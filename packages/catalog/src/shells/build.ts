import {
  type Chassis,
  MM_PER_INCH,
  type Provenance,
  type Source,
  type VanShell,
} from "@vanbuild/core";

/** Inches as published, to millimetres rounded to 0.1. */
export const inches = (value: number) => Math.round(value * MM_PER_INCH * 10) / 10;

export interface ShellSpec {
  id: string;
  name: string;
  make: string;
  model: string;
  years: VanShell["years"];
  roof: VanShell["roof"];
  /** All lengths in mm. */
  wheelbase: number;
  cargoLength: number;
  rearAxleX: number;
  floorWidth: number;
  /** Height up to which the walls are treated as vertical. */
  wallBreakHeight: number;
  interiorHeight: number;
  ceilingWidth: number;
  betweenWheelWells: number;
  wheelWellLength: number;
  wheelWellHeight: number;
  sideDoor: { from: number; width: number; height: number };
  rearDoor: { width: number; height: number };
  cabSeats: VanShell["cabSeats"];
  chassis: Chassis[];
  sources: Source[];
  provenance: Record<string, Provenance>;
}

/**
 * A van shell from a handful of measurements: one cross-section the whole length (vertical
 * walls up to `wallBreakHeight`, then leaning in to the ceiling), wheel wells centred on the
 * rear axle, a sliding door on the passenger side and doors across the rear.
 */
export function buildShell(spec: ShellSpec): VanShell {
  const floorHalf = spec.floorWidth / 2;
  const wellInner = spec.betweenWheelWells / 2;
  const wellFront = spec.rearAxleX - spec.wheelWellLength / 2;
  const wellRear = spec.rearAxleX + spec.wheelWellLength / 2;
  return {
    id: spec.id,
    name: spec.name,
    make: spec.make,
    model: spec.model,
    years: spec.years,
    roof: spec.roof,
    wheelbase: spec.wheelbase,
    cargoLength: spec.cargoLength,
    frontAxleX: Math.round((spec.rearAxleX - spec.wheelbase) * 10) / 10,
    rearAxleX: spec.rearAxleX,
    cabSeats: spec.cabSeats,
    stations: [
      {
        x: 0,
        profile: [
          { z: 0, halfWidth: floorHalf },
          { z: spec.wallBreakHeight, halfWidth: floorHalf },
          { z: spec.interiorHeight, halfWidth: spec.ceilingWidth / 2 },
        ],
      },
    ],
    wheelWells: [
      {
        min: { x: wellFront, y: wellInner, z: 0 },
        max: { x: wellRear, y: floorHalf, z: spec.wheelWellHeight },
      },
      {
        min: { x: wellFront, y: -floorHalf, z: 0 },
        max: { x: wellRear, y: -wellInner, z: spec.wheelWellHeight },
      },
    ],
    openings: [
      {
        id: "sliding-door",
        kind: "slidingDoor",
        label: "Sliding door",
        side: "passenger",
        from: spec.sideDoor.from,
        to: spec.sideDoor.from + spec.sideDoor.width,
        z0: 0,
        z1: spec.sideDoor.height,
      },
      {
        id: "rear-doors",
        kind: "rearDoors",
        label: "Rear doors",
        side: "rear",
        from: -spec.rearDoor.width / 2,
        to: spec.rearDoor.width / 2,
        z0: 0,
        z1: spec.rearDoor.height,
      },
    ],
    chassis: spec.chassis,
    sources: spec.sources,
    provenance: spec.provenance,
  };
}

/** Provenance entries for one chassis, keyed the way `requiredProvenanceKeys` expects. */
export function chassisProvenance(
  chassisId: string,
  entries: Record<"gvwr" | "gawrFront" | "gawrRear" | "curbFront" | "curbRear", Provenance>,
): Record<string, Provenance> {
  return Object.fromEntries(
    Object.entries(entries).map(([field, value]) => [`chassis.${chassisId}.${field}`, value]),
  );
}
