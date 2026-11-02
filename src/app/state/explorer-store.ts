import { computed, Injectable, signal } from '@angular/core';
import { buildIdIndex, getBlock, isOre } from '../domain/blocks';
import { generateDataset, terrainHeightFor } from '../domain/generator';
import { Block, Dataset } from '../domain/types';
import { DEFAULT_PRESET_ID, findPreset } from './scene-presets';
import { initialQuality, Quality } from './quality';

export type LoadStatus = 'loading' | 'ready' | 'error';
export type ColorMode = 'grade' | 'displacement';

export interface LayerState {
  readonly blocks: boolean;
  readonly terrain: boolean;
}

/**
 * Application state. Signals hold parameters, identifiers and summaries only;
 * the dataset itself lives in a plain field and is announced via `datasetVersion`.
 */
@Injectable({ providedIn: 'root' })
export class ExplorerStore {
  readonly status = signal<LoadStatus>('loading');
  readonly errorMessage = signal<string | null>(null);
  readonly presetId = signal(DEFAULT_PRESET_ID);
  readonly cutoff = signal(0.8);
  readonly selectedBlockId = signal<number | null>(null);
  /** Increments whenever a new dataset replaces the old one. */
  readonly datasetVersion = signal(0);
  readonly generationMs = signal<number | null>(null);

  /** Movement interpolation t ∈ [0, 1]. Updated at ≤ 10 Hz during playback, never per frame. */
  readonly movementT = signal(0);
  readonly playing = signal(false);
  readonly colorMode = signal<ColorMode>('grade');
  readonly layers = signal<LayerState>({ blocks: true, terrain: true });
  readonly quality = signal<Quality>(initialQuality());

  private dataset: Dataset | null = null;
  private idIndex = new Map<number, number>();
  private loadToken = 0;

  readonly selectedBlock = computed<Block | null>(() => {
    this.datasetVersion();
    const id = this.selectedBlockId();
    if (id === null || !this.dataset) return null;
    const i = this.idIndex.get(id);
    return i === undefined ? null : getBlock(this.dataset.blocks, i);
  });

  readonly selectedIsOre = computed(() => {
    const b = this.selectedBlock();
    return b ? isOre(b.gradeGramsPerTonne, this.cutoff()) : null;
  });

  readonly metadata = computed(() => {
    this.datasetVersion();
    return this.dataset?.metadata ?? null;
  });

  /** Non-reactive accessor for the renderer and exporters. */
  currentDataset(): Dataset | null {
    return this.dataset;
  }

  heightFunction(): ((x: number, y: number) => number) | null {
    return this.dataset ? terrainHeightFor(this.dataset.metadata.params) : null;
  }

  blockIndexOf(id: number): number | undefined {
    return this.idIndex.get(id);
  }

  async loadPreset(presetId: string): Promise<void> {
    const preset = findPreset(presetId);
    const token = ++this.loadToken;
    this.status.set('loading');
    this.errorMessage.set(null);
    this.selectedBlockId.set(null);
    this.playing.set(false);
    this.movementT.set(0);
    // Yield so the loading state paints before the synchronous generation runs.
    await new Promise((r) => setTimeout(r, 0));
    if (token !== this.loadToken) return;
    try {
      if (!preset) throw new Error(`Unknown scene "${presetId}".`);
      const t0 = performance.now();
      const dataset = generateDataset(preset.seed, preset.params);
      this.generationMs.set(performance.now() - t0);
      if (token !== this.loadToken) return;
      this.dataset = dataset;
      this.idIndex = buildIdIndex(dataset.blocks);
      this.presetId.set(preset.id);
      this.datasetVersion.update((v) => v + 1);
      this.status.set('ready');
    } catch (e) {
      this.status.set('error');
      this.errorMessage.set(e instanceof Error ? e.message : String(e));
    }
  }

  select(blockId: number | null): void {
    this.selectedBlockId.set(blockId);
  }

  setMovementT(t: number): void {
    this.playing.set(false);
    this.movementT.set(Math.min(1, Math.max(0, t)));
  }

  /** Called by the renderer's low-frequency playback reports. */
  reportPlayback(t: number, playing: boolean): void {
    this.movementT.set(t);
    this.playing.set(playing);
  }

  setLayer(layer: keyof LayerState, visible: boolean): void {
    this.layers.update((l) => ({ ...l, [layer]: visible }));
  }
}
