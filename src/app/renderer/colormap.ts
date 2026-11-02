/**
 * Sequential, colour-blind-safe colour scales with fixed domains.
 * Legends are driven by the same definitions, so filtering never re-scales colour.
 */

export interface ColorScale {
  readonly id: 'grade' | 'displacement';
  readonly label: string;
  readonly unit: string;
  readonly min: number;
  readonly max: number;
  /** RGB stops in [0, 1], evenly spaced. */
  readonly stops: readonly (readonly [number, number, number])[];
}

const VIRIDIS: readonly (readonly [number, number, number])[] = [
  [0.267, 0.005, 0.329],
  [0.283, 0.141, 0.458],
  [0.254, 0.265, 0.53],
  [0.207, 0.372, 0.553],
  [0.164, 0.471, 0.558],
  [0.128, 0.567, 0.551],
  [0.135, 0.659, 0.518],
  [0.267, 0.749, 0.441],
  [0.478, 0.821, 0.318],
  [0.741, 0.873, 0.15],
  [0.993, 0.906, 0.144],
];

const INFERNO: readonly (readonly [number, number, number])[] = [
  [0.001, 0.0, 0.014],
  [0.087, 0.045, 0.225],
  [0.258, 0.039, 0.406],
  [0.416, 0.09, 0.433],
  [0.578, 0.148, 0.404],
  [0.735, 0.216, 0.33],
  [0.865, 0.317, 0.226],
  [0.954, 0.469, 0.098],
  [0.988, 0.645, 0.04],
  [0.964, 0.837, 0.212],
  [0.988, 0.998, 0.645],
];

/** Grade scale: fixed 0–3 g/t, values above are clamped and shown as "≥ 3.0". */
export const GRADE_SCALE: ColorScale = {
  id: 'grade',
  label: 'Grade',
  unit: 'g/t',
  min: 0,
  max: 3,
  stops: VIRIDIS,
};

/** Displacement magnitude scale, fixed 0–12 m. */
export const DISPLACEMENT_SCALE: ColorScale = {
  id: 'displacement',
  label: 'Displacement magnitude',
  unit: 'm',
  min: 0,
  max: 12,
  stops: INFERNO,
};

export function sampleScale(scale: ColorScale, value: number, out: [number, number, number] = [0, 0, 0]): [number, number, number] {
  const n = scale.stops.length - 1;
  let u = (value - scale.min) / (scale.max - scale.min);
  if (!Number.isFinite(u)) u = 0;
  u = Math.min(1, Math.max(0, u)) * n;
  const i = Math.min(n - 1, Math.floor(u));
  const f = u - i;
  const a = scale.stops[i];
  const b = scale.stops[i + 1];
  out[0] = a[0] + (b[0] - a[0]) * f;
  out[1] = a[1] + (b[1] - a[1]) * f;
  out[2] = a[2] + (b[2] - a[2]) * f;
  return out;
}

/** CSS linear-gradient for legends. */
export function scaleGradientCss(scale: ColorScale): string {
  const n = scale.stops.length - 1;
  const parts = scale.stops.map(
    (c, i) => `rgb(${Math.round(c[0] * 255)} ${Math.round(c[1] * 255)} ${Math.round(c[2] * 255)}) ${((i / n) * 100).toFixed(1)}%`,
  );
  return `linear-gradient(to right, ${parts.join(', ')})`;
}
