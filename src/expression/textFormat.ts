import { enumValuesFor } from "./typeUtils.ts";
import type { Expr, ExpressionSchema } from "./types.ts";

/*
 * Plain-text form of an expression, used for the clipboard:
 *   Hi [User.Name], total: formatMoney(add([Order.Total], 10), USD)
 * Variables are `[Path]`, calls are `name(arg, arg)` for known transformation
 * names, and everything else is literal text. Parsing is best effort: a
 * literal comma or unbalanced `)` inside an argument ends that argument.
 */

const VARIABLE = /^\[([A-Za-z_][\w.]*)\]/;
const CALL_START = /^([A-Za-z_]\w*)\(/;

export function parseExpressionText(text: string, schema: ExpressionSchema): Expr | null {
  return toExpr(new Parser(text, schema).sequence(false));
}

class Parser {
  private i = 0;

  constructor(
    private readonly src: string,
    private readonly schema: ExpressionSchema,
  ) {}

  /** Reads text, variables and calls; inside an argument, stops at its `,` or `)`. */
  sequence(inArgument: boolean): Expr[] {
    const parts: Expr[] = [];
    let text = "";
    let parens = 0;
    const flush = () => {
      if (text !== "") parts.push({ kind: "string", value: text });
      text = "";
    };

    while (this.i < this.src.length) {
      const rest = this.src.slice(this.i);
      const char = rest[0];
      if (inArgument && parens === 0 && (char === "," || char === ")")) break;

      const variable = VARIABLE.exec(rest);
      if (variable?.[1]) {
        flush();
        parts.push({ kind: "variable", path: variable[1] });
        this.i += variable[0].length;
        continue;
      }

      const call = CALL_START.exec(rest);
      const previous = this.src[this.i - 1] ?? "";
      if (call?.[1] && !/\w/.test(previous) && this.isTransformation(call[1])) {
        flush();
        this.i += call[0].length;
        parts.push(this.callArguments(call[1]));
        continue;
      }

      if (char === "(") parens++;
      if (char === ")") parens--;
      text += char;
      this.i++;
    }
    flush();
    return parts;
  }

  /** Reads `arg, arg)` after `name(`. */
  private callArguments(name: string): Expr {
    const def = this.schema.transformations.find((t) => t.name === name);
    const args: (Expr | null)[] = [];
    if (this.src[this.i] === ")") {
      this.i++;
    } else {
      while (this.i <= this.src.length) {
        let arg = toExpr(this.sequence(true));
        // A bare enum value in an enum parameter becomes an enum pill.
        const param = def?.params[args.length];
        if (param && arg?.kind === "string") {
          const value = arg.value.trim();
          if (enumValuesFor(param.type, this.schema)?.includes(value)) {
            arg =
              param.type === "boolean"
                ? { kind: "boolean", value: value === "true" }
                : {
                    kind: "enum",
                    enum: typeof param.type === "object" ? param.type.enum : "",
                    value,
                  };
          }
        }
        args.push(arg);
        const separator = this.src[this.i];
        this.i++;
        if (separator !== ",") break; // ")" or end of input
        if (this.src[this.i] === " ") this.i++;
      }
    }
    return { kind: "call", name, args };
  }

  private isTransformation(name: string): boolean {
    return this.schema.transformations.some((t) => t.name === name);
  }
}

function toExpr(parts: Expr[]): Expr | null {
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0] ?? null;
  return { kind: "concat", parts };
}
