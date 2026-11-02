import { ElementNode, type LexicalNode } from "lexical";

/**
 * One argument of a transformation. Lives in a named slot of a CallNode and
 * holds inline content (text, pills, nested calls) like a paragraph.
 */
export class ArgNode extends ElementNode {
  $config() {
    return this.config("expr-arg", { extends: ElementNode });
  }

  createDOM(): HTMLElement {
    const div = document.createElement("div");
    div.className = "expr-arg";
    return div;
  }

  updateDOM(): boolean {
    return false;
  }

  isInline(): boolean {
    return false;
  }

  canBeEmpty(): boolean {
    return true;
  }
}

export function $createArgNode(): ArgNode {
  return new ArgNode();
}

export function $isArgNode(node: LexicalNode | null | undefined): node is ArgNode {
  return node instanceof ArgNode;
}
