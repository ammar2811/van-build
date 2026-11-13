import { z } from "zod";
import { Box3Schema, Vec3Schema } from "./geometry";

/** One point of an interior cross-section: half the interior width at height z. */
export const ProfilePointSchema = z.object({
  z: z.number().nonnegative(),
  halfWidth: z.number().positive(),
});

/** An interior cross-section at position x. The shell is lofted between stations. */
export const StationSchema = z.object({
  x: z.number(),
  profile: z.array(ProfilePointSchema).min(2),
});

export const SideSchema = z.enum(["driver", "passenger", "rear"]);
export type Side = z.infer<typeof SideSchema>;

/**
 * A door or window opening. For side openings `from`/`to` run along X; for rear openings
 * they run along Y.
 */
export const OpeningSchema = z.object({
  id: z.string(),
  kind: z.enum(["slidingDoor", "rearDoors", "window"]),
  label: z.string(),
  side: SideSchema,
  from: z.number(),
  to: z.number(),
  z0: z.number(),
  z1: z.number(),
});
export type Opening = z.infer<typeof OpeningSchema>;

/** Weights in grams. Curb weights are the empty vehicle with a full fuel tank. */
export const ChassisSchema = z.object({
  id: z.string(),
  name: z.string(),
  gvwr: z.number().int().positive(),
  gawrFront: z.number().int().positive(),
  gawrRear: z.number().int().positive(),
  curbFront: z.number().int().positive(),
  curbRear: z.number().int().positive(),
});
export type Chassis = z.infer<typeof ChassisSchema>;

export const SourceSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.url(),
  /** ISO date the source was read. */
  retrieved: z.iso.date(),
  note: z.string().optional(),
});
export type Source = z.infer<typeof SourceSchema>;

/** Where a number came from: a source id, or "estimated" with the reasoning in `note`. */
export const ProvenanceSchema = z.object({
  source: z.string(),
  note: z.string().optional(),
});
export type Provenance = z.infer<typeof ProvenanceSchema>;

export const ESTIMATED = "estimated";

export const VanShellSchema = z.object({
  id: z.string(),
  name: z.string(),
  make: z.string(),
  model: z.string(),
  years: z.object({ from: z.number().int(), to: z.number().int().nullable() }),
  roof: z.enum(["standard", "medium", "high"]),
  wheelbase: z.number().positive(),
  /** The cargo area spans x = 0 (behind the cab seats) to x = cargoLength (rear doors). */
  cargoLength: z.number().positive(),
  /** Axle centrelines in the van frame. The front axle is ahead of the cargo area, so negative. */
  frontAxleX: z.number(),
  rearAxleX: z.number(),
  /** Where people sit in the cab (centre of mass of a seated person), driver first. */
  cabSeats: z.array(Vec3Schema).min(1),
  stations: z.array(StationSchema).min(1),
  wheelWells: z.array(Box3Schema),
  openings: z.array(OpeningSchema),
  chassis: z.array(ChassisSchema).min(1),
  sources: z.array(SourceSchema).min(1),
  /** Keyed by the field names listed in `requiredProvenanceKeys`. */
  provenance: z.record(z.string(), ProvenanceSchema),
});
export type VanShell = z.infer<typeof VanShellSchema>;
export type Station = z.infer<typeof StationSchema>;
export type ProfilePoint = z.infer<typeof ProfilePointSchema>;

/** Every number on a shell must be traceable. These are the keys `provenance` must carry. */
export function requiredProvenanceKeys(shell: VanShell): string[] {
  const keys = [
    "wheelbase",
    "cargoLength",
    "rearAxleX",
    "cabSeats",
    "floorWidth",
    "interiorHeight",
    "wallProfile",
    "wheelWells",
    "openings",
  ];
  for (const chassis of shell.chassis) {
    for (const field of ["gvwr", "gawrFront", "gawrRear", "curbFront", "curbRear"]) {
      keys.push(`chassis.${chassis.id}.${field}`);
    }
  }
  return keys;
}
