import type { ProfilePoint, Station, VanShell } from "../schema/shell";

/** Half the interior width of one cross-section at height z (clamped to the profile). */
export function profileHalfWidth(profile: readonly ProfilePoint[], z: number): number {
  const first = profile[0];
  const last = profile[profile.length - 1];
  if (!first || !last) throw new Error("Shell profile is empty");
  if (z <= first.z) return first.halfWidth;
  if (z >= last.z) return last.halfWidth;
  for (let i = 1; i < profile.length; i++) {
    const a = profile[i - 1];
    const b = profile[i];
    if (!a || !b) continue;
    if (z <= b.z) {
      const t = b.z === a.z ? 0 : (z - a.z) / (b.z - a.z);
      return a.halfWidth + t * (b.halfWidth - a.halfWidth);
    }
  }
  return last.halfWidth;
}

function profileHeight(profile: readonly ProfilePoint[]): number {
  const last = profile[profile.length - 1];
  if (!last) throw new Error("Shell profile is empty");
  return last.z;
}

/** The two stations around x and how far x sits between them (0..1). */
function bracket(shell: VanShell, x: number): { a: Station; b: Station; t: number } {
  const stations = shell.stations;
  const first = stations[0];
  const last = stations[stations.length - 1];
  if (!first || !last) throw new Error("Shell has no stations");
  if (x <= first.x) return { a: first, b: first, t: 0 };
  if (x >= last.x) return { a: last, b: last, t: 0 };
  for (let i = 1; i < stations.length; i++) {
    const a = stations[i - 1];
    const b = stations[i];
    if (!a || !b) continue;
    if (x <= b.x) return { a, b, t: b.x === a.x ? 0 : (x - a.x) / (b.x - a.x) };
  }
  return { a: last, b: last, t: 0 };
}

/** Half the interior width at a point along the van and a height above the floor. */
export function halfWidthAt(shell: VanShell, x: number, z: number): number {
  const { a, b, t } = bracket(shell, x);
  const wa = profileHalfWidth(a.profile, z);
  if (t === 0) return wa;
  return wa + t * (profileHalfWidth(b.profile, z) - wa);
}

/** Interior height (floor to ceiling) at a point along the van. */
export function interiorHeightAt(shell: VanShell, x: number): number {
  const { a, b, t } = bracket(shell, x);
  const ha = profileHeight(a.profile);
  return t === 0 ? ha : ha + t * (profileHeight(b.profile) - ha);
}

function sampleCoordinates(lo: number, hi: number, breakpoints: readonly number[]): number[] {
  const values = [lo, hi];
  for (const p of breakpoints) if (p > lo && p < hi) values.push(p);
  return values;
}

/**
 * The narrowest half-width a box spanning [x0,x1] x [z0,z1] has to fit inside.
 *
 * The shell is piecewise linear between stations and between profile points, so the minimum
 * over the box always sits on a breakpoint or a box edge. Checking those is exact, no sampling.
 */
export function minHalfWidth(shell: VanShell, x0: number, x1: number, z0: number, z1: number) {
  const xs = sampleCoordinates(
    x0,
    x1,
    shell.stations.map((s) => s.x),
  );
  const zs = sampleCoordinates(
    z0,
    z1,
    shell.stations.flatMap((s) => s.profile.map((p) => p.z)),
  );
  let min = Number.POSITIVE_INFINITY;
  for (const x of xs) for (const z of zs) min = Math.min(min, halfWidthAt(shell, x, z));
  return min;
}

/** The lowest ceiling over the span [x0,x1]. */
export function minInteriorHeight(shell: VanShell, x0: number, x1: number): number {
  const xs = sampleCoordinates(
    x0,
    x1,
    shell.stations.map((s) => s.x),
  );
  return Math.min(...xs.map((x) => interiorHeightAt(shell, x)));
}

/** Widest half-width anywhere in the shell. Used to frame views. */
export function maxHalfWidth(shell: VanShell): number {
  return Math.max(...shell.stations.flatMap((s) => s.profile.map((p) => p.halfWidth)));
}

/**
 * The interior outline at height z as a closed polygon in the van frame, walking the
 * passenger wall rearward and the driver wall forward.
 */
export function outlineAt(shell: VanShell, z: number): { x: number; y: number }[] {
  const xs = sampleCoordinates(
    0,
    shell.cargoLength,
    shell.stations.map((s) => s.x),
  ).sort((a, b) => a - b);
  const passenger = xs.map((x) => ({ x, y: halfWidthAt(shell, x, z) }));
  const driver = xs.map((x) => ({ x, y: -halfWidthAt(shell, x, z) })).reverse();
  return [...passenger, ...driver];
}
