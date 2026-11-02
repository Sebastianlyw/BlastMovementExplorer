import { terrainHeightFor } from './generator';
import { mulberry32, valueNoise3 } from './random';
import { Bounds3, GenerationParams } from './types';

/**
 * Synthetic SURFACE SCAN of the pre-blast terrain. Visual only: it carries no
 * grade or mass information and never feeds metrics. Not LiDAR, not measured.
 */
export type PointTier = '100k' | '300k' | '1m';

export const POINT_TIER_TARGET: Readonly<Record<PointTier, number>> = {
  '100k': 100_000,
  '300k': 300_000,
  '1m': 1_000_000,
};

/** Standard deviation and hard bound of simulated measurement noise, metres. */
export const SCAN_NOISE_SIGMA = 0.025;
export const SCAN_NOISE_MAX = 0.1;

export interface SurfacePointCloud {
  /** Interleaved x, y, z in domain coordinates, metres. Length 3 × count. */
  readonly positions: Float32Array;
  readonly count: number;
  readonly bounds: Bounds3;
  readonly tier: PointTier;
  readonly source: 'synthetic-surface-scan';
}

const TIER_SALT: Readonly<Record<PointTier, number>> = { '100k': 0x1001, '300k': 0x3003, '1m': 0x7007 };

export function generateSurfacePoints(seed: number, params: GenerationParams, tier: PointTier): SurfacePointCloud {
  const height = terrainHeightFor(params);
  const ext = params.terrain.extent;
  const w = ext.max[0] - ext.min[0];
  const h = ext.max[1] - ext.min[1];
  // Stratified grid with roughly square cells and ~target cells in total.
  const target = POINT_TIER_TARGET[tier];
  const nx = Math.max(1, Math.round(Math.sqrt((target * w) / h)));
  const ny = Math.max(1, Math.round(target / nx));
  const cw = w / nx;
  const ch = h / ny;
  const rnd = mulberry32((seed ^ TIER_SALT[tier] ^ 0x5ca1ab1e) >>> 0);
  const holeSeed = (seed ^ 0x0dd0d0d0) >>> 0; // same holes for every tier
  const out = new Float32Array(nx * ny * 3);
  let n = 0;
  let zMin = Infinity;
  let zMax = -Infinity;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const x = ext.min[0] + (i + rnd()) * cw;
      const y = ext.min[1] + (j + rnd()) * ch;
      // Box–Muller for Gaussian noise; always consume two draws to keep the sequence aligned.
      const u1 = Math.max(1e-12, rnd());
      const u2 = rnd();
      if (valueNoise3(holeSeed, x / 18, y / 18, 0.5) > 0.62) continue; // coherent dropout
      const g = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      const noise = Math.max(-SCAN_NOISE_MAX, Math.min(SCAN_NOISE_MAX, g * SCAN_NOISE_SIGMA));
      const z = height(x, y) + noise;
      out[n * 3] = x;
      out[n * 3 + 1] = y;
      out[n * 3 + 2] = z;
      zMin = Math.min(zMin, z);
      zMax = Math.max(zMax, z);
      n++;
    }
  }
  // Return an exactly-sized buffer so it can be transferred without waste.
  const positions = out.slice(0, n * 3);
  return {
    positions,
    count: n,
    bounds: { min: [ext.min[0], ext.min[1], zMin], max: [ext.max[0], ext.max[1], zMax] },
    tier,
    source: 'synthetic-surface-scan',
  };
}
