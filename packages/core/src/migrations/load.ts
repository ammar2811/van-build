import type { DefinitionLookup } from "../parts/parts";
import { DESIGN_SCHEMA_VERSION, type DesignDoc, DesignDocSchema } from "../schema/design";

/**
 * Loading a saved design. Saved data is never trusted: it is brought up to the current
 * schema version step by step, then validated in full before the editor sees it.
 */

/** One step per schema version: `MIGRATIONS[1]` turns a version 1 document into version 2. */
const MIGRATIONS: Record<number, (doc: Record<string, unknown>) => Record<string, unknown>> = {};

export type LoadResult =
  | { ok: true; doc: DesignDoc; migratedFrom: number | null }
  | { ok: false; error: string };

export function loadDesign(raw: unknown): LoadResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, error: "Saved design is not a design document" };
  }
  let doc = raw as Record<string, unknown>;
  const savedVersion = doc.schemaVersion;
  if (typeof savedVersion !== "number" || !Number.isInteger(savedVersion) || savedVersion < 1) {
    return { ok: false, error: "Saved design has no schema version" };
  }
  if (savedVersion > DESIGN_SCHEMA_VERSION) {
    return {
      ok: false,
      error: `Saved design was made with a newer version of the app (schema ${savedVersion})`,
    };
  }
  for (let version = savedVersion; version < DESIGN_SCHEMA_VERSION; version++) {
    const migrate = MIGRATIONS[version];
    if (!migrate) return { ok: false, error: `No migration from schema ${version}` };
    doc = migrate(doc);
  }
  const parsed = DesignDocSchema.safeParse(doc);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.join(".") || "document";
    return { ok: false, error: `Saved design is damaged at ${where}: ${issue?.message ?? ""}` };
  }
  return {
    ok: true,
    doc: parsed.data,
    migratedFrom: savedVersion === DESIGN_SCHEMA_VERSION ? null : savedVersion,
  };
}

/**
 * Drop parts whose catalog definition no longer exists, so one retired part cannot stop a
 * whole design from opening. Returns the ids that were removed.
 */
export function dropUnknownParts(
  doc: DesignDoc,
  definitions: DefinitionLookup,
): { doc: DesignDoc; removed: string[] } {
  const removed = Object.values(doc.parts)
    .filter((part) => !definitions(part.defId))
    .map((part) => part.id)
    .sort();
  if (removed.length === 0) return { doc, removed };
  const parts = { ...doc.parts };
  for (const id of removed) delete parts[id];
  return { doc: { ...doc, parts }, removed };
}
