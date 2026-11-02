import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLexicalNodeSelection } from "@lexical/react/useLexicalNodeSelection";
import { useLexicalSlotRef } from "@lexical/react/useLexicalSlotRef";
import {
  $getNodeByKey,
  $getSlot,
  $getSlotNames,
  $getState,
  $setSlot,
  $setState,
  createState,
  DecoratorNode,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
} from "lexical";
import { Fragment, type ReactNode } from "react";
import { useEditorStore } from "../store.ts";
import { formatType } from "../typeUtils.ts";
import type { TransformationDef } from "../types.ts";
import { $createArgNode, $isArgNode, type ArgNode } from "./ArgNode.ts";

const nameState = createState("name", { parse: (v) => (typeof v === "string" ? v : "") });

/** Zero-padded so slot names sort in argument order (`arg00`, `arg01`, …). */
function argSlotName(index: number): string {
  return `arg${String(index).padStart(2, "0")}`;
}

export function argSlotIndex(slotName: string): number {
  return Number(slotName.slice(3));
}

/**
 * A transformation invocation such as `substr([User.Name], 0, 4)`. The node is
 * atomic; each argument is an ArgNode in a named slot, edited in place.
 */
export class CallNode extends DecoratorNode<ReactNode> {
  $config() {
    return this.config("expr-call", {
      extends: DecoratorNode,
      stateConfigs: [{ stateConfig: nameState, flat: true }],
    });
  }

  getName(): string {
    return $getState(this, nameState);
  }

  getArgs(): (ArgNode | null)[] {
    return $getSlotNames(this).map((name) => {
      const slot = $getSlot(this, name);
      return $isArgNode(slot) ? slot : null;
    });
  }

  createDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "expr-decorator";
    return span;
  }

  updateDOM(): boolean {
    return false;
  }

  isInline(): boolean {
    return true;
  }

  /** Plain-text form, `name(arg, arg)`; see textFormat.ts. */
  getTextContent(): string {
    const args = this.getArgs().map((arg) => arg?.getTextContent() ?? "");
    return `${this.getName()}(${args.join(", ")})`;
  }

  decorate(): ReactNode {
    return (
      <CallChip nodeKey={this.getKey()} name={this.getName()} slotNames={$getSlotNames(this)} />
    );
  }
}

function CallChip({
  nodeKey,
  name,
  slotNames,
}: {
  nodeKey: NodeKey;
  name: string;
  slotNames: string[];
}) {
  const [editor] = useLexicalComposerContext();
  const def = useEditorStore((s) => s.schema.transformations.find((t) => t.name === name));
  const error = useEditorStore((s) => s.diagnostics[nodeKey]);
  const [isSelected, setSelected, clearSelection] = useLexicalNodeSelection(nodeKey);
  const firstSlot = slotNames[0];
  const lastSlot = slotNames.at(-1);

  return (
    <span
      className="expr-call"
      data-selected={isSelected || undefined}
      data-error={error ? true : undefined}
    >
      <span
        className="expr-call__name"
        title={error ?? (def ? signature(def) : name)}
        onMouseDown={(event) => {
          // Keep the browser from dropping the caret elsewhere; select the call instead.
          event.preventDefault();
          editor.focus();
          if (!event.shiftKey) clearSelection();
          setSelected(true);
        }}
      >
        {name}
      </span>
      <Chrome
        className="expr-call__paren"
        onPick={() => firstSlot && focusArg(editor, nodeKey, firstSlot, "start")}
      >
        (
      </Chrome>
      {slotNames.map((slotName, i) => (
        <Fragment key={slotName}>
          {i > 0 && (
            <Chrome
              className="expr-call__comma"
              onPick={() => focusArg(editor, nodeKey, slotNames[i - 1] ?? slotName, "end")}
            >
              ,
            </Chrome>
          )}
          <ArgSlot
            nodeKey={nodeKey}
            slotName={slotName}
            placeholder={
              def?.params[i] ? `${def.params[i].name}: ${formatType(def.params[i].type)}` : "value"
            }
          />
        </Fragment>
      ))}
      <Chrome
        className="expr-call__paren"
        onPick={() => lastSlot && focusArg(editor, nodeKey, lastSlot, "end")}
      >
        )
      </Chrome>
    </span>
  );
}

/** Non-editable punctuation; clicking it moves the caret into the nearest argument. */
function Chrome({
  className,
  onPick,
  children,
}: {
  className: string;
  onPick: () => void;
  children: ReactNode;
}) {
  return (
    <span
      className={className}
      onMouseDown={(event) => {
        event.preventDefault();
        onPick();
      }}
    >
      {children}
    </span>
  );
}

function ArgSlot({
  nodeKey,
  slotName,
  placeholder,
}: {
  nodeKey: NodeKey;
  slotName: string;
  placeholder: string;
}) {
  const [editor] = useLexicalComposerContext();
  const slotRef = useLexicalSlotRef<HTMLSpanElement>(editor, nodeKey, slotName);
  const error = useEditorStore((s) => s.diagnostics[`${nodeKey}/${argSlotIndex(slotName)}`]);

  return (
    <span
      className="expr-slot"
      data-placeholder={placeholder}
      data-error={error ? true : undefined}
      title={error}
      ref={slotRef}
      onMouseDown={(event) => {
        // Clicks on the slot chrome (padding, placeholder) focus the argument.
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        focusArg(editor, nodeKey, slotName, "end");
      }}
    />
  );
}

function focusArg(
  editor: LexicalEditor,
  callKey: NodeKey,
  slotName: string,
  edge: "start" | "end",
) {
  editor.focus();
  editor.update(() => {
    const host = $getNodeByKey(callKey);
    const arg = host ? $getSlot(host, slotName) : null;
    if (!$isArgNode(arg)) return;
    if (edge === "start") arg.selectStart();
    else arg.selectEnd();
  });
}

function signature(def: TransformationDef): string {
  const params = def.params.map((p) => `${p.name}: ${formatType(p.type)}`).join(", ");
  return `${def.name}(${params}) → ${formatType(def.returns)}${def.description ? `\n${def.description}` : ""}`;
}

/** Creates a call with one empty argument slot per parameter. */
export function $createCallNode(name: string, argCount: number): CallNode {
  const call = $setState(new CallNode(), nameState, name);
  for (let i = 0; i < argCount; i++) {
    $setSlot(call, argSlotName(i), $createArgNode());
  }
  return call;
}

export function $isCallNode(node: LexicalNode | null | undefined): node is CallNode {
  return node instanceof CallNode;
}
