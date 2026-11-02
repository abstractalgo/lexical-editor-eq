import { useLexicalNodeSelection } from "@lexical/react/useLexicalNodeSelection";
import {
  $getState,
  $setState,
  createState,
  DecoratorNode,
  type LexicalNode,
  type NodeKey,
} from "lexical";
import type { ReactNode } from "react";
import { useEditorStore } from "../store.ts";
import { formatType } from "../typeUtils.ts";

const pathState = createState("path", { parse: (v) => (typeof v === "string" ? v : "") });

export class VariableNode extends DecoratorNode<ReactNode> {
  $config() {
    return this.config("expr-variable", {
      extends: DecoratorNode,
      stateConfigs: [{ stateConfig: pathState, flat: true }],
    });
  }

  getPath(): string {
    return $getState(this, pathState);
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
    return `[${this.getPath()}]`;
  }

  decorate(): ReactNode {
    return <VariablePill nodeKey={this.getKey()} path={this.getPath()} />;
  }
}

function VariablePill({ nodeKey, path }: { nodeKey: NodeKey; path: string }) {
  const error = useEditorStore((s) => s.diagnostics[nodeKey]);
  const def = useEditorStore((s) => s.schema.variables.find((v) => v.path === path));
  const [isSelected, setSelected, clearSelection] = useLexicalNodeSelection(nodeKey);

  return (
    <span
      className="expr-pill expr-pill--variable"
      data-selected={isSelected || undefined}
      data-error={error ? true : undefined}
      title={error ?? (def ? `${def.path}: ${formatType(def.type)}` : path)}
      onClick={(event) => {
        if (!event.shiftKey) clearSelection();
        setSelected(true);
      }}
    >
      <span className="expr-pill__bracket">[</span>
      {path}
      <span className="expr-pill__bracket">]</span>
    </span>
  );
}

export function $createVariableNode(path: string): VariableNode {
  return $setState(new VariableNode(), pathState, path);
}

export function $isVariableNode(node: LexicalNode | null | undefined): node is VariableNode {
  return node instanceof VariableNode;
}
