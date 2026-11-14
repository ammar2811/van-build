import type { Param, PartCategory, PartDefinition } from "@vanbuild/core";

/**
 * The v1 catalog. Sizes, masses and prices are generic planning defaults, not any
 * manufacturer's product data, and every one can be overridden per part in a design.
 *
 * Each entry is plain data. A few flags decide how a part behaves in the editor:
 *   carries     other parts can be put on top of it
 *   stacks      it drops onto whatever carries
 *   hollow      furniture with usable space inside
 *   fitsInside  a component that may sit inside hollow furniture
 */

function size(width: number, depth: number, height: number): Param[] {
  const max = 2400;
  return [
    { key: "width", label: "Width", kind: "length", default: width, min: 20, max },
    { key: "depth", label: "Depth", kind: "length", default: depth, min: 20, max },
    { key: "height", label: "Height", kind: "length", default: height, min: 10, max },
  ];
}

type Extra = Partial<
  Pick<
    PartDefinition,
    | "mount"
    | "defaultElevation"
    | "carries"
    | "stacks"
    | "hollow"
    | "fitsInside"
    | "electrical"
    | "water"
  >
> & { litres?: number };

function part(
  id: string,
  name: string,
  category: PartCategory,
  generator: PartDefinition["generator"],
  dimensions: [number, number, number],
  kilograms: number,
  dollars: number,
  extra: Extra = {},
): PartDefinition {
  const { litres, ...flags } = extra;
  return {
    id,
    version: 1,
    category,
    name,
    generator,
    mount: "floor",
    ...flags,
    params: size(...dimensions),
    mass: {
      fixed: Math.round(kilograms * 1000),
      ...(litres ? { contents: { capacityLitres: litres, gramsPerLitre: 1000 } } : {}),
    },
    price: { fixed: Math.round(dollars * 100), currency: "USD" },
  };
}

export const partDefinitions: PartDefinition[] = [
  // Beds. Platforms are raised decks: the space underneath stays free for storage.
  part("bed-platform", "Bed platform", "bed", "platform", [1350, 1750, 60], 30, 250, {
    defaultElevation: 700,
    carries: true,
  }),
  part(
    "bed-platform-lengthwise",
    "Bed platform, lengthwise",
    "bed",
    "platform",
    [1900, 800, 60],
    20,
    180,
    {
      defaultElevation: 500,
      carries: true,
    },
  ),
  part("mattress", "Mattress", "bed", "slab", [1350, 1750, 130], 15, 100, { stacks: true }),
  part("mattress-single", "Mattress, single", "bed", "slab", [1900, 750, 120], 9, 70, {
    stacks: true,
  }),

  // Galley.
  part("galley-cabinet", "Galley cabinet", "galley", "panelBox", [1200, 550, 900], 38, 600, {
    carries: true,
    hollow: true,
  }),
  part("sink-cabinet", "Sink cabinet", "galley", "panelBox", [600, 550, 900], 22, 380, {
    carries: true,
    hollow: true,
  }),
  part("drawer-cabinet", "Drawer cabinet", "galley", "panelBox", [450, 550, 900], 26, 420, {
    carries: true,
  }),
  part("countertop", "Countertop", "galley", "slab", [1200, 600, 38], 14, 160, {
    carries: true,
    stacks: true,
  }),
  part("cooktop-2-burner", "Cooktop", "galley", "appliance", [520, 350, 90], 5, 220, {
    stacks: true,
  }),
  part("sink", "Sink", "galley", "appliance", [400, 400, 180], 3, 110, { stacks: true }),

  // Storage.
  part("overhead-cabinet", "Overhead cabinet", "storage", "panelBox", [1200, 330, 350], 12, 280, {
    mount: "wall",
    defaultElevation: 1400,
    hollow: true,
  }),
  part("tall-cabinet", "Tall cabinet", "storage", "panelBox", [500, 550, 1800], 35, 450, {
    hollow: true,
  }),
  part("shelf-unit", "Shelf unit", "storage", "panelBox", [800, 300, 1200], 16, 190, {
    hollow: true,
  }),
  part("wall-shelf", "Wall shelf", "storage", "slab", [800, 200, 30], 3, 40, {
    mount: "wall",
    defaultElevation: 1300,
    carries: true,
  }),
  part("garage-box", "Garage box", "storage", "panelBox", [1000, 700, 500], 18, 220, {
    carries: true,
    hollow: true,
  }),
  part("storage-crate", "Storage crate", "storage", "load", [600, 400, 320], 12, 30, {
    carries: true,
    stacks: true,
  }),

  // Appliances.
  {
    ...part("fridge-upright-85", "Fridge 85 L", "appliance", "appliance", [475, 500, 830], 21, 900),
    electrical: { watts: 45, dutyHoursPerDay: 8 },
  },
  {
    ...part(
      "fridge-chest-45",
      "Chest fridge 45 L",
      "appliance",
      "appliance",
      [600, 380, 450],
      17,
      650,
      {
        fitsInside: true,
      },
    ),
    electrical: { watts: 45, dutyHoursPerDay: 7 },
  },
  part("portable-toilet", "Portable toilet", "appliance", "appliance", [380, 430, 410], 5, 130, {
    fitsInside: true,
  }),
  part(
    "composting-toilet",
    "Composting toilet",
    "appliance",
    "appliance",
    [400, 500, 500],
    12,
    950,
  ),
  part("shower-tray", "Shower tray", "appliance", "slab", [700, 700, 100], 8, 180),
  part("water-heater", "Water heater", "appliance", "appliance", [400, 300, 300], 7, 320, {
    fitsInside: true,
  }),

  // Seating.
  part("bench-seat", "Bench seat", "seating", "bench", [1000, 500, 480], 18, 250, {
    carries: true,
    hollow: true,
  }),
  part("belted-bench", "Belted bench, two seats", "seating", "bench", [1000, 600, 950], 45, 1400),
  part("table", "Table", "seating", "slab", [800, 500, 30], 7, 140, {
    defaultElevation: 700,
    carries: true,
  }),

  // Water.
  {
    ...part("fresh-water-tank-100", "Fresh water 100 L", "water", "tank", [800, 400, 320], 6, 180, {
      fitsInside: true,
      litres: 100,
    }),
    water: { litres: 100, kind: "fresh" },
  },
  {
    ...part("fresh-water-tank-60", "Fresh water 60 L", "water", "tank", [600, 400, 270], 4, 130, {
      fitsInside: true,
      litres: 60,
    }),
    water: { litres: 60, kind: "fresh" },
  },
  {
    ...part("grey-water-tank-60", "Grey water 60 L", "water", "tank", [600, 400, 270], 4, 130, {
      fitsInside: true,
      litres: 60,
    }),
    water: { litres: 60, kind: "grey" },
  },
  {
    ...part("jerry-can-20", "Jerry can 20 L", "water", "tank", [350, 170, 470], 1.5, 25, {
      fitsInside: true,
      litres: 20,
    }),
    water: { litres: 20, kind: "fresh" },
  },
  part("water-pump", "Water pump", "water", "device", [200, 100, 100], 1.5, 90, {
    fitsInside: true,
  }),

  // Electrical.
  part("battery-200ah", "Battery 200 Ah", "electrical", "battery", [520, 240, 220], 22, 900, {
    fitsInside: true,
  }),
  part("battery-100ah", "Battery 100 Ah", "electrical", "battery", [330, 175, 215], 11, 480, {
    fitsInside: true,
  }),
  part("inverter-2000", "Inverter 2000 W", "electrical", "device", [400, 220, 100], 5, 450, {
    fitsInside: true,
  }),
  part("dc-dc-charger", "DC-DC charger", "electrical", "device", [200, 150, 70], 1.5, 280, {
    fitsInside: true,
  }),
  part("solar-controller", "Solar controller", "electrical", "device", [200, 130, 70], 1, 150, {
    fitsInside: true,
  }),
  part(
    "electrical-cabinet",
    "Electrical cabinet",
    "electrical",
    "panelBox",
    [600, 350, 500],
    10,
    200,
    {
      carries: true,
      hollow: true,
    },
  ),
  part("solar-panel-200", "Solar panel 200 W", "electrical", "roofItem", [1480, 680, 35], 12, 220, {
    mount: "roof",
  }),

  // Climate.
  {
    ...part("roof-fan", "Roof fan", "climate", "roofItem", [400, 400, 100], 5, 250, {
      mount: "roof",
    }),
    electrical: { watts: 30, dutyHoursPerDay: 6 },
  },
  {
    ...part(
      "roof-air-conditioner",
      "Roof air conditioner",
      "climate",
      "roofItem",
      [800, 600, 250],
      30,
      1300,
      {
        mount: "roof",
      },
    ),
    electrical: { watts: 600, dutyHoursPerDay: 3 },
  },
  part("diesel-heater", "Diesel heater", "climate", "device", [380, 150, 140], 5, 600, {
    fitsInside: true,
  }),

  // Openings. Thin markers against a wall, so furniture is planned around them.
  part("side-window", "Side window", "opening", "wallCutout", [900, 40, 500], 8, 350, {
    mount: "wallCutout",
    defaultElevation: 900,
  }),
  part("bunk-window", "Bunk window", "opening", "wallCutout", [700, 40, 300], 5, 280, {
    mount: "wallCutout",
    defaultElevation: 1000,
  }),

  // Loads: things that are not built in but weigh something.
  part("rear-passenger", "Passenger", "load", "load", [450, 450, 1200], 80, 0),
  part("gear-bag", "Gear bag", "load", "load", [700, 350, 300], 15, 0, { stacks: true }),
  part("bikes", "Bikes, pair", "load", "load", [1700, 500, 1050], 28, 0),
];

/** Display names and order for the catalog's categories. */
export const categoryLabels: Record<PartCategory, string> = {
  bed: "Beds",
  galley: "Galley",
  storage: "Storage",
  seating: "Seating",
  appliance: "Appliances",
  water: "Water",
  electrical: "Electrical",
  climate: "Climate",
  opening: "Windows",
  load: "Loads",
};
