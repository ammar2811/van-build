import {
  createInstance,
  DESIGN_SCHEMA_VERSION,
  type DesignDoc,
  type PartInstance,
  partExtents,
  setWallDistance,
} from "@vanbuild/core";
import { partDefinitions } from "./parts/definitions";
import { sprinter144HighRoof } from "./shells/sprinter-144-high-roof";

function definition(id: string) {
  const def = partDefinitions.find((d) => d.id === id);
  if (!def) throw new Error(`Starter design needs part "${id}"`);
  return def;
}

/**
 * A small layout to start from: bed across the rear with the water tank under it, galley and
 * fridge along the driver side. Positions are derived from the shell, so they stay flush if
 * the shell data is refined.
 */
export function starterDesign(): DesignDoc {
  const shell = sprinter144HighRoof;
  const wellFront = Math.min(...shell.wheelWells.map((well) => well.min.x));

  const at = (id: string, defId: string, place: (part: PartInstance) => PartInstance) => {
    const def = definition(defId);
    return place(createInstance(def, id, { x: 0, y: 0, z: def.defaultElevation ?? 0 }));
  };

  const bed = at("bed", "bed-platform", (part) => setWallDistance(shell, part, "rear", 0));
  const galley = at("galley", "galley-cabinet", (part) => {
    const flushToWell = wellFront - partExtents(part).x;
    return setWallDistance(shell, setWallDistance(shell, part, "front", flushToWell), "driver", 0);
  });
  const fridge = at("fridge", "fridge-upright-85", (part) => {
    const flushToGalley = wellFront - partExtents(galley).x - partExtents(part).x;
    return setWallDistance(
      shell,
      setWallDistance(shell, part, "front", flushToGalley),
      "driver",
      0,
    );
  });
  const water = at("water", "fresh-water-tank-100", (part) =>
    setWallDistance(shell, part, "rear", 150),
  );

  return {
    schemaVersion: DESIGN_SCHEMA_VERSION,
    name: "My Sprinter 144",
    shellId: shell.id,
    chassisId: "worker-rwd-diesel",
    parts: { bed, galley, fridge, water },
  };
}
