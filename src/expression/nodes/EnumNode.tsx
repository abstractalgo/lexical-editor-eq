import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLexicalNodeSelection } from "@lexical/react/useLexicalNodeSelection";
import {
  $getNodeByKey,
  $getState,
  $setState,
  createState,
  DecoratorNode,
  type LexicalNode,
  type NodeKey,
} from "lexical";
import type { ReactNode } from "react";
import { useEditorStore } from "../store.ts";
import { BOOLEAN_VALUES } from "../typeUtils.ts";

const parseString = (v: unknown) => (typeof v === "string" ? v : "");
const enumState = createState("enum", { parse: parseString });
const valueState = createState("value", { parse: parseString });

/** A pill holding one value of a named enum. The enum "boolean" holds true/false. */
export class EnumNode extends DecoratorNode<ReactNode> {
  $config() {
    return this.config("expr-enum", {
      extends: DecoratorNode,
      stateConfigs: [
        { stateConfig: enumState, flat: true },
        { stateConfig: valueState, flat: true },
      ],
    });
  }

  getEnum(): string {
    return $getState(this, enumState);
  }

  getValue(): string {
    return $getState(this, valueState);
  }

  setValue(value: string): this {
    return $setState(this, valueState, value);
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

  getTextContent(): string {
    return this.getValue();
  }

  decorate(): ReactNode {
    return <EnumPill nodeKey={this.getKey()} enumName={this.getEnum()} value={this.getValue()} />;
  }
}

function EnumPill({
  nodeKey,
  enumName,
  value,
}: {
  nodeKey: NodeKey;
  enumName: string;
  value: string;
}) {
  const [editor] = useLexicalComposerContext();
  const values = useEditorStore((s) =>
    enumName === "boolean"
      ? BOOLEAN_VALUES
      : s.schema.enums.find((e) => e.name === enumName)?.values,
  );
  const error = useEditorStore((s) => s.diagnostics[nodeKey]);
  const [isSelected, setSelected, clearSelection] = useLexicalNodeSelection(nodeKey);
  const options = values?.includes(value) ? values : [value, ...(values ?? [])];

  return (
    <span
      className="expr-pill expr-pill--enum"
      data-selected={isSelected || undefined}
      data-error={error ? true : undefined}
      title={error ?? enumName}
    >
      <select
        aria-label={enumName}
        value={value}
        // Using the dropdown selects the pill, so the selection reflects it.
        onFocus={() => {
          clearSelection();
          setSelected(true);
        }}
        onChange={(event) => {
          const next = event.target.value;
          editor.update(() => {
            const node = $getNodeByKey(nodeKey);
            if ($isEnumNode(node)) node.setValue(next);
          });
        }}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </span>
  );
}

export function $createEnumNode(enumName: string, value: string): EnumNode {
  return $setState($setState(new EnumNode(), enumState, enumName), valueState, value);
}

export function $isEnumNode(node: LexicalNode | null | undefined): node is EnumNode {
  return node instanceof EnumNode;
}
