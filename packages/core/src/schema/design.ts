import { z } from "zod";
import { PartInstanceSchema } from "./part";

export const DESIGN_SCHEMA_VERSION = 2;

const Grams = z.number().int().positive();

/**
 * The user's own numbers for their vehicle, replacing the catalog values: ratings from the
 * door-jamb sticker and empty axle weights from a weigh-scale ticket. All in grams.
 */
export const VehicleOverridesSchema = z.object({
  gvwr: Grams.optional(),
  gawrFront: Grams.optional(),
  gawrRear: Grams.optional(),
  curbFront: Grams.optional(),
  curbRear: Grams.optional(),
});
export type VehicleOverrides = z.infer<typeof VehicleOverridesSchema>;

/** What is on board for the weight estimate, besides the build itself. */
export const LoadCaseSchema = z.object({
  /** People in the cab seats, driver first. */
  occupants: z.number().int().min(0).max(9),
  /** Grams per person. */
  occupantMass: Grams,
  /** How full each tank is, 0 to 1, by part id. A tank that is not listed is full. */
  fillLevels: z.record(z.string(), z.number().min(0).max(1)),
});
export type LoadCase = z.infer<typeof LoadCaseSchema>;

export const DEFAULT_OCCUPANT_MASS = 80_000;

export function defaultLoadCase(): LoadCase {
  return { occupants: 2, occupantMass: DEFAULT_OCCUPANT_MASS, fillLevels: {} };
}

/**
 * The whole design. Everything else the app shows (weights, bill of materials, drawings)
 * is derived from this document by pure functions and never stored.
 */
export const DesignDocSchema = z.object({
  schemaVersion: z.literal(DESIGN_SCHEMA_VERSION),
  name: z.string(),
  shellId: z.string(),
  chassisId: z.string(),
  vehicle: VehicleOverridesSchema,
  loadCase: LoadCaseSchema,
  parts: z.record(z.string(), PartInstanceSchema),
});
export type DesignDoc = z.infer<typeof DesignDocSchema>;
