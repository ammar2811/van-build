import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { lookupTestDefinition, testDesign, testPart, testShell } from "../testing/fixtures";
import { kgToGrams } from "../units/mass";
import {
  computeWeight,
  designLoads,
  designWeight,
  type PointLoad,
  requireChassis,
  type WeightInput,
} from "./weight";

const GOLDEN_DIR = join(import.meta.dirname, "../../fixtures/golden");

interface WeightFixture {
  description: string;
  wheelbaseMm: number;
  chassisKg: Record<"gvwr" | "gawrFront" | "gawrRear" | "curbFront" | "curbRear", number>;
  loads: { id: string; massKg: number; behindFrontAxleMm: number }[];
  expected: {
    frontKg: number;
    rearKg: number;
    grossKg: number;
    addedKg: number;
    payloadRemainingKg: number;
    cgBehindFrontAxleMm: number;
    status: { front: string; rear: string; gross: string };
  };
}

const round1 = (value: number) => Math.round(value * 10) / 10;
const kg = (grams: number) => round1(grams / 1000);

describe("golden weight fixtures (expected values calculated by hand)", () => {
  const files = readdirSync(GOLDEN_DIR).filter((name) => /^weight-.*\.json$/.test(name));

  it("finds the fixtures", () => {
    expect(files.length).toBeGreaterThanOrEqual(4);
  });

  for (const file of files) {
    it(file, () => {
      const fixture = JSON.parse(readFileSync(join(GOLDEN_DIR, file), "utf8")) as WeightFixture;
      // Put the front axle somewhere other than the origin to exercise the frame conversion.
      const frontAxleX = -1300;
      const report = computeWeight({
        frontAxleX,
        rearAxleX: frontAxleX + fixture.wheelbaseMm,
        chassis: {
          id: "fixture",
          name: "Fixture",
          gvwr: kgToGrams(fixture.chassisKg.gvwr),
          gawrFront: kgToGrams(fixture.chassisKg.gawrFront),
          gawrRear: kgToGrams(fixture.chassisKg.gawrRear),
          curbFront: kgToGrams(fixture.chassisKg.curbFront),
          curbRear: kgToGrams(fixture.chassisKg.curbRear),
        },
        loads: fixture.loads.map((load) => ({
          id: load.id,
          mass: kgToGrams(load.massKg),
          cg: { x: frontAxleX + load.behindFrontAxleMm, y: 0, z: 0 },
        })),
      });

      expect({
        frontKg: kg(report.front.load),
        rearKg: kg(report.rear.load),
        grossKg: kg(report.gross.load),
        addedKg: kg(report.added),
        payloadRemainingKg: kg(report.payloadRemaining),
        cgBehindFrontAxleMm: round1(report.cgBehindFrontAxle),
        status: {
          front: report.front.status,
          rear: report.rear.status,
          gross: report.gross.status,
        },
      }).toEqual(fixture.expected);
    });
  }
});

const chassis = requireChassis(testShell, "base");

function input(loads: PointLoad[]): WeightInput {
  return { frontAxleX: testShell.frontAxleX, rearAxleX: testShell.rearAxleX, chassis, loads };
}

const loadArb = fc.record({
  id: fc.constant("load"),
  mass: fc.integer({ min: 0, max: 500_000 }),
  cg: fc.record({
    x: fc.double({ min: -2500, max: 5000, noNaN: true }),
    y: fc.double({ min: -900, max: 900, noNaN: true }),
    z: fc.double({ min: 0, max: 1900, noNaN: true }),
  }),
});
const loadsArb = fc.array(loadArb, { maxLength: 12 });

describe("weight model properties", () => {
  it("conserves mass: front + rear = empty van + everything added", () => {
    fc.assert(
      fc.property(loadsArb, (loads) => {
        const report = computeWeight(input(loads));
        const total = chassis.curbFront + chassis.curbRear + loads.reduce((s, l) => s + l.mass, 0);
        expect(report.front.load + report.rear.load).toBeCloseTo(total, 4);
        expect(report.gross.load).toBeCloseTo(total, 4);
        expect(report.payloadRemaining).toBeCloseTo(chassis.gvwr - total, 4);
      }),
    );
  });

  it("moving a load rearward never lowers the rear axle load or raises the front", () => {
    fc.assert(
      fc.property(
        loadsArb,
        loadArb,
        fc.double({ min: 0, max: 3000, noNaN: true }),
        (rest, load, dx) => {
          const before = computeWeight(input([...rest, load]));
          const moved = { ...load, cg: { ...load.cg, x: load.cg.x + dx } };
          const after = computeWeight(input([...rest, moved]));
          expect(after.rear.load).toBeGreaterThanOrEqual(before.rear.load - 1e-6);
          expect(after.front.load).toBeLessThanOrEqual(before.front.load + 1e-6);
        },
      ),
    );
  });

  it("a load over an axle lands entirely on that axle", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 500_000 }), (mass) => {
        const overFront = computeWeight(
          input([{ id: "a", mass, cg: { x: testShell.frontAxleX, y: 0, z: 0 } }]),
        );
        expect(overFront.front.load).toBeCloseTo(chassis.curbFront + mass, 6);
        expect(overFront.rear.load).toBeCloseTo(chassis.curbRear, 6);

        const overRear = computeWeight(
          input([{ id: "a", mass, cg: { x: testShell.rearAxleX, y: 0, z: 0 } }]),
        );
        expect(overRear.rear.load).toBeCloseTo(chassis.curbRear + mass, 6);
        expect(overRear.front.load).toBeCloseTo(chassis.curbFront, 6);
      }),
    );
  });

  it("a load behind the rear axle unloads the front axle", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 500_000 }),
        fc.double({ min: 1, max: 2000, noNaN: true }),
        (mass, overhang) => {
          const report = computeWeight(
            input([{ id: "a", mass, cg: { x: testShell.rearAxleX + overhang, y: 0, z: 0 } }]),
          );
          expect(report.front.load).toBeLessThan(chassis.curbFront);
          expect(report.rear.load).toBeGreaterThan(chassis.curbRear + mass);
        },
      ),
    );
  });

  it("does not depend on the order of the loads", () => {
    fc.assert(
      fc.property(loadsArb, (loads) => {
        const forward = computeWeight(input(loads));
        const backward = computeWeight(input([...loads].reverse()));
        expect(backward.front.load).toBeCloseTo(forward.front.load, 4);
        expect(backward.rear.load).toBeCloseTo(forward.rear.load, 4);
        expect(backward.cgLateral).toBeCloseTo(forward.cgLateral, 6);
      }),
    );
  });

  it("an empty van reports its curb weights", () => {
    const report = computeWeight(input([]));
    expect(report.front.load).toBe(chassis.curbFront);
    expect(report.rear.load).toBe(chassis.curbRear);
    expect(report.added).toBe(0);
    expect(report.cgLateral).toBe(0);
  });

  it("rejects axles in the wrong order", () => {
    expect(() => computeWeight({ ...input([]), rearAxleX: testShell.frontAxleX })).toThrow();
  });
});

describe("design weight", () => {
  it("treats each part as a point mass at the centre of its box", () => {
    const doc = testDesign([
      testPart("b", "crate", 2365, 200),
      testPart("a", "cabinet", 1000, -600),
    ]);
    expect(designLoads(doc, lookupTestDefinition)).toEqual([
      { id: "a", mass: 40_000, cg: { x: 1000, y: -600, z: 450 } },
      { id: "b", mass: 10_000, cg: { x: 2365, y: 200, z: 250 } },
    ]);
  });

  it("includes contents and honours a mass override", () => {
    const tank = testPart("tank", "tank", 1500, 0);
    const heavy = { ...testPart("crate", "crate", 500, 0), overrides: { mass: 75_000 } };
    const loads = designLoads(testDesign([tank, heavy]), lookupTestDefinition);
    expect(loads.map((load) => load.mass)).toEqual([75_000, 96_000]);
  });

  it("puts a part over the rear axle entirely on the rear axle", () => {
    const doc = testDesign([testPart("crate", "crate", testShell.rearAxleX, 0)]);
    const report = designWeight(doc, testShell, lookupTestDefinition);
    expect(report.rear.load).toBeCloseTo(chassis.curbRear + 10_000, 6);
    expect(report.front.load).toBeCloseTo(chassis.curbFront, 6);
  });

  it("fails loudly on an unknown chassis", () => {
    const doc = { ...testDesign([]), chassisId: "nope" };
    expect(() => designWeight(doc, testShell, lookupTestDefinition)).toThrow(/no chassis/);
  });
});
