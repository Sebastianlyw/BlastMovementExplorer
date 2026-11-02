import { DigRegion } from './dig-analysis';
import { GradeFilter } from './filtering';
import { MovementParams, validateMovementParams } from './movement';
import { GENERATOR_VERSION, GenerationParams } from './types';

export const CONFIG_FORMAT = 'blast-movement-explorer/scene-config';
export const CONFIG_SCHEMA_VERSION = 1;
export const MAX_CONFIG_BYTES = 256 * 1024;
export const CUTOFF_RANGE: readonly [number, number] = [0, 10];

export interface DisplaySettings {
  readonly colorMode: 'grade' | 'displacement';
  readonly layers: { readonly blocks: boolean; readonly terrain: boolean; readonly pointCloud: boolean };
  readonly gradeFilter: GradeFilter;
  readonly section: { readonly enabled: boolean; readonly z: number };
  readonly movementT: number;
  readonly quality: 'high' | 'medium' | 'low';
  readonly pointDensity: '100k' | '300k' | '1m';
  readonly pointSize: number;
  readonly pointColorMode: 'height' | 'natural';
}

export interface SceneConfig {
  readonly format: typeof CONFIG_FORMAT;
  readonly schemaVersion: number;
  readonly generatorVersion: string;
  readonly scene: {
    readonly presetId: string;
    readonly seed: number;
    readonly generation: GenerationParams;
  };
  readonly cutoff: number;
  readonly regions: { readonly original: DigRegion; readonly adjusted: DigRegion };
  readonly display: DisplaySettings;
  readonly note: string;
}

export type ParseResult = { readonly ok: true; readonly config: SceneConfig } | { readonly ok: false; readonly errors: string[] };

export function serializeConfig(config: SceneConfig): string {
  return JSON.stringify(config, null, 2);
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function finite(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Structural deep equality for JSON-like values (key order independent). */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => jsonEqual(v, b[i]));
  if (isObj(a) && isObj(b)) {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => k in b && jsonEqual(a[k], b[k]));
  }
  return false;
}

function checkRegion(name: string, r: unknown, errors: string[]): void {
  if (!isObj(r)) {
    errors.push(`regions.${name} is missing`);
    return;
  }
  for (const k of ['centerE', 'centerN', 'width', 'length'] as const) {
    if (!finite(r[k])) errors.push(`regions.${name}.${k} must be a finite number`);
    else if (Math.abs(r[k]) > 10_000) errors.push(`regions.${name}.${k} is outside ±10000 m`);
  }
  for (const k of ['width', 'length'] as const) {
    if (finite(r[k]) && r[k] <= 0) errors.push(`regions.${name}.${k} must be > 0`);
  }
}

/**
 * Parse and validate a configuration file's text. Never throws.
 * `presetParams` resolves a preset id to its generation parameters.
 */
export function parseConfig(text: string, presetParams: (id: string) => GenerationParams | undefined): ParseResult {
  const errors: string[] = [];
  if (new Blob([text]).size > MAX_CONFIG_BYTES) return { ok: false, errors: [`File is larger than ${MAX_CONFIG_BYTES / 1024} kB`] };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['File is not valid JSON'] };
  }
  if (!isObj(raw)) return { ok: false, errors: ['Configuration must be a JSON object'] };
  if (raw['format'] !== CONFIG_FORMAT) return { ok: false, errors: [`format must be "${CONFIG_FORMAT}"`] };
  if (raw['schemaVersion'] !== CONFIG_SCHEMA_VERSION) return { ok: false, errors: [`Unsupported schemaVersion ${String(raw['schemaVersion'])} (expected ${CONFIG_SCHEMA_VERSION})`] };
  if (raw['generatorVersion'] !== GENERATOR_VERSION)
    return { ok: false, errors: [`generatorVersion ${String(raw['generatorVersion'])} does not match this app (${GENERATOR_VERSION}); the dataset would differ`] };

  const scene = raw['scene'];
  if (!isObj(scene)) errors.push('scene is missing');
  else {
    if (typeof scene['presetId'] !== 'string') errors.push('scene.presetId must be a string');
    if (!finite(scene['seed']) || !Number.isInteger(scene['seed']) || scene['seed'] < 0 || scene['seed'] > 0xffffffff)
      errors.push('scene.seed must be an integer in [0, 4294967295]');
    const gen = scene['generation'];
    if (!isObj(gen)) errors.push('scene.generation is missing');
    else {
      if (!isObj(gen['movement'])) errors.push('scene.generation.movement is missing');
      else errors.push(...validateMovementParams(gen['movement']));
      const preset = typeof scene['presetId'] === 'string' ? presetParams(scene['presetId']) : undefined;
      if (typeof scene['presetId'] === 'string' && !preset) errors.push(`Unknown scene.presetId "${scene['presetId']}"`);
      if (preset) {
        const { movement: _m, ...presetRest } = preset;
        const { movement: _n, ...fileRest } = gen;
        if (!jsonEqual(presetRest, fileRest))
          errors.push('scene.generation (other than movement) must match the preset; custom generation parameters are not supported');
      }
    }
  }

  if (!finite(raw['cutoff']) || raw['cutoff'] < CUTOFF_RANGE[0] || raw['cutoff'] > CUTOFF_RANGE[1])
    errors.push(`cutoff must be a number in [${CUTOFF_RANGE[0]}, ${CUTOFF_RANGE[1]}]`);

  const regions = raw['regions'];
  if (!isObj(regions)) errors.push('regions is missing');
  else {
    checkRegion('original', regions['original'], errors);
    checkRegion('adjusted', regions['adjusted'], errors);
  }

  const d = raw['display'];
  if (!isObj(d)) errors.push('display is missing');
  else {
    if (d['colorMode'] !== 'grade' && d['colorMode'] !== 'displacement') errors.push('display.colorMode must be "grade" or "displacement"');
    const layers = d['layers'];
    if (!isObj(layers) || ['blocks', 'terrain', 'pointCloud'].some((k) => typeof layers[k] !== 'boolean'))
      errors.push('display.layers must have boolean blocks, terrain and pointCloud');
    const f = d['gradeFilter'];
    if (!isObj(f) || !finite(f['minGrade']) || !finite(f['maxGrade']) || typeof f['oreOnly'] !== 'boolean')
      errors.push('display.gradeFilter must have numeric minGrade/maxGrade and boolean oreOnly');
    else if (f['minGrade'] < 0 || f['maxGrade'] > 100 || f['minGrade'] > f['maxGrade'])
      errors.push('display.gradeFilter range must satisfy 0 ≤ minGrade ≤ maxGrade ≤ 100');
    const s = d['section'];
    if (!isObj(s) || typeof s['enabled'] !== 'boolean' || !finite(s['z']) || Math.abs(s['z']) > 1000)
      errors.push('display.section must have boolean enabled and a z within ±1000 m');
    if (!finite(d['movementT']) || d['movementT'] < 0 || d['movementT'] > 1) errors.push('display.movementT must be in [0, 1]');
    if (!['high', 'medium', 'low'].includes(d['quality'] as string)) errors.push('display.quality must be high, medium or low');
    if (!['100k', '300k', '1m'].includes(d['pointDensity'] as string)) errors.push('display.pointDensity must be 100k, 300k or 1m');
    if (!finite(d['pointSize']) || d['pointSize'] < 1 || d['pointSize'] > 8) errors.push('display.pointSize must be in [1, 8]');
    if (d['pointColorMode'] !== 'height' && d['pointColorMode'] !== 'natural') errors.push('display.pointColorMode must be "height" or "natural"');
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, config: raw as unknown as SceneConfig };
}

/** Movement parameters of a validated config. */
export function configMovement(c: SceneConfig): MovementParams {
  return c.scene.generation.movement;
}
