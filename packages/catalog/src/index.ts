import type { PartDefinition, VanShell } from "@vanbuild/core";
import { partDefinitions } from "./parts/definitions";
import { sprinter144HighRoof } from "./shells/sprinter-144-high-roof";

export { partDefinitions } from "./parts/definitions";
export { starterDesign } from "./starter";

export const shells: VanShell[] = [sprinter144HighRoof];

const shellsById = new Map(shells.map((shell) => [shell.id, shell]));
const definitionsById = new Map(partDefinitions.map((def) => [def.id, def]));

export function getShell(id: string): VanShell {
  const shell = shellsById.get(id);
  if (!shell) throw new Error(`Unknown van shell "${id}"`);
  return shell;
}

export function getPartDefinition(id: string): PartDefinition | undefined {
  return definitionsById.get(id);
}
