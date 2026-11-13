import { z } from "zod";

/**
 * Van frame, used by every coordinate in the model (millimetres):
 *   X runs rearward along the van, 0 at the front of the cargo area.
 *   Y runs across the van, 0 on the centreline, positive toward the passenger side.
 *   Z runs up, 0 at the finished cargo floor.
 */
export const Vec3Schema = z.object({ x: z.number(), y: z.number(), z: z.number() });
export type Vec3 = z.infer<typeof Vec3Schema>;

export const Box3Schema = z.object({ min: Vec3Schema, max: Vec3Schema });
export type Box3 = z.infer<typeof Box3Schema>;

/** Tolerance for "touching" versus "overlapping", in mm. */
export const EPS = 0.01;

export function boxesOverlap(a: Box3, b: Box3): boolean {
  return (
    a.min.x < b.max.x - EPS &&
    b.min.x < a.max.x - EPS &&
    a.min.y < b.max.y - EPS &&
    b.min.y < a.max.y - EPS &&
    a.min.z < b.max.z - EPS &&
    b.min.z < a.max.z - EPS
  );
}

export function intervalsOverlap(a0: number, a1: number, b0: number, b1: number): boolean {
  return a0 < b1 - EPS && b0 < a1 - EPS;
}

export function boxCentre(box: Box3): Vec3 {
  return {
    x: (box.min.x + box.max.x) / 2,
    y: (box.min.y + box.max.y) / 2,
    z: (box.min.z + box.max.z) / 2,
  };
}
