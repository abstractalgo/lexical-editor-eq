import { useCounterStore } from "./store.ts";
import "./App.css";

export function App() {
  const count = useCounterStore((state) => state.count);
  const increment = useCounterStore((state) => state.increment);
  const reset = useCounterStore((state) => state.reset);

  return (
    <main className="app">
      <h1>lexical-editor-eq</h1>
      <p className="count">{count}</p>
      <div className="actions">
        <button type="button" onClick={increment}>
          Increment
        </button>
        <button type="button" onClick={reset}>
          Reset
        </button>
      </div>
    </main>
  );
}
