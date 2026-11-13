import type { Obstacle } from "../parts/parts";
import { EPS, intervalsOverlap, type Vec3 } from "../schema/geometry";
import type { VanShell } from "../schema/shell";
import { minHalfWidth } from "../shell/geometry";
import { MM_PER_INCH, type UnitSystem } from "../units/length";

/** Snap distance in screen pixels. In pixels so that zooming in gives finer control. */
export const DEFAULT_SNAP_PX = 8;
export const TOUCH_SNAP_PX = 12;

/** A snapped part holds on until the pointer is this many snap distances away. */
const HYSTERESIS = 1.5;

/** How many of the closest obstacles are used to build "slide to here" candidates. */
const MAX_NEARBY = 8;

export function defaultGridMm(system: UnitSystem): number {
  return system === "metric" ? 10 : MM_PER_INCH / 4;
}

export type Axis = "x" | "y";

/** wall: a van wall or end. face: flush against a part. edge: lined up with a part's edge. */
export type GuideKind = "wall" | "face" | "edge" | "centre";

export interface SnapGuide {
  axis: Axis;
  kind: GuideKind;
  /** Position of the guide line on its axis, in the van frame. */
  at: number;
  targetId?: string;
}

export interface Sticky {
  x?: number;
  y?: number;
}

export interface DragInput {
  shell: VanShell;
  /** Everything else in the scene, as boxes in the van frame. */
  obstacles: readonly Obstacle[];
  /** Extents of the moving part along X, Y and Z, rotation already applied. */
  size: Vec3;
  /** Height of the moving part's underside. */
  z: number;
  /** Where the pointer wants the centre of the footprint. */
  proposed: { x: number; y: number };
  /** Current zoom. Snap distance = snapPx * mmPerPx. */
  mmPerPx: number;
  snapPx?: number;
  /** Free positions land on this grid (measured at the part's leading edge). 0 turns it off. */
  gridMm?: number;
  /** `sticky` from the previous frame of the same drag. */
  sticky?: Sticky;
  /** Last known good centre, used when the part cannot fit anywhere near the pointer. */
  fallback?: { x: number; y: number };
  noSnap?: boolean;
  noCollide?: boolean;
}

export interface DragResult {
  position: Vec3;
  guides: SnapGuide[];
  /** Ids of obstacles the part still overlaps (only when it could not be resolved). */
  collisions: string[];
  outOfBounds: boolean;
  sticky: Sticky;
}

interface Context {
  shell: VanShell;
  hx: number;
  hy: number;
  z0: number;
  z1: number;
  all: readonly Obstacle[];
  /** Obstacles that share a height range with the moving part and can block it. */
  solids: Obstacle[];
  /**
   * Footprints of `solids` as [x0, x1, y0, y1] quads, already shrunk by EPS so touching
   * does not count as overlapping. Flat numbers keep the collision loop tight.
   */
  bounds: Float64Array;
}

function makeContext(input: DragInput): Context {
  const z0 = input.z;
  const z1 = input.z + input.size.z;
  const solids = input.obstacles.filter((o) => intervalsOverlap(z0, z1, o.box.min.z, o.box.max.z));
  const bounds = new Float64Array(solids.length * 4);
  solids.forEach((o, i) => {
    bounds[i * 4] = o.box.min.x + EPS;
    bounds[i * 4 + 1] = o.box.max.x - EPS;
    bounds[i * 4 + 2] = o.box.min.y + EPS;
    bounds[i * 4 + 3] = o.box.max.y - EPS;
  });
  return {
    shell: input.shell,
    hx: input.size.x / 2,
    hy: input.size.y / 2,
    z0,
    z1,
    all: input.obstacles,
    solids,
    bounds,
  };
}

/**
 * A place the part could snap to on one axis. `value` is the centre coordinate the part
 * would take, `line` is where the guide is drawn. Physical contact outranks alignment.
 */
type Visit = (
  value: number,
  line: number,
  kind: GuideKind,
  contact: boolean,
  targetId: string | undefined,
) => void;

/** Calls `visit` for every snap target along X. Visitor style: no per-frame allocation. */
function visitX(ctx: Context, cy: number, visit: Visit): void {
  const length = ctx.shell.cargoLength;
  visit(ctx.hx, 0, "wall", true, undefined);
  visit(length - ctx.hx, length, "wall", true, undefined);
  const y0 = cy - ctx.hy;
  const y1 = cy + ctx.hy;
  for (const o of ctx.all) {
    const { min, max } = o.box;
    if (intervalsOverlap(ctx.z0, ctx.z1, min.z, max.z) && intervalsOverlap(y0, y1, min.y, max.y)) {
      visit(min.x - ctx.hx, min.x, "face", true, o.id);
      visit(max.x + ctx.hx, max.x, "face", true, o.id);
    }
    visit(min.x + ctx.hx, min.x, "edge", false, o.id);
    visit(max.x - ctx.hx, max.x, "edge", false, o.id);
  }
}

function visitY(ctx: Context, cx: number, visit: Visit): void {
  const x0 = cx - ctx.hx;
  const x1 = cx + ctx.hx;
  const wall = minHalfWidth(ctx.shell, x0, x1, ctx.z0, ctx.z1);
  visit(wall - ctx.hy, wall, "wall", true, undefined);
  visit(ctx.hy - wall, -wall, "wall", true, undefined);
  visit(0, 0, "centre", false, undefined);
  for (const o of ctx.all) {
    const { min, max } = o.box;
    if (intervalsOverlap(ctx.z0, ctx.z1, min.z, max.z) && intervalsOverlap(x0, x1, min.x, max.x)) {
      visit(min.y - ctx.hy, min.y, "face", true, o.id);
      visit(max.y + ctx.hy, max.y, "face", true, o.id);
    }
    visit(min.y + ctx.hy, min.y, "edge", false, o.id);
    visit(max.y - ctx.hy, max.y, "edge", false, o.id);
  }
}

type Visitor = (visit: Visit) => void;

/** The snap target for one axis, or null when nothing is within reach. */
function pick(
  p: number,
  targets: Visitor,
  tolerance: number,
  sticky: number | undefined,
): number | null {
  const holdSticky = sticky !== undefined && Math.abs(p - sticky) <= tolerance * HYSTERESIS;
  let stickyStillThere = false;
  let best: number | null = null;
  let bestContact = false;
  let bestDistance = Number.POSITIVE_INFINITY;
  targets((value, _line, _kind, contact) => {
    if (holdSticky && Math.abs(value - (sticky as number)) < EPS) stickyStillThere = true;
    const distance = Math.abs(value - p);
    if (distance > tolerance) return;
    if (
      best === null ||
      (contact && !bestContact) ||
      (contact === bestContact && distance < bestDistance)
    ) {
      best = value;
      bestContact = contact;
      bestDistance = distance;
    }
  });
  return stickyStillThere ? (sticky as number) : best;
}

function snapToGrid(p: number, half: number, grid: number): number {
  if (grid <= 0) return p;
  return Math.round((p - half) / grid) * grid + half;
}

function inBounds(ctx: Context, cx: number, cy: number): boolean {
  if (cx - ctx.hx < -EPS || cx + ctx.hx > ctx.shell.cargoLength + EPS) return false;
  const wall = minHalfWidth(ctx.shell, cx - ctx.hx, cx + ctx.hx, ctx.z0, ctx.z1);
  return Math.abs(cy) + ctx.hy <= wall + EPS;
}

/** Whether the part would overlap anything at this centre. The hot loop of a drag. */
function hitsAny(ctx: Context, cx: number, cy: number): boolean {
  const x0 = cx - ctx.hx;
  const x1 = cx + ctx.hx;
  const y0 = cy - ctx.hy;
  const y1 = cy + ctx.hy;
  const b = ctx.bounds;
  for (let i = 0; i < b.length; i += 4) {
    if (
      (b[i] as number) < x1 &&
      x0 < (b[i + 1] as number) &&
      (b[i + 2] as number) < y1 &&
      y0 < (b[i + 3] as number)
    ) {
      return true;
    }
  }
  return false;
}

function overlapping(ctx: Context, cx: number, cy: number): string[] {
  const ids: string[] = [];
  for (const o of ctx.solids) {
    if (
      intervalsOverlap(cx - ctx.hx, cx + ctx.hx, o.box.min.x, o.box.max.x) &&
      intervalsOverlap(cy - ctx.hy, cy + ctx.hy, o.box.min.y, o.box.max.y)
    ) {
      ids.push(o.id);
    }
  }
  return ids;
}

function isFree(ctx: Context, cx: number, cy: number): boolean {
  return inBounds(ctx, cx, cy) && !hitsAny(ctx, cx, cy);
}

/** The `count` solids closest to a point, without sorting the whole list. */
function nearestSolids(ctx: Context, x: number, y: number, count: number): Obstacle[] {
  const picked: { o: Obstacle; d: number }[] = [];
  for (const o of ctx.solids) {
    const dx = Math.max(o.box.min.x - x, 0, x - o.box.max.x);
    const dy = Math.max(o.box.min.y - y, 0, y - o.box.max.y);
    const d = dx * dx + dy * dy;
    const last = picked[picked.length - 1];
    if (picked.length === count && last && d >= last.d) continue;
    let at = picked.length;
    while (at > 0 && (picked[at - 1] as { d: number }).d > d) at--;
    picked.splice(at, 0, { o, d });
    if (picked.length > count) picked.pop();
  }
  return picked.map((entry) => entry.o);
}

/**
 * The free position closest to `target`. Candidates are the target itself plus every
 * position that sits flush against a wall or a nearby obstacle, so the part slides along
 * whatever it hits and jumps across an obstacle once the pointer has passed it.
 */
function nearestFree(ctx: Context, target: { x: number; y: number }) {
  const length = ctx.shell.cargoLength;
  if (ctx.hx * 2 > length + EPS) return null;
  const tx = Math.min(Math.max(target.x, ctx.hx), length - ctx.hx);
  const near = nearestSolids(ctx, tx, target.y, MAX_NEARBY);

  const xs = [tx, ctx.hx, length - ctx.hx];
  for (const o of near) xs.push(o.box.min.x - ctx.hx, o.box.max.x + ctx.hx);

  let best: { x: number; y: number } | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const x of xs) {
    if (x < ctx.hx - EPS || x > length - ctx.hx + EPS) continue;
    const dx2 = (x - target.x) ** 2;
    if (dx2 >= bestDistance) continue;
    const limit = minHalfWidth(ctx.shell, x - ctx.hx, x + ctx.hx, ctx.z0, ctx.z1) - ctx.hy;
    if (limit < -EPS) continue;
    const reach = Math.max(limit, 0);
    const ys = [Math.min(Math.max(target.y, -reach), reach), reach, -reach];
    for (const o of near) ys.push(o.box.min.y - ctx.hy, o.box.max.y + ctx.hy);
    for (const y of ys) {
      if (Math.abs(y) > reach + EPS) continue;
      const distance = dx2 + (y - target.y) ** 2;
      if (distance >= bestDistance) continue;
      if (hitsAny(ctx, x, y)) continue;
      best = { x, y };
      bestDistance = distance;
    }
  }
  return best;
}

function guidesAt(ctx: Context, x: number, y: number): SnapGuide[] {
  const guides: SnapGuide[] = [];
  const collect = (axis: Axis, targets: Visitor, at: number) => {
    const hits: (SnapGuide & { contact: boolean })[] = [];
    targets((value, line, kind, contact, targetId) => {
      if (Math.abs(value - at) >= EPS) return;
      const guide: SnapGuide & { contact: boolean } = { axis, kind, at: line, contact };
      if (targetId !== undefined) guide.targetId = targetId;
      hits.push(guide);
    });
    hits.sort((a, b) => Number(b.contact) - Number(a.contact));
    for (const { contact: _contact, ...guide } of hits) {
      if (guides.some((g) => g.axis === axis && Math.abs(g.at - guide.at) < EPS)) continue;
      guides.push(guide);
    }
  };
  collect("x", (visit) => visitX(ctx, y, visit), x);
  collect("y", (visit) => visitY(ctx, x, visit), y);
  return guides;
}

/**
 * Decide where a dragged part ends up. Pure: the same input always gives the same answer,
 * and the 2D and 3D views both call this.
 *
 * 1. Snap each axis to the nearest wall, face or edge within reach, otherwise to the grid.
 * 2. If that spot is taken or outside the van, move to the nearest free spot.
 * 3. Report the guide lines the final position sits on.
 */
export function solveDrag(input: DragInput): DragResult {
  const ctx = makeContext(input);

  let { x, y } = input.proposed;
  if (!input.noSnap) {
    const tolerance = (input.snapPx ?? DEFAULT_SNAP_PX) * input.mmPerPx;
    const grid = input.gridMm ?? defaultGridMm("metric");
    const startY = y;
    x =
      pick(x, (visit) => visitX(ctx, startY, visit), tolerance, input.sticky?.x) ??
      snapToGrid(x, ctx.hx, grid);
    const snappedX = x;
    y =
      pick(y, (visit) => visitY(ctx, snappedX, visit), tolerance, input.sticky?.y) ??
      snapToGrid(y, ctx.hy, grid);
  }

  if (!input.noCollide && !isFree(ctx, x, y)) {
    // Snapping must never make things worse, so the raw pointer position and the last good
    // position are both acceptable answers when no flush position is free.
    const spare = [input.proposed, input.fallback].find((p) => p && isFree(ctx, p.x, p.y));
    const free = nearestFree(ctx, { x, y }) ?? spare;
    if (free) {
      x = free.x;
      y = free.y;
    }
  }

  const guides = input.noSnap ? [] : guidesAt(ctx, x, y);
  const sticky: Sticky = {};
  if (guides.some((g) => g.axis === "x")) sticky.x = x;
  if (guides.some((g) => g.axis === "y")) sticky.y = y;

  return {
    position: { x, y, z: input.z },
    guides,
    collisions: overlapping(ctx, x, y),
    outOfBounds: !inBounds(ctx, x, y),
    sticky,
  };
}
