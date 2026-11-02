/**
 * CPU picking against axis-aligned blocks. Pure functions, no Three.js.
 *
 * Uses the same current positions the vertex shader draws, so what can be
 * picked is exactly what is visible.
 */

export interface Ray {
  readonly origin: readonly [number, number, number];
  readonly dir: readonly [number, number, number];
}

/**
 * Slab test. Returns the entry distance along the ray, or Infinity on miss.
 * Box is given by centre and half extents.
 */
export function rayAabb(
  ray: Ray,
  cx: number,
  cy: number,
  cz: number,
  hx: number,
  hy: number,
  hz: number,
): number {
  let tmin = -Infinity;
  let tmax = Infinity;
  const c = [cx, cy, cz];
  const h = [hx, hy, hz];
  for (let k = 0; k < 3; k++) {
    const o = ray.origin[k];
    const d = ray.dir[k];
    const lo = c[k] - h[k];
    const hi = c[k] + h[k];
    if (Math.abs(d) < 1e-12) {
      if (o < lo || o > hi) return Infinity;
      continue;
    }
    let t1 = (lo - o) / d;
    let t2 = (hi - o) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return Infinity;
  }
  if (tmax < 0) return Infinity;
  return tmin >= 0 ? tmin : 0;
}

export interface PickInput {
  /** Number of candidate instances. */
  readonly count: number;
  /** Interleaved before / after centres in render space, indexed by instance. */
  readonly before: Float32Array;
  readonly after: Float32Array;
  /** Interleaved half extents per instance. */
  readonly halfSize: Float32Array;
  /** Movement interpolation t ∈ [0, 1]. */
  readonly t: number;
  /** Optional per-instance predicate on the current centre (e.g. section). */
  readonly isVisibleAt?: (x: number, y: number, z: number) => boolean;
}

/** Returns the nearest hit instance index or -1. */
export function pickNearest(ray: Ray, input: PickInput): number {
  const { before, after, halfSize, t, count, isVisibleAt } = input;
  const s = 1 - t;
  let best = -1;
  let bestT = Infinity;
  for (let i = 0; i < count; i++) {
    const o = i * 3;
    const x = s * before[o] + t * after[o];
    const y = s * before[o + 1] + t * after[o + 1];
    const z = s * before[o + 2] + t * after[o + 2];
    if (isVisibleAt && !isVisibleAt(x, y, z)) continue;
    const d = rayAabb(ray, x, y, z, halfSize[o], halfSize[o + 1], halfSize[o + 2]);
    if (d < bestT) {
      bestT = d;
      best = i;
    }
  }
  return best;
}
