import { computeDigMetrics, computeScenarios, deriveOriginalRegion, DigRegion, meanOreDisplacement, regionContains } from './dig-analysis';
import { analysisCsv, csvCell } from './csv';
import { buildVisibilityMask, NO_GRADE_FILTER } from './filtering';
import { DEFAULT_SEED, generateDataset } from './generator';

/** Hand-built blocks: unit cubes (1 m³) so tonnes = density. */
function fixture(blocks: { x: number; y: number; grade: number; density?: number }[]) {
  const n = blocks.length;
  const centers = new Float32Array(n * 3);
  const size = new Float32Array(n * 3).fill(1);
  const grade = new Float32Array(n);
  const density = new Float32Array(n);
  blocks.forEach((b, i) => {
    centers.set([b.x, b.y, 0.5], i * 3);
    grade[i] = b.grade;
    density[i] = b.density ?? 1;
  });
  return { count: n, grade, density, size, centers };
}

const region = (minE: number, maxE: number, minN: number, maxN: number): DigRegion => ({
  centerE: (minE + maxE) / 2,
  centerN: (minN + maxN) / 2,
  width: maxE - minE,
  length: maxN - minN,
});

describe('dig region inclusion', () => {
  it('includes centres on the boundary', () => {
    const r = region(10, 20, 0, 5);
    expect(regionContains(r, 20, 2)).toBe(true);
    expect(regionContains(r, 10, 0)).toBe(true);
    expect(regionContains(r, 20.0001, 2)).toBe(false);
  });
});

describe('computeDigMetrics (hand-checked)', () => {
  // Grades 2, 1, 0.5 g/t at E = 0, 1, 2; cutoff 1; region covers E ∈ [0.5, 2.5] → blocks 2 and 3.
  const f = fixture([
    { x: 0, y: 0, grade: 2 },
    { x: 1, y: 0, grade: 1 },
    { x: 2, y: 0, grade: 0.5 },
  ]);

  it('matches the spec example', () => {
    const m = computeDigMetrics(f, f.centers, 1, region(0.5, 2.5, -1, 1));
    expect(m.totalOreTonnes).toBe(2);
    expect(m.recoveredOreTonnes).toBe(1);
    expect(m.lostOreTonnes).toBe(1);
    expect(m.extractedWasteTonnes).toBe(1);
    expect(m.extractedTotalTonnes).toBe(2);
    expect(m.oreLossPercent).toBe(50);
    expect(m.dilutionPercent).toBe(50);
    expect(m.averageExtractedGrade).toBe(0.75);
    expect(m.extractedBlockCount).toBe(2);
  });

  it('weights grade by tonnes', () => {
    const g = fixture([
      { x: 0, y: 0, grade: 3, density: 3 },
      { x: 1, y: 0, grade: 1, density: 1 },
    ]);
    // (3·3 + 1·1) / (3 + 1) = 2.5
    expect(computeDigMetrics(g, g.centers, 0.8, region(-1, 2, -1, 1)).averageExtractedGrade).toBe(2.5);
  });

  it('empty region gives N/A ratios, not 0 or NaN', () => {
    const m = computeDigMetrics(f, f.centers, 1, region(100, 101, 100, 101));
    expect(m.extractedTotalTonnes).toBe(0);
    expect(m.dilutionPercent).toBeNull();
    expect(m.averageExtractedGrade).toBeNull();
    expect(m.oreLossPercent).toBe(100);
  });

  it('no ore gives N/A ore loss', () => {
    const m = computeDigMetrics(f, f.centers, 10, region(-1, 3, -1, 1));
    expect(m.totalOreTonnes).toBe(0);
    expect(m.oreLossPercent).toBeNull();
    expect(m.dilutionPercent).toBe(100);
  });

  it('full extraction loses nothing', () => {
    const m = computeDigMetrics(f, f.centers, 1, region(-10, 10, -10, 10));
    expect(m.lostOreTonnes).toBe(0);
    expect(m.oreLossPercent).toBe(0);
    expect(m.extractedTotalTonnes).toBe(3);
  });

  it('cutoff equality counts as ore', () => {
    const m = computeDigMetrics(f, f.centers, 0.5, region(1.5, 2.5, -1, 1));
    expect(m.recoveredOreTonnes).toBe(1);
    expect(m.extractedWasteTonnes).toBe(0);
  });
});

describe('scenarios on the default dataset', () => {
  const d = generateDataset(DEFAULT_SEED);
  const b = d.blocks;
  const original = deriveOriginalRegion(b, 0.8, [0, 0], 2)!;

  it('derives an original region on the block grid that covers most ore', () => {
    for (const v of [original.centerE - original.width / 2, original.centerE + original.width / 2, original.centerN - original.length / 2, original.centerN + original.length / 2]) {
      expect(v % 2).toBe(0);
    }
    const a = computeDigMetrics(b, b.before, 0.8, original);
    expect(a.oreLossPercent!).toBeLessThan(25);
  });

  it('movement changes B relative to A; totals are conserved', () => {
    const [A, B, C] = computeScenarios(b, 0.8, original, original);
    expect(A.metrics.totalOreTonnes).toBe(B.metrics.totalOreTonnes);
    expect(B.metrics.lostOreTonnes).not.toBe(A.metrics.lostOreTonnes);
    expect(C.metrics).toEqual(B.metrics); // adjusted == original → same as B
  });

  it('cutoff changes metrics', () => {
    const lo = computeDigMetrics(b, b.after, 0.5, original);
    const hi = computeDigMetrics(b, b.after, 1.5, original);
    expect(hi.totalOreTonnes).toBeLessThan(lo.totalOreTonnes);
  });

  it('mean ore displacement points toward the free face (south)', () => {
    const m = meanOreDisplacement(b, 0.8)!;
    expect(m.dN).toBeLessThan(0);
  });
});

describe('visibility mask', () => {
  it('applies inclusive range and ore-only with cutoff equality', () => {
    const grade = [0.2, 0.8, 1.5, 5];
    expect(Array.from(buildVisibilityMask(grade, NO_GRADE_FILTER, 0.8))).toEqual([1, 1, 1, 1]);
    expect(Array.from(buildVisibilityMask(grade, { minGrade: 0.8, maxGrade: 1.5, oreOnly: false }, 0.8))).toEqual([0, 1, 1, 0]);
    expect(Array.from(buildVisibilityMask(grade, { ...NO_GRADE_FILTER, oreOnly: true }, 0.8))).toEqual([0, 1, 1, 1]);
  });
});

describe('CSV', () => {
  it('quotes cells that need it', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell(null)).toBe('');
  });

  it('writes N/A as empty cells and one row per scenario', () => {
    const f = fixture([{ x: 0, y: 0, grade: 2 }]);
    const r = region(10, 11, 10, 11);
    const metrics = computeDigMetrics(f, f.centers, 1, r);
    const csv = analysisCsv([{ id: 'A', label: 'Before movement + original dig region', endpoint: 'before', regionKind: 'original', region: r, metrics }], 1, 7, '1.1.0');
    const lines = csv.trim().split('\r\n');
    expect(lines.length).toBe(2);
    const cells = lines[1].split(',');
    expect(cells[0]).toBe('A');
    expect(cells[14]).toBe('100'); // ore loss
    expect(cells[15]).toBe(''); // dilution N/A
    expect(cells[16]).toBe(''); // grade N/A
  });
});
