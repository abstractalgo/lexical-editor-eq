import { Fragment, useEffect, useRef, type ReactNode } from "react";
import type { ExprPath } from "./expression/index.ts";
import "./JsonView.css";

interface Line {
  depth: number;
  /** Path of the innermost value this line belongs to. */
  path: ExprPath;
  tokens: ReactNode[];
}

/**
 * Pretty-printed JSON that highlights the lines of the value at `highlight`,
 * scrolls it into view, and draws a caret inside a highlighted string literal.
 */
export function JsonView({
  value,
  highlight,
  caretOffset,
}: {
  value: unknown;
  highlight: ExprPath | null;
  /** Caret offset inside the highlighted node's `value` string, if it has one. */
  caretOffset?: number;
}) {
  const firstHit = useRef<HTMLDivElement>(null);
  const caretPath = highlight && caretOffset !== undefined ? [...highlight, "value"] : null;
  const lines: Line[] = [];
  flatten(value, [], 0, [], "", lines, caretPath, caretOffset);
  const isHit = (path: ExprPath) => highlight !== null && startsWith(path, highlight);
  const firstHitIndex = lines.findIndex((line) => isHit(line.path));

  useEffect(() => {
    firstHit.current?.scrollIntoView({ block: "nearest" });
  });

  return (
    <pre className="json">
      {lines.map((line, i) => (
        <div
          // Lines have no stable identity; the index is the line number.
          // oxlint-disable-next-line react/no-array-index-key
          key={i}
          ref={i === firstHitIndex ? firstHit : undefined}
          className="json__line"
          data-hit={isHit(line.path) || undefined}
        >
          {"  ".repeat(line.depth)}
          {line.tokens.map((token, t) => (
            // oxlint-disable-next-line react/no-array-index-key
            <Fragment key={t}>{token}</Fragment>
          ))}
        </div>
      ))}
    </pre>
  );
}

function flatten(
  value: unknown,
  path: ExprPath,
  depth: number,
  prefix: ReactNode[],
  suffix: string,
  lines: Line[],
  caretPath: ExprPath | null,
  caretOffset: number | undefined,
): void {
  const entries: [string | number, unknown][] | null = Array.isArray(value)
    ? value.map((item, i) => [i, item])
    : value !== null && typeof value === "object"
      ? Object.entries(value)
      : null;

  if (entries === null) {
    const atCaret = caretPath !== null && samePath(path, caretPath) && typeof value === "string";
    const token = atCaret ? stringWithCaret(value, caretOffset ?? 0) : primitive(value);
    lines.push({ depth, path, tokens: [...prefix, token, punct(suffix)] });
    return;
  }

  const [open, close] = Array.isArray(value) ? ["[", "]"] : ["{", "}"];
  if (entries.length === 0) {
    lines.push({ depth, path, tokens: [...prefix, punct(open + close + suffix)] });
    return;
  }
  lines.push({ depth, path, tokens: [...prefix, punct(open)] });
  entries.forEach(([key, child], i) => {
    const childPrefix =
      typeof key === "string"
        ? [
            <span key="key" className="json__key">
              {JSON.stringify(key)}
            </span>,
            punct(": "),
          ]
        : [];
    const comma = i < entries.length - 1 ? "," : "";
    flatten(child, [...path, key], depth + 1, childPrefix, comma, lines, caretPath, caretOffset);
  });
  lines.push({ depth, path, tokens: [punct(close + suffix)] });
}

function primitive(value: unknown): ReactNode {
  if (typeof value === "string")
    return <span className="json__string">{JSON.stringify(value)}</span>;
  if (typeof value === "number") return <span className="json__number">{value}</span>;
  if (typeof value === "boolean") return <span className="json__boolean">{String(value)}</span>;
  return <span className="json__null">null</span>;
}

function stringWithCaret(value: string, offset: number): ReactNode {
  const before = JSON.stringify(value.slice(0, offset)).slice(0, -1);
  const after = JSON.stringify(value.slice(offset)).slice(1);
  return (
    <span className="json__string">
      {before}
      <span className="json__caret" aria-hidden="true" />
      {after}
    </span>
  );
}

function punct(text: string): ReactNode {
  return text ? <span className="json__punct">{text}</span> : null;
}

function startsWith(path: ExprPath, prefix: ExprPath): boolean {
  return prefix.length <= path.length && prefix.every((key, i) => path[i] === key);
}

function samePath(a: ExprPath, b: ExprPath): boolean {
  return a.length === b.length && startsWith(a, b);
}
