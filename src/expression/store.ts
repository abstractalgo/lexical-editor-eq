import { createContext, useContext } from "react";
import { createStore, useStore, type StoreApi } from "zustand";
import type { ExprType, ExpressionSchema } from "./types.ts";

export interface EditorStoreState {
  schema: ExpressionSchema;
  resultType: ExprType;
  /** Error messages keyed by node key, `${callKey}/${argIndex}`, or "root". */
  diagnostics: Readonly<Record<string, string>>;
  setDiagnostics: (diagnostics: Record<string, string>) => void;
}

export type EditorStore = StoreApi<EditorStoreState>;

export function createEditorStore(schema: ExpressionSchema, resultType: ExprType): EditorStore {
  return createStore<EditorStoreState>()((set) => ({
    schema,
    resultType,
    diagnostics: {},
    setDiagnostics: (diagnostics) => set({ diagnostics }),
  }));
}

export const EditorStoreContext = createContext<EditorStore | null>(null);

export function useEditorStoreApi(): EditorStore {
  const store = useContext(EditorStoreContext);
  if (!store) throw new Error("useEditorStoreApi must be used inside ExpressionEditor");
  return store;
}

export function useEditorStore<T>(selector: (state: EditorStoreState) => T): T {
  const store = useContext(EditorStoreContext);
  if (!store) throw new Error("useEditorStore must be used inside ExpressionEditor");
  return useStore(store, selector);
}
