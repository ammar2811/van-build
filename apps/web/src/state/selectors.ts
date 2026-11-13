import { getPartDefinition, getShell } from "@vanbuild/catalog";
import {
  type DesignDoc,
  designWeight,
  findIssues,
  type PartInstance,
  type PartIssue,
  partMass,
  partPrice,
  type VanShell,
  type WeightReport,
} from "@vanbuild/core";
import { useMemo } from "react";
import { useDocStore } from "./docStore";
import { useUiStore } from "./uiStore";

export function useShell(): VanShell {
  const shellId = useDocStore((state) => state.doc.shellId);
  return useMemo(() => getShell(shellId), [shellId]);
}

/**
 * The design as it is on screen right now: the saved document with the part being dragged
 * (and anything riding on it) at its live position. Derived views use this so they follow
 * a drag as it happens.
 */
export function useLiveDoc(): DesignDoc {
  const doc = useDocStore((state) => state.doc);
  const drag = useUiStore((state) => state.drag);
  return useMemo(() => {
    if (!drag) return doc;
    const parts: Record<string, PartInstance> = {};
    for (const part of Object.values(doc.parts)) {
      const position = part.id === drag.id ? drag.position : drag.followers[part.id];
      parts[part.id] = position ? { ...part, position } : part;
    }
    return { ...doc, parts };
  }, [doc, drag]);
}

/** Issues grouped by part, recomputed whenever the design changes. */
export function useIssues(): Map<string, PartIssue[]> {
  const doc = useDocStore((state) => state.doc);
  const shell = useShell();
  return useMemo(() => {
    const byPart = new Map<string, PartIssue[]>();
    for (const issue of findIssues(doc, shell, getPartDefinition)) {
      byPart.set(issue.partId, [...(byPart.get(issue.partId) ?? []), issue]);
    }
    return byPart;
  }, [doc, shell]);
}

/** Axle loads and payload for the design as it is on screen, mid-drag included. */
export function useWeight(): WeightReport {
  const doc = useLiveDoc();
  const shell = useShell();
  return useMemo(() => designWeight(doc, shell, getPartDefinition), [doc, shell]);
}

/** The selected part, with its position replaced by the live drag position while dragging. */
export function useSelectedPart(): PartInstance | null {
  const selectedId = useUiStore((state) => state.selectedId);
  const doc = useLiveDoc();
  return selectedId ? (doc.parts[selectedId] ?? null) : null;
}

export interface LayoutTotals {
  count: number;
  /** Grams added to the empty van by the build (people not included). */
  mass: number;
  /** Minor units. */
  price: number;
  currency: string;
}

export function useTotals(): LayoutTotals {
  const parts = useDocStore((state) => state.doc.parts);
  const fillLevels = useDocStore((state) => state.doc.loadCase.fillLevels);
  return useMemo(() => {
    const totals: LayoutTotals = { count: 0, mass: 0, price: 0, currency: "USD" };
    for (const part of Object.values(parts)) {
      const def = getPartDefinition(part.defId);
      if (!def) continue;
      totals.count += 1;
      totals.mass += partMass(def, part, fillLevels[part.id] ?? 1);
      totals.price += partPrice(def, part);
      totals.currency = def.price.currency;
    }
    return totals;
  }, [parts, fillLevels]);
}
