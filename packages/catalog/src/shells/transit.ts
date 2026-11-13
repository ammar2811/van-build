import { ESTIMATED, poundsToGrams, type VanShell } from "@vanbuild/core";
import { buildShell, chassisProvenance, inches } from "./build";

/**
 * Ford Transit cargo van, long body (148 in wheelbase), medium and high roof.
 *
 * Dimensions, gross rating and total curb weight come from Ford's published technical
 * specifications. That document does not give the interior width, the axle ratings or how
 * the empty weight is split between the axles, so those are estimates and say so.
 */

const SPEC = "ford-transit-2026-tech-specs";

const wheelbase = inches(147.6);
const cargoLength = inches(143.7);
// Published rear overhang (axle to bumper) minus an estimated 130 mm from doors to bumper.
const rearAxleX = Math.round(cargoLength - (inches(47.6) - 130));

/** Share of the empty weight assumed to sit on the front axle of an empty rear-drive van. */
const FRONT_SHARE = 0.56;

function transit(roof: "medium" | "high"): VanShell {
  const high = roof === "high";
  const label = high ? "High Roof" : "Medium Roof";
  const height = high ? 81.5 : 72.0;
  const rearDoorHeight = high ? 74.3 : 64.9;
  const curbLb = high ? 5299 : 5204;
  const chassisId = "t250-rwd-gas";
  const front = Math.round(curbLb * FRONT_SHARE);

  return buildShell({
    id: `transit-148-${roof}-roof`,
    name: `Transit 148 ${label}`,
    make: "Ford",
    model: "Transit Cargo Van",
    years: { from: 2020, to: null },
    roof,
    wheelbase,
    cargoLength,
    rearAxleX,
    floorWidth: 1770,
    wallBreakHeight: 1000,
    interiorHeight: inches(height),
    ceilingWidth: high ? 1400 : 1500,
    betweenWheelWells: inches(54.8),
    wheelWellLength: 900,
    wheelWellHeight: 300,
    sideDoor: { from: 100, width: inches(51.2), height: inches(63.0) },
    rearDoor: { width: inches(61.7), height: inches(rearDoorHeight) },
    cabSeats: [
      { x: -450, y: -430, z: 450 },
      { x: -450, y: 430, z: 450 },
    ],
    chassis: [
      {
        id: chassisId,
        name: "T-250, RWD, 3.5L V6",
        gvwr: poundsToGrams(9070),
        gawrFront: poundsToGrams(4130),
        gawrRear: poundsToGrams(5515),
        curbFront: poundsToGrams(front),
        curbRear: poundsToGrams(curbLb - front),
      },
    ],
    sources: [
      {
        id: SPEC,
        title: "Ford Motor Company, 2026 Ford Transit Technical Specifications",
        url: "https://www.fromtheroad.ford.com/content/dam/fordmediasite/us/en/library/2026/specs/2026_Ford_Transit_Specs.pdf",
        retrieved: "2026-11-13",
        note: "Cargo Van, Long body columns.",
      },
    ],
    provenance: {
      wheelbase: { source: SPEC, note: "Wheelbase: 147.6 in" },
      cargoLength: { source: SPEC, note: "Cargo floor length (front): 143.7 in" },
      rearAxleX: {
        source: ESTIMATED,
        note: "Published rear overhang (47.6 in, axle to bumper) minus an estimated 130 mm between the rear doors and the bumper face.",
      },
      cabSeats: {
        source: ESTIMATED,
        note: "Two cab seats (seating is published as 2), with a seated person's centre of mass assumed 450 mm ahead of the cargo floor and 430 mm either side of the centreline.",
      },
      floorWidth: {
        source: ESTIMATED,
        note: "Interior width is not in the source. 1770 mm is assumed from the published 81.3 in body width less wall thickness.",
      },
      interiorHeight: { source: SPEC, note: `Cargo height (max): ${height.toFixed(1)} in` },
      wallProfile: {
        source: ESTIMATED,
        note: "Walls assumed vertical up to 1000 mm, then leaning in toward the ceiling. Only the height is published.",
      },
      wheelWells: {
        source: ESTIMATED,
        note: "Width between wheelhouses is published (54.8 in, single rear wheels). Length 900 mm, height 300 mm and position centred on the rear axle are estimated.",
      },
      openings: {
        source: ESTIMATED,
        note: `Opening sizes are published (side 51.2 x 63.0 in, rear 61.7 x ${rearDoorHeight} in). The sliding door's position along the wall is estimated.`,
      },
      ...chassisProvenance(chassisId, {
        gvwr: { source: SPEC, note: "Maximum payload table, T-250, 148 in, RWD: GVWR 9,070 lbs" },
        gawrFront: {
          source: ESTIMATED,
          note: "Not in the source. 4,130 lbs is a commonly seen T-250 door-sticker value. Use the number on your own door sticker.",
        },
        gawrRear: {
          source: ESTIMATED,
          note: "Not in the source. 5,515 lbs is a commonly seen T-250 door-sticker value. Use the number on your own door sticker.",
        },
        curbFront: {
          source: ESTIMATED,
          note: `Total base curb weight is published (${curbLb.toLocaleString("en-US")} lbs, 3.5L PFDI, RWD). The front/rear split is not, and is assumed to be 56/44. Replace with a weigh-scale ticket.`,
        },
        curbRear: {
          source: ESTIMATED,
          note: "See curbFront: published total, assumed 56/44 split.",
        },
      }),
    },
  });
}

export const transit148MediumRoof = transit("medium");
export const transit148HighRoof = transit("high");
