import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { lookupTestDefinition, sampleDesign, testDesign, testPart } from "../testing/fixtures";
import { expectGolden } from "../testing/golden";
import { bomToCsv, buildBom } from "./bom";

/** A layout with repeats, a resized part, a renamed part and a price override. */
function shoppingDesign() {
  const resized = {
    ...testPart("crate-3", "crate", 1500, 0),
    params: { width: 600, depth: 500, height: 500 },
  };
  const renamed = {
    ...testPart("cabinet-2", "cabinet", 2200, 0),
    overrides: { name: 'Pantry, 24"' },
  };
  const bargain = { ...testPart("shelf-2", "shelf", 2200, 0, 1400), overrides: { price: 4_550 } };
  return testDesign([
    testPart("cabinet-1", "cabinet", 1000, -600),
    renamed,
    testPart("crate-1", "crate", 250, 650),
    testPart("crate-2", "crate", 800, 650),
    resized,
    testPart("shelf-1", "shelf", 1000, -700, 1400),
    bargain,
    testPart("tank-1", "tank", 2600, 0),
  ]);
}

describe("buildBom", () => {
  it("matches the golden bill of materials", () => {
    const bom = buildBom(shoppingDesign(), lookupTestDefinition);
    expectGolden("bom-shopping.json", `${JSON.stringify(bom, null, 2)}\n`);
  });

  it("counts identical parts together and keeps different ones apart", () => {
    const bom = buildBom(shoppingDesign(), lookupTestDefinition);
    const crates = bom.lines.filter((line) => line.defId === "crate");
    expect(crates.map((line) => [line.width, line.quantity])).toEqual([
      [600, 1],
      [500, 2],
    ]);
    // Same definition, but one was renamed and one has its own price.
    expect(bom.lines.filter((line) => line.defId === "cabinet")).toHaveLength(2);
    expect(
      bom.lines.filter((line) => line.defId === "shelf").map((line) => line.unitPrice),
    ).toEqual([4_550, 10_000]);
    expect(bom.count).toBe(8);
  });

  it("is empty for an empty design", () => {
    expect(buildBom(testDesign([]), lookupTestDefinition)).toEqual({
      lines: [],
      count: 0,
      total: 0,
      currency: "USD",
    });
  });

  it("fails loudly on a part with no definition", () => {
    const doc = testDesign([{ ...testPart("x", "crate", 500, 0), defId: "gone" }]);
    expect(() => buildBom(doc, lookupTestDefinition)).toThrow(/Unknown part definition/);
  });

  const partArb = fc.record({
    defId: fc.constantFrom("cabinet", "crate", "shelf", "tank", "box"),
    width: fc.constantFrom(400, 500, 600),
    price: fc.option(fc.integer({ min: 0, max: 100_000 }), { nil: undefined }),
  });

  it("adds up: line totals, grand total and part count", () => {
    fc.assert(
      fc.property(fc.array(partArb, { maxLength: 20 }), (specs) => {
        const parts = specs.map((spec, i) => {
          const base = testPart(`p${String(i).padStart(2, "0")}`, spec.defId, 500, 0);
          return {
            ...base,
            params: { ...base.params, width: spec.width },
            overrides: spec.price === undefined ? {} : { price: spec.price },
          };
        });
        const bom = buildBom(testDesign(parts), lookupTestDefinition);
        for (const line of bom.lines) {
          expect(line.total).toBe(line.quantity * line.unitPrice);
          expect(line.partIds).toHaveLength(line.quantity);
        }
        expect(bom.total).toBe(bom.lines.reduce((sum, line) => sum + line.total, 0));
        expect(bom.count).toBe(parts.length);
        const listed = bom.lines.flatMap((line) => line.partIds).sort();
        expect(listed).toEqual(parts.map((part) => part.id).sort());
      }),
    );
  });

  it("does not depend on the order parts were added", () => {
    const doc = shoppingDesign();
    const reversed = { ...doc, parts: Object.fromEntries(Object.entries(doc.parts).reverse()) };
    expect(buildBom(reversed, lookupTestDefinition)).toEqual(buildBom(doc, lookupTestDefinition));
  });
});

describe("bomToCsv", () => {
  it("matches the golden CSV in millimetres", () => {
    const bom = buildBom(shoppingDesign(), lookupTestDefinition);
    expectGolden("bom-shopping-metric.csv", bomToCsv(bom, "metric"));
  });

  it("writes inches to two decimals", () => {
    const csv = bomToCsv(buildBom(sampleDesign(), lookupTestDefinition), "imperial");
    expect(csv.split("\r\n")[0]).toContain("Width (in)");
    expect(csv).toContain("1,Cabinet,storage,47.24,23.62,35.43,100.00,100.00,");
  });

  it("quotes names with commas and quotes", () => {
    const csv = bomToCsv(buildBom(shoppingDesign(), lookupTestDefinition), "metric");
    expect(csv).toContain('"Pantry, 24"""');
  });

  it("ends with a total row and uses CRLF line endings", () => {
    const csv = bomToCsv(buildBom(sampleDesign(), lookupTestDefinition), "metric");
    const rows = csv.trimEnd().split("\r\n");
    expect(rows.at(-1)).toBe("4,Total,,,,,,400.00,");
    expect(csv.endsWith("\r\n")).toBe(true);
  });
});
