import { LexicalComposer, type InitialConfigType } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { useEffect, useEffectEvent, useState } from "react";
import { $analyzeEditor, $loadExpression } from "./ast.ts";
import { ArgNode } from "./nodes/ArgNode.ts";
import { CallNode } from "./nodes/CallNode.tsx";
import { EnumNode } from "./nodes/EnumNode.tsx";
import { VariableNode } from "./nodes/VariableNode.tsx";
import { InsertMenuPlugin } from "./plugins/InsertMenuPlugin.tsx";
import { KeyboardPlugin } from "./plugins/KeyboardPlugin.tsx";
import { NavigationPlugin } from "./plugins/NavigationPlugin.tsx";
import { createEditorStore, EditorStoreContext, useEditorStore } from "./store.ts";
import type { Expr, ExprType, ExpressionResult, ExpressionSchema } from "./types.ts";
import "./ExpressionEditor.css";

export interface ExpressionEditorProps {
  schema: ExpressionSchema;
  /** Type the whole expression must evaluate to. Defaults to "any". */
  resultType?: ExprType;
  /** Read once on mount. */
  initialValue?: Expr | null;
  onChange?: (result: ExpressionResult) => void;
  placeholder?: string;
}

export function ExpressionEditor({
  schema,
  resultType = "any",
  initialValue = null,
  onChange,
  placeholder = "Type text, or @ to insert a variable or transformation",
}: ExpressionEditorProps) {
  const [store] = useState(() => createEditorStore(schema, resultType));

  useEffect(() => {
    store.setState({ schema, resultType });
  }, [store, schema, resultType]);

  const initialConfig: InitialConfigType = {
    namespace: "expression-editor",
    nodes: [VariableNode, EnumNode, CallNode, ArgNode],
    theme: { paragraph: "expr-line" },
    editorState: () => $loadExpression(initialValue, schema),
    onError: (error) => {
      throw error;
    },
  };

  return (
    <EditorStoreContext.Provider value={store}>
      <LexicalComposer initialConfig={initialConfig}>
        <EditorFrame placeholder={placeholder} />
        <HistoryPlugin />
        <KeyboardPlugin />
        <NavigationPlugin />
        <InsertMenuPlugin />
        <AnalysisPlugin onChange={onChange} />
      </LexicalComposer>
    </EditorStoreContext.Provider>
  );
}

function EditorFrame({ placeholder }: { placeholder: string }) {
  const rootError = useEditorStore((s) => s.diagnostics.root);
  return (
    <div className="expr-editor" data-error={rootError ? true : undefined} title={rootError}>
      <RichTextPlugin
        contentEditable={
          <ContentEditable
            className="expr-editor__input"
            aria-placeholder={placeholder}
            placeholder={<div className="expr-editor__placeholder">{placeholder}</div>}
          />
        }
        ErrorBoundary={LexicalErrorBoundary}
      />
    </div>
  );
}

/** Re-analyses on every change: publishes diagnostics to the nodes and the result to the parent. */
function AnalysisPlugin({ onChange }: { onChange?: (result: ExpressionResult) => void }) {
  const [editor] = useLexicalComposerContext();
  const setDiagnostics = useEditorStore((s) => s.setDiagnostics);
  const schema = useEditorStore((s) => s.schema);
  const resultType = useEditorStore((s) => s.resultType);
  const emitChange = useEffectEvent((result: ExpressionResult) => onChange?.(result));

  useEffect(() => {
    const run = () => {
      const { diagnostics, ...result } = editor.read(() => $analyzeEditor(schema, resultType));
      setDiagnostics(diagnostics);
      emitChange(result);
    };
    run();
    return editor.registerUpdateListener(({ dirtyElements, dirtyLeaves }) => {
      if (dirtyElements.size > 0 || dirtyLeaves.size > 0) run();
    });
  }, [editor, schema, resultType, setDiagnostics]);

  return null;
}
