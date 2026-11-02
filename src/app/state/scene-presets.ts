import { DEFAULT_GENERATION_PARAMS, DEFAULT_SEED } from '../domain/generator';
import { GenerationParams } from '../domain/types';

export interface ScenePreset {
  readonly id: string;
  readonly label: string;
  readonly seed: number;
  readonly params: GenerationParams;
}

export const SCENE_PRESETS: readonly ScenePreset[] = [
  { id: 'bench-a', label: 'Bench A · seed 20261103', seed: DEFAULT_SEED, params: DEFAULT_GENERATION_PARAMS },
  { id: 'bench-b', label: 'Bench B · seed 20261104', seed: DEFAULT_SEED + 1, params: DEFAULT_GENERATION_PARAMS },
  {
    id: 'bench-c',
    label: 'Bench C · no vein · seed 7',
    seed: 7,
    params: { ...DEFAULT_GENERATION_PARAMS, vein: { ...DEFAULT_GENERATION_PARAMS.vein, enabled: false } },
  },
];

export const DEFAULT_PRESET_ID = SCENE_PRESETS[0].id;

export function findPreset(id: string): ScenePreset | undefined {
  return SCENE_PRESETS.find((p) => p.id === id);
}
