import {
  type DefinitionLookup,
  fillLevelOf,
  partBox,
  partMass,
  requireDefinition,
} from "../parts/parts";
import type { DesignDoc } from "../schema/design";
import { boxCentre, type Vec3 } from "../schema/geometry";
import type { Chassis, VanShell } from "../schema/shell";

/**
 * Static weight model. The van is a rigid beam on two supports (the axles), standing on
 * level ground. See docs/physics.md for the derivation and the worked example that the
 * golden fixtures are calculated from by hand.
 */

export interface PointLoad {
  id: string;
  /** Grams. */
  mass: number;
  /** Centre of gravity in the van frame, mm. */
  cg: Vec3;
}

export interface WeightInput {
  /** Axle centrelines in the van frame, mm. */
  frontAxleX: number;
  rearAxleX: number;
  chassis: Chassis;
  loads: readonly PointLoad[];
}

export type LimitStatus = "ok" | "warn" | "over";

/** Warn once any limit is 90% used. */
export const WARN_AT = 0.9;

export interface LimitCheck {
  /** Grams. */
  load: number;
  limit: number;
  /** load / limit. */
  used: number;
  status: LimitStatus;
}

export interface WeightReport {
  front: LimitCheck;
  rear: LimitCheck;
  gross: LimitCheck;
  /** Everything added to the empty van, grams. */
  added: number;
  /** GVWR minus gross weight, grams. Negative when overloaded. */
  payloadRemaining: number;
  /** Centre of gravity of the loaded van, mm behind the front axle. */
  cgBehindFrontAxle: number;
  /** Sideways centre of gravity of the loaded van, mm from the centreline (+ = passenger side). */
  cgLateral: number;
}

function check(load: number, limit: number): LimitCheck {
  const used = load / limit;
  const status: LimitStatus = used > 1 ? "over" : used >= WARN_AT ? "warn" : "ok";
  return { load, limit, used, status };
}

export function computeWeight(input: WeightInput): WeightReport {
  const wheelbase = input.rearAxleX - input.frontAxleX;
  if (!(wheelbase > 0)) throw new Error("Rear axle must be behind the front axle");

  let added = 0;
  let momentAboutFrontAxle = 0;
  let lateralMoment = 0;
  for (const load of input.loads) {
    added += load.mass;
    momentAboutFrontAxle += load.mass * (load.cg.x - input.frontAxleX);
    lateralMoment += load.mass * load.cg.y;
  }

  // Taking moments about the front axle gives the share carried by the rear axle.
  const addedRear = momentAboutFrontAxle / wheelbase;
  const rear = input.chassis.curbRear + addedRear;
  const front = input.chassis.curbFront + added - addedRear;
  const gross = front + rear;

  return {
    front: check(front, input.chassis.gawrFront),
    rear: check(rear, input.chassis.gawrRear),
    gross: check(gross, input.chassis.gvwr),
    added,
    payloadRemaining: input.chassis.gvwr - gross,
    cgBehindFrontAxle: (rear * wheelbase) / gross,
    // The empty van is assumed to be balanced left to right.
    cgLateral: lateralMoment / gross,
  };
}

/** The vehicle's ratings and empty weights, with the user's own numbers on top. */
export function effectiveChassis(shell: VanShell, doc: DesignDoc): Chassis {
  const chassis = requireChassis(shell, doc.chassisId);
  return { ...chassis, ...doc.vehicle };
}

export const OCCUPANT_PREFIX = "occupant:";

/**
 * Everything the weight estimate adds to the empty van, in a stable order: each part as a
 * point mass at the centre of its box (tanks at their fill level), then the people in the cab.
 */
export function designLoads(
  doc: DesignDoc,
  shell: VanShell,
  definitions: DefinitionLookup,
): PointLoad[] {
  const loads = Object.keys(doc.parts)
    .sort()
    .flatMap((id) => {
      const part = doc.parts[id];
      if (!part) return [];
      const def = requireDefinition(definitions, part.defId);
      const mass = partMass(def, part, fillLevelOf(doc, def, id));
      return [{ id, mass, cg: boxCentre(partBox(part)) }];
    });
  const seated = Math.min(doc.loadCase.occupants, shell.cabSeats.length);
  for (let seat = 0; seat < seated; seat++) {
    const cg = shell.cabSeats[seat];
    if (cg) loads.push({ id: `${OCCUPANT_PREFIX}${seat}`, mass: doc.loadCase.occupantMass, cg });
  }
  return loads;
}

export function requireChassis(shell: VanShell, chassisId: string): Chassis {
  const chassis = shell.chassis.find((c) => c.id === chassisId);
  if (!chassis) throw new Error(`Shell "${shell.id}" has no chassis "${chassisId}"`);
  return chassis;
}

export function designWeight(
  doc: DesignDoc,
  shell: VanShell,
  definitions: DefinitionLookup,
): WeightReport {
  return computeWeight({
    frontAxleX: shell.frontAxleX,
    rearAxleX: shell.rearAxleX,
    chassis: effectiveChassis(shell, doc),
    loads: designLoads(doc, shell, definitions),
  });
}
