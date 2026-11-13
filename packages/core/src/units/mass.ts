import type { UnitSystem } from "./length";

/** Mass is stored in grams everywhere in the model. */
export const GRAMS_PER_POUND = 453.59237;
export const GRAMS_PER_KG = 1000;

export function poundsToGrams(lb: number): number {
  return Math.round(lb * GRAMS_PER_POUND);
}

export function kgToGrams(kg: number): number {
  return Math.round(kg * GRAMS_PER_KG);
}

/** `108.0 kg` in metric, `238 lb` in imperial. */
export function formatMass(grams: number, system: UnitSystem): string {
  if (system === "metric") return `${(grams / GRAMS_PER_KG).toFixed(1)} kg`;
  return `${Math.round(grams / GRAMS_PER_POUND)} lb`;
}

/** Money is stored in minor units (cents). */
export function formatMoney(minor: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: minor % 100 === 0 ? 0 : 2,
  }).format(minor / 100);
}

export type ParsedMass = { ok: true; grams: number } | { ok: false; error: string };

const MASS_RE = /^(\d+\.?\d*|\.\d+)\s*(kg|g|lb|lbs|t)?$/;
const MASS_UNITS: Record<string, number> = {
  kg: GRAMS_PER_KG,
  g: 1,
  lb: GRAMS_PER_POUND,
  lbs: GRAMS_PER_POUND,
  t: 1_000_000,
};

/** Parse a typed mass: `1500`, `1500 kg`, `3300 lb`. A bare number uses the active system. */
export function parseMass(input: string, system: UnitSystem): ParsedMass {
  const text = input.trim().toLowerCase().replace(/,/g, "");
  if (text === "") return { ok: false, error: "Enter a weight" };
  const match = MASS_RE.exec(text);
  if (!match?.[1]) return { ok: false, error: `Cannot read "${input.trim()}" as a weight` };
  const factor =
    match[2] === undefined
      ? system === "metric"
        ? GRAMS_PER_KG
        : GRAMS_PER_POUND
      : MASS_UNITS[match[2]];
  if (factor === undefined)
    return { ok: false, error: `Cannot read "${input.trim()}" as a weight` };
  return { ok: true, grams: Math.round(Number(match[1]) * factor) };
}

/** Mass for a text field: `1500 kg` or `3307 lb`, with decimals only when they matter. */
export function formatMassInput(grams: number, system: UnitSystem): string {
  if (system === "imperial") return `${Math.round(grams / GRAMS_PER_POUND)} lb`;
  const kg = Math.round(grams / 100) / 10;
  return `${Number.isInteger(kg) ? kg : kg.toFixed(1)} kg`;
}
