import { nudgeStepMm } from "@vanbuild/core";
import { useEffect } from "react";
import { deletePart, duplicate, nudge, rotate, toggleLock } from "../state/actions";
import { useDocStore } from "../state/docStore";
import { useUiStore } from "../state/uiStore";

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/** Screen direction of each arrow key, as a step along the van (X) and across it (Y). */
function arrowStep(key: string, portrait: boolean): { dx: number; dy: number } | null {
  // Landscape: nose points left, passenger side is up. Portrait: nose points up.
  const landscape: Record<string, { dx: number; dy: number }> = {
    ArrowLeft: { dx: -1, dy: 0 },
    ArrowRight: { dx: 1, dy: 0 },
    ArrowUp: { dx: 0, dy: 1 },
    ArrowDown: { dx: 0, dy: -1 },
  };
  const upright: Record<string, { dx: number; dy: number }> = {
    ArrowLeft: { dx: 0, dy: -1 },
    ArrowRight: { dx: 0, dy: 1 },
    ArrowUp: { dx: -1, dy: 0 },
    ArrowDown: { dx: 1, dy: 0 },
  };
  return (portrait ? upright : landscape)[key] ?? null;
}

/** Editor keyboard shortcuts. Ignored while a text field has focus. */
export function useShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return;
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;

      if (mod && key === "z") {
        event.preventDefault();
        if (event.shiftKey) useDocStore.getState().redo();
        else useDocStore.getState().undo();
        return;
      }
      if (mod && key === "y") {
        event.preventDefault();
        useDocStore.getState().redo();
        return;
      }
      if (mod && key === "d") {
        const selected = useUiStore.getState().selectedId;
        if (!selected) return;
        // Ctrl+D is "bookmark this page" in browsers; here it duplicates the selected part.
        event.preventDefault();
        duplicate(selected);
        return;
      }
      if (mod || event.altKey) return;

      const ui = useUiStore.getState();
      const id = ui.selectedId;
      if (key === "Escape") {
        ui.select(null);
        return;
      }
      if (!id) return;

      if (key === "r") {
        event.preventDefault();
        rotate(id);
      } else if (key === "l") {
        event.preventDefault();
        toggleLock(id);
      } else if (key === "Delete" || key === "Backspace") {
        event.preventDefault();
        deletePart(id);
      } else {
        const portrait =
          document.querySelector("[data-testid=plan]")?.getAttribute("data-orientation") ===
          "portrait";
        const step = arrowStep(key, portrait);
        if (!step) return;
        event.preventDefault();
        const mm = nudgeStepMm(ui.units, event.shiftKey);
        nudge(id, step.dx * mm, step.dy * mm);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
