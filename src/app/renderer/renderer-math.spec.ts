import { GRADE_SCALE, sampleScale } from './colormap';
import { pickNearest, rayAabb } from './picking';
import { WorldFrame } from './world-frame';

describe('WorldFrame', () => {
  const frame = WorldFrame.centeredOn({ min: [0, 0, 0], max: [120, 80, 24] });

  it('translates only — axes are never swapped', () => {
    expect(frame.toRender([60, 40, 0])).toEqual([0, 0, 0]);
    // +X East stays +x, +Y North stays +y, +Z Up stays +z.
    expect(frame.toRender([61, 40, 0])).toEqual([1, 0, 0]);
    expect(frame.toRender([60, 41, 0])).toEqual([0, 1, 0]);
    expect(frame.toRender([60, 40, 1])).toEqual([0, 0, 1]);
  });

  it('round-trips domain → render → domain', () => {
    for (const p of [
      [0, 0, 0],
      [120, 80, 24],
      [13.25, -7.5, 3.125],
    ] as const) {
      expect(frame.toDomain(frame.toRender(p))).toEqual([...p]);
    }
  });

  it('converts interleaved buffers consistently with points', () => {
    const buf = frame.bufferToRender([1, 2, 3, 119, 79, 23]);
    expect(Array.from(buf)).toEqual([...frame.toRender([1, 2, 3]), ...frame.toRender([119, 79, 23])]);
  });
});

describe('picking', () => {
  const down = { origin: [0, 0, 100] as const, dir: [0, 0, -1] as const };

  it('ray hits a box from above at its top face', () => {
    expect(rayAabb(down, 0, 0, 0, 1, 1, 1)).toBeCloseTo(99, 10);
  });

  it('ray misses a box beside it', () => {
    expect(rayAabb(down, 5, 0, 0, 1, 1, 1)).toBe(Infinity);
  });

  it('box behind the ray origin is not hit', () => {
    expect(rayAabb({ origin: [0, 0, -10], dir: [0, 0, -1] }, 0, 0, 0, 1, 1, 1)).toBe(Infinity);
  });

  it('returns the nearest of stacked boxes', () => {
    const before = new Float32Array([0, 0, 0, 0, 0, 4, 0, 0, 8]);
    const half = new Float32Array(9).fill(1);
    expect(pickNearest(down, { count: 3, before, after: before, halfSize: half, t: 0 })).toBe(2);
  });

  it('uses the interpolated position for t', () => {
    const before = new Float32Array([0, 0, 0]);
    const after = new Float32Array([10, 0, 0]);
    const half = new Float32Array(3).fill(1);
    const rayAt10 = { origin: [10, 0, 100] as const, dir: [0, 0, -1] as const };
    expect(pickNearest(rayAt10, { count: 1, before, after, halfSize: half, t: 0 })).toBe(-1);
    expect(pickNearest(rayAt10, { count: 1, before, after, halfSize: half, t: 1 })).toBe(0);
  });

  it('skips instances rejected by the visibility predicate', () => {
    const before = new Float32Array([0, 0, 0, 0, 0, 8]);
    const half = new Float32Array(6).fill(1);
    const below5 = (_x: number, _y: number, z: number) => z <= 5;
    expect(pickNearest(down, { count: 2, before, after: before, halfSize: half, t: 0, isVisibleAt: below5 })).toBe(0);
  });
});

describe('colour scale', () => {
  it('clamps outside the fixed domain', () => {
    expect(sampleScale(GRADE_SCALE, -1)).toEqual(sampleScale(GRADE_SCALE, 0));
    expect(sampleScale(GRADE_SCALE, 99)).toEqual(sampleScale(GRADE_SCALE, GRADE_SCALE.max));
    expect(sampleScale(GRADE_SCALE, Number.NaN)).toEqual(sampleScale(GRADE_SCALE, 0));
  });

  it('is monotonic in luminance (sequential scale)', () => {
    let prev = -1;
    for (let g = 0; g <= 3; g += 0.25) {
      const [r, gr, b] = sampleScale(GRADE_SCALE, g);
      const lum = 0.2126 * r + 0.7152 * gr + 0.0722 * b;
      expect(lum).toBeGreaterThan(prev);
      prev = lum;
    }
  });
});
