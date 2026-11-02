import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { mergeRegister } from "@lexical/utils";
import {
  $createNodeSelection,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $setSelection,
  COMMAND_PRIORITY_EDITOR,
  COMMAND_PRIORITY_HIGH,
  COMMAND_PRIORITY_LOW,
  FORMAT_TEXT_COMMAND,
  INSERT_LINE_BREAK_COMMAND,
  INSERT_PARAGRAPH_COMMAND,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  KEY_ENTER_COMMAND,
  PASTE_COMMAND,
  type LexicalNode,
  type PointType,
} from "lexical";
import { useEffect } from "react";
import { $createExprNodes } from "../ast.ts";
import { $isCallNode } from "../nodes/CallNode.tsx";
import { useEditorStoreApi } from "../store.ts";
import { parseExpressionText } from "../textFormat.ts";

import type { Direction } from "../navigation.ts";

/**
 * Keeps the editor single-line and plain (no Enter, no formatting; paste is
 * parsed from the plain-text form). Backspace/Delete next to a call selects
 * it first, so a second press is needed to delete it with its arguments.
 */
export function KeyboardPlugin() {
  const [editor] = useLexicalComposerContext();
  const store = useEditorStoreApi();

  useEffect(
    () =>
      mergeRegister(
        editor.registerCommand(
          KEY_ENTER_COMMAND,
          (event) => {
            event?.preventDefault();
            return true;
          },
          COMMAND_PRIORITY_EDITOR,
        ),
        editor.registerCommand(INSERT_PARAGRAPH_COMMAND, () => true, COMMAND_PRIORITY_HIGH),
        editor.registerCommand(INSERT_LINE_BREAK_COMMAND, () => true, COMMAND_PRIORITY_HIGH),
        editor.registerCommand(FORMAT_TEXT_COMMAND, () => true, COMMAND_PRIORITY_HIGH),
        // All pastes go through the plain-text form, so pills and calls
        // survive copy/paste between editors and from outside.
        editor.registerCommand(
          PASTE_COMMAND,
          (event) => {
            if (!(event instanceof ClipboardEvent)) return false;
            const text = event.clipboardData?.getData("text/plain");
            const selection = $getSelection();
            if (text === undefined || !$isRangeSelection(selection)) return false;
            event.preventDefault();
            const { schema } = store.getState();
            const expr = parseExpressionText(text.replace(/\s*\r?\n\s*/g, " "), schema);
            if (expr) selection.insertNodes($createExprNodes(expr, schema));
            return true;
          },
          COMMAND_PRIORITY_HIGH,
        ),
        editor.registerCommand(
          KEY_BACKSPACE_COMMAND,
          (event) => selectAdjacentCall(event, "backward"),
          COMMAND_PRIORITY_LOW,
        ),
        editor.registerCommand(
          KEY_DELETE_COMMAND,
          (event) => selectAdjacentCall(event, "forward"),
          COMMAND_PRIORITY_LOW,
        ),
      ),
    [editor, store],
  );

  return null;
}

function selectAdjacentCall(event: KeyboardEvent, direction: Direction): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
  const adjacent =
    direction === "forward" ? $nodeAfter(selection.focus) : $nodeBefore(selection.focus);
  if (!$isCallNode(adjacent)) return false;
  event.preventDefault();
  const nodeSelection = $createNodeSelection();
  nodeSelection.add(adjacent.getKey());
  $setSelection(nodeSelection);
  return true;
}

/** The sibling node directly after a collapsed caret, if the caret sits on a node boundary. */
function $nodeAfter(point: PointType): LexicalNode | null {
  const node = point.getNode();
  if (point.type === "element") {
    return $isElementNode(node) ? node.getChildAtIndex(point.offset) : null;
  }
  return point.offset === node.getTextContentSize() ? node.getNextSibling() : null;
}

/** The sibling node directly before a collapsed caret, if the caret sits on a node boundary. */
function $nodeBefore(point: PointType): LexicalNode | null {
  const node = point.getNode();
  if (point.type === "element") {
    return $isElementNode(node) && point.offset > 0 ? node.getChildAtIndex(point.offset - 1) : null;
  }
  return point.offset === 0 ? node.getPreviousSibling() : null;
}
