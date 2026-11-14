import { starterDesign } from "@vanbuild/catalog";
import type { DesignDoc } from "@vanbuild/core";
import { applyPatches, type Draft, enablePatches, type Patch, produceWithPatches } from "immer";
import { create } from "zustand";

enablePatches();

interface HistoryEntry {
  label: string;
  patches: Patch[];
  inverse: Patch[];
}

/** Undo steps kept in memory. Old steps fall off the far end. */
const HISTORY_LIMIT = 200;

interface DocState {
  doc: DesignDoc;
  past: HistoryEntry[];
  future: HistoryEntry[];
  /**
   * Make one undoable change. The recipe mutates a draft; Immer records what changed and
   * how to reverse it, so there are no hand-written inverse operations to get wrong.
   */
  commit: (label: string, recipe: (draft: Draft<DesignDoc>) => void) => void;
  undo: () => void;
  redo: () => void;
  /** Replace the whole design and forget history (opening another design). */
  reset: (doc: DesignDoc) => void;
  /** Replace the whole design as one undoable step (bringing back an old version). */
  replace: (label: string, doc: DesignDoc) => void;
}

export const useDocStore = create<DocState>((set, get) => ({
  doc: starterDesign(),
  past: [],
  future: [],

  commit: (label, recipe) => {
    const [doc, patches, inverse] = produceWithPatches(get().doc, recipe);
    if (patches.length === 0) return;
    set((state) => ({
      doc,
      past: [...state.past, { label, patches, inverse }].slice(-HISTORY_LIMIT),
      future: [],
    }));
  },

  undo: () => {
    const { past, future, doc } = get();
    const entry = past[past.length - 1];
    if (!entry) return;
    set({
      doc: applyPatches(doc, entry.inverse),
      past: past.slice(0, -1),
      future: [...future, entry],
    });
  },

  redo: () => {
    const { past, future, doc } = get();
    const entry = future[future.length - 1];
    if (!entry) return;
    set({
      doc: applyPatches(doc, entry.patches),
      past: [...past, entry],
      future: future.slice(0, -1),
    });
  },

  reset: (doc) => set({ doc, past: [], future: [] }),

  replace: (label, next) => {
    const [doc, patches, inverse] = produceWithPatches(get().doc, () => next);
    if (patches.length === 0) return;
    set((state) => ({
      doc,
      past: [...state.past, { label, patches, inverse }].slice(-HISTORY_LIMIT),
      future: [],
    }));
  },
}));
