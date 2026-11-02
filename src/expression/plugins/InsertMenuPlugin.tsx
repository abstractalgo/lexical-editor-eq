import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
  type MenuRenderFn,
  useBasicTypeaheadTriggerMatch,
} from "@lexical/react/LexicalTypeaheadMenuPlugin";
import {
  $getSelection,
  $insertNodes,
  $isRangeSelection,
  type LexicalNode,
  type TextNode,
} from "lexical";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { $expectedTypeAt, $selectArgStartWhenMounted } from "../context.ts";
import { $createCallNode, $isCallNode } from "../nodes/CallNode.tsx";
import { $createEnumNode } from "../nodes/EnumNode.tsx";
import { $createVariableNode } from "../nodes/VariableNode.tsx";
import { useEditorStore } from "../store.ts";
import { enumValuesFor, formatType, isAssignable } from "../typeUtils.ts";
import type { ExprType } from "../types.ts";

type OptionGroup = "Values" | "Variables" | "Transformations";

class InsertOption extends MenuOption {
  constructor(
    key: string,
    readonly group: OptionGroup,
    readonly label: string,
    readonly detail: string,
    readonly compatible: boolean,
    readonly $create: () => LexicalNode,
  ) {
    super(key);
  }
}

const MAX_OPTIONS = 30;

const GROUP_ICONS: Record<OptionGroup, string> = {
  Values: "=",
  Variables: "[]",
  Transformations: "ƒ",
};

/** `@` opens a menu of enum values, variables and transformations. */
export function InsertMenuPlugin() {
  const [editor] = useLexicalComposerContext();
  const schema = useEditorStore((s) => s.schema);
  const resultType = useEditorStore((s) => s.resultType);
  const [query, setQuery] = useState<string | null>(null);
  const [expected, setExpected] = useState<ExprType>("any");
  const triggerFn = useBasicTypeaheadTriggerMatch("@", {
    minLength: 0,
    punctuation: "\\,\\(\\)\\[\\]",
  });

  const options = useMemo(() => {
    if (query === null) return [];
    const q = query.toLowerCase();
    const matches = (text: string) => text.toLowerCase().includes(q);
    const result: InsertOption[] = [];

    const enumValues = enumValuesFor(expected, schema);
    const enumName =
      expected === "boolean" ? "boolean" : typeof expected === "object" ? expected.enum : "";
    for (const value of enumValues ?? []) {
      if (!matches(value)) continue;
      result.push(
        new InsertOption(`enum:${value}`, "Values", value, enumName, true, () =>
          $createEnumNode(enumName, value),
        ),
      );
    }
    for (const v of schema.variables) {
      if (!matches(v.path)) continue;
      result.push(
        new InsertOption(
          `var:${v.path}`,
          "Variables",
          `[${v.path}]`,
          formatType(v.type),
          isAssignable(v.type, expected),
          () => $createVariableNode(v.path),
        ),
      );
    }
    for (const t of schema.transformations) {
      if (!matches(t.name)) continue;
      result.push(
        new InsertOption(
          `fn:${t.name}`,
          "Transformations",
          `${t.name}(${t.params.map((p) => p.name).join(", ")})`,
          `→ ${formatType(t.returns)}`,
          isAssignable(t.returns, expected),
          () => $createCallNode(t.name, t.params.length),
        ),
      );
    }
    // Compatible options first, keeping group order otherwise.
    return result
      .toSorted((a, b) => Number(b.compatible) - Number(a.compatible))
      .slice(0, MAX_OPTIONS);
  }, [query, expected, schema]);

  return (
    <LexicalTypeaheadMenuPlugin<InsertOption>
      triggerFn={triggerFn}
      options={options}
      onQueryChange={(next) => {
        setQuery(next);
        if (next === null) return;
        editor.read(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            setExpected($expectedTypeAt(selection.anchor.getNode(), schema, resultType));
          }
        });
      }}
      onSelectOption={(option, textNode: TextNode | null, closeMenu) => {
        editor.update(() => {
          const node = option.$create();
          if (textNode) textNode.replace(node);
          else $insertNodes([node]);
          node.selectNext(0, 0);
          const firstArg = $isCallNode(node) ? node.getArgs()[0] : null;
          if (firstArg) $selectArgStartWhenMounted(editor, firstArg.getKey());
          closeMenu();
        });
      }}
      menuRenderFn={renderMenu}
    />
  );
}

const renderMenu: MenuRenderFn<InsertOption> = (
  anchorRef,
  { options, selectedIndex, selectOptionAndCleanUp, setHighlightedIndex },
) =>
  anchorRef.current && options.length > 0
    ? createPortal(
        <ul className="expr-menu" role="listbox">
          {options.map((option, i) => (
            <li
              key={option.key}
              ref={option.setRefElement}
              role="option"
              aria-selected={selectedIndex === i}
              className="expr-menu__item"
              data-incompatible={option.compatible ? undefined : true}
              onMouseEnter={() => setHighlightedIndex(i)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectOptionAndCleanUp(option)}
            >
              <span className="expr-menu__group" data-group={option.group} title={option.group}>
                {GROUP_ICONS[option.group]}
              </span>
              <span className="expr-menu__label">{option.label}</span>
              <span className="expr-menu__detail">{option.detail}</span>
            </li>
          ))}
        </ul>,
        anchorRef.current,
      )
    : null;
