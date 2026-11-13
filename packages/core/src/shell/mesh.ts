import type { VanShell } from "../schema/shell";
import { halfWidthAt, interiorHeightAt } from "./geometry";

/** Triangles in the van frame (mm): `positions` is x, y, z per vertex. */
export interface TriangleMesh {
  positions: number[];
  indices: number[];
}

export type Polyline = [number, number, number][];

function unique(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

/** Positions along the van where the cross-section changes, including both ends. */
function stationXs(shell: VanShell): number[] {
  const inside = shell.stations.map((s) => s.x).filter((x) => x > 0 && x < shell.cargoLength);
  return unique([0, ...inside, shell.cargoLength]);
}

/** Heights where any cross-section changes direction, from the floor to the highest ceiling. */
function profileZs(shell: VanShell): number[] {
  return unique(shell.stations.flatMap((s) => s.profile.map((p) => p.z)));
}

/** Half-width at (x, z), with z held at or below the ceiling at that x. */
function wallAt(shell: VanShell, x: number, z: number): { y: number; z: number } {
  const top = Math.min(z, interiorHeightAt(shell, x));
  return { y: halfWidthAt(shell, x, top), z: top };
}

/**
 * The side walls as one mesh, lofted between the shell's cross-sections. `sides` picks the
 * passenger wall (1), the driver wall (-1) or both. The ends are left open (the cab and the
 * rear doors), so a 3D view can look straight in.
 */
export function shellWallMesh(shell: VanShell, sides: readonly (1 | -1)[] = [1, -1]): TriangleMesh {
  const xs = stationXs(shell);
  const zs = profileZs(shell);
  const positions: number[] = [];
  const indices: number[] = [];
  for (const side of sides) {
    const offset = positions.length / 3;
    for (const x of xs) {
      for (const z of zs) {
        const wall = wallAt(shell, x, z);
        positions.push(x, side * wall.y, wall.z);
      }
    }
    const rows = zs.length;
    for (let i = 0; i < xs.length - 1; i++) {
      for (let j = 0; j < rows - 1; j++) {
        const a = offset + i * rows + j;
        const b = a + rows;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  }
  return { positions, indices };
}

/** The floor as a mesh at z = 0. */
export function shellFloorMesh(shell: VanShell): TriangleMesh {
  const xs = stationXs(shell);
  const positions: number[] = [];
  const indices: number[] = [];
  for (const x of xs) {
    const half = halfWidthAt(shell, x, 0);
    positions.push(x, half, 0, x, -half, 0);
  }
  for (let i = 0; i < xs.length - 1; i++) {
    const a = i * 2;
    indices.push(a, a + 2, a + 1, a + 2, a + 3, a + 1);
  }
  return { positions, indices };
}

/**
 * The shell's outline as lines: the floor edge, the ceiling edge, and the wall profile at
 * each end. Enough to read the shape without drawing solid walls.
 */
export function shellEdges(shell: VanShell): Polyline[] {
  const xs = stationXs(shell);
  const zs = profileZs(shell);
  const top = zs[zs.length - 1] ?? 0;
  const lines: Polyline[] = [];
  for (const side of [1, -1]) {
    lines.push(xs.map((x) => [x, side * halfWidthAt(shell, x, 0), 0]));
    lines.push(
      xs.map((x) => {
        const wall = wallAt(shell, x, top);
        return [x, side * wall.y, wall.z];
      }),
    );
  }
  for (const x of [0, shell.cargoLength]) {
    const left: Polyline = zs.map((z) => {
      const wall = wallAt(shell, x, z);
      return [x, -wall.y, wall.z];
    });
    const right: Polyline = zs.map((z) => {
      const wall = wallAt(shell, x, z);
      return [x, wall.y, wall.z];
    });
    // Up one wall, across the ceiling, down the other, and back along the floor.
    const first = left[0];
    lines.push([...left, ...right.reverse(), ...(first ? [first] : [])]);
  }
  return lines;
}
