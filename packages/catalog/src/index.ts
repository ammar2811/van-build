import type { PartDefinition, VanShell } from "@vanbuild/core";
import { partDefinitions } from "./parts/definitions";
import { promaster136HighRoof, promaster159HighRoof } from "./shells/promaster";
import { sprinter144HighRoof, sprinter170HighRoof } from "./shells/sprinter";
import { transit148HighRoof, transit148MediumRoof } from "./shells/transit";

export { categoryLabels, partDefinitions } from "./parts/definitions";
export { starterDesign } from "./starter";
export { designFromTemplate, type Template, templates } from "./templates";

export const shells: VanShell[] = [
  sprinter144HighRoof,
  sprinter170HighRoof,
  transit148MediumRoof,
  transit148HighRoof,
  promaster136HighRoof,
  promaster159HighRoof,
];

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
