import { getPartDefinition, getShell } from "@vanbuild/catalog";
import {
  duplicatePart,
  type PartInstance,
  partExtents,
  partName,
  placeNewPart,
  quantizeMm,
  resizePart,
  ridersOf,
  rotatePart,
  sceneObstacles,
  setClearance,
  setFloorHeight,
  settleOnSupports,
  setWallDistance,
  solveDrag,
  translatePart,
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

export function isLocked(part: PartInstance): boolean {
  return part.locks.position;
}

/** Write several parts as one undo step. Does nothing when nothing actually changed. */
function replaceAll(description: string, parts: PartInstance[]): void {
  const { doc, commit } = current();
  const changed = parts.filter(
    (part) => JSON.stringify(doc.parts[part.id]) !== JSON.stringify(part),
  );
  if (changed.length === 0) return;
  commit(description, (draft) => {
    for (const part of changed) draft.parts[part.id] = part;
  });
}

/** Move a part to `next`, taking everything resting on it along by the same amount. */
function moveTo(part: PartInstance, next: PartInstance): void {
  const { doc } = current();
  const delta = {
    x: next.position.x - part.position.x,
    y: next.position.y - part.position.y,
    z: next.position.z - part.position.z,
  };
  const riders = ridersOf(doc, getPartDefinition, part.id).flatMap((id) => {
    const rider = doc.parts[id];
    return rider ? [translatePart(rider, delta)] : [];
  });
  replaceAll(`Move ${label(part)}`, [next, ...riders]);
}

/**
 * Apply a change of shape to a part, then let whatever was resting on it settle: riders
 * follow a new height and drop when the part underneath no longer reaches them.
 */
function reshape(description: string, part: PartInstance, next: PartInstance): void {
  const { doc, shell } = current();
  const riderIds = ridersOf(doc, getPartDefinition, part.id);
  let after = { ...doc, parts: { ...doc.parts, [next.id]: next } };
  const settled: PartInstance[] = [];
  for (const id of riderIds) {
    const rider = after.parts[id];
    if (!rider) continue;
    const resting = settleOnSupports(after, shell, getPartDefinition, rider);
    after = { ...after, parts: { ...after.parts, [id]: resting } };
    settled.push(resting);
  }
  replaceAll(description, [next, ...settled]);
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

export function duplicate(id: string): void {
  const { doc, shell, commit } = current();
  const part = doc.parts[id];
  if (!part) return;
  const copy = duplicatePart(doc, shell, getPartDefinition, part, newId());
  commit(`Duplicate ${label(part)}`, (draft) => {
    draft.parts[copy.id] = copy;
  });
  useUiStore.getState().select(copy.id);
}

export function movePart(id: string, position: Vec3): void {
  const part = current().doc.parts[id];
  if (part) moveTo(part, { ...part, position });
}

export function deletePart(id: string): void {
  const { doc, shell, commit } = current();
  const part = doc.parts[id];
  if (!part || isLocked(part)) return;
  // What was resting on it drops to whatever is underneath once it is gone.
  const remaining = { ...doc.parts };
  delete remaining[id];
  let after = { ...doc, parts: remaining };
  const settled: PartInstance[] = [];
  for (const riderId of ridersOf(doc, getPartDefinition, id)) {
    const rider = after.parts[riderId];
    if (!rider) continue;
    const resting = settleOnSupports(after, shell, getPartDefinition, rider);
    after = { ...after, parts: { ...after.parts, [riderId]: resting } };
    settled.push(resting);
  }
  commit(`Delete ${label(part)}`, (draft) => {
    delete draft.parts[id];
    for (const rider of settled) draft.parts[rider.id] = rider;
  });
  const ui = useUiStore.getState();
  if (ui.selectedId === id) ui.select(null);
}

export function rotate(id: string): void {
  const { doc, shell } = current();
  const part = doc.parts[id];
  if (!part || isLocked(part)) return;
  reshape(`Rotate ${label(part)}`, part, rotatePart(doc, shell, part));
}

export function resize(id: string, key: "width" | "depth" | "height", value: number): void {
  const { doc, shell } = current();
  const part = doc.parts[id];
  if (!part || part.locks.params.includes(key)) return;
  reshape(`Resize ${label(part)}`, part, resizePart(shell, part, key, value));
}

export function setDistance(id: string, wall: keyof WallDistances, distance: number): void {
  const { doc, shell } = current();
  const part = doc.parts[id];
  if (part && !isLocked(part)) moveTo(part, setWallDistance(shell, part, wall, distance));
}

/** Set the gap between a part and its nearest neighbour (or wall) on one side. */
export function setGap(id: string, side: keyof WallDistances, distance: number): void {
  const { doc, shell } = current();
  const part = doc.parts[id];
  if (part && !isLocked(part)) moveTo(part, setClearance(doc, shell, part, side, distance));
}

export function setElevation(id: string, z: number): void {
  const part = current().doc.parts[id];
  if (part && !isLocked(part)) moveTo(part, setFloorHeight(part, z));
}

/** Arrow-key move. Stops at walls and neighbours instead of pushing through them. */
export function nudge(id: string, dx: number, dy: number): void {
  const { doc, shell } = current();
  const part = doc.parts[id];
  if (!part || isLocked(part)) return;
  const riders = ridersOf(doc, getPartDefinition, id);
  const result = solveDrag({
    shell,
    obstacles: sceneObstacles(doc, shell, [id, ...riders]),
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

/** Lock or unlock a part. A locked part cannot be moved, resized, rotated or deleted. */
export function toggleLock(id: string): void {
  const { doc, commit } = current();
  const part = doc.parts[id];
  if (!part) return;
  const locked = !isLocked(part);
  commit(`${locked ? "Lock" : "Unlock"} ${label(part)}`, (draft) => {
    const target = draft.parts[id];
    if (!target) return;
    target.locks = { position: locked, params: locked ? ["width", "depth", "height"] : [] };
  });
}

export function renameDesign(name: string): void {
  const trimmed = name.trim();
  if (trimmed === "") return;
  current().commit("Rename design", (draft) => {
    draft.name = trimmed;
  });
}

export function clearAll(): void {
  current().commit("Remove all parts", (draft) => {
    draft.parts = {};
  });
  useUiStore.getState().select(null);
}
