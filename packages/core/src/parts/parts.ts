import type { DesignDoc } from "../schema/design";
import type { Box3, Vec3 } from "../schema/geometry";
import type { ParamValue, PartDefinition, PartInstance, Yaw } from "../schema/part";
import type { VanShell } from "../schema/shell";

export type DefinitionLookup = (defId: string) => PartDefinition | undefined;

export function requireDefinition(lookup: DefinitionLookup, defId: string): PartDefinition {
  const def = lookup(defId);
  if (!def) throw new Error(`Unknown part definition "${defId}"`);
  return def;
}

/** Definition defaults with the instance's own values on top. */
export function resolveParams(
  def: PartDefinition,
  params: Readonly<Record<string, ParamValue>>,
): Record<string, ParamValue> {
  const resolved: Record<string, ParamValue> = {};
  for (const param of def.params) resolved[param.key] = params[param.key] ?? param.default;
  return resolved;
}

function lengthParam(instance: PartInstance, key: string): number {
  const value = instance.params[key];
  if (typeof value !== "number") {
    throw new Error(`Part "${instance.id}" has no length param "${key}"`);
  }
  return value;
}

/** The part's own dimensions, before rotation. */
export function partDimensions(instance: PartInstance): {
  width: number;
  depth: number;
  height: number;
} {
  return {
    width: lengthParam(instance, "width"),
    depth: lengthParam(instance, "depth"),
    height: lengthParam(instance, "height"),
  };
}

export function isQuarterTurned(yaw: Yaw): boolean {
  return yaw === 90 || yaw === 270;
}

/** Extents along the van's X, Y and Z once the part's rotation is applied. */
export function partExtents(instance: PartInstance): Vec3 {
  const { width, depth, height } = partDimensions(instance);
  return isQuarterTurned(instance.yaw)
    ? { x: depth, y: width, z: height }
    : { x: width, y: depth, z: height };
}

/** Axis-aligned box of a part in the van frame. */
export function partBox(instance: PartInstance): Box3 {
  const size = partExtents(instance);
  const { x, y, z } = instance.position;
  return {
    min: { x: x - size.x / 2, y: y - size.y / 2, z },
    max: { x: x + size.x / 2, y: y + size.y / 2, z: z + size.z },
  };
}

export function partName(def: PartDefinition, instance: PartInstance): string {
  return instance.overrides.name ?? def.name;
}

/** Mass in grams: the user's override, or empty mass plus contents at the given fill level. */
export function partMass(def: PartDefinition, instance: PartInstance, fillLevel = 1): number {
  if (instance.overrides.mass !== undefined) return instance.overrides.mass;
  const contents = def.mass.contents
    ? def.mass.contents.capacityLitres * def.mass.contents.gramsPerLitre * fillLevel
    : 0;
  return def.mass.fixed + contents;
}

/** Price in minor units. */
export function partPrice(def: PartDefinition, instance: PartInstance): number {
  return instance.overrides.price ?? def.price.fixed;
}

export function createInstance(def: PartDefinition, id: string, position: Vec3): PartInstance {
  return {
    id,
    defId: def.id,
    defVersion: def.version,
    params: resolveParams(def, {}),
    position,
    yaw: 0,
    locks: { position: false, params: [] },
    overrides: {},
  };
}

export interface Obstacle {
  id: string;
  box: Box3;
}

export const WHEEL_WELL_PREFIX = "wheelwell:";

/** Everything a moving part can bump into: the other parts and the wheel wells. */
export function sceneObstacles(
  doc: DesignDoc,
  shell: VanShell,
  exclude: string | readonly string[] = [],
): Obstacle[] {
  const skip = new Set(typeof exclude === "string" ? [exclude] : exclude);
  const obstacles: Obstacle[] = shell.wheelWells.map((box, i) => ({
    id: `${WHEEL_WELL_PREFIX}${i}`,
    box,
  }));
  for (const part of Object.values(doc.parts)) {
    if (!skip.has(part.id)) obstacles.push({ id: part.id, box: partBox(part) });
  }
  return obstacles;
}
