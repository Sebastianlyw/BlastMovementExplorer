import { blockTonnes } from './blocks';
import { DEFAULT_GENERATION_PARAMS, DEFAULT_SEED, generateDataset } from './generator';
import { computeAfterCenters, DEFAULT_MOVEMENT_PARAMS, interpolate, validateMovementParams } from './movement';

describe('movement field', () => {
  const d = generateDataset(DEFAULT_SEED);
  const b = d.blocks;

  it('is deterministic', () => {
    expect(generateDataset(DEFAULT_SEED).blocks.after).toEqual(b.after);
  });

  it('preserves count, ids, grades, densities, sizes and total tonnes', () => {
    expect(b.after.length).toBe(b.before.length);
    const again = generateDataset(DEFAULT_SEED, { ...DEFAULT_GENERATION_PARAMS, movement: { ...DEFAULT_MOVEMENT_PARAMS, throwMetres: 0 } });
    // Grades/densities/ids do not depend on the movement parameters at all.
    expect(again.blocks.grade).toEqual(b.grade);
    expect(again.blocks.density).toEqual(b.density);
    expect(again.blocks.ids).toEqual(b.ids);
    let total = 0;
    for (let i = 0; i < b.count; i++) total += blockTonnes(b, i);
    let totalAgain = 0;
    for (let i = 0; i < again.blocks.count; i++) totalAgain += blockTonnes(again.blocks, i);
    expect(totalAgain).toBe(total);
  });

  it('produces visible but bounded displacement', () => {
    let maxH = 0;
    let maxV = 0;
    let sum = 0;
    for (let i = 0; i < b.count; i++) {
      const dx = b.after[i * 3] - b.before[i * 3];
      const dy = b.after[i * 3 + 1] - b.before[i * 3 + 1];
      const dz = b.after[i * 3 + 2] - b.before[i * 3 + 2];
      maxH = Math.max(maxH, Math.hypot(dx, dy));
      maxV = Math.max(maxV, Math.abs(dz));
      sum += Math.hypot(dx, dy, dz);
    }
    expect(sum / b.count).toBeGreaterThan(1); // visible
    expect(maxH).toBeLessThan(12); // not exaggerated
    expect(maxV).toBeLessThanOrEqual(DEFAULT_MOVEMENT_PARAMS.verticalMaxMetres + 1e-5);
  });

  it('is spatially continuous along E, N and Z', () => {
    const nx = 60;
    const ny = 40;
    const disp = (i: number) => [0, 1, 2].map((k) => b.after[i * 3 + k] - b.before[i * 3 + k]);
    let mag = 0;
    for (let i = 0; i < b.count; i++) mag += Math.hypot(...(disp(i) as [number, number, number]));
    mag /= b.count;
    for (const [axis, stride, last] of [
      [0, 1, nx - 1],
      [1, nx, ny - 1],
      [2, nx * ny, 11],
    ] as const) {
      let diff = 0;
      let n = 0;
      for (let i = 0; i < b.count; i++) {
        if (b.gridIndex[i * 3 + axis] === last) continue;
        const a = disp(i);
        const c = disp(i + stride);
        diff += Math.hypot(a[0] - c[0], a[1] - c[1], a[2] - c[2]);
        n++;
      }
      expect(diff / n, `axis ${axis}`).toBeLessThan(mag / 3);
    }
  });

  it('final bounds contain every moved block and nothing is removed', () => {
    const { min, max } = d.metadata.finalBounds;
    for (let i = 0; i < b.count; i++) {
      for (let k = 0; k < 3; k++) {
        const h = b.size[i * 3 + k] / 2;
        expect(b.after[i * 3 + k] - h).toBeGreaterThanOrEqual(min[k]);
        expect(b.after[i * 3 + k] + h).toBeLessThanOrEqual(max[k]);
      }
    }
    // Material thrown past the free face is kept, not deleted.
    expect(min[1]).toBeLessThan(0);
  });

  it('keeps moved blocks above the lower floor', () => {
    for (let i = 0; i < b.count; i++) expect(b.after[i * 3 + 2] - b.size[i * 3 + 2] / 2).toBeGreaterThanOrEqual(-1e-5);
  });

  it('respects a custom vertical bound', () => {
    const p = { ...DEFAULT_MOVEMENT_PARAMS, dropMetres: 4, verticalMaxMetres: 0.5 };
    const after = computeAfterCenters(1, p, { blockBounds: d.metadata.blockBounds, faceCrestY: 0, floorZ: 0 }, b.before, b.size);
    for (let i = 2; i < after.length; i += 3) expect(Math.abs(after[i] - b.before[i])).toBeLessThanOrEqual(0.5 + 1e-5);
  });
});

describe('movement parameter validation', () => {
  it('accepts defaults', () => {
    expect(validateMovementParams({ ...DEFAULT_MOVEMENT_PARAMS })).toEqual([]);
  });

  it('rejects out-of-range and non-numeric values without clamping', () => {
    const errs = validateMovementParams({ ...DEFAULT_MOVEMENT_PARAMS, throwMetres: 99, depthRatio: 'x' });
    expect(errs).toContain('movement.throwMetres = 99 is outside [0, 15]');
    expect(errs).toContain('movement.depthRatio must be a finite number');
    expect(() =>
      computeAfterCenters(1, { ...DEFAULT_MOVEMENT_PARAMS, throwMetres: 99 }, { blockBounds: { min: [0, 0, 0], max: [2, 2, 2] }, faceCrestY: 0, floorZ: 0 }, new Float32Array(3), new Float32Array(3).fill(2)),
    ).toThrow(RangeError);
  });
});

describe('movement interpolation', () => {
  it('returns the endpoints bit-exactly at t = 0 and t = 1', () => {
    const b = generateDataset(DEFAULT_SEED).blocks;
    for (let i = 0; i < b.before.length; i++) {
      expect(Object.is(interpolate(b.before[i], b.after[i], 0), b.before[i])).toBe(true);
      expect(Object.is(interpolate(b.before[i], b.after[i], 1), b.after[i])).toBe(true);
    }
  });

  it('interpolates between the endpoints', () => {
    const a = 0.1;
    const c = 0.7;
    expect(interpolate(a, c, 1)).toBe(c);
    expect(interpolate(a, c, 0.5)).toBeCloseTo(0.4, 15);
  });
});
