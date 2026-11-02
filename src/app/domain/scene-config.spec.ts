import { DEFAULT_GENERATION_PARAMS } from './generator';
import { CONFIG_FORMAT, CONFIG_SCHEMA_VERSION, parseConfig, SceneConfig, serializeConfig } from './scene-config';
import { GENERATOR_VERSION } from './types';

const presets = (id: string) => (id === 'bench-a' ? DEFAULT_GENERATION_PARAMS : undefined);

function validConfig(): SceneConfig {
  return {
    format: CONFIG_FORMAT,
    schemaVersion: CONFIG_SCHEMA_VERSION,
    generatorVersion: GENERATOR_VERSION,
    scene: { presetId: 'bench-a', seed: 20261103, generation: DEFAULT_GENERATION_PARAMS },
    cutoff: 0.8,
    regions: {
      original: { centerE: 50, centerN: 30, width: 60, length: 40 },
      adjusted: { centerE: 50, centerN: 26, width: 60, length: 40 },
    },
    display: {
      colorMode: 'grade',
      layers: { blocks: true, terrain: true, pointCloud: false },
      gradeFilter: { minGrade: 0, maxGrade: 10, oreOnly: false },
      section: { enabled: false, z: 12 },
      movementT: 0,
      quality: 'high',
      pointDensity: '100k',
      pointSize: 2,
    },
    note: 'test',
  };
}

function withPatch(patch: (c: Record<string, any>) => void): string {
  const c = JSON.parse(serializeConfig(validConfig()));
  patch(c);
  return JSON.stringify(c);
}

describe('scene config', () => {
  it('round-trips a valid config', () => {
    const r = parseConfig(serializeConfig(validConfig()), presets);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.config).toEqual(validConfig());
  });

  it('accepts reordered keys in generation params', () => {
    const text = withPatch((c) => {
      const g = c['scene']['generation'];
      c['scene']['generation'] = { movement: g.movement, terrain: g.terrain, vein: g.vein, oreBody: g.oreBody, grid: g.grid };
    });
    expect(parseConfig(text, presets).ok).toBe(true);
  });

  const cases: [string, string, string][] = [
    ['not JSON', '{oops', 'not valid JSON'],
    ['wrong format', withPatch((c) => (c['format'] = 'x')), 'format'],
    ['unknown schema version', withPatch((c) => (c['schemaVersion'] = 99)), 'schemaVersion'],
    ['other generator version', withPatch((c) => (c['generatorVersion'] = '0.9.0')), 'generatorVersion'],
    ['negative cutoff', withPatch((c) => (c['cutoff'] = -1)), 'cutoff'],
    ['missing regions', withPatch((c) => delete c['regions']), 'regions'],
    ['zero width', withPatch((c) => (c['regions']['adjusted']['width'] = 0)), 'regions.adjusted.width'],
    ['out-of-range movement', withPatch((c) => (c['scene']['generation']['movement']['throwMetres'] = 40)), 'movement.throwMetres'],
    ['unknown preset', withPatch((c) => (c['scene']['presetId'] = 'nope')), 'presetId'],
    ['edited grid', withPatch((c) => (c['scene']['generation']['grid']['nx'] = 10)), 'must match the preset'],
    ['bad seed', withPatch((c) => (c['scene']['seed'] = 1.5)), 'scene.seed'],
    ['bad t', withPatch((c) => (c['display']['movementT'] = 2)), 'movementT'],
    ['bad filter', withPatch((c) => (c['display']['gradeFilter']['minGrade'] = 20)), 'gradeFilter'],
  ];
  for (const [name, text, needle] of cases) {
    it(`rejects ${name}`, () => {
      const r = parseConfig(text, presets);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.join(' | ')).toContain(needle);
    });
  }

  it('rejects files over 256 kB', () => {
    const r = parseConfig(' '.repeat(300 * 1024), presets);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toContain('larger than');
  });
});
