import { describe, expect, it } from "vitest";
import { partBox } from "../parts/parts";
import { findIssues } from "../snap/issues";
import {
  lookupTestDefinition,
  sampleDesign,
  testDesign,
  testPart,
  testShell,
} from "../testing/fixtures";
import {
  clearances,
  placeNewPart,
  resizePart,
  rotatePart,
  setClearance,
  setFloorHeight,
  setWallDistance,
  touchesWall,
  wallDistances,
} from "./placement";

describe("wallDistances", () => {
  it("measures clear distance to each wall", () => {
    // Cabinet 1200 x 600 centred at (1000, -600): flush against the driver-side wall.
    const part = testPart("c", "cabinet", 1000, -600);
    expect(wallDistances(testShell, part)).toEqual({
      front: 400,
      rear: 1400,
      driver: 0,
      passenger: 1200,
    });
    expect(touchesWall(testShell, part)).toBe(true);
  });

  it("measures to the leaning wall for raised parts", () => {
    const shelf = testPart("s", "shelf", 1000, 0, 1400);
    // Top edge at 1750 mm, where the half-width is 733.333.
    expect(wallDistances(testShell, shelf).driver).toBeCloseTo(733.333 - 150, 3);
  });
});

describe("clearances", () => {
  it("measures to the wall when nothing is in the way", () => {
    const part = testPart("c", "crate", 1500, 0);
    expect(clearances(testDesign([part]), testShell, part)).toEqual({
      front: { distance: 1250, toId: null },
      rear: { distance: 1250, toId: null },
      driver: { distance: 650, toId: null },
      passenger: { distance: 650, toId: null },
    });
  });

  it("measures to the nearest neighbour in the same lane", () => {
    const part = testPart("c", "crate", 1500, 0);
    const ahead = testPart("ahead", "crate", 600, 100);
    const beside = testPart("beside", "cabinet", 1500, -600);
    const result = clearances(testDesign([part, ahead, beside]), testShell, part);
    expect(result.front).toEqual({ distance: 400, toId: "ahead" });
    expect(result.driver).toEqual({ distance: 50, toId: "beside" });
    expect(result.rear.toId).toBeNull();
  });

  it("reports zero against a touching neighbour and a wheel well", () => {
    const part = testPart("c", "crate", 1550, -650);
    expect(clearances(testDesign([part]), testShell, part).rear).toEqual({
      distance: 0,
      toId: "wheelwell:1",
    });
  });

  it("ignores things at a different height or out of the lane", () => {
    const part = testPart("c", "crate", 1500, 0);
    const overhead = testPart("shelf", "shelf", 700, 0, 1400);
    const offToTheSide = testPart("side", "crate", 600, 650);
    const result = clearances(testDesign([part, overhead, offToTheSide]), testShell, part);
    expect(result.front).toEqual({ distance: 1250, toId: null });
  });
});

describe("setClearance", () => {
  it("sets the gap to a neighbour on each side", () => {
    const part = testPart("c", "crate", 1500, 0);
    const ahead = testPart("ahead", "crate", 600, 100);
    const beside = testPart("beside", "cabinet", 1500, -600);
    const doc = testDesign([part, ahead, beside]);
    for (const side of ["front", "rear", "driver", "passenger"] as const) {
      const moved = setClearance(doc, testShell, part, side, 120);
      const after = { ...doc, parts: { ...doc.parts, c: moved } };
      expect(clearances(after, testShell, moved)[side].distance, side).toBe(120);
    }
  });
});

describe("setWallDistance", () => {
  it("round-trips with wallDistances on every wall", () => {
    const part = testPart("c", "cabinet", 1500, 0);
    for (const wall of ["front", "rear", "driver", "passenger"] as const) {
      const moved = setWallDistance(testShell, part, wall, 123.5);
      expect(wallDistances(testShell, moved)[wall]).toBe(123.5);
    }
  });

  it("sets the height off the floor", () => {
    expect(setFloorHeight(testPart("c", "crate", 500, 0), 250).position.z).toBe(250);
  });
});

describe("rotatePart", () => {
  it("keeps a part against the wall it was touching", () => {
    const part = testPart("c", "cabinet", 1000, -600);
    const rotated = rotatePart(testDesign([part]), testShell, part);
    expect(rotated.yaw).toBe(90);
    expect(wallDistances(testShell, rotated).driver).toBe(0);
    // Now 600 along the van and 1200 across.
    expect(partBox(rotated).max.y - partBox(rotated).min.y).toBe(1200);
  });

  it("turns a free-standing part about its centre", () => {
    const part = testPart("c", "crate", 1500, 0);
    const rotated = rotatePart(testDesign([part]), testShell, part);
    expect(rotated.position).toEqual(part.position);
  });

  it("comes back to where it started after four turns", () => {
    const start = testPart("c", "cabinet", 1500, 100);
    let part = start;
    for (let i = 0; i < 4; i++) part = rotatePart(testDesign([part]), testShell, part);
    expect(part).toEqual(start);
  });

  it("slides clear of a neighbour instead of overlapping it", () => {
    const cabinet = testPart("cabinet", "cabinet", 1000, -600);
    const crate = testPart("crate", "crate", 1000, 50);
    const doc = testDesign([cabinet, crate]);
    const rotated = rotatePart(doc, testShell, cabinet);
    const after = testDesign([rotated, crate]);
    expect(findIssues(after, testShell)).toEqual([]);
  });
});

describe("resizePart", () => {
  it("keeps the driver-side wall contact when depth changes", () => {
    const part = testPart("c", "cabinet", 1000, -600);
    const resized = resizePart(testShell, part, "depth", 450);
    expect(wallDistances(testShell, resized).driver).toBe(0);
    expect(wallDistances(testShell, resized).front).toBe(400);
  });

  it("keeps the passenger-side wall contact when depth changes", () => {
    const part = testPart("c", "cabinet", 1000, 600);
    const resized = resizePart(testShell, part, "depth", 450);
    expect(wallDistances(testShell, resized).passenger).toBe(0);
  });

  it("keeps the rear contact when width changes", () => {
    const part = setWallDistance(testShell, testPart("c", "cabinet", 1000, 0), "rear", 0);
    const resized = resizePart(testShell, part, "width", 800);
    expect(wallDistances(testShell, resized).rear).toBe(0);
  });

  it("grows a free-standing part away from its front, driver-side corner", () => {
    const part = testPart("c", "crate", 1500, 0);
    const before = partBox(part);
    const after = partBox(resizePart(testShell, part, "width", 700));
    expect(after.min.x).toBe(before.min.x);
    expect(after.max.x).toBe(before.min.x + 700);
    expect(after.min.y).toBe(before.min.y);
  });

  it("follows the leaning wall when a raised part gets taller", () => {
    const shelf = setWallDistance(testShell, testPart("s", "shelf", 1000, 0, 1400), "driver", 0);
    const taller = resizePart(testShell, shelf, "height", 450);
    expect(wallDistances(testShell, taller).driver).toBe(0);
    expect(findIssues(testDesign([taller]), testShell)).toEqual([]);
  });
});

describe("placeNewPart", () => {
  it("drops a new part somewhere free, at its default height", () => {
    let doc = sampleDesign();
    for (const [i, defId] of ["cabinet", "crate", "shelf", "tank"].entries()) {
      const def = lookupTestDefinition(defId);
      if (!def) throw new Error("missing definition");
      const placed = placeNewPart(doc, testShell, def, `new-${i}`);
      expect(placed.position.z).toBe(def.defaultElevation ?? 0);
      doc = { ...doc, parts: { ...doc.parts, [placed.id]: placed } };
      expect(findIssues(doc, testShell)).toEqual([]);
    }
  });
});

describe("findIssues", () => {
  it("is quiet for a valid layout", () => {
    expect(findIssues(sampleDesign(), testShell)).toEqual([]);
  });

  it("flags overlapping parts on both sides", () => {
    const doc = testDesign([testPart("a", "crate", 1000, 0), testPart("b", "crate", 1200, 100)]);
    expect(findIssues(doc, testShell)).toEqual([
      { partId: "a", kind: "collision", withIds: ["b"] },
      { partId: "b", kind: "collision", withIds: ["a"] },
    ]);
  });

  it("flags a part on a wheel well, through a wall, and through the roof", () => {
    const onWell = testPart("a", "crate", 2200, -650);
    const throughWall = testPart("b", "crate", 500, 800);
    const tooTall = resizePart(testShell, testPart("c", "crate", 500, 0), "height", 2000);
    const issues = findIssues(testDesign([onWell, throughWall, tooTall]), testShell);
    expect(issues).toEqual([
      { partId: "a", kind: "collision", withIds: ["wheelwell:1"] },
      { partId: "b", kind: "outOfBounds", withIds: [] },
      { partId: "c", kind: "tooTall", withIds: [] },
    ]);
  });
});
