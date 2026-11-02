import type { ExpressionSchema, VariableDef } from "./expression/index.ts";
import type { Binding } from "./appStore.ts";

const NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Why a binding's name can't be used as a variable, or null if it can. */
export function nameError(
  bindings: readonly Binding[],
  index: number,
  base: ExpressionSchema,
): string | null {
  const name = bindings[index]?.name ?? "";
  if (name === "") return "Name is required";
  if (!NAME_PATTERN.test(name)) return "Use letters, digits and _ (not starting with a digit)";
  if (base.variables.some((v) => v.path === name)) return `${name} is already a built-in variable`;
  if (bindings.slice(0, index).some((b) => b.name === name))
    return `${name} is already defined above`;
  return null;
}

/** Variables defined by the bindings above `index`, typed by their expressions' result types. */
export function bindingsInScope(
  bindings: readonly Binding[],
  index: number,
  base: ExpressionSchema,
): VariableDef[] {
  return bindings.slice(0, index).flatMap((binding, i) =>
    nameError(bindings, i, base) === null
      ? [
          {
            path: binding.name,
            type: binding.result?.type ?? "any",
            description: "Defined above",
          },
        ]
      : [],
  );
}
