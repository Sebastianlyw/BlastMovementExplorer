import { boundsOf, computeAfterCenters, DEFAULT_MOVEMENT_PARAMS } from './movement';
import { fbm3, valueNoise3 } from './random';
import {
  BlockModel,
  Bounds3,
  Dataset,
  DatasetMetadata,
  GENERATOR_VERSION,
  GenerationParams,
  GeoClass,
  SCHEMA_VERSION,
  TerrainParams,
} from './types';

export const DEFAULT_SEED = 20261103;

export const DEFAULT_GENERATION_PARAMS: GenerationParams = {
  grid: { nx: 60, ny: 40, nz: 12, blockSize: 2, origin: [0, 0, 0] },
  oreBody: {
    center: [56, 22, 12],
    radii: [42, 17, 8.5],
    strikeDeg: 28,
    dipDeg: 18,
    peakGrade: 3.2,
    backgroundGrade: 0.12,
    noiseAmplitude: 0.28,
    noiseScale: 14,
  },
  vein: {
    enabled: true,
    point: [98, 40, 12],
    strikeDeg: 100,
    halfWidth: 2.2,
    grade: 1.7,
    halfLength: 52,
  },
  terrain: {
    benchTopZ: 24,
    floorZ: 0,
    faceCrestY: 0,
    wallHeight: 12,
    extent: { min: [-40, -50, -10], max: [160, 130, 40] },
  },
  movement: DEFAULT_MOVEMENT_PARAMS,
};

const DEG = Math.PI / 180;

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/**
 * Pre-blast terrain elevation at (x, y), metres.
 * A blast bench (flat at benchTopZ) with a vertical free face along y = faceCrestY
 * (the block model's south side) above a lower floor, enclosed by pit walls to the
 * west, east and north. The face is vertical so the surface never sits in front
 * of the blocks' south face; points exactly on the crest line belong to the floor.
 */
export function terrainHeight(t: TerrainParams, gridMax: readonly [number, number], x: number, y: number): number {
  const base = y > t.faceCrestY ? t.benchTopZ : t.floorZ;
  // Pit walls start 12 m beyond the block model footprint and rise over 6 m.
  const north = smoothstep(gridMax[1] + 12, gridMax[1] + 18, y);
  const west = smoothstep(-12, -18, x);
  const east = smoothstep(gridMax[0] + 12, gridMax[0] + 18, x);
  const wall = Math.max(north, west, east);
  return base + wall * (t.benchTopZ + t.wallHeight - base);
}

export function gridBounds(p: GenerationParams): Bounds3 {
  const g = p.grid;
  const [ox, oy, oz] = g.origin;
  return {
    min: [ox, oy, oz],
    max: [ox + g.nx * g.blockSize, oy + g.ny * g.blockSize, oz + g.nz * g.blockSize],
  };
}

/** Normalised ellipsoid distance (1 = on the ellipsoid surface). */
function ellipsoidDistance(p: GenerationParams, x: number, y: number, z: number): number {
  const o = p.oreBody;
  const dx = x - o.center[0];
  const dy = y - o.center[1];
  const dz = z - o.center[2];
  const cs = Math.cos(o.strikeDeg * DEG);
  const ss = Math.sin(o.strikeDeg * DEG);
  // Rotate into strike frame: u along strike, v across strike (horizontal), w vertical.
  const u = dx * cs + dy * ss;
  const v = -dx * ss + dy * cs;
  // Tilt about the strike axis by the dip angle.
  const cd = Math.cos(o.dipDeg * DEG);
  const sd = Math.sin(o.dipDeg * DEG);
  const v2 = v * cd + dz * sd;
  const w2 = -v * sd + dz * cd;
  return Math.sqrt((u / o.radii[0]) ** 2 + (v2 / o.radii[1]) ** 2 + (w2 / o.radii[2]) ** 2);
}

/** Vein grade contribution at a point, g/t. */
function veinGrade(p: GenerationParams, x: number, y: number, z: number): number {
  const v = p.vein;
  if (!v.enabled) return 0;
  const cs = Math.cos(v.strikeDeg * DEG);
  const ss = Math.sin(v.strikeDeg * DEG);
  const dx = x - v.point[0];
  const dy = y - v.point[1];
  const along = dx * cs + dy * ss;
  const across = -dx * ss + dy * cs;
  // Gentle sinuosity plus a steep dip keep the vein from looking ruler-straight.
  const wobble = 1.5 * Math.sin(along / 9) + 0.25 * (z - v.point[2]);
  const d = (across - wobble) / v.halfWidth;
  const taper = 1 - smoothstep(v.halfLength * 0.6, v.halfLength, Math.abs(along));
  return v.grade * Math.exp(-d * d) * taper;
}

/**
 * Generate the synthetic dataset. Pure: identical inputs → identical output.
 */
export function generateDataset(seed: number, params: GenerationParams = DEFAULT_GENERATION_PARAMS): Dataset {
  const g = params.grid;
  const n = g.nx * g.ny * g.nz;
  const ids = new Int32Array(n);
  const gridIndex = new Int32Array(n * 3);
  const before = new Float32Array(n * 3);
  const size = new Float32Array(n * 3);
  const density = new Float32Array(n);
  const grade = new Float32Array(n);
  const geoClass = new Uint8Array(n);

  const o = params.oreBody;
  const gradeSeed = (seed ^ 0x51ed270b) >>> 0;
  const densitySeed = (seed ^ 0x2f6b9a13) >>> 0;
  const ns = 1 / o.noiseScale;

  let i = 0;
  for (let iz = 0; iz < g.nz; iz++) {
    for (let iy = 0; iy < g.ny; iy++) {
      for (let ix = 0; ix < g.nx; ix++, i++) {
        const x = g.origin[0] + (ix + 0.5) * g.blockSize;
        const y = g.origin[1] + (iy + 0.5) * g.blockSize;
        const z = g.origin[2] + (iz + 0.5) * g.blockSize;
        ids[i] = ix + g.nx * (iy + g.ny * iz);
        gridIndex[i * 3] = ix;
        gridIndex[i * 3 + 1] = iy;
        gridIndex[i * 3 + 2] = iz;
        before[i * 3] = x;
        before[i * 3 + 1] = y;
        before[i * 3 + 2] = z;
        size[i * 3] = g.blockSize;
        size[i * 3 + 1] = g.blockSize;
        size[i * 3 + 2] = g.blockSize;

        // Distance is perturbed by low-frequency noise so the body boundary is irregular.
        const warp = 0.18 * valueNoise3(gradeSeed + 7, x * ns * 0.6, y * ns * 0.6, z * ns * 0.6);
        const r = ellipsoidDistance(params, x, y, z) * (1 + warp);
        const body = o.peakGrade * Math.exp(-1.7 * r * r);
        const vein = veinGrade(params, x, y, z);
        const noise = fbm3(gradeSeed, x * ns, y * ns, z * ns, 3);
        const raw = (o.backgroundGrade + Math.max(body, vein)) * (1 + o.noiseAmplitude * noise);
        grade[i] = Math.max(0, raw);

        let cls: GeoClass = GeoClass.HostRock;
        if (r < 0.7) cls = GeoClass.Core;
        else if (vein > 0.5 * params.vein.grade && vein > body) cls = GeoClass.Vein;
        else if (r < 1.2) cls = GeoClass.Halo;
        geoClass[i] = cls;

        const baseDensity = cls === GeoClass.Core ? 2.85 : cls === GeoClass.Vein ? 2.9 : cls === GeoClass.Halo ? 2.74 : 2.65;
        density[i] = baseDensity + 0.03 * valueNoise3(densitySeed, x / 20, y / 20, z / 20);
      }
    }
  }

  const blockBounds = gridBounds(params);
  const after = computeAfterCenters(
    (seed ^ 0x1f83d9ab) >>> 0,
    params.movement,
    { blockBounds, faceCrestY: params.terrain.faceCrestY, floorZ: params.terrain.floorZ },
    before,
    size,
  );
  const blocks: BlockModel = { count: n, ids, gridIndex, before, after, size, density, grade, geoClass };
  const metadata: DatasetMetadata = {
    schemaVersion: SCHEMA_VERSION,
    generatorVersion: GENERATOR_VERSION,
    seed,
    units: { length: 'm', mass: 't', grade: 'g/t', density: 't/m3' },
    coordinateSystem: { kind: 'local', axes: 'X East, Y North, Z Up', handedness: 'right', epsg: null },
    blockBounds,
    finalBounds: boundsOf(after, size),
    params,
    provenance:
      'Synthetic data generated procedurally by Blast Movement Explorer. Not measured, not derived from any real mine. ' +
      'Movement is an illustrative procedural field, not a blast physics prediction. For demonstration only.',
  };
  return { metadata, blocks };
}

/** Terrain height bound to a dataset's parameters. */
export function terrainHeightFor(params: GenerationParams): (x: number, y: number) => number {
  const b = gridBounds(params);
  const max: [number, number] = [b.max[0], b.max[1]];
  return (x, y) => terrainHeight(params.terrain, max, x, y);
}
