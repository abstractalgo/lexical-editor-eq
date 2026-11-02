import {
  $getSelection,
  $isElementNode,
  $isNodeSelection,
  $isRangeSelection,
  $isTextNode,
  type NodeKey,
  type PointType,
} from "lexical";
import type { NodeLocation } from "./ast.ts";
import type { CaretLocation, ExprPath } from "./types.ts";

/** Maps the current selection to the `Expr` node it's in, using the last analysis' locations. */
export function $caretLocation(
  locations: ReadonlyMap<NodeKey, NodeLocation>,
): CaretLocation | null {
  const selection = $getSelection();
  if ($isNodeSelection(selection)) {
    const [node] = selection.getNodes();
    const location = node ? locations.get(node.getKey()) : undefined;
    return location ? { path: location.path } : null;
  }
  if (!$isRangeSelection(selection)) return null;

  const focus = $pointLocation(selection.focus, locations);
  if (!focus || selection.isCollapsed()) return focus;
  const anchor = $pointLocation(selection.anchor, locations);
  return { path: anchor ? commonNodePath(anchor.path, focus.path) : focus.path };
}

function $pointLocation(
  point: PointType,
  locations: ReadonlyMap<NodeKey, NodeLocation>,
): CaretLocation | null {
  const node = point.getNode();
  const inText = (key: NodeKey, offset: number): CaretLocation | null => {
    const location = locations.get(key);
    return location ? { path: location.path, offset: (location.textStart ?? 0) + offset } : null;
  };
  if (point.type === "text") return inText(node.getKey(), point.offset);
  if (!$isElementNode(node)) return null;

  // Between children: prefer neighbouring text, then the pill/call before or after,
  // then the container itself (an empty argument or line).
  const before = point.offset > 0 ? node.getChildAtIndex(point.offset - 1) : null;
  const after = node.getChildAtIndex(point.offset);
  if ($isTextNode(before)) return inText(before.getKey(), before.getTextContentSize());
  if ($isTextNode(after)) return inText(after.getKey(), 0);
  const neighbour = before ?? after;
  const location =
    (neighbour ? locations.get(neighbour.getKey()) : undefined) ?? locations.get(node.getKey());
  return location ? { path: location.path } : null;
}

/** Longest shared prefix that ends on a node, not on a key like "parts". */
function commonNodePath(a: ExprPath, b: ExprPath): ExprPath {
  let length = 0;
  while (length < a.length && length < b.length && a[length] === b[length]) length++;
  const shared = a.slice(0, length);
  return typeof shared.at(-1) === "string" ? shared.slice(0, -1) : shared;
}
