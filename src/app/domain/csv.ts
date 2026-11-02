import { ScenarioResult } from './dig-analysis';

/** RFC 4180 quoting. */
export function csvCell(v: string | number | null): string {
  if (v === null) return '';
  const s = typeof v === 'number' ? String(v) : v;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const ANALYSIS_CSV_HEADER = [
  'scenario',
  'description',
  'endpoint',
  'region',
  'region_min_e_m',
  'region_max_e_m',
  'region_min_n_m',
  'region_max_n_m',
  'cutoff_g_per_t',
  'total_ore_t',
  'recovered_ore_t',
  'lost_ore_t',
  'extracted_waste_t',
  'extracted_total_t',
  'ore_loss_pct',
  'dilution_pct',
  'avg_extracted_grade_g_per_t',
  'extracted_blocks',
  'seed',
  'generator_version',
] as const;

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const r4 = (v: number | null) => (v === null ? null : Math.round(v * 10000) / 10000);

/** One row per scenario. N/A ratios are empty cells. Values are rounded for readability. */
export function analysisCsv(results: readonly ScenarioResult[], cutoff: number, seed: number, generatorVersion: string): string {
  const rows: (string | number | null)[][] = [[...ANALYSIS_CSV_HEADER]];
  for (const s of results) {
    const r = s.region;
    const m = s.metrics;
    rows.push([
      s.id,
      s.label,
      s.endpoint,
      s.regionKind,
      r3(r.centerE - r.width / 2),
      r3(r.centerE + r.width / 2),
      r3(r.centerN - r.length / 2),
      r3(r.centerN + r.length / 2),
      cutoff,
      r3(m.totalOreTonnes),
      r3(m.recoveredOreTonnes),
      r3(m.lostOreTonnes),
      r3(m.extractedWasteTonnes),
      r3(m.extractedTotalTonnes),
      r4(m.oreLossPercent),
      r4(m.dilutionPercent),
      r4(m.averageExtractedGrade),
      m.extractedBlockCount,
      seed,
      generatorVersion,
    ]);
  }
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
