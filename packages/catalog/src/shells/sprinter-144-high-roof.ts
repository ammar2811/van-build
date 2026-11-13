import { ESTIMATED, MM_PER_INCH, poundsToGrams, type VanShell } from "@vanbuild/core";

/**
 * Mercedes-Benz Sprinter cargo van, 144 in wheelbase, high roof.
 *
 * Every number here is either read from the manufacturer's published specification table
 * or marked as estimated in `provenance`. docs/data-sources.md is the human-readable version.
 * The source rounds dimensions to whole inches, so sourced lengths are good to about +/- 13 mm.
 */

const inches = (value: number) => Math.round(value * MM_PER_INCH * 10) / 10;

const SPEC = "mbvans-sprinter-cargo-2027";

const cargoLength = inches(133);
const wheelbase = inches(144);
const floorHalfWidth = inches(70) / 2;
const interiorHeight = inches(79);
const betweenWheelWellsHalf = inches(53) / 2;

// Rear overhang (axle to bumper) is published as 49 in. The cargo floor ends at the rear
// doors, roughly 130 mm ahead of the bumper face. That 130 mm is the estimate.
const rearAxleX = Math.round(cargoLength - (inches(49) - 130));

// Wheel well length and height are not published. Estimated from tyre size plus clearance.
const wheelWellLength = 900;
const wheelWellHeight = 330;

export const sprinter144HighRoof: VanShell = {
  id: "sprinter-144-high-roof",
  name: "Sprinter 144 High Roof",
  make: "Mercedes-Benz",
  model: "Sprinter Cargo Van",
  years: { from: 2019, to: null },
  roof: "high",
  wheelbase,
  cargoLength,
  frontAxleX: rearAxleX - wheelbase,
  rearAxleX,
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
      to: 120 + inches(50),
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
      id: "worker-rwd-diesel",
      name: "Cargo Van WORKER, RWD, 4-cyl diesel",
      gvwr: poundsToGrams(9050),
      gawrFront: poundsToGrams(4101),
      gawrRear: poundsToGrams(5359),
      curbFront: poundsToGrams(2025),
      curbRear: poundsToGrams(2914),
    },
  ],
  sources: [
    {
      id: SPEC,
      title:
        "Mercedes-Benz Vans USA, Sprinter Cargo Van specifications (model year 2027, 144 in wheelbase, high roof, Cargo Van WORKER)",
      url: "https://www.mbvans.com/en/sprinter/cargo-van",
      retrieved: "2026-11-12",
      note: "Dimensions are published in whole inches.",
    },
  ],
  provenance: {
    wheelbase: { source: SPEC, note: "Wheelbase: 144 in" },
    cargoLength: { source: SPEC, note: "Cargo Bed Length: 133 in" },
    rearAxleX: {
      source: ESTIMATED,
      note: "Published rear overhang (49 in, axle to bumper) minus an estimated 130 mm between the rear doors and the bumper face.",
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
      note: "Door widths and heights are published (side 50 x 72 in, rear 61 x 73 in). The sliding door's position along the wall is estimated.",
    },
    "chassis.worker-rwd-diesel.gvwr": { source: SPEC, note: "Max Available GVWR: 9,050 lbs" },
    "chassis.worker-rwd-diesel.gawrFront": {
      source: SPEC,
      note: "GAWR.F (Standard): 4,101 lbs. A 4,409 lbs front axle is a factory option.",
    },
    "chassis.worker-rwd-diesel.gawrRear": { source: SPEC, note: "GAWR.R: 5,359 lbs" },
    "chassis.worker-rwd-diesel.curbFront": {
      source: SPEC,
      note: "Base Curb Weight (Front): 2,025 lbs. Low confidence: front + rear (4,939 lbs) does not match the published base curb weight (4,916 lbs), and the split is unusually rear-heavy for an empty van. Replace with a weigh-scale ticket when possible.",
    },
    "chassis.worker-rwd-diesel.curbRear": {
      source: SPEC,
      note: "Base Curb Weight (Rear): 2,914 lbs. Low confidence, see curbFront.",
    },
  },
};
