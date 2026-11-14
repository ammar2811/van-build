import { getPartDefinition, shells } from "@vanbuild/catalog";
import { type DesignDoc, dropUnknownParts, loadDesign } from "@vanbuild/core";
import { useDocStore } from "../state/docStore";
import { hasBeenWelcomed, useUiStore } from "../state/uiStore";
import { createAutosaver } from "./autosave";
import type { DesignRepository } from "./repository";

/** Turn whatever was in storage into a design the editor can open, or explain why not. */
export function openSaved(raw: unknown): { doc: DesignDoc; notice: string | null } | string {
  const loaded = loadDesign(raw);
  if (!loaded.ok) return loaded.error;
  if (!shells.some((shell) => shell.id === loaded.doc.shellId)) {
    return `Saved design uses a van this version does not know (${loaded.doc.shellId})`;
  }
  const { doc, removed } = dropUnknownParts(loaded.doc, getPartDefinition);
  const notice =
    removed.length === 0
      ? null
      : `${removed.length} part${removed.length === 1 ? " was" : "s were"} removed because the catalog no longer has ${removed.length === 1 ? "it" : "them"}.`;
  return { doc, notice };
}

/**
 * Open the design saved on this device, then keep saving it as it changes. The editor works
 * without storage too (private browsing): it just says that nothing is being saved.
 */
export async function startPersistence(repository: DesignRepository): Promise<void> {
  const ui = useUiStore.getState();
  let storageWorks = true;
  try {
    const raw = await repository.load();
    // Nothing saved yet: a first visit. Offer the templates over the example layout.
    if (raw === null && !hasBeenWelcomed()) ui.setWelcome(true);
    if (raw !== null) {
      const opened = openSaved(raw);
      if (typeof opened === "string") {
        // Keep the unreadable data aside before anything overwrites it.
        await repository.keepBackup(raw);
        ui.setNotice(`${opened}. A fresh layout was opened and the old data was kept as a backup.`);
      } else {
        useDocStore.getState().reset(opened.doc);
        if (opened.notice) ui.setNotice(opened.notice);
      }
    }
  } catch (error) {
    console.warn("Design storage is unavailable", error);
    storageWorks = false;
    ui.setSaveStatus("failed");
  }
  if (!storageWorks) return;

  const autosaver = createAutosaver(
    repository,
    () => useDocStore.getState().doc,
    (status) => useUiStore.getState().setSaveStatus(status),
  );
  useDocStore.subscribe((state, previous) => {
    if (state.doc !== previous.doc) autosaver.changed();
  });
  // Do not lose the last half second of edits when the tab is closed or put in the background.
  const flush = () => void autosaver.flush();
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
}
