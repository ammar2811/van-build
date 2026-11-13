import { z } from "zod";
import { Vec3Schema } from "./geometry";

export const PartCategorySchema = z.enum([
  "bed",
  "galley",
  "storage",
  "appliance",
  "seating",
  "water",
  "electrical",
  "climate",
  "opening",
  "load",
]);
export type PartCategory = z.infer<typeof PartCategorySchema>;

/** The code that turns a definition's params into geometry, mass and BOM lines. */
export const GeneratorSchema = z.enum([
  "panelBox",
  "platform",
  "bench",
  "slab",
  "appliance",
  "tank",
  "battery",
  "device",
  "roofItem",
  "wallCutout",
  "load",
]);
export type Generator = z.infer<typeof GeneratorSchema>;

export const MountSchema = z.enum(["floor", "wall", "ceiling", "roof", "wallCutout", "load"]);

const ParamBase = { key: z.string(), label: z.string() };

export const ParamSchema = z.discriminatedUnion("kind", [
  z.object({
    ...ParamBase,
    kind: z.literal("length"),
    default: z.number().positive(),
    min: z.number().positive(),
    max: z.number().positive(),
  }),
  z.object({
    ...ParamBase,
    kind: z.literal("number"),
    default: z.number(),
    min: z.number(),
    max: z.number(),
    step: z.number().positive(),
  }),
  z.object({
    ...ParamBase,
    kind: z.literal("enum"),
    default: z.string(),
    options: z.array(z.object({ value: z.string(), label: z.string() })).min(1),
  }),
  z.object({ ...ParamBase, kind: z.literal("bool"), default: z.boolean() }),
]);
export type Param = z.infer<typeof ParamSchema>;

export const ParamValueSchema = z.union([z.number(), z.string(), z.boolean()]);
export type ParamValue = z.infer<typeof ParamValueSchema>;

/**
 * A catalog entry. Plain data, so new parts can be contributed without writing code.
 * Every definition has `width` (along the van at yaw 0), `depth` (across the van at yaw 0)
 * and `height` length params.
 */
export const PartDefinitionSchema = z.object({
  id: z.string(),
  version: z.number().int().positive(),
  category: PartCategorySchema,
  name: z.string(),
  generator: GeneratorSchema,
  mount: MountSchema,
  /** Height of the underside above the floor that a new instance starts at. Default 0. */
  defaultElevation: z.number().nonnegative().optional(),
  /** Other parts can be put on top of this one (a cabinet, a bed platform). */
  carries: z.boolean().optional(),
  /** When dragged over something that carries, this part drops onto it (a mattress, a crate). */
  stacks: z.boolean().optional(),
  params: z.array(ParamSchema),
  mass: z.object({
    /** Empty mass in grams. */
    fixed: z.number().int().nonnegative(),
    /** Liquid or cargo the part can hold, added at the current fill level. */
    contents: z
      .object({ capacityLitres: z.number().positive(), gramsPerLitre: z.number().positive() })
      .optional(),
  }),
  price: z.object({ fixed: z.number().int().nonnegative(), currency: z.string().length(3) }),
  url: z.url().optional(),
  electrical: z
    .object({ watts: z.number().nonnegative(), dutyHoursPerDay: z.number().min(0).max(24) })
    .optional(),
  water: z.object({ litres: z.number().positive(), kind: z.enum(["fresh", "grey"]) }).optional(),
});
export type PartDefinition = z.infer<typeof PartDefinitionSchema>;

/** Rotation about the vertical axis. v1 placement works in quarter turns. */
export const YawSchema = z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]);
export type Yaw = z.infer<typeof YawSchema>;

export const PartInstanceSchema = z.object({
  id: z.string(),
  defId: z.string(),
  defVersion: z.number().int().positive(),
  /** Resolved values, so a catalog update never silently changes an existing design. */
  params: z.record(z.string(), ParamValueSchema),
  /** Centre of the footprint in X and Y, underside of the part in Z. */
  position: Vec3Schema,
  yaw: YawSchema,
  locks: z.object({ position: z.boolean(), params: z.array(z.string()) }),
  overrides: z.object({
    name: z.string().optional(),
    mass: z.number().int().nonnegative().optional(),
    price: z.number().int().nonnegative().optional(),
  }),
});
export type PartInstance = z.infer<typeof PartInstanceSchema>;
