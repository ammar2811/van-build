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
