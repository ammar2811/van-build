import {
  createInstance,
  DESIGN_SCHEMA_VERSION,
  type DesignDoc,
  defaultLoadCase,
  initialElevation,
  type PartInstance,
  partBox,
  partExtents,
  setWallDistance,
  type VanShell,
  type Yaw,
} from "@vanbuild/core";
import { partDefinitions } from "./parts/definitions";

/**
 * Ready-made layouts to start from. Each part is placed by intent ("against the rear wall",
 * "flush in front of the wheel well", "just behind the sliding door"), not by coordinates, so
 * every template fits every van in the catalog. A test checks that each one opens in each van
 * without a single collision or out-of-bounds part.
 */

/** Where a part goes along the van. Gaps are in mm. */
type Along =
  | { front: number }
  | { rear: number }
  /**
   * Rear face this far in front of whichever comes first: the wheel wells ("well") or the
   * named parts. A galley ends at the wheel well in one van and at the bed in another.
   */
  | { before: string[]; gap?: number }
  /** Front face this far behind the sliding door opening. */
  | { afterDoor: number }
  /** Front face this far behind another part's rear face. */
  | { after: string; gap?: number }
  /** Front faces lined up with another part's, plus a gap. For things inside furniture. */
  | { startOf: string; gap?: number }
  /** Rear faces lined up with another part's, less a gap. */
  | { endOf: string; gap?: number }
  /** Same position along the van as another part. */
  | { with: string };

/** Where a part goes across the van. */
type Across = { driver: number } | { passenger: number } | "centre" | { with: string };

interface Placement {
  id: string;
  defId: string;
  along: Along;
  across: Across;
  /** Sit on top of another part. Otherwise the part's usual height (floor, wall, roof). */
  on?: string;
  yaw?: Yaw;
}

export interface Template {
  id: string;
  name: string;
  /** One sentence for the picker. */
  description: string;
  parts: Placement[];
}

/** The bed across the rear, fresh water and the battery under it. Shared by most templates. */
const REAR_BED: Placement[] = [
  { id: "bed", defId: "bed-platform", along: { rear: 0 }, across: "centre" },
  { id: "mattress", defId: "mattress", along: { with: "bed" }, across: { with: "bed" }, on: "bed" },
  { id: "water", defId: "fresh-water-tank-100", along: { rear: 150 }, across: "centre" },
];

/** Galley along the driver side, ending at the wheel well or the bed, fridge in front of it. */
const DRIVER_GALLEY: Placement[] = [
  {
    id: "galley",
    defId: "galley-cabinet",
    along: { before: ["well", "bed"] },
    across: { driver: 0 },
  },
  {
    id: "fridge",
    defId: "fridge-upright-85",
    along: { before: ["galley"] },
    across: { driver: 0 },
  },
];

const FAN: Placement = { id: "fan", defId: "roof-fan", along: { rear: 900 }, across: "centre" };

export const templates: Template[] = [
  {
    id: "empty",
    name: "Empty van",
    description: "Start from a bare floor and add everything yourself.",
    parts: [],
  },
  {
    id: "weekender",
    name: "Weekender",
    description:
      "A bed across the back, a galley and fridge, water and a battery. Light and simple.",
    parts: [
      ...REAR_BED,
      ...DRIVER_GALLEY,
      { id: "battery", defId: "battery-100ah", along: { rear: 60 }, across: { passenger: 60 } },
      FAN,
    ],
  },
  {
    id: "full-time",
    name: "Full-time solo",
    description:
      "For living on the road: solar, a big battery and inverter, heating, a toilet and overhead storage.",
    parts: [
      ...REAR_BED,
      ...DRIVER_GALLEY,
      // Grey water and the heater live inside the galley cabinet, one at each end.
      {
        id: "grey",
        defId: "grey-water-tank-60",
        along: { startOf: "galley", gap: 20 },
        across: { driver: 80 },
      },
      {
        id: "heater",
        defId: "diesel-heater",
        along: { endOf: "galley", gap: 20 },
        across: { driver: 80 },
      },
      {
        id: "overhead",
        defId: "overhead-cabinet",
        along: { with: "galley" },
        across: { driver: 0 },
      },
      {
        id: "overhead-rear",
        defId: "overhead-cabinet",
        along: { rear: 0 },
        across: { passenger: 0 },
      },
      // Turned so it clears the wheel well in the shorter vans, with the inverter just ahead.
      {
        id: "battery",
        defId: "battery-200ah",
        along: { rear: 60 },
        across: { passenger: 60 },
        yaw: 90,
      },
      { id: "inverter", defId: "inverter-2000", along: { rear: 330 }, across: { passenger: 300 } },
      {
        id: "toilet",
        defId: "portable-toilet",
        along: { afterDoor: 0 },
        across: { passenger: 20 },
      },
      { id: "solar", defId: "solar-panel-200", along: { front: 100 }, across: "centre" },
      FAN,
    ],
  },
  {
    id: "dinette",
    name: "Couple with a dinette",
    description: "A bench behind the cab and a table for meals and work, the bed across the back.",
    parts: [
      ...REAR_BED,
      ...DRIVER_GALLEY,
      {
        id: "bench",
        defId: "bench-seat",
        along: { front: 0 },
        across: { passenger: 0 },
        yaw: 90,
      },
      {
        id: "table",
        defId: "table",
        along: { after: "bench", gap: 200 },
        across: { with: "bench" },
      },
      { id: "battery", defId: "battery-100ah", along: { rear: 60 }, across: { passenger: 60 } },
      FAN,
    ],
  },
];

function definition(id: string) {
  const def = partDefinitions.find((d) => d.id === id);
  if (!def) throw new Error(`Template needs part "${id}"`);
  return def;
}

function moveTo(part: PartInstance, x: number, y = part.position.y): PartInstance {
  return { ...part, position: { ...part.position, x, y } };
}

/** Build a template in a van. The result is an ordinary design: everything can be changed. */
export function designFromTemplate(template: Template, shell: VanShell): DesignDoc {
  const chassis = shell.chassis[0];
  if (!chassis) throw new Error(`Van "${shell.id}" has no chassis`);
  const placed = new Map<string, PartInstance>();
  const wellFront = Math.min(shell.cargoLength, ...shell.wheelWells.map((w) => w.min.x));
  const door = shell.openings.find((o) => o.kind === "slidingDoor");
  const other = (id: string) => {
    const part = placed.get(id);
    if (!part) throw new Error(`Template "${template.id}" refers to "${id}" before placing it`);
    return part;
  };

  for (const spec of template.parts) {
    const def = definition(spec.defId);
    let part: PartInstance = {
      ...createInstance(def, spec.id, { x: 0, y: 0, z: initialElevation(shell, def) }),
      yaw: spec.yaw ?? 0,
    };
    if (spec.on) {
      const base = other(spec.on);
      part = { ...part, position: { ...part.position, z: partBox(base).max.z } };
    }
    const size = partExtents(part);

    const along = spec.along;
    if ("front" in along) part = setWallDistance(shell, part, "front", along.front);
    else if ("rear" in along) part = setWallDistance(shell, part, "rear", along.rear);
    else if ("before" in along) {
      const limit = Math.min(
        ...along.before.map((id) => (id === "well" ? wellFront : partBox(other(id)).min.x)),
      );
      part = moveTo(part, limit - (along.gap ?? 0) - size.x / 2);
    } else if ("afterDoor" in along) {
      part = moveTo(part, (door?.to ?? 0) + along.afterDoor + size.x / 2);
    } else if ("after" in along) {
      part = moveTo(part, partBox(other(along.after)).max.x + (along.gap ?? 0) + size.x / 2);
    } else if ("startOf" in along) {
      part = moveTo(part, partBox(other(along.startOf)).min.x + (along.gap ?? 0) + size.x / 2);
    } else if ("endOf" in along) {
      part = moveTo(part, partBox(other(along.endOf)).max.x - (along.gap ?? 0) - size.x / 2);
    } else part = moveTo(part, other(along.with).position.x);

    const across = spec.across;
    if (across === "centre") part = moveTo(part, part.position.x, 0);
    else if ("driver" in across) part = setWallDistance(shell, part, "driver", across.driver);
    else if ("passenger" in across) {
      part = setWallDistance(shell, part, "passenger", across.passenger);
    } else part = moveTo(part, part.position.x, other(across.with).position.y);

    placed.set(spec.id, part);
  }

  return {
    schemaVersion: DESIGN_SCHEMA_VERSION,
    name: template.id === "empty" ? `My ${shell.name}` : `${template.name}, ${shell.name}`,
    shellId: shell.id,
    chassisId: chassis.id,
    vehicle: {},
    loadCase: defaultLoadCase(),
    parts: Object.fromEntries(placed),
  };
}
