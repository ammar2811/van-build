import { describe, expect, it } from "vitest";
import type { VanShell } from "../schema/shell";
import { testShell } from "../testing/fixtures";
import { halfWidthAt } from "./geometry";
import { shellEdges, shellFloorMesh, shellWallMesh } from "./mesh";

/** Narrows toward the rear and gets lower. */
const tapered: VanShell = {
  ...testShell,
  stations: [
    {
      x: 0,
      profile: [
        { z: 0, halfWidth: 900 },
        { z: 1900, halfWidth: 700 },
      ],
    },
    {
      x: 1500,
      profile: [
        { z: 0, halfWidth: 850 },
        { z: 1000, halfWidth: 850 },
        { z: 1800, halfWidth: 650 },
      ],
    },
  ],
};

function vertices(positions: number[]): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let i = 0; i < positions.length; i += 3) {
    out.push([positions[i] ?? 0, positions[i + 1] ?? 0, positions[i + 2] ?? 0]);
  }
  return out;
}

describe("shellWallMesh", () => {
  it("builds two walls spanning the cargo length and height", () => {
    const mesh = shellWallMesh(testShell);
    const points = vertices(mesh.positions);
    // Two ends x three profile heights, on each side.
    expect(points).toHaveLength(12);
    expect(mesh.indices).toHaveLength(2 * 1 * 2 * 6);
    expect(Math.min(...points.map((p) => p[0]))).toBe(0);
    expect(Math.max(...points.map((p) => p[0]))).toBe(3000);
    expect(Math.max(...points.map((p) => p[2]))).toBe(1900);
    expect(Math.max(...points.map((p) => p[1]))).toBe(900);
    expect(Math.min(...points.map((p) => p[1]))).toBe(-900);
  });

  it("can build one wall at a time", () => {
    const passenger = vertices(shellWallMesh(testShell, [1]).positions);
    const driver = vertices(shellWallMesh(testShell, [-1]).positions);
    expect(passenger).toHaveLength(6);
    expect(passenger.every((p) => p[1] > 0)).toBe(true);
    expect(driver.every((p) => p[1] < 0)).toBe(true);
  });

  it("puts every vertex exactly on the wall", () => {
    for (const shell of [testShell, tapered]) {
      for (const [x, y, z] of vertices(shellWallMesh(shell).positions)) {
        expect(Math.abs(y)).toBeCloseTo(halfWidthAt(shell, x, z), 9);
      }
    }
  });

  it("only references vertices that exist, and has no degenerate triangles", () => {
    const mesh = shellWallMesh(tapered);
    const count = mesh.positions.length / 3;
    expect(mesh.indices.length % 3).toBe(0);
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const triangle = mesh.indices.slice(i, i + 3);
      expect(triangle.every((index) => index >= 0 && index < count)).toBe(true);
      expect(new Set(triangle).size).toBe(3);
    }
  });

  it("follows a ceiling that gets lower toward the rear", () => {
    const points = vertices(shellWallMesh(tapered).positions);
    const rearTop = Math.max(...points.filter((p) => p[0] === 3000).map((p) => p[2]));
    expect(rearTop).toBe(1800);
  });
});

describe("shellFloorMesh", () => {
  it("covers the floor outline", () => {
    const mesh = shellFloorMesh(testShell);
    expect(vertices(mesh.positions)).toEqual([
      [0, 900, 0],
      [0, -900, 0],
      [3000, 900, 0],
      [3000, -900, 0],
    ]);
    expect(mesh.indices).toHaveLength(6);
  });

  it("adds a strip per cross-section change", () => {
    expect(shellFloorMesh(tapered).indices).toHaveLength(12);
  });
});

describe("shellEdges", () => {
  it("draws floor and ceiling edges on both sides and a closed profile at each end", () => {
    const lines = shellEdges(testShell);
    expect(lines).toHaveLength(6);
    const frontProfile = lines[4];
    expect(frontProfile?.[0]).toEqual(frontProfile?.[frontProfile.length - 1]);
    expect(frontProfile?.every((point) => point[0] === 0)).toBe(true);
  });
});
