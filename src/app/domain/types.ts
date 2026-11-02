/**
 * Domain types for the synthetic dataset.
 *
 * Coordinate convention (shared by every module):
 *   local mine coordinates, X = East, Y = North, Z = Up, metres, right-handed.
 *   There is no geodetic datum / EPSG code — the data is synthetic.
 */

export const SCHEMA_VERSION = 1;
export const GENERATOR_VERSION = '1.0.0';

export type Vec3 = readonly [number, number, number];

export interface Bounds3 {
  readonly min: Vec3;
  readonly max: Vec3;
}

/** Regular block grid. Block (ix, iy, iz) has centre origin + (i + 0.5) * blockSize. */
export interface GridParams {
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
  /** Block edge length in metres. */
  readonly blockSize: number;
  /** Minimum corner of the grid, metres. */
  readonly origin: Vec3;
}

export interface OreBodyParams {
  /** Ellipsoid centre, metres. */
  readonly center: Vec3;
  /** Semi-axes along strike, across strike and normal to the dipping plane, metres. */
  readonly radii: Vec3;
  /** Strike azimuth measured counter-clockwise from +X (East), degrees. */
  readonly strikeDeg: number;
  /** Dip of the ellipsoid about its strike axis, degrees. */
  readonly dipDeg: number;
  /** Grade at the ellipsoid centre before noise, g/t. */
  readonly peakGrade: number;
  /** Grade far from any mineralisation, g/t. */
  readonly backgroundGrade: number;
  /** Relative amplitude of multiplicative grade noise (0–0.5). */
  readonly noiseAmplitude: number;
  /** Noise wavelength, metres. */
  readonly noiseScale: number;
}

export interface VeinParams {
  readonly enabled: boolean;
  /** A point on the vein plane, metres. */
  readonly point: Vec3;
  /** Strike azimuth of the vein plane, CCW from +X, degrees. */
  readonly strikeDeg: number;
  /** Vein half-thickness, metres. */
  readonly halfWidth: number;
  /** Peak vein grade, g/t. */
  readonly grade: number;
  /** Half-length along strike before the vein tapers out, metres. */
  readonly halfLength: number;
}

export interface TerrainParams {
  /** Elevation of the blast bench top (= top of the block model), metres. */
  readonly benchTopZ: number;
  /** Elevation of the lower floor in front of the free face, metres. */
  readonly floorZ: number;
  /** Northing of the vertical free face (south side of the blast bench), metres. */
  readonly faceCrestY: number;
  /** Height of the surrounding pit walls above the bench, metres. */
  readonly wallHeight: number;
  /** Surface extent (larger than the block model), metres. */
  readonly extent: Bounds3;
}

export interface GenerationParams {
  readonly grid: GridParams;
  readonly oreBody: OreBodyParams;
  readonly vein: VeinParams;
  readonly terrain: TerrainParams;
}

/** Geological class, fixed at generation. Independent of the economic (cutoff) class. */
export const GeoClass = {
  HostRock: 0,
  Halo: 1,
  Core: 2,
  Vein: 3,
} as const;
export type GeoClass = (typeof GeoClass)[keyof typeof GeoClass];

export const GEO_CLASS_LABELS: Readonly<Record<number, string>> = {
  [GeoClass.HostRock]: 'Host rock',
  [GeoClass.Halo]: 'Mineralised halo',
  [GeoClass.Core]: 'Ore-zone core',
  [GeoClass.Vein]: 'Narrow vein',
};

export interface DatasetMetadata {
  readonly schemaVersion: number;
  readonly generatorVersion: string;
  readonly seed: number;
  readonly units: {
    readonly length: 'm';
    readonly mass: 't';
    readonly grade: 'g/t';
    readonly density: 't/m3';
  };
  readonly coordinateSystem: {
    readonly kind: 'local';
    readonly axes: 'X East, Y North, Z Up';
    readonly handedness: 'right';
    readonly epsg: null;
  };
  readonly blockBounds: Bounds3;
  readonly params: GenerationParams;
  readonly provenance: string;
}

/**
 * Authoritative block model, structure-of-arrays.
 * Index i addresses the i-th block; ids[i] is its stable identifier.
 * Arrays are never mutated after generation.
 */
export interface BlockModel {
  readonly count: number;
  readonly ids: Int32Array;
  /** Grid indices (ix, iy, iz) interleaved, length 3N. */
  readonly gridIndex: Int32Array;
  /** Pre-movement block centres (x, y, z) interleaved, length 3N, metres. */
  readonly before: Float32Array;
  /** True block dimensions (dx, dy, dz) interleaved, length 3N, metres. */
  readonly size: Float32Array;
  /** t/m³ */
  readonly density: Float32Array;
  /** g/t */
  readonly grade: Float32Array;
  readonly geoClass: Uint8Array;
}

/** Plain record view of one block (for the inspector, exports and tests). */
export interface Block {
  readonly id: number;
  readonly gridIndex: Vec3;
  readonly centerBefore: Vec3;
  readonly size: Vec3;
  readonly densityTonnesPerM3: number;
  readonly gradeGramsPerTonne: number;
  readonly geoClass: GeoClass;
  readonly tonnes: number;
}

export interface Dataset {
  readonly metadata: DatasetMetadata;
  readonly blocks: BlockModel;
}
