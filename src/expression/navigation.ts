import {
  $createRangeSelection,
  $getSelection,
  $getSlot,
  $getSlotNames,
  $isNodeSelection,
  $isRangeSelection,
  $isRootNode,
  $isTextNode,
  $setSelection,
  type ElementNode,
  type LexicalNode,
  type PointType,
  type RangeSelection,
} from "lexical";
import { $getArgPosition } from "./context.ts";
import { $isArgNode } from "./nodes/ArgNode.ts";
import { $isCallNode, type CallNode } from "./nodes/CallNode.tsx";

/*
 * Caret movement over expression content. Every container (the top-level
 * line, or one argument) is flattened into units: one per text character,
 * one per pill or call (atoms). A position is an index between units.
 *
 * - char: one unit.
 * - word: skips separators, then one word or one pill.
 * A plain char or word move into a call enters its first/last argument; an
 * extending move selects the call whole.
 * - line: the start/end of the current container.
 * At an argument's edge a plain move continues into the neighbouring
 * argument (or out of the call); an extending move selects the whole call.
 */

export type Direction = "forward" | "backward";
export type Unit = "char" | "word" | "line";

type Item = { kind: "char"; char: string } | { kind: "atom"; node: LexicalNode };
type PointSpec = [key: string, offset: number, type: "text" | "element"];

const WORD_CHAR = /[\p{L}\p{N}_]/u;

/** Moves or extends the selection; returns false when there's nothing to handle. */
export function $navigate(direction: Direction, unit: Unit, extend: boolean): boolean {
  const selection = $getSelection();
  if ($isNodeSelection(selection))
    return $fromNodeSelection(selection.getNodes(), direction, extend);
  if (!$isRangeSelection(selection)) return false;

  const container = $containerOf(selection.focus.getNode());
  if (!container) return false;
  const items = $items(container);
  const from = $indexOf(selection.focus, container);

  // A plain move with a range selected collapses it towards the move.
  if (!extend && !selection.isCollapsed()) {
    const anchor = $containerOf(selection.anchor.getNode())?.is(container)
      ? $indexOf(selection.anchor, container)
      : from;
    $setCaret(container, direction === "forward" ? Math.max(anchor, from) : Math.min(anchor, from));
    return true;
  }

  // Plain char and word moves step into a call's arguments; selections take it whole.
  if (!extend && unit !== "line") {
    const at = unit === "word" ? skipSeparators(items, from, direction) : from;
    const adjacent = items[direction === "forward" ? at : at - 1];
    if (adjacent?.kind === "atom" && $isCallNode(adjacent.node)) {
      return $enterCall(adjacent.node, direction);
    }
  }

  const target = targetIndex(items, from, direction, unit);
  if (target === null) return $leaveContainer(container, direction, unit, extend);
  if (extend) $setRange(selection.anchor, container, target);
  else $setCaret(container, target);
  return true;
}

/**
 * Select-all that widens step by step: the current argument, then the call
 * around it, then the argument or line around that. Returns false at the top
 * level so the editor's own select-all applies.
 */
export function $selectAllWidening(): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return false;
  const container = $containerOf(selection.focus.getNode());
  if (!container || !$isArgNode(container)) return false;

  const size = $indexBeforeChild(container, container.getChildrenSize());
  const focus = $indexOf(selection.focus, container);
  const anchor = $containerOf(selection.anchor.getNode())?.is(container)
    ? $indexOf(selection.anchor, container)
    : focus;
  if (Math.min(anchor, focus) > 0 || Math.max(anchor, focus) < size) {
    $setRangeSpecs($pointAt(container, 0), $pointAt(container, size));
    return true;
  }
  const call = $getArgPosition(container)?.call;
  const parent = call ? $containerOf(call) : null;
  if (!call || !parent) return false;
  const callIndex = $indexBeforeChild(parent, call.getIndexWithinParent());
  $setRangeSpecs($pointAt(parent, callIndex), $pointAt(parent, callIndex + 1));
  return true;
}

function targetIndex(items: Item[], from: number, direction: Direction, unit: Unit): number | null {
  const end = items.length;
  if (direction === "forward" ? from >= end : from <= 0) return null;
  if (unit === "line") return direction === "forward" ? end : 0;
  if (unit === "char") return from + (direction === "forward" ? 1 : -1);

  let i = skipSeparators(items, from, direction);
  if (direction === "forward") {
    if (items[i]?.kind === "atom") return i + 1;
    while (i < end && isWord(items[i])) i++;
  } else {
    if (items[i - 1]?.kind === "atom") return i - 1;
    while (i > 0 && isWord(items[i - 1])) i--;
  }
  return i;
}

const isWord = (item: Item | undefined) => item?.kind === "char" && WORD_CHAR.test(item.char);
const isSeparator = (item: Item | undefined) => item?.kind === "char" && !WORD_CHAR.test(item.char);

/** Index after skipping spaces and punctuation in `direction`. */
function skipSeparators(items: Item[], from: number, direction: Direction): number {
  let i = from;
  if (direction === "forward") {
    while (i < items.length && isSeparator(items[i])) i++;
  } else {
    while (i > 0 && isSeparator(items[i - 1])) i--;
  }
  return i;
}

/** Past the edge of a container: next argument, out of the call, or select the call. */
function $leaveContainer(
  container: ElementNode,
  direction: Direction,
  unit: Unit,
  extend: boolean,
): boolean {
  // Top-level line: nothing beyond it, but keep the browser from moving the caret.
  if (!$isArgNode(container)) return true;
  const position = $getArgPosition(container);
  if (!position) return false;
  const { call, index } = position;
  const parent = $containerOf(call);
  if (!parent) return false;

  const callIndex = $indexBeforeChild(parent, call.getIndexWithinParent());
  if (extend) {
    // Select the whole call, oriented with the move, so further moves extend past it.
    const [anchor, focus] =
      direction === "forward" ? [callIndex, callIndex + 1] : [callIndex + 1, callIndex];
    $setRangeSpecs($pointAt(parent, anchor), $pointAt(parent, focus));
    return true;
  }
  if (unit !== "line") {
    const slotNames = $getSlotNames(call);
    const nextName = slotNames[direction === "forward" ? index + 1 : index - 1];
    const next = nextName === undefined ? null : $getSlot(call, nextName);
    if ($isArgNode(next)) {
      if (direction === "forward") next.selectStart();
      else next.selectEnd();
      return true;
    }
  }
  $setCaret(parent, direction === "forward" ? callIndex + 1 : callIndex);
  return true;
}

function $enterCall(call: CallNode, direction: Direction): boolean {
  const args = call.getArgs();
  const target = direction === "forward" ? args[0] : args.at(-1);
  if (!target) return false;
  if (direction === "forward") target.selectStart();
  else target.selectEnd();
  return true;
}

/** A selected pill/call: a plain move puts the caret beside it, an extending move turns it into a range. */
function $fromNodeSelection(nodes: LexicalNode[], direction: Direction, extend: boolean): boolean {
  const [node] = nodes;
  if (!node || nodes.length !== 1) return false;
  const container = $containerOf(node);
  if (!container) return false;
  const before = $indexBeforeChild(container, node.getIndexWithinParent());
  if (extend) {
    const [anchor, focus] = direction === "forward" ? [before, before + 1] : [before + 1, before];
    $setRangeSpecs($pointAt(container, anchor), $pointAt(container, focus));
  } else {
    $setCaret(container, direction === "forward" ? before + 1 : before);
  }
  return true;
}

/** The argument or top-level line that directly contains `node`. */
function $containerOf(node: LexicalNode): ElementNode | null {
  if ($isRootNode(node)) {
    const first = node.getFirstChild();
    return first && "getChildren" in first ? (first as ElementNode) : null;
  }
  let current: LexicalNode | null = node;
  while (current) {
    if ($isArgNode(current)) return current;
    const parent: LexicalNode | null = current.getParent();
    if (parent && $isRootNode(parent)) return current as ElementNode;
    current = parent;
  }
  return null;
}

function $items(container: ElementNode): Item[] {
  return container.getChildren().flatMap((child): Item[] =>
    $isTextNode(child)
      ? child
          .getTextContent()
          .split("")
          .map((char): Item => ({ kind: "char", char }))
      : [{ kind: "atom", node: child }],
  );
}

/** Index between units for a point inside `container`. */
function $indexOf(point: PointType, container: ElementNode): number {
  const node = point.getNode();
  if (point.type === "element") return $indexBeforeChild(container, point.offset);
  let index = 0;
  for (const child of container.getChildren()) {
    if (child.is(node)) return index + point.offset;
    index += $size(child);
  }
  return index;
}

/** Index just before the container's child at `childIndex`. */
function $indexBeforeChild(container: ElementNode, childIndex: number): number {
  return container
    .getChildren()
    .slice(0, childIndex)
    .reduce((sum, child) => sum + $size(child), 0);
}

function $size(node: LexicalNode): number {
  return $isTextNode(node) ? node.getTextContentSize() : 1;
}

/** Lexical point for an index; prefers text points so the browser caret stays inside text. */
function $pointAt(container: ElementNode, target: number): PointSpec {
  let index = 0;
  const children = container.getChildren();
  for (let k = 0; k < children.length; k++) {
    const child = children[k] as LexicalNode;
    if ($isTextNode(child)) {
      const size = child.getTextContentSize();
      if (target <= index + size) return [child.getKey(), target - index, "text"];
      index += size;
    } else {
      if (target === index) return [container.getKey(), k, "element"];
      index += 1;
    }
  }
  return [container.getKey(), children.length, "element"];
}

function $setCaret(container: ElementNode, index: number): void {
  const point = $pointAt(container, index);
  $setRangeSpecs(point, point);
}

function $setRange(anchor: PointType, container: ElementNode, focusIndex: number): void {
  $setRangeSpecs([anchor.key, anchor.offset, anchor.type], $pointAt(container, focusIndex));
}

function $setRangeSpecs(anchor: PointSpec, focus: PointSpec): void {
  const selection: RangeSelection = $createRangeSelection();
  selection.anchor.set(...anchor);
  selection.focus.set(...focus);
  $setSelection(selection);
}
