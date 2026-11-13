import { describe, expect, it } from "vitest";
import { DESIGN_SCHEMA_VERSION } from "../schema/design";
import { lookupTestDefinition, sampleDesign, testDesign, testPart } from "../testing/fixtures";
import { dropUnknownParts, loadDesign } from "./load";

describe("loadDesign", () => {
  it("accepts a design that went through JSON", () => {
    const doc = sampleDesign();
    const result = loadDesign(JSON.parse(JSON.stringify(doc)));
    expect(result).toEqual({ ok: true, doc, migratedFrom: null });
  });

  it("rejects things that are not designs", () => {
    for (const raw of [null, undefined, 42, "design", [], {}]) {
      expect(loadDesign(raw).ok).toBe(false);
    }
  });

  it("refuses a design from a newer version instead of guessing", () => {
    const result = loadDesign({ ...sampleDesign(), schemaVersion: DESIGN_SCHEMA_VERSION + 1 });
    expect(result).toEqual({
      ok: false,
      error: `Saved design was made with a newer version of the app (schema ${DESIGN_SCHEMA_VERSION + 1})`,
    });
  });

  it("says where a damaged design is damaged", () => {
    const doc = JSON.parse(JSON.stringify(sampleDesign()));
    doc.parts.cabinet.position.x = "left";
    const result = loadDesign(doc);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain("parts.cabinet.position.x");
  });

  it("rejects a rotation that is not a quarter turn", () => {
    const doc = JSON.parse(JSON.stringify(sampleDesign()));
    doc.parts.cabinet.yaw = 45;
    expect(loadDesign(doc).ok).toBe(false);
  });
});

describe("dropUnknownParts", () => {
  it("removes parts whose definition is gone and reports them", () => {
    const retired = { ...testPart("old", "crate", 500, 0), defId: "retired-part" };
    const doc = testDesign([testPart("keep", "crate", 1500, 0), retired]);
    const result = dropUnknownParts(doc, lookupTestDefinition);
    expect(result.removed).toEqual(["old"]);
    expect(Object.keys(result.doc.parts)).toEqual(["keep"]);
  });

  it("returns the same document when nothing is missing", () => {
    const doc = sampleDesign();
    expect(dropUnknownParts(doc, lookupTestDefinition).doc).toBe(doc);
  });
});
