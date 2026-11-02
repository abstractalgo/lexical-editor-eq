import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isElementNode,
  $isLineBreakNode,
  $isTextNode,
  type ElementNode,
  type LexicalNode,
  type NodeKey,
} from "lexical";
import { $createCallNode, $isCallNode, type CallNode } from "./nodes/CallNode.tsx";
import { $createEnumNode, $isEnumNode } from "./nodes/EnumNode.tsx";
import { $createVariableNode, $isVariableNode } from "./nodes/VariableNode.tsx";
import { formatType, isAssignable } from "./typeUtils.ts";
import type { Expr, ExprPath, ExprType, ExpressionResult, ExpressionSchema } from "./types.ts";

/** A run of text (possibly several text nodes) or one pill/call node. */
type RawSegment =
  | { text: string; nodes: { node: LexicalNode; start: number }[] }
  | { node: LexicalNode };

/** Where a Lexical node ends up in the output: its JSON path, and for text its offset in the literal. */
export interface NodeLocation {
  path: ExprPath;
  textStart?: number;
}

interface Analysis {
  schema: ExpressionSchema;
  /** Error message keyed by node key, `${callKey}/${argIndex}`, or "root". */
  diagnostics: Record<string, string>;
  locations: Map<NodeKey, NodeLocation>;
}

/** Reads the editor content into an AST and type-checks it against `resultType`. */
export function $analyzeEditor(
  schema: ExpressionSchema,
  resultType: ExprType,
): ExpressionResult & {
  diagnostics: Record<string, string>;
  locations: Map<NodeKey, NodeLocation>;
} {
  const analysis: Analysis = { schema, diagnostics: {}, locations: new Map() };
  const root = $getRoot();
  analysis.locations.set(root.getKey(), { path: [] });
  const inline = root.getChildren().flatMap((block) => {
    if (!$isElementNode(block)) return [block];
    analysis.locations.set(block.getKey(), { path: [] });
    return block.getChildren();
  });
  const { expr, type } = analyzeSequence(inline, resultType, analysis, "root", "Expression", []);
  return {
    expr,
    type,
    errors: Object.values(analysis.diagnostics),
    diagnostics: analysis.diagnostics,
    locations: analysis.locations,
  };
}

function analyzeSequence(
  nodes: LexicalNode[],
  expected: ExprType,
  analysis: Analysis,
  ownerKey: string,
  label: string,
  path: ExprPath,
): { expr: Expr | null; type: ExprType | null } {
  const raw: RawSegment[] = [];
  for (const node of nodes) {
    const text = $isTextNode(node) ? node.getTextContent() : $isLineBreakNode(node) ? " " : null;
    if (text === null) {
      raw.push({ node });
      continue;
    }
    const last = raw.at(-1);
    if (last && "text" in last) {
      last.nodes.push({ node, start: last.text.length });
      last.text += text;
    } else {
      raw.push({ text, nodes: [{ node, start: 0 }] });
    }
  }

  // A lone segment is the sequence itself; several become `parts` of a concat.
  const segmentPath = (i: number): ExprPath => (raw.length === 1 ? path : [...path, "parts", i]);
  const segments = raw.map((segment, i): { text: string } | { expr: Expr; type: ExprType } => {
    const at = segmentPath(i);
    if ("text" in segment) {
      for (const { node, start } of segment.nodes) {
        analysis.locations.set(node.getKey(), { path: at, textStart: start });
      }
      return { text: segment.text };
    }
    analysis.locations.set(segment.node.getKey(), { path: at });
    return analyzeAtom(segment.node, analysis, at);
  });

  const report = (message: string) => {
    analysis.diagnostics[ownerKey] = `${label}: ${message}`;
  };

  if (segments.length === 0) {
    if (ownerKey !== "root") report("missing value");
    return { expr: null, type: null };
  }

  if (segments.length === 1) {
    const [only] = segments as [{ text: string } | { expr: Expr; type: ExprType }];
    if ("expr" in only) {
      if (!isAssignable(only.type, expected)) {
        report(`expected ${formatType(expected)}, got ${formatType(only.type)}`);
      }
      return only;
    }
    const literal = coerceText(only.text, expected, analysis.schema);
    if ("error" in literal) {
      report(literal.error);
      return { expr: { kind: "string", value: only.text }, type: "string" };
    }
    return literal;
  }

  if (!isAssignable("string", expected)) {
    report(`text and values are joined into a string, but ${formatType(expected)} is expected`);
  }
  const parts = segments.map((s): Expr =>
    "text" in s ? { kind: "string", value: s.text } : s.expr,
  );
  return { expr: { kind: "concat", parts }, type: "string" };
}

function analyzeAtom(
  node: LexicalNode,
  analysis: Analysis,
  path: ExprPath,
): { expr: Expr; type: ExprType } {
  if ($isVariableNode(node)) {
    const def = analysis.schema.variables.find((v) => v.path === node.getPath());
    if (!def) analysis.diagnostics[node.getKey()] = `Unknown variable [${node.getPath()}]`;
    return { expr: { kind: "variable", path: node.getPath() }, type: def?.type ?? "any" };
  }
  if ($isEnumNode(node)) {
    return node.getEnum() === "boolean"
      ? { expr: { kind: "boolean", value: node.getValue() === "true" }, type: "boolean" }
      : {
          expr: { kind: "enum", enum: node.getEnum(), value: node.getValue() },
          type: { enum: node.getEnum() },
        };
  }
  if ($isCallNode(node)) return analyzeCall(node, analysis, path);
  return { expr: { kind: "string", value: node.getTextContent() }, type: "string" };
}

function analyzeCall(
  node: CallNode,
  analysis: Analysis,
  path: ExprPath,
): { expr: Expr; type: ExprType } {
  const def = analysis.schema.transformations.find((t) => t.name === node.getName());
  if (!def) analysis.diagnostics[node.getKey()] = `Unknown transformation ${node.getName()}()`;

  const args = node.getArgs().map((arg, i) => {
    const param = def?.params[i];
    const label = param ? `${def.name}(${param.name})` : `${node.getName()}(#${i + 1})`;
    const argPath: ExprPath = [...path, "args", i];
    if (arg) analysis.locations.set(arg.getKey(), { path: argPath });
    return analyzeSequence(
      arg?.getChildren() ?? [],
      param?.type ?? "any",
      analysis,
      `${node.getKey()}/${i}`,
      label,
      argPath,
    ).expr;
  });

  return { expr: { kind: "call", name: node.getName(), args }, type: def?.returns ?? "any" };
}

/** Reads plain text as a literal of the expected type. */
function coerceText(
  text: string,
  expected: ExprType,
  schema: ExpressionSchema,
): { expr: Expr; type: ExprType } | { error: string } {
  const trimmed = text.trim();
  const asNumber = trimmed === "" ? Number.NaN : Number(trimmed);
  const asBoolean = trimmed === "true" ? true : trimmed === "false" ? false : null;

  if (expected === "string") return { expr: { kind: "string", value: text }, type: "string" };
  if (expected === "number") {
    return Number.isFinite(asNumber)
      ? { expr: { kind: "number", value: asNumber }, type: "number" }
      : { error: `expected number, got "${text}"` };
  }
  if (expected === "boolean") {
    return asBoolean === null
      ? { error: `expected true or false, got "${text}"` }
      : { expr: { kind: "boolean", value: asBoolean }, type: "boolean" };
  }
  if (expected === "any") {
    if (Number.isFinite(asNumber))
      return { expr: { kind: "number", value: asNumber }, type: "number" };
    if (asBoolean !== null) return { expr: { kind: "boolean", value: asBoolean }, type: "boolean" };
    return { expr: { kind: "string", value: text }, type: "string" };
  }
  const values = schema.enums.find((e) => e.name === expected.enum)?.values ?? [];
  return values.includes(trimmed)
    ? { expr: { kind: "enum", enum: expected.enum, value: trimmed }, type: expected }
    : { error: `expected one of ${values.join(", ")}, got "${text}"` };
}

/** Replaces the editor content with nodes built from `expr`. */
export function $loadExpression(expr: Expr | null, schema: ExpressionSchema): void {
  const paragraph = $createParagraphNode();
  if (expr) $appendExpr(paragraph, expr, schema);
  $getRoot().clear().append(paragraph);
}

/** Builds the inline nodes for `expr`, ready to insert at the selection. */
export function $createExprNodes(expr: Expr, schema: ExpressionSchema): LexicalNode[] {
  const holder = $createParagraphNode();
  $appendExpr(holder, expr, schema);
  return holder.getChildren();
}

function $appendExpr(container: ElementNode, expr: Expr, schema: ExpressionSchema): void {
  switch (expr.kind) {
    case "string":
      if (expr.value !== "") container.append($createTextNode(expr.value));
      return;
    case "number":
      container.append($createTextNode(String(expr.value)));
      return;
    case "boolean":
      container.append($createEnumNode("boolean", String(expr.value)));
      return;
    case "enum":
      container.append($createEnumNode(expr.enum, expr.value));
      return;
    case "variable":
      container.append($createVariableNode(expr.path));
      return;
    case "concat":
      for (const part of expr.parts) $appendExpr(container, part, schema);
      return;
    case "call": {
      const def = schema.transformations.find((t) => t.name === expr.name);
      const call = $createCallNode(expr.name, Math.max(def?.params.length ?? 0, expr.args.length));
      call.getArgs().forEach((arg, i) => {
        const value = expr.args[i];
        if (arg && value) $appendExpr(arg, value, schema);
      });
      container.append(call);
      return;
    }
  }
}
