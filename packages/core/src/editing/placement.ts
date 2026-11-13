import { createInstance, partBox, partExtents, sceneObstacles } from "../parts/parts";
import type { DesignDoc } from "../schema/design";
import { EPS, intervalsOverlap } from "../schema/geometry";
import type { PartDefinition, PartInstance, Yaw } from "../schema/part";
import type { VanShell } from "../schema/shell";
import { minHalfWidth } from "../shell/geometry";
import { solveDrag } from "../snap/solveDrag";
import { quantizeMm } from "../units/length";

/** How close a face has to be to a wall to count as "against" it when re-anchoring. */
const CONTACT_MM = 0.5;

export interface WallDistances {
  front: number;
  rear: number;
  driver: number;
  passenger: number;
}

/** Clear distance from each face of a part to the wall it faces, at the part's own height. */
export function wallDistances(shell: VanShell, part: PartInstance): WallDistances {
  const box = partBox(part);
  const wall = minHalfWidth(shell, box.min.x, box.max.x, box.min.z, box.max.z);
  return {
    front: quantizeMm(box.min.x),
    rear: quantizeMm(shell.cargoLength - box.max.x),
    driver: quantizeMm(box.min.y + wall),
    passenger: quantizeMm(wall - box.max.y),
  };
}

export interface Clearance {
  /** Free space in mm between the part's face and whatever is nearest in that direction. */
  distance: number;
  /** Id of the neighbour (part or wheel well) that was hit, or null for a van wall. */
  toId: string | null;
}

/**
 * Free space around a part in each direction: to the nearest neighbour that shares its
 * lane and height, or to the wall when nothing is in the way. This is what the live
 * dimension labels on the plan show.
 */
export function clearances(
  doc: DesignDoc,
  shell: VanShell,
  part: PartInstance,
): Record<keyof WallDistances, Clearance> {
  const box = partBox(part);
  const walls = wallDistances(shell, part);
  const result: Record<keyof WallDistances, Clearance> = {
    front: { distance: walls.front, toId: null },
    rear: { distance: walls.rear, toId: null },
    driver: { distance: walls.driver, toId: null },
    passenger: { distance: walls.passenger, toId: null },
  };
  const consider = (side: keyof WallDistances, gap: number, id: string) => {
    if (gap > -EPS && gap < result[side].distance) {
      result[side] = { distance: quantizeMm(Math.max(gap, 0)), toId: id };
    }
  };
  for (const o of sceneObstacles(doc, shell, part.id)) {
    if (!intervalsOverlap(box.min.z, box.max.z, o.box.min.z, o.box.max.z)) continue;
    if (intervalsOverlap(box.min.y, box.max.y, o.box.min.y, o.box.max.y)) {
      consider("front", box.min.x - o.box.max.x, o.id);
      consider("rear", o.box.min.x - box.max.x, o.id);
    }
    if (intervalsOverlap(box.min.x, box.max.x, o.box.min.x, o.box.max.x)) {
      consider("driver", box.min.y - o.box.max.y, o.id);
      consider("passenger", o.box.min.y - box.max.y, o.id);
    }
  }
  return result;
}

function withPosition(part: PartInstance, x: number, y: number, z = part.position.z) {
  return { ...part, position: { x: quantizeMm(x), y: quantizeMm(y), z: quantizeMm(z) } };
}

/** Move a part so one face sits an exact distance from the wall it faces. */
export function setWallDistance(
  shell: VanShell,
  part: PartInstance,
  wall: keyof WallDistances,
  distance: number,
): PartInstance {
  const size = partExtents(part);
  const { x, y } = part.position;
  if (wall === "front") return withPosition(part, distance + size.x / 2, y);
  if (wall === "rear") return withPosition(part, shell.cargoLength - distance - size.x / 2, y);
  const box = partBox(part);
  const limit = minHalfWidth(shell, box.min.x, box.max.x, box.min.z, box.max.z);
  if (wall === "driver") return withPosition(part, x, -limit + distance + size.y / 2);
  return withPosition(part, x, limit - distance - size.y / 2);
}

export function setFloorHeight(part: PartInstance, z: number): PartInstance {
  return withPosition(part, part.position.x, part.position.y, z);
}

/**
 * Carry a part's wall contacts across a change of size or rotation: a cabinet that was
 * against the passenger wall stays against it. Faces that touched nothing keep `keep`:
 * the centre (rotation) or the front/driver-side corner (resize).
 */
function reanchor(
  shell: VanShell,
  before: PartInstance,
  after: PartInstance,
  keep: "centre" | "corner",
): PartInstance {
  const was = wallDistances(shell, before);
  const oldBox = partBox(before);
  const size = partExtents(after);

  let x = keep === "centre" ? before.position.x : oldBox.min.x + size.x / 2;
  if (was.front <= CONTACT_MM) x = size.x / 2;
  else if (was.rear <= CONTACT_MM) x = shell.cargoLength - size.x / 2;

  const z0 = after.position.z;
  const limit = minHalfWidth(shell, x - size.x / 2, x + size.x / 2, z0, z0 + size.z);
  let y = keep === "centre" ? before.position.y : oldBox.min.y + size.y / 2;
  if (was.driver <= CONTACT_MM) y = -limit + size.y / 2;
  else if (was.passenger <= CONTACT_MM) y = limit - size.y / 2;

  return withPosition(after, x, y);
}

/** Nearest spot where the part fits without overlapping anything. */
function settle(doc: DesignDoc, shell: VanShell, part: PartInstance): PartInstance {
  const result = solveDrag({
    shell,
    obstacles: sceneObstacles(doc, shell, part.id),
    size: partExtents(part),
    z: part.position.z,
    proposed: { x: part.position.x, y: part.position.y },
    mmPerPx: 1,
    noSnap: true,
  });
  return withPosition(part, result.position.x, result.position.y);
}

/** Turn a part a quarter turn, keep it against its walls, then slide it clear of neighbours. */
export function rotatePart(doc: DesignDoc, shell: VanShell, part: PartInstance): PartInstance {
  const yaw = ((part.yaw + 90) % 360) as Yaw;
  return settle(doc, shell, reanchor(shell, part, { ...part, yaw }, "centre"));
}

/**
 * Change one of a part's dimensions. The value is taken as typed: if the bigger part now
 * overlaps a neighbour it is flagged, not silently moved.
 */
export function resizePart(
  shell: VanShell,
  part: PartInstance,
  key: "width" | "depth" | "height",
  value: number,
): PartInstance {
  const resized = { ...part, params: { ...part.params, [key]: quantizeMm(value) } };
  return reanchor(shell, part, resized, "corner");
}

/** A new part from the catalog, dropped in the free spot nearest the middle of the van. */
export function placeNewPart(
  doc: DesignDoc,
  shell: VanShell,
  def: PartDefinition,
  id: string,
): PartInstance {
  const z = def.defaultElevation ?? 0;
  const fresh = createInstance(def, id, { x: shell.cargoLength / 2, y: 0, z });
  const size = partExtents(fresh);
  // Start from a spot on the 10 mm grid so new parts get round numbers.
  const x = Math.round((shell.cargoLength / 2 - size.x / 2) / 10) * 10 + size.x / 2;
  return settle(doc, shell, withPosition(fresh, x, 0));
}

/** Whether a part sits flush against any wall. Exposed for tests and the inspector. */
export function touchesWall(shell: VanShell, part: PartInstance): boolean {
  const d = wallDistances(shell, part);
  return Math.min(d.front, d.rear, d.driver, d.passenger) <= EPS;
}
