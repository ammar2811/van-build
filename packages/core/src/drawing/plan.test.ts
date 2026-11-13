import { describe, expect, it } from "vitest";
import {
  lookupTestDefinition,
  sampleDesign,
  testDesign,
  testPart,
  testShell,
} from "../testing/fixtures";
import { expectGolden } from "../testing/golden";
import { drawingToPdf } from "./pdf";
import { partsInDrawingOrder, planDrawing } from "./plan";
import { drawingToSvg } from "./svg";

const DATE = "2026-11-12";

function texts(drawing: ReturnType<typeof planDrawing>): string[] {
  return drawing.items.flatMap((item) => (item.type === "text" ? [item.text] : []));
}

describe("planDrawing", () => {
  it("matches the metric A4 golden", () => {
    const drawing = planDrawing(sampleDesign(), testShell, lookupTestDefinition, {
      units: "metric",
      date: DATE,
    });
    expect([drawing.width, drawing.height]).toEqual([297, 210]);
    expectGolden("plan-sample-metric-a4.svg", drawingToSvg(drawing));
  });

  it("matches the imperial US Letter golden", () => {
    const drawing = planDrawing(sampleDesign(), testShell, lookupTestDefinition, {
      units: "imperial",
      date: DATE,
    });
    expect([drawing.width, drawing.height]).toEqual([279.4, 215.9]);
    expectGolden("plan-sample-imperial-letter.svg", drawingToSvg(drawing));
  });

  it("numbers parts front to rear and lists each one in the schedule", () => {
    const doc = sampleDesign();
    expect(partsInDrawingOrder(doc).map((part) => part.id)).toEqual([
      "crate",
      "cabinet",
      "shelf",
      "tank",
    ]);
    const labels = texts(
      planDrawing(doc, testShell, lookupTestDefinition, { units: "metric", date: DATE }),
    );
    for (const expected of [
      "Test layout",
      "Scale 1:15",
      "3000 mm",
      "1800 mm",
      "Cabinet",
      "1200 x 600 x 900",
      "Overhead shelf",
      "1400",
      "FRONT (cab)",
    ]) {
      expect(labels, expected).toContain(expected);
    }
  });

  it("does not depend on the order parts were added", () => {
    const doc = sampleDesign();
    const reversed = { ...doc, parts: Object.fromEntries(Object.entries(doc.parts).reverse()) };
    const options = { units: "metric", date: DATE } as const;
    expect(drawingToSvg(planDrawing(reversed, testShell, lookupTestDefinition, options))).toBe(
      drawingToSvg(planDrawing(doc, testShell, lookupTestDefinition, options)),
    );
  });

  it("shrinks the scale to keep a long schedule on the sheet", () => {
    const parts = Array.from({ length: 30 }, (_, i) =>
      testPart(`p${String(i).padStart(2, "0")}`, "crate", 250 + (i % 6) * 500, 0, i * 10),
    );
    const drawing = planDrawing(testDesign(parts), testShell, lookupTestDefinition, {
      units: "metric",
    });
    const labels = texts(drawing);
    expect(labels).toContain("Scale 1:25");
    expect(labels.filter((label) => label === "Crate").length).toBeGreaterThanOrEqual(30);
    expect(labels.join(" ")).not.toMatch(/do not fit/);
  });

  it("keeps everything on the page", () => {
    for (const units of ["metric", "imperial"] as const) {
      const drawing = planDrawing(sampleDesign(), testShell, lookupTestDefinition, { units });
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
        for (const x of xs) expect(x >= 0 && x <= drawing.width).toBe(true);
        for (const y of ys) expect(y >= 0 && y <= drawing.height).toBe(true);
      }
    }
  });
});

describe("drawingToSvg", () => {
  it("escapes text", () => {
    const svg = drawingToSvg({
      width: 10,
      height: 10,
      title: 'A & B <"quoted">',
      items: [{ type: "text", x: 1, y: 1, text: "5 < 6 & 7", size: 2, anchor: "start" }],
    });
    expect(svg).toContain("<title>A &amp; B &lt;&quot;quoted&quot;&gt;</title>");
    expect(svg).toContain(">5 &lt; 6 &amp; 7</text>");
  });
});

describe("drawingToPdf", () => {
  it("writes a single-page vector PDF with real text", () => {
    const drawing = planDrawing(sampleDesign(), testShell, lookupTestDefinition, {
      units: "metric",
      date: DATE,
    });
    const pdf = Buffer.from(drawingToPdf(drawing)).toString("latin1");
    expect(pdf.startsWith("%PDF-")).toBe(true);
    expect(pdf.match(/\/Type \/Page\b/g)?.length).toBe(1);
    // Text is stored as text (searchable, sharp at any zoom), not as an image.
    expect(pdf).toContain("(Test layout) Tj");
    expect(pdf).toContain("(Scale 1:15) Tj");
    expect(pdf).toContain("(1200 x 600 x 900) Tj");
    expect(pdf).not.toContain("/Subtype /Image");
  });
});
