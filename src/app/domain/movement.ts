import { valueNoise3 } from './random';
import { Bounds3, Vec3 } from './types';

/**
 * Illustrative movement field. Procedural, NOT a blast physics model:
 * it produces plausible-looking, spatially continuous displacements only.
 */
export interface MovementParams {
  /** Main throw azimuth, CCW from +X (East), degrees. −90 = South (toward the free face). */
  readonly throwAzimuthDeg: number;
  /** Horizontal throw at the free face, top of bench, metres. */
  readonly throwMetres: number;
  /** e-folding distance of throw magnitude away from the free face, metres. */
  readonly faceDecayMetres: number;
  /** Throw at the bench floor relative to the bench top (0–1). */
  readonly depthRatio: number;
  /** Maximum lateral (perpendicular) spreading, metres. */
  readonly lateralSpreadMetres: number;
  /** Typical drop of material near the face, metres. */
  readonly dropMetres: number;
  /** Hard bound on |vertical displacement|, metres. */
  readonly verticalMaxMetres: number;
  /** Amplitude of continuous noise, metres. */
  readonly noiseMetres: number;
  /** Wavelength of the noise, metres. */
  readonly noiseScaleMetres: number;
}

export const DEFAULT_MOVEMENT_PARAMS: MovementParams = {
  throwAzimuthDeg: -90,
  throwMetres: 6,
  faceDecayMetres: 30,
  depthRatio: 0.55,
  lateralSpreadMetres: 1.5,
  dropMetres: 2,
  verticalMaxMetres: 2.5,
  noiseMetres: 0.6,
  noiseScaleMetres: 18,
};

/** Inclusive [min, max] for every movement parameter. */
export const MOVEMENT_PARAM_RANGES: Readonly<Record<keyof MovementParams, readonly [number, number]>> = {
  throwAzimuthDeg: [-180, 180],
  throwMetres: [0, 15],
  faceDecayMetres: [5, 200],
  depthRatio: [0, 1],
  lateralSpreadMetres: [0, 5],
  dropMetres: [0, 4],
  verticalMaxMetres: [0, 4],
  noiseMetres: [0, 2],
  noiseScaleMetres: [4, 100],
};

/** Returns human-readable errors; empty when valid. Never clamps. */
export function validateMovementParams(p: Partial<Record<string, unknown>>): string[] {
  const errors: string[] = [];
  for (const key of Object.keys(MOVEMENT_PARAM_RANGES) as (keyof MovementParams)[]) {
    const v = p[key];
    const [lo, hi] = MOVEMENT_PARAM_RANGES[key];
    if (typeof v !== 'number' || !Number.isFinite(v)) errors.push(`movement.${key} must be a finite number`);
    else if (v < lo || v > hi) errors.push(`movement.${key} = ${v} is outside [${lo}, ${hi}]`);
  }
  return errors;
}

export interface MovementContext {
  readonly blockBounds: Bounds3;
  readonly faceCrestY: number;
  readonly floorZ: number;
}

/**
 * Computes after-movement centres. Only positions change; the caller keeps
 * ids, grades, densities and sizes untouched.
 */
export function computeAfterCenters(
  seed: number,
  params: MovementParams,
  ctx: MovementContext,
  before: Float32Array,
  size: Float32Array,
): Float32Array {
  const errors = validateMovementParams(params as unknown as Record<string, unknown>);
  if (errors.length) throw new RangeError(errors.join('; '));
  const n = before.length / 3;
  const after = new Float32Array(before.length);
  const az = (params.throwAzimuthDeg * Math.PI) / 180;
  const dirX = Math.cos(az);
  const dirY = Math.sin(az);
  // Perpendicular (lateral) direction, 90° CCW from the throw.
  const perpX = -dirY;
  const perpY = dirX;
  const { min, max } = ctx.blockBounds;
  const cx = (min[0] + max[0]) / 2;
  const cy = (min[1] + max[1]) / 2;
  const acrossCentre = cx * perpX + cy * perpY;
  const halfWidth = Math.max(1e-6, (Math.abs(perpX) * (max[0] - min[0]) + Math.abs(perpY) * (max[1] - min[1])) / 2);
  const height = Math.max(1e-6, max[2] - min[2]);
  const ns = 1 / params.noiseScaleMetres;
  const s1 = (seed ^ 0x6a09e667) >>> 0;
  const s2 = (seed ^ 0xbb67ae85) >>> 0;
  const s3 = (seed ^ 0x3c6ef372) >>> 0;

  for (let i = 0; i < n; i++) {
    const o = i * 3;
    const x = before[o];
    const y = before[o + 1];
    const z = before[o + 2];
    const d = Math.max(0, y - ctx.faceCrestY);
    const h = Math.min(1, Math.max(0, (z - min[2]) / height));
    const face = 0.3 + 0.7 * Math.exp(-d / params.faceDecayMetres);
    const depth = params.depthRatio + (1 - params.depthRatio) * h;
    const n1 = valueNoise3(s1, x * ns, y * ns, z * ns);
    const n2 = valueNoise3(s2, x * ns, y * ns, z * ns);
    const n3 = valueNoise3(s3, x * ns, y * ns, z * ns);

    const main = params.throwMetres * face * depth * (1 + 0.2 * n1);
    const across = x * perpX + y * perpY;
    const spreadT = Math.min(1, Math.max(-1, (across - acrossCentre) / halfWidth));
    const lateral = params.lateralSpreadMetres * face * spreadT + params.noiseMetres * n2;
    let dz = -params.dropMetres * face * (0.4 + 0.6 * h) + params.noiseMetres * 0.3 * n3;
    dz = Math.min(params.verticalMaxMetres, Math.max(-params.verticalMaxMetres, dz));
    // Material cannot end below the lower floor.
    const minZ = ctx.floorZ + size[o + 2] / 2;
    if (z + dz < minZ) dz = Math.min(0, minZ - z);

    after[o] = x + main * dirX + lateral * perpX;
    after[o + 1] = y + main * dirY + lateral * perpY;
    after[o + 2] = z + dz;
  }
  return after;
}

/**
 * Movement interpolation p(t) = (1 − t)·before + t·after, t ∈ [0, 1].
 * Written this way (not before + t·(after − before)) so t = 0 and t = 1
 * return the endpoints bit-exactly. The vertex shader uses the same form.
 */
export function interpolate(before: number, after: number, t: number): number {
  return (1 - t) * before + t * after;
}

export function interpolateCenter(before: Vec3, after: Vec3, t: number): Vec3 {
  return [interpolate(before[0], after[0], t), interpolate(before[1], after[1], t), interpolate(before[2], after[2], t)];
}

/** Bounds of all blocks (centre ± half size) for a centre buffer. */
export function boundsOf(centers: Float32Array, size: Float32Array): Bounds3 {
  const mn = [Infinity, Infinity, Infinity];
  const mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < centers.length; i++) {
    const k = i % 3;
    const h = size[i] / 2;
    mn[k] = Math.min(mn[k], centers[i] - h);
    mx[k] = Math.max(mx[k], centers[i] + h);
  }
  return { min: [mn[0], mn[1], mn[2]], max: [mx[0], mx[1], mx[2]] };
}
