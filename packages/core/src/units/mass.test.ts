import { describe, expect, it } from "vitest";
import { formatMass, formatMassInput, formatMoney, parseMass, poundsToGrams } from "./mass";

function grams(input: string, system: "metric" | "imperial" = "metric"): number {
  const parsed = parseMass(input, system);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.grams;
}

describe("parseMass", () => {
  it("reads bare numbers in the active system", () => {
    expect(grams("1500")).toBe(1_500_000);
    expect(grams("9050", "imperial")).toBe(poundsToGrams(9050));
  });

  it("reads explicit units in either system", () => {
    expect(grams("1500 kg", "imperial")).toBe(1_500_000);
    expect(grams("3300lb")).toBe(poundsToGrams(3300));
    expect(grams("3300 lbs")).toBe(poundsToGrams(3300));
    expect(grams("750 g")).toBe(750);
    expect(grams("3.5 t")).toBe(3_500_000);
    expect(grams("80.5kg")).toBe(80_500);
  });

  it("ignores thousands separators and case", () => {
    expect(grams("9,050 LB")).toBe(poundsToGrams(9050));
  });

  it("rejects things that are not weights", () => {
    for (const bad of ["", "heavy", "12 stone", "-5", "5 5", "kg"]) {
      expect(parseMass(bad, "metric").ok, bad).toBe(false);
    }
  });
});

describe("formatting", () => {
  it("formats masses for display", () => {
    expect(formatMass(108_000, "metric")).toBe("108.0 kg");
    expect(formatMass(108_000, "imperial")).toBe("238 lb");
  });

  it("formats masses for text fields and parses them back", () => {
    expect(formatMassInput(1_500_000, "metric")).toBe("1500 kg");
    expect(formatMassInput(80_500, "metric")).toBe("80.5 kg");
    expect(formatMassInput(poundsToGrams(9050), "imperial")).toBe("9050 lb");
    for (const value of [918_525, 4_105_011, 80_000]) {
      const pounds = parseMass(formatMassInput(value, "imperial"), "imperial");
      expect(pounds.ok && Math.abs(pounds.grams - value) < 300).toBe(true);
    }
  });

  it("formats money", () => {
    expect(formatMoney(203_000, "USD")).toBe("$2,030");
    expect(formatMoney(1_999, "USD")).toBe("$19.99");
  });
});
