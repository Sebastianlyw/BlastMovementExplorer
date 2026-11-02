import { computed, Injectable, signal } from '@angular/core';
import { buildIdIndex, getBlock, isOre } from '../domain/blocks';
import { analysisCsv } from '../domain/csv';
import { computeScenarios, deriveOriginalRegion, DigRegion, meanOreDisplacement, ScenarioResult } from '../domain/dig-analysis';
import { GradeFilter, NO_GRADE_FILTER } from '../domain/filtering';
import { generateDataset, terrainHeightFor } from '../domain/generator';
import { MovementParams } from '../domain/movement';
import { CONFIG_FORMAT, CONFIG_SCHEMA_VERSION, DisplaySettings, parseConfig, SceneConfig, serializeConfig } from '../domain/scene-config';
import { Block, Dataset, GENERATOR_VERSION, GenerationParams } from '../domain/types';
import { initialQuality, Quality } from './quality';
import { DEFAULT_PRESET_ID, findPreset } from './scene-presets';

export type LoadStatus = 'loading' | 'ready' | 'error';
export type ColorMode = 'grade' | 'displacement';
export type PointDensity = '100k' | '300k' | '1m';

export interface LayerState {
  readonly blocks: boolean;
  readonly terrain: boolean;
  readonly pointCloud: boolean;
}

export type PointCloudStatus =
  | { readonly state: 'idle' }
  | { readonly state: 'generating'; readonly tier: PointDensity }
  | { readonly state: 'ready'; readonly tier: PointDensity; readonly count: number; readonly workerMs: number }
  | { readonly state: 'error'; readonly message: string };

export interface SectionState {
  readonly enabled: boolean;
  /** Elevation, metres (domain Z). */
  readonly z: number;
}

/** Demo cutoff used for the default and for deriving the frozen original region. */
export const DEFAULT_CUTOFF = 0.8;

const DEFAULT_LAYERS: LayerState = { blocks: true, terrain: true, pointCloud: false };
const DEFAULT_SECTION: SectionState = { enabled: false, z: 12 };

/**
 * Application state. Signals hold parameters, identifiers and summaries only;
 * the dataset itself lives in a plain field and is announced via `datasetVersion`.
 */
@Injectable({ providedIn: 'root' })
export class ExplorerStore {
  readonly status = signal<LoadStatus>('loading');
  readonly errorMessage = signal<string | null>(null);
  readonly presetId = signal(DEFAULT_PRESET_ID);
  readonly cutoff = signal(DEFAULT_CUTOFF);
  readonly selectedBlockId = signal<number | null>(null);
  /** Increments whenever a new dataset replaces the old one. */
  readonly datasetVersion = signal(0);
  readonly generationMs = signal<number | null>(null);

  /** Movement interpolation t ∈ [0, 1]. Updated at ≤ 10 Hz during playback, never per frame. */
  readonly movementT = signal(0);
  readonly playing = signal(false);
  readonly colorMode = signal<ColorMode>('grade');
  readonly layers = signal<LayerState>(DEFAULT_LAYERS);
  readonly quality = signal<Quality>(initialQuality());
  readonly gradeFilter = signal<GradeFilter>(NO_GRADE_FILTER);
  readonly section = signal<SectionState>(DEFAULT_SECTION);
  readonly pointDensity = signal<PointDensity>('100k');
  readonly pointSize = signal(2);
  readonly pointColorMode = signal<'height' | 'natural'>('height');
  /** Status of the surface point cloud (summary only; positions never enter signals). */
  readonly pointCloudStatus = signal<PointCloudStatus>({ state: 'idle' });

  /** Frozen per dataset: derived from pre-movement ore at the default cutoff. */
  readonly originalRegion = signal<DigRegion | null>(null);
  readonly adjustedRegion = signal<DigRegion | null>(null);

  /** Short-lived user notice (e.g. why a selection was cleared). */
  readonly notice = signal<string | null>(null);
  /** Number of blocks passing the grade filters (set by the viewport). */
  readonly visibleBlockCount = signal<number | null>(null);

  private dataset: Dataset | null = null;
  private idIndex = new Map<number, number>();
  private heightAt: ((x: number, y: number) => number) | null = null;
  private loadToken = 0;
  private noticeTimer: ReturnType<typeof setTimeout> | undefined;

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

  /**
   * Scenarios A/B/C. Depends only on the dataset, cutoff and regions — never on
   * view settings or movement t (endpoints only).
   */
  readonly analysis = computed<ScenarioResult[] | null>(() => {
    this.datasetVersion();
    const original = this.originalRegion();
    const adjusted = this.adjustedRegion();
    const cutoff = this.cutoff();
    if (!this.dataset || !original || !adjusted) return null;
    return computeScenarios(this.dataset.blocks, cutoff, original, adjusted);
  });

  /** Non-reactive accessor for the renderer and exporters. */
  currentDataset(): Dataset | null {
    return this.dataset;
  }

  heightFunction(): ((x: number, y: number) => number) | null {
    return this.heightAt;
  }

  blockIndexOf(id: number): number | undefined {
    return this.idIndex.get(id);
  }

  async loadPreset(presetId: string): Promise<void> {
    const preset = findPreset(presetId);
    if (!preset) {
      this.status.set('error');
      this.errorMessage.set(`Unknown scene "${presetId}".`);
      return;
    }
    await this.loadScene(preset.id, preset.seed, preset.params);
  }

  /** Reset the current scene and every view setting to defaults. */
  async resetAll(): Promise<void> {
    this.cutoff.set(DEFAULT_CUTOFF);
    this.colorMode.set('grade');
    this.layers.set(DEFAULT_LAYERS);
    this.gradeFilter.set(NO_GRADE_FILTER);
    this.section.set(DEFAULT_SECTION);
    this.pointDensity.set('100k');
    this.pointSize.set(2);
    this.pointColorMode.set('height');
    await this.loadPreset(this.presetId());
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

  showNotice(message: string, ms = 4000): void {
    clearTimeout(this.noticeTimer);
    this.notice.set(message);
    this.noticeTimer = setTimeout(() => this.notice.set(null), ms);
  }

  /** Shift the adjusted region by the tonnage-weighted mean ore displacement (heuristic). */
  offsetAdjustedByMeanOreDisplacement(): void {
    const adj = this.adjustedRegion();
    const orig = this.originalRegion();
    if (!this.dataset || !adj || !orig) return;
    const d = meanOreDisplacement(this.dataset.blocks, this.cutoff());
    if (!d) {
      this.showNotice('No ore at the current cutoff — nothing to offset by.');
      return;
    }
    const snap = (v: number) => Math.round(v * 10) / 10;
    this.adjustedRegion.set({ ...orig, centerE: snap(orig.centerE + d.dE), centerN: snap(orig.centerN + d.dN) });
  }

  // ---------------------------------------------------------------- export / import

  buildConfig(): SceneConfig | null {
    const ds = this.dataset;
    const original = this.originalRegion();
    const adjusted = this.adjustedRegion();
    if (!ds || !original || !adjusted) return null;
    return {
      format: CONFIG_FORMAT,
      schemaVersion: CONFIG_SCHEMA_VERSION,
      generatorVersion: GENERATOR_VERSION,
      scene: { presetId: this.presetId(), seed: ds.metadata.seed, generation: ds.metadata.params },
      cutoff: this.cutoff(),
      regions: { original, adjusted },
      display: this.displaySettings(),
      note: 'Blast Movement Explorer scene configuration. Synthetic data and illustrative movement; not for mining decisions.',
    };
  }

  exportConfigText(): string | null {
    const c = this.buildConfig();
    return c ? serializeConfig(c) : null;
  }

  exportAnalysisCsv(): string | null {
    const a = this.analysis();
    const ds = this.dataset;
    return a && ds ? analysisCsv(a, this.cutoff(), ds.metadata.seed, ds.metadata.generatorVersion) : null;
  }

  /**
   * Validate and apply a configuration file. Returns error messages; on any error
   * the current scene is left unchanged.
   */
  async importConfigText(text: string): Promise<string[]> {
    const parsed = parseConfig(text, (id) => findPreset(id)?.params);
    if (!parsed.ok) return parsed.errors;
    const c = parsed.config;
    const params: GenerationParams = { ...findPreset(c.scene.presetId)!.params, movement: c.scene.generation.movement };
    let dataset: Dataset;
    const t0 = performance.now();
    try {
      dataset = generateDataset(c.scene.seed, params);
    } catch (e) {
      return [`Could not generate the scene: ${e instanceof Error ? e.message : String(e)}`];
    }
    const derived = this.deriveOriginal(dataset);
    const o = c.regions.original;
    const same = (a: number, b: number) => Math.abs(a - b) < 1e-9;
    if (!derived || !same(derived.centerE, o.centerE) || !same(derived.centerN, o.centerN) || !same(derived.width, o.width) || !same(derived.length, o.length)) {
      return ['regions.original does not match the region derived from this scene; the file was edited or made by different code'];
    }
    const d = c.display;
    this.cutoff.set(c.cutoff);
    this.colorMode.set(d.colorMode);
    this.layers.set({ ...d.layers });
    this.gradeFilter.set({ ...d.gradeFilter });
    this.section.set({ ...d.section });
    this.quality.set(d.quality);
    this.pointDensity.set(d.pointDensity);
    this.pointSize.set(d.pointSize);
    this.commitDataset(c.scene.presetId, dataset, performance.now() - t0);
    this.adjustedRegion.set({ ...c.regions.adjusted });
    this.movementT.set(d.movementT);
    return [];
  }

  // ---------------------------------------------------------------- internals

  private displaySettings(): DisplaySettings {
    return {
      colorMode: this.colorMode(),
      layers: this.layers(),
      gradeFilter: this.gradeFilter(),
      section: this.section(),
      movementT: this.movementT(),
      quality: this.quality(),
      pointDensity: this.pointDensity(),
      pointSize: this.pointSize(),
    };
  }

  private deriveOriginal(ds: Dataset): DigRegion | null {
    const g = ds.metadata.params.grid;
    return deriveOriginalRegion(ds.blocks, DEFAULT_CUTOFF, [g.origin[0], g.origin[1]], g.blockSize);
  }

  private async loadScene(presetId: string, seed: number, params: GenerationParams): Promise<void> {
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
      const t0 = performance.now();
      const dataset = generateDataset(seed, params);
      this.generationMs.set(performance.now() - t0);
      if (token !== this.loadToken) return;
      this.commitDataset(presetId, dataset, this.generationMs());
    } catch (e) {
      this.status.set('error');
      this.errorMessage.set(e instanceof Error ? e.message : String(e));
    }
  }

  private commitDataset(presetId: string, dataset: Dataset, generationMs: number | null): void {
    this.loadToken++; // supersede any in-flight load
    this.dataset = dataset;
    this.idIndex = buildIdIndex(dataset.blocks);
    this.heightAt = terrainHeightFor(dataset.metadata.params);
    const original = this.deriveOriginal(dataset);
    this.originalRegion.set(original);
    this.adjustedRegion.set(original);
    this.presetId.set(presetId);
    this.selectedBlockId.set(null);
    this.playing.set(false);
    this.movementT.set(0);
    if (generationMs !== null) this.generationMs.set(generationMs);
    this.datasetVersion.update((v) => v + 1);
    this.status.set('ready');
    this.errorMessage.set(null);
  }

  /** For movement parameter access in the UI. */
  movementParams(): MovementParams | null {
    return this.dataset?.metadata.params.movement ?? null;
  }
}
