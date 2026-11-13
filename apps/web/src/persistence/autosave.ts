import type { DesignDoc } from "@vanbuild/core";
import type { DesignRepository } from "./repository";

export type SaveStatus = "saved" | "pending" | "saving" | "failed";

export interface Autosaver {
  /** Tell the autosaver the design changed. Saves after a short pause in editing. */
  changed(): void;
  /** Save now if anything is waiting (the tab is closing or going to the background). */
  flush(): Promise<void>;
  dispose(): void;
}

/**
 * Saves the latest design a moment after editing stops. Saves never overlap: if the design
 * changes while one is running, another follows it, and the status only says "saved" when
 * the newest design is the one in storage.
 */
export function createAutosaver(
  repository: Pick<DesignRepository, "save">,
  getDoc: () => DesignDoc,
  onStatus: (status: SaveStatus) => void,
  delayMs = 400,
): Autosaver {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running: Promise<void> | null = null;
  let dirty = false;
  let disposed = false;

  const save = async (): Promise<void> => {
    if (running) return running;
    running = (async () => {
      while (dirty) {
        dirty = false;
        onStatus("saving");
        try {
          await repository.save(getDoc());
        } catch (error) {
          console.error("Could not save the design", error);
          onStatus("failed");
          return;
        }
      }
      onStatus("saved");
    })().finally(() => {
      running = null;
    });
    return running;
  };

  const cancelTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  return {
    changed() {
      if (disposed) return;
      dirty = true;
      onStatus("pending");
      cancelTimer();
      timer = setTimeout(() => {
        timer = null;
        void save();
      }, delayMs);
    },
    async flush() {
      cancelTimer();
      if (dirty || running) await save();
    },
    dispose() {
      disposed = true;
      cancelTimer();
    },
  };
}
