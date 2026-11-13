import { ESTIMATED, MM_PER_INCH, poundsToGrams, type VanShell } from "@vanbuild/core";

/**
 * Mercedes-Benz Sprinter cargo vans, high roof, 144 in and 170 in wheelbase.
 *
 * Every number here is either read from the manufacturer's published specification table
 * or marked as estimated in `provenance`. docs/data-sources.md is the human-readable version.
 * The source rounds dimensions to whole inches, so sourced lengths are good to about +/- 13 mm.
 */

const inches = (value: number) => Math.round(value * MM_PER_INCH * 10) / 10;

const SPEC = "mbvans-sprinter-cargo-2027";

// Published for both wheelbases.
const floorHalfWidth = inches(70) / 2;
const interiorHeight = inches(79);
const betweenWheelWellsHalf = inches(53) / 2;

// Not published. Estimated from tyre size plus clearance.
const wheelWellLength = 900;
const wheelWellHeight = 330;
// The cargo floor ends at the rear doors, roughly this far ahead of the bumper face.
const doorsToBumper = 130;

interface SprinterSpec {
  id: string;
  name: string;
  /** As published, in inches. */
  wheelbaseIn: number;
  cargoLengthIn: number;
  rearOverhangIn: number;
  sideDoorWidthIn: number;
  trim: string;
  chassisId: string;
  chassisName: string;
  /** As published, in pounds. */
  curbFrontLb: number;
  curbRearLb: number;
  baseCurbLb: number;
}

function sprinter(spec: SprinterSpec): VanShell {
  const cargoLength = inches(spec.cargoLengthIn);
  const wheelbase = inches(spec.wheelbaseIn);
  const rearAxleX = Math.round(cargoLength - (inches(spec.rearOverhangIn) - doorsToBumper));
  const chassis = `chassis.${spec.chassisId}`;
  const curbSum = spec.curbFrontLb + spec.curbRearLb;
  const frontShare = Math.round((spec.curbFrontLb / curbSum) * 100);

  return {
    id: spec.id,
    name: spec.name,
    make: "Mercedes-Benz",
    model: "Sprinter Cargo Van",
    years: { from: 2019, to: null },
    roof: "high",
    wheelbase,
    cargoLength,
    frontAxleX: rearAxleX - wheelbase,
    rearAxleX,
    cabSeats: [
      { x: -450, y: -430, z: 450 },
      { x: -450, y: 430, z: 450 },
    ],
    stations: [
      {
        x: 0,
        profile: [
          { z: 0, halfWidth: floorHalfWidth },
          { z: 1100, halfWidth: floorHalfWidth },
          { z: interiorHeight, halfWidth: 690 },
        ],
      },
    ],
    wheelWells: [
      {
        min: { x: rearAxleX - wheelWellLength / 2, y: betweenWheelWellsHalf, z: 0 },
        max: { x: rearAxleX + wheelWellLength / 2, y: floorHalfWidth, z: wheelWellHeight },
      },
      {
        min: { x: rearAxleX - wheelWellLength / 2, y: -floorHalfWidth, z: 0 },
        max: { x: rearAxleX + wheelWellLength / 2, y: -betweenWheelWellsHalf, z: wheelWellHeight },
      },
    ],
    openings: [
      {
        id: "sliding-door",
        kind: "slidingDoor",
        label: "Sliding door",
        side: "passenger",
        from: 120,
        to: 120 + inches(spec.sideDoorWidthIn),
        z0: 0,
        z1: inches(72),
      },
      {
        id: "rear-doors",
        kind: "rearDoors",
        label: "Rear doors",
        side: "rear",
        from: -inches(61) / 2,
        to: inches(61) / 2,
        z0: 0,
        z1: inches(73),
      },
    ],
    chassis: [
      {
        id: spec.chassisId,
        name: spec.chassisName,
        gvwr: poundsToGrams(9050),
        gawrFront: poundsToGrams(4101),
        gawrRear: poundsToGrams(5359),
        curbFront: poundsToGrams(spec.curbFrontLb),
        curbRear: poundsToGrams(spec.curbRearLb),
      },
    ],
    sources: [
      {
        id: SPEC,
        title: `Mercedes-Benz Vans USA, Sprinter Cargo Van specifications (model year 2027, ${spec.wheelbaseIn} in wheelbase, high roof, ${spec.trim})`,
        url: "https://www.mbvans.com/en/sprinter/cargo-van",
        retrieved: "2026-11-12",
        note: "Dimensions are published in whole inches.",
      },
    ],
    provenance: {
      wheelbase: { source: SPEC, note: `Wheelbase: ${spec.wheelbaseIn} in` },
      cargoLength: { source: SPEC, note: `Cargo Bed Length: ${spec.cargoLengthIn} in` },
      rearAxleX: {
        source: ESTIMATED,
        note: `Published rear overhang (${spec.rearOverhangIn} in, axle to bumper) minus an estimated ${doorsToBumper} mm between the rear doors and the bumper face.`,
      },
      cabSeats: {
        source: ESTIMATED,
        note: "Two cab seats, with a seated person's centre of mass assumed 450 mm ahead of the cargo area and 430 mm either side of the centreline.",
      },
      floorWidth: { source: SPEC, note: "Max Width at Floor: 70 in" },
      interiorHeight: { source: SPEC, note: "Interior Height: 79 in" },
      wallProfile: {
        source: ESTIMATED,
        note: "Walls assumed vertical up to 1100 mm, then leaning in to 1380 mm wide at the ceiling. Only the floor width and the height are published.",
      },
      wheelWells: {
        source: ESTIMATED,
        note: "Width between wheel wells is published (Cargo Width at Wheelhouse: 53 in). Length 900 mm, height 330 mm and position centred on the rear axle are estimated.",
      },
      openings: {
        source: ESTIMATED,
        note: `Door widths and heights are published (side ${spec.sideDoorWidthIn} x 72 in, rear 61 x 73 in). The sliding door's position along the wall is estimated.`,
      },
      [`${chassis}.gvwr`]: { source: SPEC, note: "Max Available GVWR: 9,050 lbs" },
      [`${chassis}.gawrFront`]: {
        source: SPEC,
        note: "GAWR.F (Standard): 4,101 lbs. A 4,409 lbs front axle is a factory option.",
      },
      [`${chassis}.gawrRear`]: { source: SPEC, note: "GAWR.R: 5,359 lbs" },
      [`${chassis}.curbFront`]: {
        source: SPEC,
        note: `Base Curb Weight (Front): ${spec.curbFrontLb.toLocaleString("en-US")} lbs. Low confidence: front + rear (${curbSum.toLocaleString("en-US")} lbs) does not match the published base curb weight (${spec.baseCurbLb.toLocaleString("en-US")} lbs), and a ${frontShare}/${100 - frontShare} front/rear split is unusually rear-heavy for an empty van. Replace with a weigh-scale ticket when possible.`,
      },
      [`${chassis}.curbRear`]: {
        source: SPEC,
        note: `Base Curb Weight (Rear): ${spec.curbRearLb.toLocaleString("en-US")} lbs. Low confidence, see curbFront.`,
      },
    },
  };
}

export const sprinter144HighRoof = sprinter({
  id: "sprinter-144-high-roof",
  name: "Sprinter 144 High Roof",
  wheelbaseIn: 144,
  cargoLengthIn: 133,
  rearOverhangIn: 49,
  sideDoorWidthIn: 50,
  trim: "Cargo Van WORKER",
  chassisId: "worker-rwd-diesel",
  chassisName: "Cargo Van WORKER, RWD, 4-cyl diesel",
  curbFrontLb: 2025,
  curbRearLb: 2914,
  baseCurbLb: 4916,
});

export const sprinter170HighRoof = sprinter({
  id: "sprinter-170-high-roof",
  name: "Sprinter 170 High Roof",
  wheelbaseIn: 170,
  cargoLengthIn: 173,
  rearOverhangIn: 64,
  sideDoorWidthIn: 51,
  trim: "Cargo Van 2500",
  chassisId: "2500-rwd-diesel",
  chassisName: "Cargo Van 2500, RWD, 4-cyl diesel",
  curbFrontLb: 2208,
  curbRearLb: 3050,
  baseCurbLb: 5236,
});
