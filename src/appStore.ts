import { create } from "zustand";
import { demoBindings } from "./demoSchema.ts";
import type { Expr, ExpressionResult } from "./expression/index.ts";

export interface Binding {
  id: string;
  name: string;
  /** Loaded into the editor once, when the row mounts. */
  initialValue: Expr | null;
  /** Latest output of the row's editor. */
  result: ExpressionResult | null;
}

interface AppState {
  bindings: Binding[];
  addBinding: () => void;
  removeBinding: (id: string) => void;
  renameBinding: (id: string, name: string) => void;
  setResult: (id: string, result: ExpressionResult) => void;
}

const newBinding = (name: string, initialValue: Expr | null): Binding => ({
  id: crypto.randomUUID(),
  name,
  initialValue,
  result: null,
});

const update = (bindings: Binding[], id: string, patch: Partial<Binding>) =>
  bindings.map((b) => (b.id === id ? { ...b, ...patch } : b));

export const useAppStore = create<AppState>()((set) => ({
  bindings: demoBindings.map((b) => newBinding(b.name, b.value)),
  addBinding: () =>
    set((s) => ({ bindings: [...s.bindings, newBinding(`var${s.bindings.length + 1}`, null)] })),
  removeBinding: (id) => set((s) => ({ bindings: s.bindings.filter((b) => b.id !== id) })),
  renameBinding: (id, name) => set((s) => ({ bindings: update(s.bindings, id, { name }) })),
  setResult: (id, result) =>
    set((s) => {
      // Skip no-op updates: every result change re-scopes the rows below,
      // which re-analyse and report back.
      const current = s.bindings.find((b) => b.id === id)?.result;
      if (JSON.stringify(current) === JSON.stringify(result)) return s;
      return { bindings: update(s.bindings, id, { result }) };
    }),
}));
