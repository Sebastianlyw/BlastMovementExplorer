/**
 * Seeded randomness for the synthetic dataset.
 *
 * Everything here is a pure function of its inputs so that a dataset is fully
 * determined by (seed, generatorVersion, params).
 */

/** Mulberry32 PRNG. Returns a function yielding floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer hash of a seeded lattice point, mapped to [0, 1). */
export function hash3(seed: number, ix: number, iy: number, iz: number): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (ix | 0), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13) ^ (iy | 0), 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 16) ^ (iz | 0), 0x27d4eb2f);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

function quintic(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Continuous 3D value noise in [-1, 1]. C2-continuous thanks to quintic
 * interpolation, so neighbouring samples are similar.
 */
export function valueNoise3(seed: number, x: number, y: number, z: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const fx = quintic(x - x0);
  const fy = quintic(y - y0);
  const fz = quintic(z - z0);
  const c = (dx: number, dy: number, dz: number) => hash3(seed, x0 + dx, y0 + dy, z0 + dz);
  const x00 = lerp(c(0, 0, 0), c(1, 0, 0), fx);
  const x10 = lerp(c(0, 1, 0), c(1, 1, 0), fx);
  const x01 = lerp(c(0, 0, 1), c(1, 0, 1), fx);
  const x11 = lerp(c(0, 1, 1), c(1, 1, 1), fx);
  const v = lerp(lerp(x00, x10, fy), lerp(x01, x11, fy), fz);
  return v * 2 - 1;
}

/** Fractal sum of value noise, normalised to roughly [-1, 1]. */
export function fbm3(seed: number, x: number, y: number, z: number, octaves = 3): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let freq = 1;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise3(seed + o * 1013, x * freq, y * freq, z * freq);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}
