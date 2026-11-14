import { describe, expect, it } from "vitest";
import { buildBom } from "../bom/bom";
import type { DesignDoc } from "../schema/design";
import {
  lookupTestDefinition,
  sampleDesign,
  testDesign,
  testPart,
  testShell,
} from "../testing/fixtures";
import { expectGolden } from "../testing/golden";
import { kgToGrams } from "../units/mass";
import { bomDrawings, bomSheetCount } from "./bomSheet";
import { elevationDrawing } from "./elevation";
import type { Drawing } from "./ir";
import { buildPack } from "./pack";
import { drawingsToPdf } from "./pdf";
import { drawingToSvg } from "./svg";
import { weightDrawing } from "./weightSheet";

const DATE = "2026-11-13";

/** The sample layout with two people aboard, a half-full tank and one number from a sticker. */
function loadedDesign(): DesignDoc {
  const doc = sampleDesign();
  return {
    ...doc,
    vehicle: { gawrRear: kgToGrams(2500) },
    loadCase: { occupants: 2, occupantMass: 80_000, fillLevels: { tank: 0.5 } },
  };
}

function texts(drawing: Drawing): string[] {
  return drawing.items.flatMap((item) => (item.type === "text" ? [item.text] : []));
}

function expectOnPage(drawing: Drawing): void {
  for (const item of drawing.items) {
    const xs =
      item.type === "line"
        ? [item.x1, item.x2]
        : item.type === "polygon"
          ? item.points.map((p) => p[0])
          : item.type === "rect"
            ? [item.x, item.x + item.w]
            : [item.x];
    const ys =
      item.type === "line"
        ? [item.y1, item.y2]
        : item.type === "polygon"
          ? item.points.map((p) => p[1])
          : item.type === "rect"
            ? [item.y, item.y + item.h]
            : [item.y];
    for (const x of xs) expect(x >= 10 && x <= drawing.width - 10, JSON.stringify(item)).toBe(true);
    for (const y of ys)
      expect(y >= 10 && y <= drawing.height - 10, JSON.stringify(item)).toBe(true);
  }
}

describe("buildPack", () => {
  const options = { units: "metric", date: DATE } as const;

  it("matches the metric goldens, sheet by sheet", () => {
    const pack = buildPack(loadedDesign(), testShell, lookupTestDefinition, options);
    expect(pack.map((drawing) => drawing.title)).toEqual([
      "Test layout - floor plan",
      "Test layout - side elevation",
      "Test layout - weight estimate",
      "Test layout - parts list",
    ]);
    expectGolden("pack-sample-1-plan.svg", drawingToSvg(pack[0] as Drawing));
    expectGolden("pack-sample-2-elevation.svg", drawingToSvg(pack[1] as Drawing));
    expectGolden("pack-sample-3-weight.svg", drawingToSvg(pack[2] as Drawing));
    expectGolden("pack-sample-4-parts.svg", drawingToSvg(pack[3] as Drawing));
  });

  it("matches the imperial goldens for the sheets that show weights and money", () => {
    const pack = buildPack(loadedDesign(), testShell, lookupTestDefinition, {
      units: "imperial",
      date: DATE,
    });
    expect([pack[2]?.width, pack[2]?.height]).toEqual([279.4, 215.9]);
    expectGolden("pack-sample-3-weight-imperial.svg", drawingToSvg(pack[2] as Drawing));
    expectGolden("pack-sample-4-parts-imperial.svg", drawingToSvg(pack[3] as Drawing));
  });

  it("numbers every sheet", () => {
    const pack = buildPack(loadedDesign(), testShell, lookupTestDefinition, options);
    pack.forEach((drawing, index) => {
      expect(texts(drawing).join("|")).toContain(`sheet ${index + 1} of ${pack.length}`);
    });
  });

  it("keeps every sheet inside its border, in both unit systems", () => {
    for (const units of ["metric", "imperial"] as const) {
      for (const drawing of buildPack(loadedDesign(), testShell, lookupTestDefinition, {
        units,
      })) {
        expectOnPage(drawing);
      }
    }
  });

  it("still makes a pack for an empty van", () => {
    const pack = buildPack(testDesign([]), testShell, lookupTestDefinition, options);
    expect(pack).toHaveLength(4);
    expect(texts(pack[3] as Drawing)).toContain("No parts yet.");
    for (const drawing of pack) expectOnPage(drawing);
  });
});

describe("elevationDrawing", () => {
  const options = { units: "metric", date: DATE } as const;

  it("uses the floor plan's part numbers and shows length and height", () => {
    const labels = texts(
      elevationDrawing(sampleDesign(), testShell, lookupTestDefinition, options),
    );
    for (const expected of ["3000 mm", "1900 mm", "rear axle", "Cabinet", "FRONT (cab)"]) {
      expect(labels, expected).toContain(expected);
    }
    // Floor plan order is crate, cabinet, shelf, tank.
    expect(labels).toContain("2");
    expect(labels).toContain("4");
  });

  it("does not print a label where a nearer part covers it", () => {
    // Two crates in line across the van: the far one is completely hidden by the near one.
    const doc = testDesign([
      testPart("far", "crate", 1000, 500),
      testPart("near", "crate", 1000, -500),
    ]);
    const drawing = elevationDrawing(doc, testShell, lookupTestDefinition, options);
    expect(texts(drawing).filter((label) => label === "Crate")).toHaveLength(1);
    expect(texts(drawing)).toContain("1");
    expect(texts(drawing)).not.toContain("2");
  });

  it("makes room above the ceiling for parts on the roof", () => {
    const high = { ...testPart("panel", "crate", 1500, 0), position: { x: 1500, y: 0, z: 1960 } };
    expectOnPage(elevationDrawing(testDesign([high]), testShell, lookupTestDefinition, options));
  });
});

describe("weightDrawing", () => {
  const options = { units: "metric", date: DATE } as const;

  it("prints the same numbers as the weight model, and where each rating came from", () => {
    const labels = texts(weightDrawing(loadedDesign(), testShell, lookupTestDefinition, options));
    // Cabinet 40 + crate 10 + shelf 8 + tank 6 + 45 kg of water + 2 x 80 kg.
    expect(labels).toContain("Gross 2769.0 kg");
    expect(labels).toContain("Payload remaining: 1336.0 kg of 1605.0 kg.");
    expect(labels).toContain("2500.0 kg");
    expect(labels).toContain("your number");
    expect(labels).toContain("published");
    expect(labels).toContain("Driver");
    expect(labels).toContain("Passenger");
    expect(labels.join("|")).toContain("2 people at 80.0 kg each, Water tank 50% full");
  });

  it("lists loads whose axle shares add up to the totals", () => {
    const doc = loadedDesign();
    const drawing = weightDrawing(doc, testShell, lookupTestDefinition, options);
    const labels = texts(drawing);
    const kg = (label: string | undefined) => Number(label?.replace(" kg", ""));
    // Rows are item, weight, position, front, rear; the empty van has no position.
    const start = labels.indexOf("Empty van");
    const end = labels.indexOf("Total");
    let weight = kg(labels[start + 1]);
    let front = kg(labels[start + 2]);
    let rear = kg(labels[start + 3]);
    for (let i = start + 4; i < end; i += 5) {
      weight += kg(labels[i + 1]);
      front += kg(labels[i + 3]);
      rear += kg(labels[i + 4]);
    }
    expect(weight).toBeCloseTo(kg(labels[end + 1]), 0);
    expect(front).toBeCloseTo(kg(labels[end + 3]), 0);
    expect(rear).toBeCloseTo(kg(labels[end + 4]), 0);
  });

  it("adds up the lightest loads into one line when there are too many to list", () => {
    const parts = Array.from({ length: 60 }, (_, i) =>
      testPart(
        `p${String(i).padStart(2, "0")}`,
        i < 5 ? "cabinet" : "crate",
        300 + i * 40,
        0,
        i * 10,
      ),
    );
    const drawing = weightDrawing(testDesign(parts), testShell, lookupTestDefinition, options);
    const labels = texts(drawing);
    expect(labels.some((label) => /^\d+ lighter items$/.test(label))).toBe(true);
    expect(labels.filter((label) => label === "Cabinet")).toHaveLength(5);
    expectOnPage(drawing);
  });

  it("says so when the van is over its gross rating", () => {
    const doc = { ...sampleDesign(), vehicle: { gvwr: kgToGrams(2550) } };
    const labels = texts(weightDrawing(doc, testShell, lookupTestDefinition, options));
    expect(labels).toContain("Over the gross rating by 104.0 kg.");
    expect(labels).toContain("OVER LIMIT");
  });
});

describe("bomDrawings", () => {
  const options = { units: "metric", date: DATE } as const;

  it("continues a long list on further sheets and totals it once", () => {
    // Fifty parts of different sizes are fifty lines.
    const parts = Array.from({ length: 50 }, (_, i) => {
      const part = testPart(`p${String(i).padStart(2, "0")}`, "crate", 300, 0, i * 10);
      return { ...part, params: { ...part.params, width: 300 + i } };
    });
    const doc = testDesign(parts);
    const bom = buildBom(doc, lookupTestDefinition);
    expect(bom.lines).toHaveLength(50);
    const sheets = bomDrawings(doc, testShell, bom, { ...options, sheet: { number: 4, of: 5 } });
    expect(sheets).toHaveLength(2);
    expect(bomSheetCount(bom, options)).toBe(2);
    expect(texts(sheets[0] as Drawing)).toContain("Continued on the next sheet.");
    // "Total" is a column title on every sheet and a row on the last one only.
    expect(texts(sheets[0] as Drawing).filter((label) => label === "Total")).toHaveLength(1);
    expect(texts(sheets[1] as Drawing).filter((label) => label === "Total")).toHaveLength(2);
    expect(texts(sheets[1] as Drawing)).toContain("Parts list, continued");
    expect(texts(sheets[1] as Drawing).filter((label) => label === "$5,000")).toHaveLength(1);
    expect(texts(sheets[1] as Drawing).join("|")).toContain("sheet 5 of 5");
    const listed = sheets.flatMap(texts).filter((label) => label === "Crate");
    expect(listed).toHaveLength(50);
    for (const sheet of sheets) expectOnPage(sheet);
    // The pack numbers its sheets with the extra page counted.
    expect(buildPack(doc, testShell, lookupTestDefinition, options)).toHaveLength(5);
  });
});

describe("drawingsToPdf", () => {
  it("writes one page per sheet, with real text", () => {
    const pack = buildPack(loadedDesign(), testShell, lookupTestDefinition, {
      units: "metric",
      date: DATE,
    });
    const pdf = Buffer.from(drawingsToPdf(pack, "Test layout - build pack")).toString("latin1");
    expect(pdf.match(/\/Type \/Page\b/g)?.length).toBe(4);
    expect(pdf).toContain("(Test layout - build pack)");
    expect(pdf).toContain("(Weight estimate) Tj");
    expect(pdf).toContain("(Parts list) Tj");
    expect(pdf).not.toContain("/Subtype /Image");
  });
});
