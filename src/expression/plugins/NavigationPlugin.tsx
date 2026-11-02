import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { mergeRegister } from "@lexical/utils";
import { COMMAND_PRIORITY_LOW, KEY_DOWN_COMMAND, SELECT_ALL_COMMAND } from "lexical";
import { useEffect } from "react";
import { $navigate, $selectAllWidening, type Direction, type Unit } from "../navigation.ts";

const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

/** Direction and unit for a key press, or null for keys left to Lexical and the OS. */
function movement(event: KeyboardEvent): { direction: Direction; unit: Unit } | null {
  const { key, altKey, ctrlKey, metaKey } = event;
  if (key === "Home" || key === "End") {
    if (altKey || ctrlKey || metaKey) return null;
    return { direction: key === "End" ? "forward" : "backward", unit: "line" };
  }
  if (key !== "ArrowLeft" && key !== "ArrowRight") return null;
  const direction = key === "ArrowRight" ? "forward" : "backward";
  if (IS_MAC) {
    if (ctrlKey) return null;
    if (metaKey) return { direction, unit: "line" };
    return { direction, unit: altKey ? "word" : "char" };
  }
  if (altKey || metaKey) return null;
  return { direction, unit: ctrlKey ? "word" : "char" };
}

/**
 * Left/Right with word (⌥ / Ctrl) and line (⌘ / Home / End) modifiers, with or
 * without Shift, and select-all that widens from an argument outwards; see
 * navigation.ts. Handled on keydown, ahead of Lexical's own
 * shortcuts, because word moves are otherwise left to the browser.
 */
export function NavigationPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(
    () =>
      mergeRegister(
        editor.registerCommand(
          KEY_DOWN_COMMAND,
          (event) => {
            const move = movement(event);
            if (!move || !$navigate(move.direction, move.unit, event.shiftKey)) return false;
            event.preventDefault();
            return true;
          },
          COMMAND_PRIORITY_LOW,
        ),
        editor.registerCommand(
          SELECT_ALL_COMMAND,
          (event) => {
            if (!$selectAllWidening()) return false;
            event?.preventDefault();
            return true;
          },
          COMMAND_PRIORITY_LOW,
        ),
      ),
    [editor],
  );

  return null;
}
