import { describe, expect, it } from "vitest";
import type { VanShell } from "../schema/shell";
import { testShell } from "../testing/fixtures";
import {
  halfWidthAt,
  interiorHeightAt,
  maxHalfWidth,
  minHalfWidth,
  minInteriorHeight,
  outlineAt,
} from "./geometry";

/** Narrows toward the rear: 900 wide at the front station, 800 at the rear station. */
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
      x: 3000,
      profile: [
        { z: 0, halfWidth: 800 },
        { z: 1800, halfWidth: 600 },
      ],
    },
  ],
};

describe("halfWidthAt", () => {
  it("is constant where the wall is vertical", () => {
    expect(halfWidthAt(testShell, 1500, 0)).toBe(900);
    expect(halfWidthAt(testShell, 1500, 1000)).toBe(900);
  });

  it("interpolates where the wall leans in", () => {
    expect(halfWidthAt(testShell, 1500, 1450)).toBe(800);
    expect(halfWidthAt(testShell, 1500, 1900)).toBe(700);
  });

  it("clamps above the ceiling and below the floor", () => {
    expect(halfWidthAt(testShell, 1500, 5000)).toBe(700);
    expect(halfWidthAt(testShell, 1500, -100)).toBe(900);
  });

  it("interpolates between stations along the van", () => {
    expect(halfWidthAt(tapered, 0, 0)).toBe(900);
    expect(halfWidthAt(tapered, 1500, 0)).toBe(850);
    expect(halfWidthAt(tapered, 3000, 0)).toBe(800);
    expect(halfWidthAt(tapered, 9999, 0)).toBe(800);
  });
});

describe("minHalfWidth", () => {
  it("returns the narrowest point a box has to fit in", () => {
    // A floor-standing part 900 high stays below the lean.
    expect(minHalfWidth(testShell, 0, 1000, 0, 900)).toBe(900);
    // An overhead cabinet from 1400 to 1750 is limited by its top edge.
    expect(minHalfWidth(testShell, 0, 1000, 1400, 1750)).toBeCloseTo(900 - (750 / 900) * 200, 9);
  });

  it("accounts for the van narrowing along its length", () => {
    expect(minHalfWidth(tapered, 0, 1500, 0, 0)).toBe(850);
    expect(minHalfWidth(tapered, 1500, 3000, 0, 0)).toBe(800);
  });

  it("matches a brute-force scan", () => {
    const boxes = [
      [200, 2500, 300, 1700],
      [0, 3000, 0, 1900],
      [1000, 1100, 1750, 1850],
    ] as const;
    for (const [x0, x1, z0, z1] of boxes) {
      let brute = Number.POSITIVE_INFINITY;
      for (let i = 0; i <= 60; i++) {
        for (let j = 0; j <= 60; j++) {
          const x = x0 + ((x1 - x0) * i) / 60;
          const z = z0 + ((z1 - z0) * j) / 60;
          brute = Math.min(brute, halfWidthAt(tapered, x, z));
        }
      }
      const exact = minHalfWidth(tapered, x0, x1, z0, z1);
      expect(exact).toBeLessThanOrEqual(brute + 1e-9);
      expect(exact).toBeGreaterThan(brute - 2);
    }
  });
});

describe("heights and outline", () => {
  it("reports interior height, interpolated between stations", () => {
    expect(interiorHeightAt(testShell, 100)).toBe(1900);
    expect(interiorHeightAt(tapered, 1500)).toBe(1850);
    expect(minInteriorHeight(tapered, 0, 3000)).toBe(1800);
  });

  it("finds the widest point", () => {
    expect(maxHalfWidth(testShell)).toBe(900);
  });

  it("walks the outline as a closed polygon", () => {
    expect(outlineAt(testShell, 0)).toEqual([
      { x: 0, y: 900 },
      { x: 3000, y: 900 },
      { x: 3000, y: -900 },
      { x: 0, y: -900 },
    ]);
  });
});
