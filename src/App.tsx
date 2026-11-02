import { useMemo } from "react";
import { useAppStore, type Binding } from "./appStore.ts";
import { demoSchema } from "./demoSchema.ts";
import { ExpressionEditor, formatType, type ExpressionSchema } from "./expression/index.ts";
import { bindingsInScope, nameError } from "./scope.ts";
import "./App.css";

export function App() {
  const bindings = useAppStore((s) => s.bindings);
  const addBinding = useAppStore((s) => s.addBinding);

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
          <BindingRow key={binding.id} binding={binding} index={index} />
        ))}
      </ol>
      <button type="button" className="add" onClick={addBinding}>
        Add variable
      </button>

      <section className="output">
        <h2>Output</h2>
        <pre>
          {JSON.stringify(
            bindings.map((b) => ({ name: b.name, expr: b.result?.expr ?? null })),
            null,
            2,
          )}
        </pre>
      </section>
    </main>
  );
}

function BindingRow({ binding, index }: { binding: Binding; index: number }) {
  const bindings = useAppStore((s) => s.bindings);
  const renameBinding = useAppStore((s) => s.renameBinding);
  const removeBinding = useAppStore((s) => s.removeBinding);
  const setResult = useAppStore((s) => s.setResult);

  const schema = useScopedSchema(demoSchema, bindingsInScope(bindings, index, demoSchema));
  const error = nameError(bindings, index, demoSchema);
  const { result } = binding;

  return (
    <li className="binding">
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
            onChange={(next) => setResult(binding.id, next)}
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
