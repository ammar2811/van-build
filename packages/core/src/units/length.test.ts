import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  formatInches,
  formatLength,
  formatMillimetres,
  formatSize,
  MM_PER_INCH,
  nudgeStepMm,
  parseLength,
  quantizeMm,
} from "./length";

function mm(input: string, system: "metric" | "imperial" = "metric"): number {
  const result = parseLength(input, system);
  if (!result.ok) throw new Error(result.error);
  return result.mm;
}

describe("parseLength", () => {
  it("reads bare numbers in the active unit system", () => {
    expect(mm("600")).toBe(600);
    expect(mm("600.5")).toBe(600.5);
    expect(mm("24", "imperial")).toBe(609.6);
  });

  it("reads explicit metric units regardless of the active system", () => {
    expect(mm("600mm", "imperial")).toBe(600);
    expect(mm("60 cm")).toBe(600);
    expect(mm("1.2m")).toBe(1200);
  });

  it("reads inches, fractions and mixed numbers", () => {
    expect(mm('24"')).toBe(609.6);
    expect(mm("24in")).toBe(609.6);
    expect(mm('23 5/8"')).toBe(600.075);
    expect(mm('5/8"')).toBe(15.875);
    expect(mm("23 5/8", "imperial")).toBe(600.075);
    expect(mm("23.5 inches")).toBe(596.9);
  });

  it("reads feet and inches", () => {
    expect(mm("2'")).toBe(609.6);
    expect(mm("2' 3\"")).toBe(685.8);
    expect(mm("2ft 3in")).toBe(685.8);
    expect(mm("2' 3 1/2\"")).toBe(698.5);
    expect(mm("6 feet")).toBe(1828.8);
  });

  it("accepts typographic quote marks", () => {
    expect(mm("2′ 3″")).toBe(685.8);
    expect(mm("24”")).toBe(609.6);
  });

  it("evaluates division and sums", () => {
    expect(mm("1200/2")).toBe(600);
    expect(mm("600 + 18")).toBe(618);
    expect(mm("1200 - 18 - 18")).toBe(1164);
    expect(mm("2' + 6mm")).toBe(615.6);
  });

  it("treats a leading sign as a relative nudge", () => {
    expect(parseLength("+50", "metric")).toEqual({ ok: true, kind: "relative", mm: 50 });
    expect(parseLength("-1/2", "imperial")).toEqual({ ok: true, kind: "relative", mm: -12.7 });
    expect(parseLength("600", "metric")).toEqual({ ok: true, kind: "absolute", mm: 600 });
  });

  it("rejects things that are not lengths", () => {
    for (const bad of ["", "   ", "abc", "12 apples", "1/0", "5 5", "12,5", "--5", "mm"]) {
      expect(parseLength(bad, "metric").ok, bad).toBe(false);
    }
  });
});

describe("formatLength", () => {
  it("formats millimetres with at most one decimal", () => {
    expect(formatMillimetres(600)).toBe("600 mm");
    expect(formatMillimetres(600.04)).toBe("600 mm");
    expect(formatMillimetres(600.25)).toBe("600.3 mm");
    expect(formatMillimetres(-0.01)).toBe("0 mm");
  });

  it("formats inches to the nearest sixteenth with reduced fractions", () => {
    expect(formatInches(609.6)).toBe('24"');
    expect(formatInches(600)).toBe('23 5/8"');
    expect(formatInches(15.875)).toBe('5/8"');
    expect(formatInches(12.7)).toBe('1/2"');
    expect(formatInches(0)).toBe('0"');
    expect(formatInches(-12.7)).toBe('-1/2"');
    expect(formatInches(0.1)).toBe('0"');
  });

  it("formats sizes compactly", () => {
    expect(formatSize([1200, 600], "metric")).toBe("1200 x 600 mm");
    expect(formatSize([609.6, 304.8], "imperial")).toBe('24" x 12"');
  });

  it("picks nudge steps per unit system", () => {
    expect(nudgeStepMm("metric", false)).toBe(1);
    expect(nudgeStepMm("metric", true)).toBe(10);
    expect(nudgeStepMm("imperial", false)).toBe(MM_PER_INCH / 16);
    expect(nudgeStepMm("imperial", true)).toBe(MM_PER_INCH);
  });
});

describe("round trips", () => {
  it("parses back what it formats, to within display precision", () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 6000, noNaN: true }), (value) => {
        const metric = parseLength(formatLength(value, "metric"), "metric");
        const imperial = parseLength(formatLength(value, "imperial"), "imperial");
        expect(metric.ok && Math.abs(metric.mm - value) <= 0.05 + 1e-9).toBe(true);
        // Half of one sixteenth of an inch.
        expect(imperial.ok && Math.abs(imperial.mm - value) <= MM_PER_INCH / 32 + 1e-6).toBe(true);
      }),
    );
  });

  it("is stable once a value has been displayed in sixteenths", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 4000 }), (sixteenths) => {
        const text = formatInches((sixteenths / 16) * MM_PER_INCH);
        const parsed = parseLength(text, "imperial");
        expect(parsed.ok && formatInches(parsed.mm)).toBe(text);
      }),
    );
  });

  it("quantizes to a thousandth of a millimetre", () => {
    expect(quantizeMm(600.0749999)).toBe(600.075);
    expect(quantizeMm(-0.0001)).toBe(0);
    expect(Object.is(quantizeMm(-0.0001), 0)).toBe(true);
  });
});
