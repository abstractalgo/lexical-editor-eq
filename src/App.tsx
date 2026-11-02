import { useMemo } from "react";
import { useAppStore, type Binding } from "./appStore.ts";
import { demoSchema } from "./demoSchema.ts";
import {
  ExpressionEditor,
  formatType,
  type ExprPath,
  type ExpressionSchema,
} from "./expression/index.ts";
import { JsonView } from "./JsonView.tsx";
import { bindingsInScope, nameError } from "./scope.ts";
import "./App.css";

export function App() {
  const bindings = useAppStore((s) => s.bindings);
  const revision = useAppStore((s) => s.revision);
  const addBinding = useAppStore((s) => s.addBinding);
  const reset = useAppStore((s) => s.reset);
  const singleLine = useAppStore((s) => s.singleLine);
  const setSingleLine = useAppStore((s) => s.setSingleLine);

  return (
    <main className="app">
      <header>
        <h1>Expression editor</h1>
        <p className="hint">
          Type text, or <kbd>@</kbd> to insert a variable or transformation. <kbd>←</kbd> /{" "}
          <kbd>→</kbd> move into and between arguments. Each value can use the variables defined
          above it.
        </p>
      </header>

      <ol className="bindings">
        {bindings.map((binding, index) => (
          <BindingRow key={`${revision}:${binding.id}`} binding={binding} index={index} />
        ))}
      </ol>
      <div className="actions">
        <button type="button" className="add" onClick={addBinding}>
          Add variable
        </button>
        <label className="toggle">
          <input
            type="checkbox"
            checked={singleLine}
            onChange={(e) => setSingleLine(e.target.checked)}
          />
          Single-line inputs
        </label>
        <button type="button" className="reset" onClick={reset}>
          Reset to example
        </button>
      </div>

      <Output />
    </main>
  );
}

/** JSON of the row that last had the caret, with the caret's node highlighted. */
function Output() {
  const active = useAppStore((s) => s.active);
  const binding = useAppStore((s) => s.bindings.find((b) => b.id === s.active?.id));

  if (!active || !binding) {
    return (
      <section className="output">
        <h2>Output</h2>
        <p className="hint">Put the caret in an expression to inspect its output.</p>
      </section>
    );
  }

  const { caret } = active;
  return (
    <section className="output">
      <h2>
        Output <span className="output__name">{binding.name}</span>
        <code className="output__path">{formatPath(caret.path)}</code>
      </h2>
      <JsonView
        value={binding.result?.expr ?? null}
        highlight={caret.path}
        caretOffset={caret.offset}
      />
    </section>
  );
}

/** `["parts", 3, "args", 0]` → `parts[3].args[0]`; the root is `(root)`. */
function formatPath(path: ExprPath): string {
  if (path.length === 0) return "(root)";
  return path
    .map((key, i) => (typeof key === "number" ? `[${key}]` : i === 0 ? key : `.${key}`))
    .join("");
}

function BindingRow({ binding, index }: { binding: Binding; index: number }) {
  const bindings = useAppStore((s) => s.bindings);
  const renameBinding = useAppStore((s) => s.renameBinding);
  const removeBinding = useAppStore((s) => s.removeBinding);
  const setResult = useAppStore((s) => s.setResult);
  const setCaret = useAppStore((s) => s.setCaret);
  const isActive = useAppStore((s) => s.active?.id === binding.id);
  const singleLine = useAppStore((s) => s.singleLine);

  const schema = useScopedSchema(demoSchema, bindingsInScope(bindings, index, demoSchema));
  const error = nameError(bindings, index, demoSchema);
  const { result } = binding;

  return (
    <li className="binding" data-active={isActive || undefined}>
      <div className="binding__row">
        <input
          className="binding__name"
          aria-label="Variable name"
          aria-invalid={error !== null}
          title={error ?? undefined}
          value={binding.name}
          spellCheck={false}
          onChange={(e) => renameBinding(binding.id, e.target.value)}
        />
        <span className="binding__eq">=</span>
        <div className="binding__value">
          <ExpressionEditor
            schema={schema}
            initialValue={binding.initialValue}
            singleLine={singleLine}
            onChange={(next) => setResult(binding.id, next)}
            onCaretChange={(caret) => setCaret(binding.id, caret)}
          />
        </div>
        <button
          type="button"
          className="binding__remove"
          aria-label={`Remove ${binding.name}`}
          onClick={() => removeBinding(binding.id)}
        >
          ×
        </button>
      </div>
      <div className="binding__meta">
        <code className="binding__type">{result?.type ? formatType(result.type) : "empty"}</code>
        {[error, ...(result?.errors ?? [])].filter(Boolean).map((message) => (
          <span key={message} className="binding__error">
            {message}
          </span>
        ))}
      </div>
    </li>
  );
}

/**
 * Adds `scope` to the base schema. The result keeps its identity while the
 * scope's content is unchanged, so editors don't re-analyse on every render.
 */
function useScopedSchema(base: ExpressionSchema, scope: ExpressionSchema["variables"]) {
  const scopeKey = JSON.stringify(scope);
  return useMemo(
    (): ExpressionSchema => ({ ...base, variables: [...base.variables, ...JSON.parse(scopeKey)] }),
    [base, scopeKey],
  );
}
