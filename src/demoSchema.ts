import type { Expr, ExpressionSchema } from "./expression/index.ts";

export const demoSchema: ExpressionSchema = {
  enums: [
    { name: "Currency", values: ["USD", "EUR", "GBP"] },
    { name: "Case", values: ["upper", "lower", "title"] },
  ],
  variables: [
    { path: "User.Name", type: "string" },
    { path: "User.Email", type: "string" },
    { path: "User.Age", type: "number" },
    { path: "User.IsActive", type: "boolean" },
    { path: "Order.Total", type: "number" },
    { path: "Order.Currency", type: { enum: "Currency" } },
  ],
  transformations: [
    {
      name: "substr",
      params: [
        { name: "text", type: "string" },
        { name: "start", type: "number" },
        { name: "length", type: "number" },
      ],
      returns: "string",
    },
    {
      name: "add",
      params: [
        { name: "a", type: "number" },
        { name: "b", type: "number" },
      ],
      returns: "number",
    },
    {
      name: "length",
      params: [{ name: "text", type: "string" }],
      returns: "number",
      description: "Number of characters in the text",
    },
    { name: "uppercase", params: [{ name: "text", type: "string" }], returns: "string" },
    { name: "lowercase", params: [{ name: "text", type: "string" }], returns: "string" },
    {
      name: "sentenceCase",
      params: [{ name: "text", type: "string" }],
      returns: "string",
      description: "Capitalises the first letter and lowercases the rest",
    },
    {
      name: "changeCase",
      params: [
        { name: "text", type: "string" },
        { name: "case", type: { enum: "Case" } },
      ],
      returns: "string",
    },
    {
      name: "formatMoney",
      params: [
        { name: "amount", type: "number" },
        { name: "currency", type: { enum: "Currency" } },
      ],
      returns: "string",
    },
    {
      name: "if",
      params: [
        { name: "condition", type: "boolean" },
        { name: "then", type: "any" },
        { name: "else", type: "any" },
      ],
      returns: "any",
    },
    {
      name: "equals",
      params: [
        { name: "a", type: "any" },
        { name: "b", type: "any" },
      ],
      returns: "boolean",
    },
    { name: "toString", params: [{ name: "value", type: "any" }], returns: "string" },
  ],
};

/** Initial key/value bindings; later ones reference earlier ones by name. */
export const demoBindings: { name: string; value: Expr | null }[] = [
  {
    name: "firstName",
    value: {
      kind: "call",
      name: "substr",
      args: [
        { kind: "variable", path: "User.Name" },
        { kind: "number", value: 0 },
        { kind: "number", value: 4 },
      ],
    },
  },
  {
    name: "total",
    value: {
      kind: "call",
      name: "add",
      args: [
        { kind: "variable", path: "Order.Total" },
        { kind: "number", value: 10 },
      ],
    },
  },
  {
    name: "greeting",
    value: {
      kind: "concat",
      parts: [
        { kind: "string", value: "Hi " },
        { kind: "variable", path: "firstName" },
        { kind: "string", value: ", your total is " },
        {
          kind: "call",
          name: "formatMoney",
          args: [
            { kind: "variable", path: "total" },
            { kind: "variable", path: "Order.Currency" },
          ],
        },
      ],
    },
  },
];
