export type Quality = 'high' | 'medium' | 'low';

export interface QualitySettings {
  readonly label: string;
  readonly antialias: boolean;
  readonly maxPixelRatio: number;
}

/** Rendering quality presets. Changing antialias requires a new WebGL context. */
export const QUALITY_SETTINGS: Readonly<Record<Quality, QualitySettings>> = {
  high: { label: 'High (MSAA, DPR ≤ 2)', antialias: true, maxPixelRatio: 2 },
  medium: { label: 'Medium (MSAA, DPR ≤ 1.5)', antialias: true, maxPixelRatio: 1.5 },
  low: { label: 'Low (no MSAA, DPR 1)', antialias: false, maxPixelRatio: 1 },
};

/** Reads `?quality=high|medium|low`; defaults to high. */
export function initialQuality(search: string = globalThis.location?.search ?? ''): Quality {
  const q = new URLSearchParams(search).get('quality');
  return q === 'low' || q === 'medium' || q === 'high' ? q : 'high';
}

/** Reads `?points=100k|300k|1m` (shows the surface point cloud at that density). */
export function initialPointDensity(search: string = globalThis.location?.search ?? ''): '100k' | '300k' | '1m' | null {
  const p = new URLSearchParams(search).get('points');
  return p === '100k' || p === '300k' || p === '1m' ? p : null;
}

/** `?benchmark=auto` runs the benchmark once after the scene (and requested points) are ready. */
export function autoBenchmarkRequested(search: string = globalThis.location?.search ?? ''): boolean {
  return new URLSearchParams(search).get('benchmark') === 'auto';
}
