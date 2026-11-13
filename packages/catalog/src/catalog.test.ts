import {
  DesignDocSchema,
  designWeight,
  ESTIMATED,
  findIssues,
  interiorHeightAt,
  PartDefinitionSchema,
  requiredProvenanceKeys,
  ridersOf,
  VanShellSchema,
  wallDistances,
} from "@vanbuild/core";
import { describe, expect, it } from "vitest";
import { getPartDefinition, getShell, partDefinitions, shells, starterDesign } from "./index";

describe("van shells", () => {
  it("have unique ids", () => {
    expect(new Set(shells.map((shell) => shell.id)).size).toBe(shells.length);
  });

  for (const shell of shells) {
    describe(shell.name, () => {
      it("matches the schema", () => {
        expect(VanShellSchema.safeParse(shell).error).toBeUndefined();
      });

      it("has a source or an estimate note for every number", () => {
        const sourceIds = new Set(shell.sources.map((source) => source.id));
        for (const key of requiredProvenanceKeys(shell)) {
          const entry = shell.provenance[key];
          expect(entry, `provenance for ${key}`).toBeDefined();
          if (!entry) continue;
          if (entry.source === ESTIMATED) {
            expect(entry.note, `estimate note for ${key}`).toBeTruthy();
          } else {
            expect(sourceIds.has(entry.source), `source "${entry.source}" for ${key}`).toBe(true);
          }
        }
      });

      it("is geometrically sane", () => {
        expect(shell.rearAxleX - shell.frontAxleX).toBeCloseTo(shell.wheelbase, 6);
        expect(shell.frontAxleX).toBeLessThan(0);
        expect(shell.rearAxleX).toBeGreaterThan(0);
        expect(shell.rearAxleX).toBeLessThan(shell.cargoLength);
        expect(interiorHeightAt(shell, 0)).toBeGreaterThan(1200);
        for (const station of shell.stations) {
          const zs = station.profile.map((point) => point.z);
          expect(zs).toEqual([...zs].sort((a, b) => a - b));
          expect(zs[0]).toBe(0);
        }
        for (const well of shell.wheelWells) {
          expect(well.min.x).toBeLessThan(well.max.x);
          expect(well.min.y).toBeLessThan(well.max.y);
          expect(well.min.x).toBeGreaterThanOrEqual(0);
          expect(well.max.x).toBeLessThanOrEqual(shell.cargoLength);
        }
      });

      it("has consistent weight ratings", () => {
        for (const chassis of shell.chassis) {
          const curb = chassis.curbFront + chassis.curbRear;
          expect(curb).toBeLessThan(chassis.gvwr);
          expect(chassis.curbFront).toBeLessThan(chassis.gawrFront);
          expect(chassis.curbRear).toBeLessThan(chassis.gawrRear);
        }
      });
    });
  }
});

describe("Sprinter 144 High Roof", () => {
  const shell = getShell("sprinter-144-high-roof");

  it("carries the published numbers", () => {
    expect(shell.wheelbase).toBe(3657.6);
    expect(shell.cargoLength).toBe(3378.2);
    expect(shell.stations[0]?.profile[0]?.halfWidth).toBe(889);
    expect(interiorHeightAt(shell, 0)).toBe(2006.6);
    // 53 in between the wheel wells.
    expect(
      shell.wheelWells.map((well) => Math.min(Math.abs(well.min.y), Math.abs(well.max.y))),
    ).toEqual([673.1, 673.1]);
    expect(shell.chassis[0]).toMatchObject({
      gvwr: 4_105_011,
      gawrFront: 1_860_182,
      gawrRear: 2_430_802,
      curbFront: 918_525,
      curbRear: 1_321_768,
    });
  });
});

describe("part definitions", () => {
  it("have unique ids", () => {
    expect(new Set(partDefinitions.map((def) => def.id)).size).toBe(partDefinitions.length);
  });

  for (const def of partDefinitions) {
    it(`${def.id} is well formed`, () => {
      expect(PartDefinitionSchema.safeParse(def).error).toBeUndefined();
      for (const key of ["width", "depth", "height"]) {
        const param = def.params.find((p) => p.key === key);
        expect(param?.kind, `${key} param`).toBe("length");
        if (param?.kind !== "length") continue;
        expect(param.default).toBeGreaterThanOrEqual(param.min);
        expect(param.default).toBeLessThanOrEqual(param.max);
      }
      expect(def.mass.fixed).toBeGreaterThan(0);
      expect(def.price.fixed).toBeGreaterThan(0);
    });
  }
});

describe("catalog size", () => {
  it("offers at least ten parts", () => {
    expect(partDefinitions.length).toBeGreaterThanOrEqual(10);
  });
});

describe("starter design", () => {
  const doc = starterDesign();
  const shell = getShell(doc.shellId);

  it("matches the schema and only uses catalog parts", () => {
    expect(DesignDocSchema.safeParse(doc).error).toBeUndefined();
    for (const part of Object.values(doc.parts)) {
      expect(getPartDefinition(part.defId), part.defId).toBeDefined();
    }
  });

  it("has nothing overlapping or outside the van", () => {
    expect(findIssues(doc, shell)).toEqual([]);
  });

  it("sits flush where it is meant to", () => {
    const part = (id: string) => {
      const found = doc.parts[id];
      if (!found) throw new Error(`starter design has no "${id}"`);
      return found;
    };
    expect(wallDistances(shell, part("bed")).rear).toBe(0);
    expect(ridersOf(doc, getPartDefinition, "bed")).toEqual(["mattress"]);
    expect(wallDistances(shell, part("galley")).driver).toBe(0);
    expect(wallDistances(shell, part("fridge")).driver).toBe(0);
  });

  it("stays within the axle and gross ratings", () => {
    const report = designWeight(doc, shell, getPartDefinition);
    expect(report.added).toBe(30_000 + 15_000 + 38_000 + 21_000 + 106_000);
    expect(report.front.status).toBe("ok");
    expect(report.rear.status).toBe("ok");
    expect(report.gross.status).toBe("ok");
  });
});
