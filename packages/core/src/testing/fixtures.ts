import { setWallDistance } from "../editing/placement";
import { createInstance, type DefinitionLookup } from "../parts/parts";
import { DESIGN_SCHEMA_VERSION, type DesignDoc } from "../schema/design";
import type { PartDefinition, PartInstance } from "../schema/part";
import type { VanShell } from "../schema/shell";
import { kgToGrams } from "../units/mass";

/**
 * A made-up van with round numbers, used by the core tests so they do not depend on the
 * catalog. Walls are vertical to 1000 mm and lean in above that.
 */
export const testShell: VanShell = {
  id: "test-van",
  name: "Test Van",
  make: "Test",
  model: "Van",
  years: { from: 2020, to: null },
  roof: "high",
  wheelbase: 3665,
  cargoLength: 3000,
  frontAxleX: -1300,
  rearAxleX: 2365,
  stations: [
    {
      x: 0,
      profile: [
        { z: 0, halfWidth: 900 },
        { z: 1000, halfWidth: 900 },
        { z: 1900, halfWidth: 700 },
      ],
    },
  ],
  wheelWells: [
    { min: { x: 1800, y: 680, z: 0 }, max: { x: 2600, y: 900, z: 300 } },
    { min: { x: 1800, y: -900, z: 0 }, max: { x: 2600, y: -680, z: 300 } },
  ],
  openings: [
    {
      id: "sliding-door",
      kind: "slidingDoor",
      label: "Sliding door",
      side: "passenger",
      from: 100,
      to: 1300,
      z0: 0,
      z1: 1800,
    },
  ],
  chassis: [
    {
      id: "base",
      name: "Base",
      gvwr: kgToGrams(4105),
      gawrFront: kgToGrams(2000),
      gawrRear: kgToGrams(2430),
      curbFront: kgToGrams(1400),
      curbRear: kgToGrams(1100),
    },
  ],
  sources: [
    { id: "made-up", title: "Test data", url: "https://example.com/", retrieved: "2026-01-01" },
  ],
  provenance: {},
};

/** The same van without wheel wells, for tests that want an empty rectangle. */
export const emptyShell: VanShell = { ...testShell, id: "empty-van", wheelWells: [] };

function definition(
  id: string,
  name: string,
  width: number,
  depth: number,
  height: number,
  massKg: number,
  extra: Partial<PartDefinition> = {},
): PartDefinition {
  return {
    id,
    version: 1,
    category: "storage",
    name,
    generator: "panelBox",
    mount: "floor",
    params: [
      { key: "width", label: "Width", kind: "length", default: width, min: 50, max: 2400 },
      { key: "depth", label: "Depth", kind: "length", default: depth, min: 50, max: 2400 },
      { key: "height", label: "Height", kind: "length", default: height, min: 10, max: 2400 },
    ],
    mass: { fixed: kgToGrams(massKg) },
    price: { fixed: 10_000, currency: "USD" },
    ...extra,
  };
}

export const testDefinitions: PartDefinition[] = [
  definition("cabinet", "Cabinet", 1200, 600, 900, 40),
  definition("crate", "Crate", 500, 500, 500, 10),
  definition("shelf", "Overhead shelf", 1000, 300, 350, 8, { defaultElevation: 1400 }),
  definition("tank", "Water tank", 800, 400, 300, 6, {
    mass: { fixed: kgToGrams(6), contents: { capacityLitres: 90, gramsPerLitre: 1000 } },
  }),
];

export const lookupTestDefinition: DefinitionLookup = (id) =>
  testDefinitions.find((def) => def.id === id);

export function testPart(
  id: string,
  defId: string,
  x: number,
  y: number,
  z = 0,
  yaw: PartInstance["yaw"] = 0,
): PartInstance {
  const def = lookupTestDefinition(defId);
  if (!def) throw new Error(`No test definition "${defId}"`);
  return { ...createInstance(def, id, { x, y, z }), yaw };
}

export function testDesign(parts: PartInstance[]): DesignDoc {
  return {
    schemaVersion: DESIGN_SCHEMA_VERSION,
    name: "Test layout",
    shellId: testShell.id,
    chassisId: "base",
    parts: Object.fromEntries(parts.map((part) => [part.id, part])),
  };
}

/** A small layout touching every drawing feature: floor parts, a raised part, a rotated part. */
export function sampleDesign(): DesignDoc {
  return testDesign([
    testPart("cabinet", "cabinet", 1000, -600),
    testPart("crate", "crate", 250, 650),
    // Against the driver-side wall at shelf height, where the wall has already leaned in.
    setWallDistance(testShell, testPart("shelf", "shelf", 1000, 0, 1400), "driver", 0),
    testPart("tank", "tank", 2600, 0, 0, 90),
  ]);
}
