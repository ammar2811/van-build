import type { SnapGuide, UnitSystem, Vec3 } from "@vanbuild/core";
import { create } from "zustand";
import type { CloudUser } from "../cloud/backend";
import type { SyncStatus } from "../cloud/sync";
import type { SaveStatus } from "../persistence/autosave";

const UNITS_KEY = "vanbuild.units";
/** Set once someone has seen the welcome, so it never comes back on this browser. */
export const WELCOMED_KEY = "vanbuild.welcomed";

export function hasBeenWelcomed(): boolean {
  try {
    return globalThis.localStorage?.getItem(WELCOMED_KEY) === "1";
  } catch {
    return false;
  }
}

function loadUnits(): UnitSystem {
  try {
    const stored = globalThis.localStorage?.getItem(UNITS_KEY);
    if (stored === "metric" || stored === "imperial") return stored;
  } catch {
    // Storage can be unavailable (private mode). Fall through to the default.
  }
  // The US, Liberia and Myanmar build in inches.
  const region = globalThis.navigator?.language?.split("-")[1];
  return region === "US" || region === "LR" || region === "MM" ? "imperial" : "metric";
}

/** A drag in progress. Lives outside the document so it never lands in undo history. */
export interface DragState {
  id: string;
  position: Vec3;
  guides: SnapGuide[];
  /** Live positions of the parts riding on the dragged part. */
  followers: Record<string, Vec3>;
}

/** Which view of the design is showing. "split" is the plan and the 3D view side by side. */
export type ViewMode = "plan" | "side" | "3d" | "split" | "parts";

interface UiState {
  selectedId: string | null;
  /** A display preference, not part of the design: the document is always millimetres. */
  units: UnitSystem;
  drag: DragState | null;
  viewMode: ViewMode;
  saveStatus: SaveStatus;
  /** A message the user should see once, such as a saved design that could not be opened. */
  notice: string | null;
  /** "edit" is the person's own design; "shared" is someone else's, opened from a link. */
  mode: "edit" | "shared";
  /** Whether this build has accounts at all. */
  cloudAvailable: boolean;
  account: CloudUser | null;
  syncStatus: SyncStatus;
  /** First visit: offer the template picker before anything else. */
  welcome: boolean;
  select: (id: string | null) => void;
  setUnits: (units: UnitSystem) => void;
  setDrag: (drag: DragState | null) => void;
  setViewMode: (viewMode: ViewMode) => void;
  setSaveStatus: (status: SaveStatus) => void;
  setNotice: (notice: string | null) => void;
  setCloud: (cloud: Partial<Pick<UiState, "cloudAvailable" | "account" | "syncStatus">>) => void;
  setMode: (mode: UiState["mode"]) => void;
  setWelcome: (welcome: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  selectedId: null,
  units: loadUnits(),
  drag: null,
  viewMode: "plan",
  saveStatus: "saved",
  notice: null,
  mode: "edit",
  cloudAvailable: false,
  account: null,
  syncStatus: "signedOut",
  welcome: false,
  select: (selectedId) => set({ selectedId }),
  setUnits: (units) => {
    try {
      globalThis.localStorage?.setItem(UNITS_KEY, units);
    } catch {
      // Not being able to remember the preference is not worth interrupting anyone for.
    }
    set({ units });
  },
  setDrag: (drag) => set({ drag }),
  setViewMode: (viewMode) => set({ viewMode }),
  setSaveStatus: (saveStatus) => set({ saveStatus }),
  setNotice: (notice) => set({ notice }),
  setCloud: (cloud) => set(cloud),
  setMode: (mode) => set({ mode }),
  setWelcome: (welcome) => {
    if (!welcome) {
      try {
        globalThis.localStorage?.setItem(WELCOMED_KEY, "1");
      } catch {
        // Seeing the welcome again in a private window is harmless.
      }
    }
    set({ welcome });
  },
}));
