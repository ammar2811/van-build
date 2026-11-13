import type { Param, PartDefinition } from "@vanbuild/core";

/**
 * Starter catalog. Sizes, masses and prices are generic planning defaults, not any
 * manufacturer's product data, and every one can be overridden per part in a design.
 */

function size(
  width: number,
  depth: number,
  height: number,
  limits: { max?: number } = {},
): Param[] {
  const max = limits.max ?? 2400;
  return [
    { key: "width", label: "Width", kind: "length", default: width, min: 50, max },
    { key: "depth", label: "Depth", kind: "length", default: depth, min: 50, max },
    { key: "height", label: "Height", kind: "length", default: height, min: 10, max },
  ];
}

export const partDefinitions: PartDefinition[] = [
  {
    id: "bed-platform",
    version: 1,
    category: "bed",
    name: "Bed platform",
    generator: "platform",
    mount: "floor",
    // A raised deck with a mattress on top. The space underneath stays free for storage.
    defaultElevation: 600,
    params: size(1350, 1750, 300),
    mass: { fixed: 45_000 },
    price: { fixed: 35_000, currency: "USD" },
  },
  {
    id: "galley-cabinet",
    version: 1,
    category: "galley",
    name: "Galley cabinet",
    generator: "panelBox",
    mount: "floor",
    params: size(1200, 550, 900),
    mass: { fixed: 38_000 },
    price: { fixed: 60_000, currency: "USD" },
  },
  {
    id: "overhead-cabinet",
    version: 1,
    category: "storage",
    name: "Overhead cabinet",
    generator: "panelBox",
    mount: "wall",
    defaultElevation: 1400,
    params: size(1200, 330, 350),
    mass: { fixed: 12_000 },
    price: { fixed: 28_000, currency: "USD" },
  },
  {
    id: "fridge-upright-85",
    version: 1,
    category: "appliance",
    name: "Fridge 85 L",
    generator: "appliance",
    mount: "floor",
    params: size(475, 500, 830),
    mass: { fixed: 21_000 },
    price: { fixed: 90_000, currency: "USD" },
    electrical: { watts: 45, dutyHoursPerDay: 8 },
  },
  {
    id: "bench-seat",
    version: 1,
    category: "seating",
    name: "Bench seat",
    generator: "bench",
    mount: "floor",
    params: size(1000, 500, 480),
    mass: { fixed: 18_000 },
    price: { fixed: 25_000, currency: "USD" },
  },
  {
    id: "fresh-water-tank-100",
    version: 1,
    category: "water",
    name: "Fresh water 100 L",
    generator: "tank",
    mount: "floor",
    params: size(800, 400, 320),
    mass: { fixed: 6_000, contents: { capacityLitres: 100, gramsPerLitre: 1000 } },
    price: { fixed: 18_000, currency: "USD" },
    water: { litres: 100, kind: "fresh" },
  },
];
