import { describe, expect, it } from "vitest";
import { obstaclesFor, partExtents, sceneObstacles } from "../parts/parts";
import { findIssues } from "../snap/issues";
import {
  emptyShell,
  lookupTestDefinition,
  testDesign,
  testPart,
  testShell,
} from "../testing/fixtures";
import {
  restingLevels,
  ridersOf,
  settleOnSupports,
  solveStackedDrag,
  supportSurfaces,
  translatePart,
} from "./stacking";

const lookup = lookupTestDefinition;

describe("supportSurfaces", () => {
  it("includes wheel wells and parts that carry, but not ordinary parts", () => {
    const doc = testDesign([
      testPart("cabinet", "cabinet", 1000, -600),
      testPart("crate", "crate", 250, 650),
    ]);
    expect(supportSurfaces(doc, testShell, lookup).map((s) => s.id)).toEqual([
      "wheelwell:0",
      "wheelwell:1",
      "cabinet",
    ]);
    expect(supportSurfaces(doc, testShell, lookup, ["cabinet"]).map((s) => s.id)).toEqual([
      "wheelwell:0",
      "wheelwell:1",
    ]);
  });
});

describe("restingLevels", () => {
  const doc = testDesign([
    testPart("cabinet", "cabinet", 1000, -600),
    testPart("box", "box", 1000, -600, 900),
  ]);
  const supports = supportSurfaces(doc, testShell, lookup);

  it("lists the surfaces under a point from the top down, ending at the floor", () => {
    expect(restingLevels(supports, { x: 1000, y: -600 }, 0)).toEqual([1100, 900, 0]);
    expect(restingLevels(supports, { x: 1500, y: -600 }, 0)).toEqual([900, 0]);
    expect(restingLevels(supports, { x: 1500, y: 0 }, 0)).toEqual([0]);
  });

  it("finds the wheel well", () => {
    expect(restingLevels(supports, { x: 2200, y: -800 }, 0)).toEqual([300, 0]);
  });
});

/** A stacking box (400 x 300 x 200) dragged over a scene. */
function dragBox(doc: ReturnType<typeof testDesign>, x: number, y: number, shell = emptyShell) {
  const box = testPart("moving", "box", 0, 0);
  return solveStackedDrag({
    shell,
    obstacles: sceneObstacles(doc, shell, "moving"),
    supports: supportSurfaces(doc, shell, lookup, ["moving"]),
    baseZ: 0,
    size: partExtents(box),
    proposed: { x, y },
    mmPerPx: 2,
  });
}

describe("solveStackedDrag", () => {
  const cabinet = testPart("cabinet", "cabinet", 1000, -600);

  it("drops the part onto a carrier when the pointer is over it", () => {
    const result = dragBox(testDesign([cabinet]), 1000, -600);
    expect(result.position.z).toBe(900);
    expect(result.collisions).toEqual([]);
  });

  it("stays on the floor beside the carrier when the pointer is not over it", () => {
    const result = dragBox(testDesign([cabinet]), 1000, -200);
    expect(result.position.z).toBe(0);
    // Flush against the cabinet's face rather than inside it.
    expect(result.position.y).toBe(-150);
  });

  it("stacks on top of another stacked part", () => {
    const first = testPart("first", "box", 1000, -600, 900);
    const result = dragBox(testDesign([cabinet, first]), 1000, -600);
    expect(result.position.z).toBe(1100);
  });

  it("snaps to the carrier's edges while on top of it", () => {
    // 6 mm short of lining up with the cabinet's front edge (x = 400).
    const result = dragBox(testDesign([cabinet]), 606, -600);
    expect(result.position).toEqual({ x: 600, y: -600, z: 900 });
  });

  it("does not stack where there is no headroom", () => {
    // A tall cabinet whose top is 150 mm under the 1900 mm ceiling: a 200 mm box cannot go there.
    const tall = {
      ...testPart("tall", "cabinet", 1000, 0),
      params: { width: 1200, depth: 600, height: 1750 },
    };
    const result = dragBox(testDesign([tall]), 1000, 0);
    expect(result.position.z).toBe(0);
    expect(result.collisions).toEqual([]);
  });

  it("falls to a lower level when the top level is blocked by something else", () => {
    // A shelf hangs 100 mm above the cabinet top, so a 200 mm box cannot sit under it.
    const shelf = testPart("shelf", "shelf", 1000, -650, 1000);
    const result = dragBox(testDesign([cabinet, shelf]), 1000, -650);
    expect(result.collisions).toEqual([]);
    const issues = findIssues(
      testDesign([
        cabinet,
        shelf,
        { ...testPart("moving", "box", 0, 0), position: result.position },
      ]),
      emptyShell,
    );
    expect(issues).toEqual([]);
  });

  it("rests on a wheel well", () => {
    const result = dragBox(testDesign([]), 2200, -790, testShell);
    expect(result.position.z).toBe(300);
  });
});

describe("ridersOf", () => {
  const deck = testPart("deck", "deck", 2000, 0, 600);
  const onDeck = testPart("on-deck", "box", 2000, 200, 650);
  const onBox = testPart("on-box", "box", 2000, 200, 850);
  const beside = testPart("beside", "box", 500, 0);
  const hovering = testPart("hovering", "box", 2000, -400, 900);
  const doc = testDesign([deck, onDeck, onBox, beside, hovering]);

  it("finds what rests on a carrier, and what rests on that", () => {
    expect(ridersOf(doc, lookup, "deck")).toEqual(["on-deck", "on-box"]);
    expect(ridersOf(doc, lookup, "on-deck")).toEqual(["on-box"]);
  });

  it("ignores parts beside it, parts at another height and parts that do not carry", () => {
    expect(ridersOf(doc, lookup, "beside")).toEqual([]);
    expect(ridersOf(testDesign([testPart("crate", "crate", 500, 0)]), lookup, "crate")).toEqual([]);
  });
});

describe("parts inside furniture", () => {
  // A 1200 x 600 x 900 cabinet with an 800 x 400 x 300 tank fully inside it.
  const cabinet = testPart("cabinet", "cabinet", 1000, -600);
  const inside = testPart("tank", "tank", 1000, -600);
  const halfOut = testPart("tank", "tank", 1500, -600);
  const crateInside = testPart("crate", "crate", 1000, -600);

  it("accepts a component fully inside hollow furniture", () => {
    expect(findIssues(testDesign([cabinet, inside]), emptyShell, lookup)).toEqual([]);
  });

  it("flags a component that is half in, half out", () => {
    expect(findIssues(testDesign([cabinet, halfOut]), emptyShell, lookup)).toEqual([
      { partId: "cabinet", kind: "collision", withIds: ["tank"] },
      { partId: "tank", kind: "collision", withIds: ["cabinet"] },
    ]);
  });

  it("still flags ordinary parts inside furniture", () => {
    expect(findIssues(testDesign([cabinet, crateInside]), emptyShell, lookup)).toHaveLength(2);
  });

  it("treats everything as solid when no definitions are given", () => {
    expect(findIssues(testDesign([cabinet, inside]), emptyShell)).toHaveLength(2);
  });

  it("leaves compatible furniture out of a component's obstacles, and the reverse", () => {
    const doc = testDesign([cabinet, inside, testPart("crate", "crate", 2000, 0)]);
    const ids = (part: typeof cabinet) =>
      obstaclesFor(doc, emptyShell, lookup, part).map((o) => o.id);
    expect(ids(inside)).toEqual(["crate"]);
    expect(ids(cabinet)).toEqual(["crate"]);
    expect(ids(testPart("crate", "crate", 2000, 0))).toEqual(["cabinet", "tank"]);
  });

  it("takes what is inside along as a rider", () => {
    const onTop = testPart("box", "box", 1000, -600, 900);
    const doc = testDesign([cabinet, inside, onTop, testPart("far", "tank", 2500, 400)]);
    expect(ridersOf(doc, lookup, "cabinet")).toEqual(["box", "tank"]);
  });

  it("does not take a half-inside component along", () => {
    expect(ridersOf(testDesign([cabinet, halfOut]), lookup, "cabinet")).toEqual([]);
  });
});

describe("translatePart and settleOnSupports", () => {
  it("moves a part by a delta", () => {
    const moved = translatePart(testPart("b", "box", 100, 200, 300), { x: 10, y: -20, z: 5 });
    expect(moved.position).toEqual({ x: 110, y: 180, z: 305 });
  });

  it("drops a rider to the floor when its carrier is gone", () => {
    const rider = testPart("rider", "box", 1000, -600, 900);
    const settled = settleOnSupports(testDesign([rider]), testShell, lookup, rider);
    expect(settled.position.z).toBe(0);
  });

  it("follows a carrier whose height changed", () => {
    const cabinet = {
      ...testPart("cabinet", "cabinet", 1000, -600),
      params: { width: 1200, depth: 600, height: 700 },
    };
    const rider = testPart("rider", "box", 1000, -600, 900);
    const settled = settleOnSupports(testDesign([cabinet, rider]), testShell, lookup, rider);
    expect(settled.position.z).toBe(700);
  });

  it("leaves parts that do not stack alone", () => {
    const crate = testPart("crate", "crate", 1000, 0, 250);
    expect(settleOnSupports(testDesign([crate]), testShell, lookup, crate)).toBe(crate);
  });
});
