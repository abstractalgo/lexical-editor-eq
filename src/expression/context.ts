import {
  $getNodeByKey,
  $getSlotHost,
  $getSlotNameWithinHost,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
} from "lexical";
import { $isArgNode, type ArgNode } from "./nodes/ArgNode.ts";
import { $isCallNode, argSlotIndex, type CallNode } from "./nodes/CallNode.tsx";
import type { ExprType, ExpressionSchema } from "./types.ts";

/** The argument that contains `node`, or null when `node` is at the top level. */
function $findArg(node: LexicalNode): ArgNode | null {
  let current: LexicalNode | null = node;
  while (current) {
    if ($isArgNode(current)) return current;
    current = current.getParent();
  }
  return null;
}

export function $getArgPosition(arg: ArgNode): { call: CallNode; index: number } | null {
  const host = $getSlotHost(arg);
  const slotName = $getSlotNameWithinHost(arg);
  if (!$isCallNode(host) || slotName === null) return null;
  return { call: host, index: argSlotIndex(slotName) };
}

/** The type expected at the position of `node`: its argument's parameter type, or the result type. */
export function $expectedTypeAt(
  node: LexicalNode,
  schema: ExpressionSchema,
  resultType: ExprType,
): ExprType {
  const arg = $findArg(node);
  if (!arg) return resultType;
  const position = $getArgPosition(arg);
  if (!position) return "any";
  const def = schema.transformations.find((t) => t.name === position.call.getName());
  return def?.params[position.index]?.type ?? "any";
}

/**
 * Moves the caret to the start of an argument of a call created in the
 * current update. Its slot only becomes visible once the call's chip has
 * rendered and mounted it, so the selection is applied on the next frame.
 */
export function $selectArgStartWhenMounted(editor: LexicalEditor, argKey: NodeKey): void {
  requestAnimationFrame(() => {
    editor.update(() => {
      const arg = $getNodeByKey(argKey);
      if ($isArgNode(arg)) arg.selectStart();
    });
  });
}
