import { isOre, tonnesOf } from './blocks';

/**
 * Axis-aligned dig region in the XY plane, spanning the full vertical range.
 * A block is extracted when its CENTRE lies inside, boundaries inclusive.
 * This is a centre-point approximation — no partial-volume intersection.
 */
export interface DigRegion {
  readonly centerE: number;
  readonly centerN: number;
  /** Extent along E, metres. */
  readonly width: number;
  /** Extent along N, metres. */
  readonly length: number;
}

/** Minimal block data needed for metrics (the block model satisfies it). */
export interface MetricBlocks {
  readonly count: number;
  readonly grade: ArrayLike<number>;
  readonly density: ArrayLike<number>;
  readonly size: ArrayLike<number>;
}

/** Demo definitions. Ratios are null (shown as N/A) when their denominator is zero. */
export interface DigMetrics {
  readonly totalOreTonnes: number;
  readonly recoveredOreTonnes: number;
  readonly lostOreTonnes: number;
  readonly extractedWasteTonnes: number;
  readonly extractedTotalTonnes: number;
  readonly oreLossPercent: number | null;
  readonly dilutionPercent: number | null;
  readonly averageExtractedGrade: number | null;
  readonly extractedBlockCount: number;
}

export function regionContains(r: DigRegion, x: number, y: number): boolean {
  const hw = r.width / 2;
  const hl = r.length / 2;
  return x >= r.centerE - hw && x <= r.centerE + hw && y >= r.centerN - hl && y <= r.centerN + hl;
}

/**
 * Metrics over ALL blocks of the authoritative model at one movement endpoint.
 * `centers` must be the before or after centres, never an interpolated state.
 */
export function computeDigMetrics(blocks: MetricBlocks, centers: ArrayLike<number>, cutoff: number, region: DigRegion): DigMetrics {
  let totalOre = 0;
  let recoveredOre = 0;
  let waste = 0;
  let extracted = 0;
  let gradeTonnes = 0;
  let extractedCount = 0;
  for (let i = 0; i < blocks.count; i++) {
    const o = i * 3;
    const t = tonnesOf(blocks.size[o], blocks.size[o + 1], blocks.size[o + 2], blocks.density[i]);
    const g = blocks.grade[i];
    const ore = isOre(g, cutoff);
    if (ore) totalOre += t;
    if (regionContains(region, centers[o], centers[o + 1])) {
      extracted += t;
      gradeTonnes += g * t;
      extractedCount++;
      if (ore) recoveredOre += t;
      else waste += t;
    }
  }
  const lost = totalOre - recoveredOre;
  return {
    totalOreTonnes: totalOre,
    recoveredOreTonnes: recoveredOre,
    lostOreTonnes: lost,
    extractedWasteTonnes: waste,
    extractedTotalTonnes: extracted,
    oreLossPercent: totalOre > 0 ? (lost / totalOre) * 100 : null,
    dilutionPercent: extracted > 0 ? (waste / extracted) * 100 : null,
    averageExtractedGrade: extracted > 0 ? gradeTonnes / extracted : null,
    extractedBlockCount: extractedCount,
  };
}

export type ScenarioId = 'A' | 'B' | 'C';

export interface ScenarioResult {
  readonly id: ScenarioId;
  readonly label: string;
  readonly endpoint: 'before' | 'after';
  readonly regionKind: 'original' | 'adjusted';
  readonly region: DigRegion;
  readonly metrics: DigMetrics;
}

export const SCENARIO_LABELS: Readonly<Record<ScenarioId, string>> = {
  A: 'Before movement + original dig region',
  B: 'After movement + original dig region',
  C: 'After movement + adjusted dig region',
};

export function computeScenarios(
  blocks: MetricBlocks & { readonly before: ArrayLike<number>; readonly after: ArrayLike<number> },
  cutoff: number,
  original: DigRegion,
  adjusted: DigRegion,
): ScenarioResult[] {
  return [
    { id: 'A', label: SCENARIO_LABELS.A, endpoint: 'before', regionKind: 'original', region: original, metrics: computeDigMetrics(blocks, blocks.before, cutoff, original) },
    { id: 'B', label: SCENARIO_LABELS.B, endpoint: 'after', regionKind: 'original', region: original, metrics: computeDigMetrics(blocks, blocks.after, cutoff, original) },
    { id: 'C', label: SCENARIO_LABELS.C, endpoint: 'after', regionKind: 'adjusted', region: adjusted, metrics: computeDigMetrics(blocks, blocks.after, cutoff, adjusted) },
  ];
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[idx];
}

/**
 * Original dig region: 5th–95th percentile of pre-movement E and N of ore blocks,
 * snapped outward to the block grid. Returns null when there is no ore.
 * Called once per dataset and then frozen.
 */
export function deriveOriginalRegion(
  blocks: MetricBlocks & { readonly before: ArrayLike<number> },
  cutoff: number,
  gridOrigin: readonly [number, number],
  blockSize: number,
): DigRegion | null {
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < blocks.count; i++) {
    if (!isOre(blocks.grade[i], cutoff)) continue;
    xs.push(blocks.before[i * 3]);
    ys.push(blocks.before[i * 3 + 1]);
  }
  if (xs.length === 0) return null;
  xs.sort((a, b) => a - b);
  ys.sort((a, b) => a - b);
  const snapDown = (v: number, o: number) => o + Math.floor((v - o) / blockSize) * blockSize;
  const snapUp = (v: number, o: number) => o + Math.ceil((v - o) / blockSize) * blockSize;
  // Percentiles are of block centres; extend by half a block so whole blocks are covered.
  const minE = snapDown(percentile(xs, 5) - blockSize / 2, gridOrigin[0]);
  const maxE = snapUp(percentile(xs, 95) + blockSize / 2, gridOrigin[0]);
  const minN = snapDown(percentile(ys, 5) - blockSize / 2, gridOrigin[1]);
  const maxN = snapUp(percentile(ys, 95) + blockSize / 2, gridOrigin[1]);
  return { centerE: (minE + maxE) / 2, centerN: (minN + maxN) / 2, width: maxE - minE, length: maxN - minN };
}

/**
 * Tonnage-weighted mean horizontal displacement of ore blocks (after − before).
 * Used by the "offset by mean ore displacement" helper; a heuristic, not an optimiser.
 */
export function meanOreDisplacement(
  blocks: MetricBlocks & { readonly before: ArrayLike<number>; readonly after: ArrayLike<number> },
  cutoff: number,
): { dE: number; dN: number } | null {
  let w = 0;
  let dE = 0;
  let dN = 0;
  for (let i = 0; i < blocks.count; i++) {
    if (!isOre(blocks.grade[i], cutoff)) continue;
    const o = i * 3;
    const t = tonnesOf(blocks.size[o], blocks.size[o + 1], blocks.size[o + 2], blocks.density[i]);
    dE += t * (blocks.after[o] - blocks.before[o]);
    dN += t * (blocks.after[o + 1] - blocks.before[o + 1]);
    w += t;
  }
  return w > 0 ? { dE: dE / w, dN: dN / w } : null;
}
