import { type DefinitionLookup, partExtents, sceneObstacles } from "../parts/parts";
import type { DesignDoc } from "../schema/design";
import type { PartInstance } from "../schema/part";
import type { VanShell } from "../schema/shell";
import { solveDrag } from "../snap/solveDrag";
import { quantizeMm } from "../units/length";
import { solveStackedDrag, supportSurfaces } from "./stacking";

/**
 * A copy of a part, placed in the free spot nearest the original (usually flush beside it,
 * or on top of it when the part stacks on itself). The copy starts unlocked.
 */
export function duplicatePart(
  doc: DesignDoc,
  shell: VanShell,
  definitions: DefinitionLookup,
  part: PartInstance,
  id: string,
): PartInstance {
  const def = definitions(part.defId);
  const common = {
    shell,
    obstacles: sceneObstacles(doc, shell),
    size: partExtents(part),
    proposed: { x: part.position.x, y: part.position.y },
    mmPerPx: 1,
    noSnap: true,
  };
  const result = def?.stacks
    ? solveStackedDrag({
        ...common,
        supports: supportSurfaces(doc, shell, definitions),
        baseZ: def.defaultElevation ?? 0,
      })
    : solveDrag({ ...common, z: part.position.z });
  return {
    ...part,
    id,
    params: { ...part.params },
    overrides: { ...part.overrides },
    locks: { position: false, params: [] },
    position: {
      x: quantizeMm(result.position.x),
      y: quantizeMm(result.position.y),
      z: quantizeMm(result.position.z),
    },
  };
}
