import { getPartDefinition, getShell } from "@vanbuild/catalog";
import {
  findIssues,
  type PartInstance,
  type PartIssue,
  partMass,
  partPrice,
  type VanShell,
} from "@vanbuild/core";
import { useMemo } from "react";
import { useDocStore } from "./docStore";
import { useUiStore } from "./uiStore";

export function useShell(): VanShell {
  const shellId = useDocStore((state) => state.doc.shellId);
  return useMemo(() => getShell(shellId), [shellId]);
}

/** Issues grouped by part, recomputed whenever the design changes. */
export function useIssues(): Map<string, PartIssue[]> {
  const doc = useDocStore((state) => state.doc);
  const shell = useShell();
  return useMemo(() => {
    const byPart = new Map<string, PartIssue[]>();
    for (const issue of findIssues(doc, shell)) {
      byPart.set(issue.partId, [...(byPart.get(issue.partId) ?? []), issue]);
    }
    return byPart;
  }, [doc, shell]);
}

/** The selected part, with its position replaced by the live drag position while dragging. */
export function useSelectedPart(): PartInstance | null {
  const selectedId = useUiStore((state) => state.selectedId);
  const drag = useUiStore((state) => state.drag);
  const part = useDocStore((state) => (selectedId ? state.doc.parts[selectedId] : undefined));
  return useMemo(() => {
    if (!part) return null;
    return drag?.id === part.id ? { ...part, position: drag.position } : part;
  }, [part, drag]);
}

export interface LayoutTotals {
  count: number;
  /** Grams added to the empty van. */
  mass: number;
  /** Minor units. */
  price: number;
  currency: string;
}

export function useTotals(): LayoutTotals {
  const parts = useDocStore((state) => state.doc.parts);
  return useMemo(() => {
    const totals: LayoutTotals = { count: 0, mass: 0, price: 0, currency: "USD" };
    for (const part of Object.values(parts)) {
      const def = getPartDefinition(part.defId);
      if (!def) continue;
      totals.count += 1;
      totals.mass += partMass(def, part);
      totals.price += partPrice(def, part);
      totals.currency = def.price.currency;
    }
    return totals;
  }, [parts]);
}
