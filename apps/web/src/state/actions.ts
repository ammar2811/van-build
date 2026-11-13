import { getPartDefinition, getShell } from "@vanbuild/catalog";
import {
  type PartInstance,
  partExtents,
  partName,
  placeNewPart,
  quantizeMm,
  resizePart,
  rotatePart,
  sceneObstacles,
  setFloorHeight,
  setWallDistance,
  solveDrag,
  type Vec3,
  type WallDistances,
} from "@vanbuild/core";
import { useDocStore } from "./docStore";
import { useUiStore } from "./uiStore";

/**
 * Everything the editor can do to a design. Each action is one undo step. Components call
 * these instead of touching the stores, so keyboard, buttons and canvas all behave the same.
 */

function current() {
  const { doc, commit } = useDocStore.getState();
  return { doc, commit, shell: getShell(doc.shellId) };
}

function label(part: PartInstance): string {
  const def = getPartDefinition(part.defId);
  return def ? partName(def, part) : "part";
}

function newId(): string {
  return `p_${crypto.randomUUID().slice(0, 8)}`;
}

function replace(action: string, next: PartInstance): void {
  const { doc, commit } = current();
  // An edit that changes nothing must not leave an empty step in the undo history.
  if (JSON.stringify(doc.parts[next.id]) === JSON.stringify(next)) return;
  commit(`${action} ${label(next)}`, (draft) => {
    draft.parts[next.id] = next;
  });
}

export function addPart(defId: string): void {
  const { doc, shell, commit } = current();
  const def = getPartDefinition(defId);
  if (!def) return;
  const part = placeNewPart(doc, shell, def, newId());
  commit(`Add ${def.name}`, (draft) => {
    draft.parts[part.id] = part;
  });
  useUiStore.getState().select(part.id);
}

export function movePart(id: string, position: Vec3): void {
  const part = current().doc.parts[id];
  if (!part) return;
  replace("Move", { ...part, position });
}

export function deletePart(id: string): void {
  const { doc, commit } = current();
  const part = doc.parts[id];
  if (!part) return;
  commit(`Delete ${label(part)}`, (draft) => {
    delete draft.parts[id];
  });
  const ui = useUiStore.getState();
  if (ui.selectedId === id) ui.select(null);
}

export function rotate(id: string): void {
  const { doc, shell } = current();
  const part = doc.parts[id];
  if (part) replace("Rotate", rotatePart(doc, shell, part));
}

export function resize(id: string, key: "width" | "depth" | "height", value: number): void {
  const { doc, shell } = current();
  const part = doc.parts[id];
  if (part) replace("Resize", resizePart(shell, part, key, value));
}

export function setDistance(id: string, wall: keyof WallDistances, distance: number): void {
  const { doc, shell } = current();
  const part = doc.parts[id];
  if (part) replace("Move", setWallDistance(shell, part, wall, distance));
}

export function setElevation(id: string, z: number): void {
  const part = current().doc.parts[id];
  if (part) replace("Move", setFloorHeight(part, z));
}

/** Arrow-key move. Stops at walls and neighbours instead of pushing through them. */
export function nudge(id: string, dx: number, dy: number): void {
  const { doc, shell } = current();
  const part = doc.parts[id];
  if (!part) return;
  const result = solveDrag({
    shell,
    obstacles: sceneObstacles(doc, shell, id),
    size: partExtents(part),
    z: part.position.z,
    proposed: { x: part.position.x + dx, y: part.position.y + dy },
    fallback: part.position,
    mmPerPx: 1,
    noSnap: true,
  });
  movePart(id, {
    x: quantizeMm(result.position.x),
    y: quantizeMm(result.position.y),
    z: part.position.z,
  });
}
