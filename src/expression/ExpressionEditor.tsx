import { HistoryExtension } from "@lexical/history";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalExtensionComposer } from "@lexical/react/LexicalExtensionComposer";
import { RichTextExtension } from "@lexical/rich-text";
import { mergeRegister } from "@lexical/utils";
import { defineExtension, type LexicalEditor, type NodeKey } from "lexical";
import { useEffect, useEffectEvent, useState } from "react";
import { $analyzeEditor, $loadExpression, type NodeLocation } from "./ast.ts";
import { $caretLocation } from "./caret.ts";
import { ArgNode } from "./nodes/ArgNode.ts";
import { CallNode } from "./nodes/CallNode.tsx";
import { EnumNode } from "./nodes/EnumNode.tsx";
import { VariableNode } from "./nodes/VariableNode.tsx";
import { InsertMenuPlugin } from "./plugins/InsertMenuPlugin.tsx";
import { KeyboardPlugin } from "./plugins/KeyboardPlugin.tsx";
import { NavigationPlugin } from "./plugins/NavigationPlugin.tsx";
import { createEditorStore, EditorStoreContext, useEditorStore } from "./store.ts";
import type { CaretLocation, Expr, ExprType, ExpressionResult, ExpressionSchema } from "./types.ts";
import "./ExpressionEditor.css";

export interface ExpressionEditorProps {
  schema: ExpressionSchema;
  /** Type the whole expression must evaluate to. Defaults to "any". */
  resultType?: ExprType;
  /** Read once on mount. */
  initialValue?: Expr | null;
  onChange?: (result: ExpressionResult) => void;
  /** Called on selection changes while the editor has focus. */
  onCaretChange?: (caret: CaretLocation | null) => void;
  placeholder?: string;
  /**
   * Keep the expression on one line and scroll horizontally, instead of
   * wrapping long content (and long transformations) onto more lines.
   */
  singleLine?: boolean;
}

export function ExpressionEditor({
  schema,
  resultType = "any",
  initialValue = null,
  onChange,
  onCaretChange,
  placeholder = "Type text, or @ to insert a variable or transformation",
  singleLine = false,
}: ExpressionEditorProps) {
  const [store] = useState(() => createEditorStore(schema, resultType));

  useEffect(() => {
    store.setState({ schema, resultType });
  }, [store, schema, resultType]);

  // Created once per editor: a new extension object would re-create the editor.
  // The initial value and schema are only read here, like `initialValue` promises.
  const [extension] = useState(() =>
    defineExtension({
      name: "expression-editor",
      namespace: "expression-editor",
      dependencies: [RichTextExtension, HistoryExtension],
      nodes: [VariableNode, EnumNode, CallNode, ArgNode],
      theme: { paragraph: "expr-line" },
      $initialEditorState: () => $loadExpression(initialValue, schema),
    }),
  );

  return (
    <EditorStoreContext.Provider value={store}>
      {/* contentEditable={null}: EditorFrame renders it inside the styled frame. */}
      <LexicalExtensionComposer extension={extension} contentEditable={null}>
        <EditorFrame placeholder={placeholder} singleLine={singleLine} />
        <KeyboardPlugin />
        <NavigationPlugin />
        <InsertMenuPlugin />
        <AnalysisPlugin onChange={onChange} onCaretChange={onCaretChange} />
        {singleLine && <HorizontalCaretScrollPlugin />}
      </LexicalExtensionComposer>
    </EditorStoreContext.Provider>
  );
}

function EditorFrame({ placeholder, singleLine }: { placeholder: string; singleLine: boolean }) {
  const rootError = useEditorStore((s) => s.diagnostics.root);
  return (
    <div
      className="expr-editor"
      data-error={rootError ? true : undefined}
      data-single-line={singleLine || undefined}
      title={rootError}
    >
      <ContentEditable
        className="expr-editor__input"
        aria-placeholder={placeholder}
        placeholder={<div className="expr-editor__placeholder">{placeholder}</div>}
      />
    </div>
  );
}

const CARET_SCROLL_MARGIN = 24;

/**
 * Single-line mode: after each update, scroll the input horizontally so the
 * caret stays visible. Lexical only keeps the caret in view vertically.
 */
function HorizontalCaretScrollPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(
    () =>
      editor.registerUpdateListener(() => {
        requestAnimationFrame(() => {
          const root = editor.getRootElement();
          const selection = window.getSelection();
          const node = selection?.focusNode;
          if (!root || !selection || !node || !root.contains(node)) return;

          const range = document.createRange();
          range.setStart(node, selection.focusOffset);
          let rect = range.getBoundingClientRect();
          if (rect.height === 0) {
            // Collapsed ranges at element boundaries have no box; use the nearest element's.
            const element = node instanceof Element ? node : node.parentElement;
            const child = element?.children[selection.focusOffset] ?? element;
            if (!child) return;
            rect = child.getBoundingClientRect();
          }
          const bounds = root.getBoundingClientRect();
          if (rect.right > bounds.right - CARET_SCROLL_MARGIN) {
            root.scrollLeft += rect.right - bounds.right + CARET_SCROLL_MARGIN;
          } else if (rect.left < bounds.left + CARET_SCROLL_MARGIN) {
            root.scrollLeft -= bounds.left + CARET_SCROLL_MARGIN - rect.left;
          }
        });
      }),
    [editor],
  );

  return null;
}

/** The editor the user last pressed or focused in, across all editor instances. */
let lastInteracted: LexicalEditor | null = null;

/**
 * Re-analyses on every change: publishes diagnostics to the nodes and the
 * result to the parent. On every update in the active editor, also reports
 * where the caret is in terms of the result.
 */
function AnalysisPlugin({
  onChange,
  onCaretChange,
}: {
  onChange?: (result: ExpressionResult) => void;
  onCaretChange?: (caret: CaretLocation | null) => void;
}) {
  const [editor] = useLexicalComposerContext();
  const setDiagnostics = useEditorStore((s) => s.setDiagnostics);
  const schema = useEditorStore((s) => s.schema);
  const resultType = useEditorStore((s) => s.resultType);
  const emitChange = useEffectEvent((result: ExpressionResult) => onChange?.(result));
  const emitCaret = useEffectEvent((caret: CaretLocation | null) => onCaretChange?.(caret));

  useEffect(() => {
    let locations: ReadonlyMap<NodeKey, NodeLocation> = new Map();
    const analyse = () => {
      const {
        diagnostics,
        locations: next,
        ...result
      } = editor.read(() => $analyzeEditor(schema, resultType));
      locations = next;
      setDiagnostics(diagnostics);
      emitChange(result);
    };
    const reportCaret = () => {
      // Only the editor the user is working in reports, so re-analysis in
      // other editors (e.g. after a scope change) doesn't claim the caret.
      const root = editor.getRootElement();
      if (!root?.contains(document.activeElement) && lastInteracted !== editor) return;
      emitCaret(editor.read(() => $caretLocation(locations)));
    };
    // Clicking chrome such as a call's name selects the node without moving
    // DOM focus (its mousedown is prevented), so pointer and focus events also
    // mark this editor as the active one.
    const claim = () => {
      lastInteracted = editor;
      requestAnimationFrame(reportCaret);
    };
    analyse();
    return mergeRegister(
      editor.registerUpdateListener(({ dirtyElements, dirtyLeaves }) => {
        if (dirtyElements.size > 0 || dirtyLeaves.size > 0) analyse();
        reportCaret();
      }),
      editor.registerRootListener((root, previous) => {
        previous?.removeEventListener("pointerdown", claim, true);
        previous?.removeEventListener("focusin", claim, true);
        root?.addEventListener("pointerdown", claim, true);
        root?.addEventListener("focusin", claim, true);
      }),
      () => {
        if (lastInteracted === editor) lastInteracted = null;
      },
    );
  }, [editor, schema, resultType, setDiagnostics]);

  return null;
}
