import type { DesignDoc } from "@vanbuild/core";

/**
 * Where designs are kept. The editor only knows this interface, so the browser's own storage
 * (now) and a cloud account (later) are interchangeable.
 */
export interface DesignRepository {
  /** The saved design exactly as stored, or null when there is none. Not yet validated. */
  load(): Promise<unknown | null>;
  save(doc: DesignDoc): Promise<void>;
  /** Set aside a saved design that could not be opened, so it is not lost when overwritten. */
  keepBackup(raw: unknown): Promise<void>;
}
