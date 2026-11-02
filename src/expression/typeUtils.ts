import type { ExprType, ExpressionSchema } from "./types.ts";

export const BOOLEAN_VALUES = ["true", "false"];

export function formatType(type: ExprType): string {
  return typeof type === "string" ? type : type.enum;
}

export function isAssignable(actual: ExprType, expected: ExprType): boolean {
  if (actual === "any" || expected === "any") return true;
  if (typeof actual === "string" || typeof expected === "string") return actual === expected;
  return actual.enum === expected.enum;
}

/** Values selectable as enum pills for a type, or null if the type isn't enum-like. */
export function enumValuesFor(type: ExprType, schema: ExpressionSchema): string[] | null {
  if (type === "boolean") return BOOLEAN_VALUES;
  if (typeof type === "string") return null;
  return schema.enums.find((e) => e.name === type.enum)?.values ?? null;
}
