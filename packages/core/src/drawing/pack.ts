import { buildBom } from "../bom/bom";
import type { DefinitionLookup } from "../parts/parts";
import type { DesignDoc } from "../schema/design";
import type { VanShell } from "../schema/shell";
import { bomDrawings, bomSheetCount } from "./bomSheet";
import { elevationDrawing } from "./elevation";
import type { Drawing } from "./ir";
import { planDrawing } from "./plan";
import type { SheetOptions } from "./sheet";
import { weightDrawing } from "./weightSheet";

/**
 * The whole build pack, one drawing per sheet: floor plan, side elevation, weight estimate
 * and the parts list (which runs over more sheets when it is long).
 */
export function buildPack(
  doc: DesignDoc,
  shell: VanShell,
  definitions: DefinitionLookup,
  options: Omit<SheetOptions, "sheet">,
): Drawing[] {
  const bom = buildBom(doc, definitions);
  const of = 3 + bomSheetCount(bom, options);
  const sheet = (number: number): SheetOptions => ({ ...options, sheet: { number, of } });
  return [
    planDrawing(doc, shell, definitions, sheet(1)),
    elevationDrawing(doc, shell, definitions, sheet(2)),
    weightDrawing(doc, shell, definitions, sheet(3)),
    ...bomDrawings(doc, shell, bom, sheet(4)),
  ];
}
