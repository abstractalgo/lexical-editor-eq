import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { demoBindings } from "./demoSchema.ts";
import type { CaretLocation, Expr, ExpressionResult } from "./expression/index.ts";

export interface Binding {
  id: string;
  name: string;
  /** Loaded into the editor when the row mounts. */
  initialValue: Expr | null;
  /** Latest output of the row's editor. */
  result: ExpressionResult | null;
}

interface AppState {
  bindings: Binding[];
  /**
   * Bumped when another tab changes the saved state, so rows remount and
   * their editors load the new values (editors read `initialValue` once).
   */
  revision: number;
  /** Row whose editor last had the caret, and where the caret was (not saved). */
  active: { id: string; caret: CaretLocation } | null;
  setCaret: (id: string, caret: CaretLocation | null) => void;
  addBinding: () => void;
  removeBinding: (id: string) => void;
  renameBinding: (id: string, name: string) => void;
  setResult: (id: string, result: ExpressionResult) => void;
  reset: () => void;
}

/** What is saved: names and expressions. Types and errors are recomputed on load. */
interface PersistedState {
  bindings: { id: string; name: string; value: Expr | null }[];
}

const STORAGE_KEY = "expression-editor:bindings";

/**
 * localStorage that skips writes equal to what this tab last read or wrote.
 * After loading another tab's change, the remounted editors report their
 * values again; without this the tab would write that state back and could
 * overwrite a newer change the other tab made in the meantime.
 */
let lastSynced: string | null = null;
const syncedStorage: StateStorage = {
  getItem: (name) => {
    try {
      lastSynced = localStorage.getItem(name);
    } catch {
      lastSynced = null; // storage blocked: start from the example
    }
    return lastSynced;
  },
  setItem: (name, value) => {
    if (value === lastSynced) return;
    lastSynced = value;
    try {
      localStorage.setItem(name, value);
    } catch {
      // Storage blocked or full: keep working without saving.
    }
  },
  removeItem: (name) => {
    try {
      localStorage.removeItem(name);
    } catch {
      // ignore
    }
  },
};

const newBinding = (
  name: string,
  initialValue: Expr | null,
  id: string = crypto.randomUUID(),
): Binding => ({
  id,
  name,
  initialValue,
  result: null,
});

const demoState = () => demoBindings.map((b) => newBinding(b.name, b.value));

const update = (bindings: Binding[], id: string, patch: Partial<Binding>) =>
  bindings.map((b) => (b.id === id ? { ...b, ...patch } : b));

function isPersistedState(value: unknown): value is PersistedState {
  if (typeof value !== "object" || value === null || !("bindings" in value)) return false;
  const { bindings } = value;
  return (
    Array.isArray(bindings) &&
    bindings.every(
      (b: unknown) =>
        typeof b === "object" &&
        b !== null &&
        "id" in b &&
        typeof b.id === "string" &&
        "name" in b &&
        typeof b.name === "string",
    )
  );
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      bindings: demoState(),
      revision: 0,
      active: null,
      setCaret: (id, caret) =>
        set((s) => {
          // Ignore editors losing the caret: keep showing the last position.
          if (!caret) return s;
          if (s.active?.id === id && JSON.stringify(s.active.caret) === JSON.stringify(caret))
            return s;
          return { active: { id, caret } };
        }),
      addBinding: () =>
        set((s) => ({
          bindings: [...s.bindings, newBinding(`var${s.bindings.length + 1}`, null)],
        })),
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
      reset: () => set((s) => ({ bindings: demoState(), revision: s.revision + 1 })),
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => syncedStorage),
      partialize: (state): PersistedState => ({
        bindings: state.bindings.map((b) => ({
          id: b.id,
          name: b.name,
          value: b.result ? b.result.expr : b.initialValue,
        })),
      }),
      merge: (persisted, current) =>
        isPersistedState(persisted)
          ? {
              ...current,
              bindings: persisted.bindings.map((b) => newBinding(b.name, b.value ?? null, b.id)),
            }
          : current,
    },
  ),
);

// Keep tabs in sync: reload when another tab saves, and remount the rows.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY) return;
    void Promise.resolve(useAppStore.persist.rehydrate()).then(() =>
      useAppStore.setState((s) => ({ revision: s.revision + 1 })),
    );
  });
}
