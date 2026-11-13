import { z } from "zod";
import { PartInstanceSchema } from "./part";

export const DESIGN_SCHEMA_VERSION = 1;

/**
 * The whole design. Everything else the app shows (weights, bill of materials, drawings)
 * is derived from this document by pure functions and never stored.
 */
export const DesignDocSchema = z.object({
  schemaVersion: z.literal(DESIGN_SCHEMA_VERSION),
  name: z.string(),
  shellId: z.string(),
  chassisId: z.string(),
  parts: z.record(z.string(), PartInstanceSchema),
});
export type DesignDoc = z.infer<typeof DesignDocSchema>;
