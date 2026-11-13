import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Obstacle } from "../parts/parts";
import { boxesOverlap } from "../schema/geometry";
import { emptyShell, testShell } from "../testing/fixtures";
import { type DragInput, solveDrag } from "./solveDrag";

function obstacle(
  id: string,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  z0 = 0,
  z1 = 900,
): Obstacle {
  return { id, box: { min: { x: x0, y: y0, z: z0 }, max: { x: x1, y: y1, z: z1 } } };
}

/** A 600 x 400 x 800 part dragged in the empty test van at 2 mm per pixel (16 mm snap reach). */
function drag(overrides: Partial<DragInput>): DragInput {
  return {
    shell: emptyShell,
    obstacles: [],
    size: { x: 600, y: 400, z: 800 },
    z: 0,
    proposed: { x: 1500, y: 0 },
    mmPerPx: 2,
    ...overrides,
  };
}

describe("snapping", () => {
  it("snaps flush to a side wall and reports the wall guide", () => {
    const result = solveDrag(drag({ proposed: { x: 1500, y: -690 } }));
    expect(result.position.y).toBe(-700);
    expect(result.guides).toContainEqual({ axis: "y", kind: "wall", at: -900 });
  });

  it("snaps flush to the front and rear of the cargo area", () => {
    expect(solveDrag(drag({ proposed: { x: 310, y: 0 } })).position.x).toBe(300);
    expect(solveDrag(drag({ proposed: { x: 2695, y: 0 } })).position.x).toBe(2700);
  });

  it("leaves the part on the 10 mm grid when nothing is in reach", () => {
    const result = solveDrag(drag({ proposed: { x: 1503.7, y: 297.2 } }));
    // The leading edges (x - 300, y - 200) land on the grid.
    expect(result.position).toEqual({ x: 1500, y: 300, z: 0 });
    expect(result.guides).toEqual([]);
  });

  it("snaps flush against another part in the same lane", () => {
    const cabinet = obstacle("cabinet", 0, -900, 1000, -300);
    const result = solveDrag(drag({ obstacles: [cabinet], proposed: { x: 1310, y: -690 } }));
    expect(result.position.x).toBe(1300);
    expect(result.guides).toContainEqual({
      axis: "x",
      kind: "face",
      at: 1000,
      targetId: "cabinet",
    });
  });

  it("lines up with the edge of a part across the aisle", () => {
    const cabinet = obstacle("cabinet", 1000, 300, 2000, 900);
    const result = solveDrag(drag({ obstacles: [cabinet], proposed: { x: 1308, y: -700 } }));
    expect(result.position.x).toBe(1300);
    expect(result.guides).toContainEqual({
      axis: "x",
      kind: "edge",
      at: 1000,
      targetId: "cabinet",
    });
  });

  it("prefers contact over alignment when both are in reach", () => {
    // Left face of the part is 6 mm from lining up with A's edge and 12 mm from touching B.
    const a = obstacle("a", 1006, 300, 2000, 900);
    const b = obstacle("b", 500, -200, 988, 200);
    const result = solveDrag(drag({ obstacles: [a, b], proposed: { x: 1300, y: 0 } }));
    expect(result.position.x).toBe(1288);
  });

  it("snaps to the centreline", () => {
    const result = solveDrag(drag({ proposed: { x: 1500, y: 9 } }));
    expect(result.position.y).toBe(0);
    expect(result.guides).toContainEqual({ axis: "y", kind: "centre", at: 0 });
  });

  it("reaches further when zoomed out and less when zoomed in", () => {
    const far = { x: 1500, y: -660 };
    expect(solveDrag(drag({ proposed: far, mmPerPx: 6 })).position.y).toBe(-700);
    expect(solveDrag(drag({ proposed: far, mmPerPx: 1 })).position.y).toBe(-660);
  });

  it("holds a snap until the pointer is well clear (hysteresis)", () => {
    const first = solveDrag(drag({ proposed: { x: 1500, y: -690 } }));
    expect(first.sticky.y).toBe(-700);
    // 20 mm away is past the 16 mm reach but inside 1.5x, so the snap holds.
    const held = solveDrag(drag({ proposed: { x: 1500, y: -680 }, sticky: first.sticky }));
    expect(held.position.y).toBe(-700);
    const released = solveDrag(drag({ proposed: { x: 1500, y: -670 }, sticky: held.sticky }));
    expect(released.position.y).toBe(-670);
  });

  it("can be switched off", () => {
    const result = solveDrag(drag({ proposed: { x: 1503.7, y: -690 }, noSnap: true }));
    expect(result.position).toEqual({ x: 1503.7, y: -690, z: 0 });
  });
});

describe("walls that lean in", () => {
  it("stops a tall part earlier than a low one", () => {
    const low = solveDrag(drag({ proposed: { x: 1500, y: -2000 } }));
    expect(low.position.y).toBe(-700);

    // 350 high with its underside at 1400: limited by the wall at 1750 mm.
    const high = solveDrag(
      drag({ size: { x: 600, y: 400, z: 350 }, z: 1400, proposed: { x: 1500, y: -2000 } }),
    );
    const wallAtTop = 900 - (750 / 900) * 200;
    expect(high.position.y).toBeCloseTo(-(wallAtTop - 200), 9);
    expect(high.outOfBounds).toBe(false);
  });
});

describe("collisions", () => {
  const cabinet = obstacle("cabinet", 1000, -900, 2000, -300);

  it("never leaves a part inside another part", () => {
    const result = solveDrag(drag({ obstacles: [cabinet], proposed: { x: 1500, y: -520 } }));
    expect(result.collisions).toEqual([]);
    // Slid out sideways to sit flush against the cabinet's face.
    expect(result.position).toEqual({ x: 1500, y: -100, z: 0 });
  });

  it("keeps the part inside the van", () => {
    const result = solveDrag(drag({ proposed: { x: -500, y: 5000 } }));
    expect(result.position).toEqual({ x: 300, y: 700, z: 0 });
    expect(result.outOfBounds).toBe(false);
  });

  it("jumps across an obstacle once the pointer is past it", () => {
    const wall = obstacle("divider", 1400, -900, 1600, 900);
    const before = solveDrag(drag({ obstacles: [wall], proposed: { x: 1250, y: 0 } }));
    expect(before.position.x).toBe(1100);
    const after = solveDrag(drag({ obstacles: [wall], proposed: { x: 1750, y: 0 } }));
    expect(after.position.x).toBe(1900);
  });

  it("lets a raised part pass over low obstacles", () => {
    const result = solveDrag(
      drag({
        shell: testShell,
        obstacles: [obstacle("wheelwell", 1800, -900, 2600, -680, 0, 300)],
        size: { x: 600, y: 400, z: 300 },
        z: 600,
        proposed: { x: 2200, y: -695 },
      }),
    );
    expect(result.position.y).toBe(-700);
    expect(result.collisions).toEqual([]);
  });

  it("blocks a floor part at the wheel well", () => {
    const result = solveDrag(
      drag({
        obstacles: [obstacle("wheelwell", 1800, -900, 2600, -680, 0, 300)],
        proposed: { x: 2200, y: -690 },
      }),
    );
    expect(result.position.y).toBe(-480);
    expect(result.guides).toContainEqual({
      axis: "y",
      kind: "face",
      at: -680,
      targetId: "wheelwell",
    });
  });

  it("falls back to the last good position when there is no room near the pointer", () => {
    // The part is exactly as wide as the van, so only the lane beside the divider is free.
    const divider = obstacle("divider", 1000, -900, 3000, 900);
    const result = solveDrag(
      drag({
        obstacles: [divider],
        size: { x: 1000, y: 1800, z: 800 },
        proposed: { x: 2000, y: 0 },
        fallback: { x: 500, y: 0 },
      }),
    );
    expect(result.position).toEqual({ x: 500, y: 0, z: 0 });
    expect(result.collisions).toEqual([]);
  });

  it("reports what it overlaps when collisions are switched off", () => {
    const result = solveDrag(
      drag({ obstacles: [cabinet], proposed: { x: 1500, y: -520 }, noSnap: true, noCollide: true }),
    );
    expect(result.position).toEqual({ x: 1500, y: -520, z: 0 });
    expect(result.collisions).toEqual(["cabinet"]);
  });
});

const sizeArb = fc.record({
  x: fc.integer({ min: 100, max: 600 }),
  y: fc.integer({ min: 100, max: 600 }),
  z: fc.integer({ min: 100, max: 800 }),
});
const pointArb = fc.record({
  x: fc.double({ min: -500, max: 3500, noNaN: true }),
  y: fc.double({ min: -1500, max: 1500, noNaN: true }),
});
/** A part size plus a pointer position that keeps the part inside the van. */
const insideArb = fc
  .record({
    size: sizeArb,
    u: fc.double({ min: 0, max: 1, noNaN: true }),
    v: fc.double({ min: 0, max: 1, noNaN: true }),
  })
  .map(({ size, u, v }) => ({
    size,
    proposed: {
      x: size.x / 2 + u * (3000 - size.x),
      y: (v - 0.5) * (1800 - size.y),
    },
  }));
const obstacleArb = fc
  .record({
    x: fc.integer({ min: 0, max: 2400 }),
    y: fc.integer({ min: -900, max: 300 }),
    w: fc.integer({ min: 100, max: 600 }),
    d: fc.integer({ min: 100, max: 600 }),
  })
  .map(({ x, y, w, d }) => obstacle("o", x, y, x + w, y + d));
const fewObstaclesArb = fc.array(obstacleArb, { maxLength: 3 });

function movedBox(input: DragInput, position: { x: number; y: number }) {
  return {
    min: { x: position.x - input.size.x / 2, y: position.y - input.size.y / 2, z: input.z },
    max: {
      x: position.x + input.size.x / 2,
      y: position.y + input.size.y / 2,
      z: input.z + input.size.z,
    },
  };
}

describe("solveDrag properties", () => {
  it("always finds a free spot around a single obstacle", () => {
    fc.assert(
      fc.property(sizeArb, pointArb, obstacleArb, fc.boolean(), (size, proposed, o, noSnap) => {
        const input = drag({ size, proposed, obstacles: [o], noSnap });
        const result = solveDrag(input);
        expect(result.collisions).toEqual([]);
        expect(result.outOfBounds).toBe(false);
        expect(boxesOverlap(movedBox(input, result.position), o.box)).toBe(false);
      }),
    );
  });

  it("never turns a free position into a collision", () => {
    fc.assert(
      fc.property(insideArb, fewObstaclesArb, ({ size, proposed }, list) => {
        const obstacles = list.map((o, i) => ({ ...o, id: `o${i}` }));
        const input = drag({ size, proposed, obstacles });
        const raw = solveDrag({ ...input, noSnap: true, noCollide: true });
        fc.pre(raw.collisions.length === 0 && !raw.outOfBounds);
        const result = solveDrag(input);
        expect(result.collisions).toEqual([]);
        expect(result.outOfBounds).toBe(false);
      }),
    );
  });

  it("leaves a free position alone when snapping is off", () => {
    fc.assert(
      fc.property(insideArb, fewObstaclesArb, ({ size, proposed }, list) => {
        const obstacles = list.map((o, i) => ({ ...o, id: `o${i}` }));
        const input = drag({ size, proposed, obstacles, noSnap: true });
        const raw = solveDrag({ ...input, noCollide: true });
        fc.pre(raw.collisions.length === 0 && !raw.outOfBounds);
        expect(solveDrag(input).position).toEqual({ x: proposed.x, y: proposed.y, z: 0 });
      }),
    );
  });

  it("is deterministic and does not mutate its input", () => {
    fc.assert(
      fc.property(sizeArb, pointArb, fc.array(obstacleArb, { maxLength: 8 }), (size, p, list) => {
        const input = drag({ size, proposed: p, obstacles: list });
        const snapshot = structuredClone(input);
        expect(solveDrag(input)).toEqual(solveDrag(input));
        expect(input).toEqual(snapshot);
      }),
    );
  });
});

describe("performance budget", () => {
  it("solves a drag frame against 200 parts in under 1 ms", () => {
    const obstacles: Obstacle[] = [];
    for (let i = 0; i < 200; i++) {
      const x = (i % 20) * 150;
      const y = -900 + Math.floor(i / 20) * 180;
      obstacles.push(obstacle(`o${i}`, x, y, x + 120, y + 150));
    }
    // Worst case on purpose: the part fits nowhere, so every frame searches for a free spot.
    const input = drag({ obstacles, size: { x: 300, y: 300, z: 800 } });
    const frame = (i: number) =>
      solveDrag({ ...input, proposed: { x: (i * 37) % 3000, y: ((i * 53) % 1800) - 900 } });
    for (let i = 0; i < 200; i++) frame(i);
    // Best of several batches, so a garbage-collection pause or a busy CI box cannot fail it.
    let perFrame = Number.POSITIVE_INFINITY;
    for (let batch = 0; batch < 5; batch++) {
      const start = performance.now();
      for (let i = 0; i < 100; i++) frame(batch * 100 + i);
      perFrame = Math.min(perFrame, (performance.now() - start) / 100);
    }
    expect(perFrame).toBeLessThan(1);
  });
});
