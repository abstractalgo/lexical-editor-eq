/** A value type in the expression language. Enums are referenced by name. */
export type ExprType = "string" | "number" | "boolean" | "any" | { enum: string };

export interface VariableDef {
  /** Dotted path, rendered as `[User.Name]`. */
  path: string;
  type: ExprType;
  description?: string;
}

export interface ParamDef {
  name: string;
  type: ExprType;
}

export interface TransformationDef {
  name: string;
  params: ParamDef[];
  returns: ExprType;
  description?: string;
}

export interface EnumDef {
  name: string;
  values: string[];
}

export interface ExpressionSchema {
  variables: VariableDef[];
  transformations: TransformationDef[];
  enums: EnumDef[];
}

/** JSON representation of an expression. `null` means "empty". */
export type Expr =
  | { kind: "string"; value: string }
  | { kind: "number"; value: number }
  | { kind: "boolean"; value: boolean }
  | { kind: "enum"; enum: string; value: string }
  | { kind: "variable"; path: string }
  | { kind: "call"; name: string; args: (Expr | null)[] }
  | { kind: "concat"; parts: Expr[] };

export interface ExpressionResult {
  expr: Expr | null;
  /** Type the expression evaluates to, or null when empty. */
  type: ExprType | null;
  errors: string[];
}
