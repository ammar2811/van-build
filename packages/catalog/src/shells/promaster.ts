import { ESTIMATED, poundsToGrams, type VanShell } from "@vanbuild/core";
import { buildShell, chassisProvenance, inches } from "./build";

/**
 * Ram ProMaster 2500 cargo van, high roof, 136 in and 159 in wheelbase.
 *
 * Dimensions, ratings and total curb weight come from Ram's published brochure for model
 * year 2015. The body has kept the same dimensions since, but ratings on newer vans can
 * differ: check the door sticker. Axle positions and the empty-weight split are estimates.
 */

const SPEC = "ram-promaster-2015-brochure";

/** Front overhang is not published for vans. Assumed, to place the axles within the body. */
const FRONT_OVERHANG = 950;
const DOORS_TO_BUMPER = 130;
/** Share of the empty weight assumed to sit on the front axle of an empty front-drive van. */
const FRONT_SHARE = 0.6;

interface ProMasterSpec {
  wheelbaseIn: number;
  overallLengthIn: number;
  cargoLengthIn: number;
  curbLb: number;
}

function promaster(spec: ProMasterSpec): VanShell {
  const wheelbase = inches(spec.wheelbaseIn);
  const cargoLength = inches(spec.cargoLengthIn);
  const rearOverhang = inches(spec.overallLengthIn) - wheelbase - FRONT_OVERHANG;
  const rearAxleX = Math.round(cargoLength - (rearOverhang - DOORS_TO_BUMPER));
  const chassisId = "2500-fwd-gas";
  const front = Math.round(spec.curbLb * FRONT_SHARE);

  return buildShell({
    id: `promaster-${spec.wheelbaseIn}-high-roof`,
    name: `ProMaster ${spec.wheelbaseIn} High Roof`,
    make: "Ram",
    model: "ProMaster Cargo Van",
    years: { from: 2014, to: null },
    roof: "high",
    wheelbase,
    cargoLength,
    rearAxleX,
    floorWidth: inches(73.4),
    wallBreakHeight: 1500,
    interiorHeight: inches(76),
    ceilingWidth: 1750,
    betweenWheelWells: inches(56),
    wheelWellLength: 800,
    wheelWellHeight: 290,
    sideDoor: { from: 100, width: inches(49.2), height: inches(69.0) },
    rearDoor: { width: inches(62.0), height: inches(70.5) },
    cabSeats: [
      { x: -450, y: -430, z: 450 },
      { x: -450, y: 430, z: 450 },
    ],
    chassis: [
      {
        id: chassisId,
        name: "2500, FWD, 3.6L V6",
        gvwr: poundsToGrams(8900),
        gawrFront: poundsToGrams(4630),
        gawrRear: poundsToGrams(5291),
        curbFront: poundsToGrams(front),
        curbRear: poundsToGrams(spec.curbLb - front),
      },
    ],
    sources: [
      {
        id: SPEC,
        title: "Ram, 2015 Ram ProMaster brochure, specifications tables",
        url: "https://www.ramtrucks.com/assets/pdf/brochures/2015_ram_promaster.pdf",
        retrieved: "2026-11-13",
        note: `Cargo Van, 2500, ${spec.wheelbaseIn} in wheelbase, high roof column. Model year 2015.`,
      },
    ],
    provenance: {
      wheelbase: { source: SPEC, note: `${spec.wheelbaseIn} in wheelbase` },
      cargoLength: {
        source: SPEC,
        note: `Cargo body overall length: ${spec.cargoLengthIn} in`,
      },
      rearAxleX: {
        source: ESTIMATED,
        note: `Overhangs are not published for vans. Derived from the published overall length (${spec.overallLengthIn} in) and wheelbase with an assumed 950 mm front overhang, less an estimated 130 mm between the rear doors and the bumper face.`,
      },
      cabSeats: {
        source: ESTIMATED,
        note: "Two cab seats, with a seated person's centre of mass assumed 450 mm ahead of the cargo area and 430 mm either side of the centreline.",
      },
      floorWidth: { source: SPEC, note: "Interior width at side panel: 73.4 in" },
      interiorHeight: { source: SPEC, note: "High roof interior height: 76 in" },
      wallProfile: {
        source: ESTIMATED,
        note: "The source describes the walls as near vertical. Assumed vertical up to 1500 mm, then leaning in to 1750 mm wide at the ceiling.",
      },
      wheelWells: {
        source: ESTIMATED,
        note: "Width at the wheel wells is published (56 in). Length 800 mm, height 290 mm and position centred on the rear axle are estimated.",
      },
      openings: {
        source: ESTIMATED,
        note: "Opening sizes are published (side 49.2 x 69.0 in, rear 62.0 x 70.5 in). The sliding door's position along the wall is estimated.",
      },
      ...chassisProvenance(chassisId, {
        gvwr: { source: SPEC, note: "GVWR: 8,900 lb (model year 2015)" },
        gawrFront: { source: SPEC, note: "Front GAWR: 4,630 lb (model year 2015)" },
        gawrRear: { source: SPEC, note: "Rear GAWR: 5,291 lb (model year 2015)" },
        curbFront: {
          source: ESTIMATED,
          note: `Total base curb weight is published (${spec.curbLb.toLocaleString("en-US")} lb, gas engine). The front/rear split is not, and is assumed to be 60/40 for this front-wheel-drive van. Replace with a weigh-scale ticket.`,
        },
        curbRear: {
          source: ESTIMATED,
          note: "See curbFront: published total, assumed 60/40 split.",
        },
      }),
    },
  });
}

export const promaster136HighRoof = promaster({
  wheelbaseIn: 136,
  overallLengthIn: 213.1,
  cargoLengthIn: 122.8,
  curbLb: 4764,
});

export const promaster159HighRoof = promaster({
  wheelbaseIn: 159,
  overallLengthIn: 236.0,
  cargoLengthIn: 145.9,
  curbLb: 4889,
});
