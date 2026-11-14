import { describe, expect, it } from "vitest";
import { formatMoney, parseMoney } from "./money";

function minor(input: string): number {
  const parsed = parseMoney(input);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.minor;
}

describe("formatMoney", () => {
  it("shows cents only when there are some", () => {
    expect(formatMoney(203_000, "USD")).toBe("$2,030");
    expect(formatMoney(1_999, "USD")).toBe("$19.99");
    expect(formatMoney(0, "USD")).toBe("$0");
  });
});

describe("parseMoney", () => {
  it("reads plain and formatted prices", () => {
    expect(minor("1200")).toBe(120_000);
    expect(minor("$1,200")).toBe(120_000);
    expect(minor(" $ 12.50 ")).toBe(1_250);
    expect(minor("12.5")).toBe(1_250);
    expect(minor(".99")).toBe(99);
    expect(minor("0")).toBe(0);
  });

  it("does not lose a cent to floating point", () => {
    expect(minor("19.99")).toBe(1_999);
    expect(minor("1.15")).toBe(115);
    expect(minor("4.35")).toBe(435);
  });

  it("reads back what formatMoney writes", () => {
    for (const value of [0, 99, 1_250, 120_000, 203_000, 12_345_678]) {
      expect(minor(formatMoney(value, "USD"))).toBe(value);
    }
  });

  it("rejects what is not a price", () => {
    for (const input of ["", "  ", "abc", "-5", "1.999", "12 kg", "1e3"]) {
      expect(parseMoney(input).ok, input).toBe(false);
    }
  });
});
