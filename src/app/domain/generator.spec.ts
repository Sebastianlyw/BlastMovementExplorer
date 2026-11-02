import { blockTonnes, buildIdIndex, getBlock, isOre, tonnesOf } from './blocks';
import { DEFAULT_GENERATION_PARAMS, DEFAULT_SEED, generateDataset, terrainHeightFor } from './generator';
import { fbm3, mulberry32, valueNoise3 } from './random';

describe('random', () => {
  it('mulberry32 is deterministic per seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const c = mulberry32(43);
    const seqA = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(seqA);
    expect([c(), c(), c()]).not.toEqual(seqA);
  });

  it('value noise is continuous and bounded', () => {
    let maxStep = 0;
    for (let i = 0; i < 1000; i++) {
      const x = i * 0.01;
      const v = valueNoise3(7, x, 1.3, 2.7);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
      maxStep = Math.max(maxStep, Math.abs(valueNoise3(7, x + 0.01, 1.3, 2.7) - v));
    }
    // A 0.01 step in a unit-wavelength C2 noise cannot jump by more than a few percent.
    expect(maxStep).toBeLessThan(0.05);
    expect(Math.abs(fbm3(7, 0.5, 0.5, 0.5))).toBeLessThanOrEqual(1);
  });
});

describe('generateDataset (default)', () => {
  const d = generateDataset(DEFAULT_SEED);
  const b = d.blocks;

  it('has 60 × 40 × 12 blocks with unique ids', () => {
    expect(b.count).toBe(28_800);
    expect(new Set(b.ids).size).toBe(28_800);
    expect(buildIdIndex(b).size).toBe(28_800);
  });

  it('places every centre inside the declared extents', () => {
    const { min, max } = d.metadata.blockBounds;
    expect(min).toEqual([0, 0, 0]);
    expect(max).toEqual([120, 80, 24]);
    for (let i = 0; i < b.count; i++) {
      for (let k = 0; k < 3; k++) {
        const v = b.before[i * 3 + k];
        expect(v > min[k] && v < max[k]).toBe(true);
      }
    }
  });

  it('contains no NaN, Infinity, negative grade or non-positive density/size', () => {
    let bad = 0;
    for (let i = 0; i < b.count; i++) {
      if (!Number.isFinite(b.grade[i]) || b.grade[i] < 0) bad++;
      if (!Number.isFinite(b.density[i]) || b.density[i] <= 0) bad++;
      for (let k = 0; k < 3; k++) {
        if (!Number.isFinite(b.before[i * 3 + k])) bad++;
        if (!(b.size[i * 3 + k] > 0)) bad++;
      }
    }
    expect(bad).toBe(0);
  });

  it('is deterministic for the same seed and params', () => {
    const again = generateDataset(DEFAULT_SEED, DEFAULT_GENERATION_PARAMS);
    expect(again.blocks.grade).toEqual(b.grade);
    expect(again.blocks.density).toEqual(b.density);
    expect(again.blocks.before).toEqual(b.before);
    expect(again.blocks.geoClass).toEqual(b.geoClass);
    expect(again.metadata).toEqual(d.metadata);
  });

  it('changes grades for a different seed', () => {
    const other = generateDataset(DEFAULT_SEED + 1);
    let differing = 0;
    for (let i = 0; i < b.count; i++) if (other.blocks.grade[i] !== b.grade[i]) differing++;
    expect(differing).toBeGreaterThan(b.count / 2);
  });

  it('has a spatially coherent grade field', () => {
    const nx = 60;
    let adj = 0;
    let adjN = 0;
    for (let i = 0; i < b.count; i++) {
      if (b.gridIndex[i * 3] < nx - 1) {
        adj += Math.abs(b.grade[i] - b.grade[i + 1]);
        adjN++;
      }
    }
    const rnd = mulberry32(1);
    let pair = 0;
    const pairs = 20_000;
    for (let k = 0; k < pairs; k++) {
      const i = Math.floor(rnd() * b.count);
      const j = Math.floor(rnd() * b.count);
      pair += Math.abs(b.grade[i] - b.grade[j]);
    }
    expect(adj / adjN).toBeLessThan(0.5 * (pair / pairs));
  });

  it('has both ore and waste at the demo cutoff 0.8 g/t', () => {
    let ore = 0;
    for (let i = 0; i < b.count; i++) if (isOre(b.grade[i], 0.8)) ore++;
    expect(ore).toBeGreaterThan(0);
    expect(ore).toBeLessThan(b.count);
  });

  it('keeps every block below the pre-blast terrain surface', () => {
    const h = terrainHeightFor(d.metadata.params);
    for (let i = 0; i < b.count; i++) {
      const top = b.before[i * 3 + 2] + b.size[i * 3 + 2] / 2;
      expect(h(b.before[i * 3], b.before[i * 3 + 1])).toBeGreaterThanOrEqual(top - 1e-6);
    }
  });

  it('declares synthetic local coordinates in metadata', () => {
    expect(d.metadata.coordinateSystem).toEqual({
      kind: 'local',
      axes: 'X East, Y North, Z Up',
      handedness: 'right',
      epsg: null,
    });
    expect(d.metadata.provenance.toLowerCase()).toContain('synthetic');
    expect(JSON.parse(JSON.stringify(d.metadata.params))).toEqual(d.metadata.params);
  });

  it('getBlock returns a record consistent with the arrays', () => {
    const blk = getBlock(b, 1234);
    expect(blk.id).toBe(b.ids[1234]);
    expect(blk.gradeGramsPerTonne).toBe(b.grade[1234]);
    expect(blk.tonnes).toBeCloseTo(8 * b.density[1234], 10);
    expect(blockTonnes(b, 1234)).toBe(blk.tonnes);
  });
});

describe('hand-checked fixtures', () => {
  it('a 2 m block at 2.7 t/m³ weighs 21.6 t', () => {
    expect(tonnesOf(2, 2, 2, 2.7)).toBeCloseTo(21.6, 12);
  });

  it('grade equal to cutoff is ore, just below is waste', () => {
    expect(isOre(0.8, 0.8)).toBe(true);
    expect(isOre(0.7999, 0.8)).toBe(false);
  });
});
