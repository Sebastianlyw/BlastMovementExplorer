import { isOre } from './blocks';

/** View filter parameters. They affect drawing and picking only — never metrics. */
export interface GradeFilter {
  /** Inclusive grade range, g/t. */
  readonly minGrade: number;
  readonly maxGrade: number;
  /** Keep only blocks with grade ≥ cutoff. */
  readonly oreOnly: boolean;
}

export const NO_GRADE_FILTER: GradeFilter = { minGrade: 0, maxGrade: 10, oreOnly: false };

/** True when the filter can hide at least one block of a dataset whose highest grade is maxGradeInData. */
export function isFilterActive(f: GradeFilter, maxGradeInData: number): boolean {
  return f.oreOnly || f.minGrade > 0 || f.maxGrade < maxGradeInData;
}

/** mask[i] = 1 when block i passes the filter. */
export function buildVisibilityMask(grade: ArrayLike<number>, filter: GradeFilter, cutoff: number): Uint8Array {
  const mask = new Uint8Array(grade.length);
  for (let i = 0; i < grade.length; i++) {
    const g = grade[i];
    const inRange = g >= filter.minGrade && g <= filter.maxGrade;
    mask[i] = inRange && (!filter.oreOnly || isOre(g, cutoff)) ? 1 : 0;
  }
  return mask;
}

export function countVisible(mask: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < mask.length; i++) n += mask[i];
  return n;
}
