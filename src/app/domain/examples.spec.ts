import fixture from '../../../examples/mini-block-fixture.json';
import defaultConfig from '../../../examples/scene-config.default.json';
import { computeDigMetrics } from './dig-analysis';
import { DEFAULT_GENERATION_PARAMS } from './generator';
import { parseConfig } from './scene-config';

describe('examples/', () => {
  it('mini-block-fixture.json: metrics equal the hand-computed values', () => {
    const n = fixture.blocks.length;
    const blocks = {
      count: n,
      grade: fixture.blocks.map((b) => b.grade),
      density: fixture.blocks.map((b) => b.density),
      size: fixture.blocks.flatMap((b) => b.size),
    };
    for (const endpoint of ['before', 'after'] as const) {
      const centers = fixture.blocks.flatMap((b) => b[endpoint]);
      const m = computeDigMetrics(blocks, centers, fixture.cutoff, fixture.region);
      const e = fixture.expected[endpoint];
      for (const key of Object.keys(e) as (keyof typeof e)[]) {
        expect(m[key], `${endpoint}.${key}`).toBeCloseTo(e[key], 9);
      }
    }
  });

  it('scene-config.default.json is a valid configuration', () => {
    const r = parseConfig(JSON.stringify(defaultConfig), (id) => (id === 'bench-a' ? DEFAULT_GENERATION_PARAMS : undefined));
    expect(r.ok ? [] : r.errors).toEqual([]);
  });
});
