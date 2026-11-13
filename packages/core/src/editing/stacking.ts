import {
  type DefinitionLookup,
  type Obstacle,
  partBox,
  partExtents,
  WHEEL_WELL_PREFIX,
} from "../parts/parts";
import type { DesignDoc } from "../schema/design";
import { type Box3, EPS, type Vec3 } from "../schema/geometry";
import type { PartInstance } from "../schema/part";
import type { VanShell } from "../schema/shell";
import { minInteriorHeight } from "../shell/geometry";
import { type DragInput, type DragResult, solveDrag } from "../snap/solveDrag";
import { quantizeMm } from "../units/length";

/**
 * Stacking. Some parts carry others (a bed platform, a cabinet, a wheel well) and some parts
 * stack (a mattress, a crate). A stacking part dragged over a carrier drops onto it, and
 * parts resting on a carrier ride along when the carrier moves.
 */

function covers(box: Box3, point: { x: number; y: number }): boolean {
  return (
    point.x >= box.min.x - EPS &&
    point.x <= box.max.x + EPS &&
    point.y >= box.min.y - EPS &&
    point.y <= box.max.y + EPS
  );
}

/** Everything a stacking part can rest on: wheel wells and the parts that carry. */
export function supportSurfaces(
  doc: DesignDoc,
  shell: VanShell,
  definitions: DefinitionLookup,
  exclude: readonly string[] = [],
): Obstacle[] {
  const skip = new Set(exclude);
  const supports: Obstacle[] = shell.wheelWells.map((box, i) => ({
    id: `${WHEEL_WELL_PREFIX}${i}`,
    box,
  }));
  for (const id of Object.keys(doc.parts).sort()) {
    const part = doc.parts[id];
    if (!part || skip.has(id) || !definitions(part.defId)?.carries) continue;
    supports.push({ id, box: partBox(part) });
  }
  return supports;
}

/** Heights a part could rest at when centred on `point`: highest support first, base last. */
export function restingLevels(
  supports: readonly Obstacle[],
  point: { x: number; y: number },
  base: number,
): number[] {
  const tops = supports
    .filter((support) => covers(support.box, point) && support.box.max.z > base + EPS)
    .map((support) => support.box.max.z)
    .sort((a, b) => b - a);
  return [...new Set(tops), base];
}

export interface StackedDragInput extends Omit<DragInput, "z"> {
  supports: readonly Obstacle[];
  /** Height the part sits at when it is not on anything (normally the floor). */
  baseZ: number;
}

/**
 * `solveDrag` for a part that stacks. Tries the highest surface under the pointer first and
 * works down to the floor, keeping the first level where the part fits, is clear of its
 * neighbours and still ends up over the surface it is resting on.
 */
export function solveStackedDrag(input: StackedDragInput): DragResult {
  for (const z of restingLevels(input.supports, input.proposed, input.baseZ)) {
    const result = solveDrag({ ...input, z });
    if (z === input.baseZ) return result;
    if (result.collisions.length > 0 || result.outOfBounds) continue;
    const { x } = result.position;
    const headroom = minInteriorHeight(input.shell, x - input.size.x / 2, x + input.size.x / 2);
    if (z + input.size.z > headroom + EPS) continue;
    const stillSupported = restingLevels(input.supports, result.position, input.baseZ).some(
      (level) => Math.abs(level - z) < EPS,
    );
    if (stillSupported) return result;
  }
  return solveDrag({ ...input, z: input.baseZ });
}

/** Ids of the parts resting on a carrier, and on those, and so on. Stable order. */
export function ridersOf(
  doc: DesignDoc,
  definitions: DefinitionLookup,
  carrierId: string,
): string[] {
  const riders: string[] = [];
  const ids = Object.keys(doc.parts).sort();
  const visit = (id: string) => {
    const carrier = doc.parts[id];
    if (!carrier || !definitions(carrier.defId)?.carries) return;
    const box = partBox(carrier);
    for (const otherId of ids) {
      const other = doc.parts[otherId];
      if (!other || otherId === carrierId || otherId === id || riders.includes(otherId)) continue;
      if (!definitions(other.defId)?.stacks) continue;
      if (Math.abs(other.position.z - box.max.z) > EPS) continue;
      if (!covers(box, other.position)) continue;
      riders.push(otherId);
      visit(otherId);
    }
  };
  visit(carrierId);
  return riders;
}

/** A part moved by `delta`. */
export function translatePart(part: PartInstance, delta: Vec3): PartInstance {
  return {
    ...part,
    position: {
      x: quantizeMm(part.position.x + delta.x),
      y: quantizeMm(part.position.y + delta.y),
      z: quantizeMm(part.position.z + delta.z),
    },
  };
}

/**
 * Let a stacking part settle after what it was resting on changed or went away: it drops to
 * the highest surface under its centre that leaves it headroom, or to its base height.
 */
export function settleOnSupports(
  doc: DesignDoc,
  shell: VanShell,
  definitions: DefinitionLookup,
  part: PartInstance,
): PartInstance {
  const def = definitions(part.defId);
  if (!def?.stacks) return part;
  const base = def.defaultElevation ?? 0;
  const size = partExtents(part);
  const { x, y } = part.position;
  const headroom = minInteriorHeight(shell, x - size.x / 2, x + size.x / 2);
  const supports = supportSurfaces(doc, shell, definitions, [part.id]);
  const level =
    restingLevels(supports, part.position, base).find((z) => z + size.z <= headroom + EPS) ?? base;
  return { ...part, position: { x, y, z: quantizeMm(level) } };
}
