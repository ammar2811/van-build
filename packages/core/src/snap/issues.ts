import { partBox, sceneObstacles } from "../parts/parts";
import type { DesignDoc } from "../schema/design";
import { boxesOverlap, EPS } from "../schema/geometry";
import type { VanShell } from "../schema/shell";
import { minHalfWidth, minInteriorHeight } from "../shell/geometry";

export type IssueKind = "collision" | "outOfBounds" | "tooTall";

export interface PartIssue {
  partId: string;
  kind: IssueKind;
  /** For collisions: what the part overlaps. */
  withIds: string[];
}

/**
 * Problems a design can be saved with. Typed values are always accepted, so a part can end
 * up overlapping another or poking through a wall; this is what the editor flags in red.
 */
export function findIssues(doc: DesignDoc, shell: VanShell): PartIssue[] {
  const issues: PartIssue[] = [];
  const ids = Object.keys(doc.parts).sort();
  for (const id of ids) {
    const part = doc.parts[id];
    if (!part) continue;
    const box = partBox(part);

    const withIds = sceneObstacles(doc, shell, id)
      .filter((o) => boxesOverlap(box, o.box))
      .map((o) => o.id)
      .sort();
    if (withIds.length > 0) issues.push({ partId: id, kind: "collision", withIds });

    const wall = minHalfWidth(shell, box.min.x, box.max.x, box.min.z, box.max.z);
    const outside =
      box.min.x < -EPS ||
      box.max.x > shell.cargoLength + EPS ||
      Math.max(Math.abs(box.min.y), Math.abs(box.max.y)) > wall + EPS ||
      box.min.z < -EPS;
    if (outside) issues.push({ partId: id, kind: "outOfBounds", withIds: [] });

    if (box.max.z > minInteriorHeight(shell, box.min.x, box.max.x) + EPS) {
      issues.push({ partId: id, kind: "tooTall", withIds: [] });
    }
  }
  return issues;
}
