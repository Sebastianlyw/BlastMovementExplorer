import { afterNextRender, Component, computed, DestroyRef, effect, ElementRef, inject, signal, untracked, viewChild } from '@angular/core';
import { DISPLACEMENT_SCALE, GRADE_SCALE, scaleGradientCss } from '../renderer/colormap';
import { CameraPreset, RenderStats, SceneRenderer, ViewIndicator, WebGLUnavailableError } from '../renderer/scene-renderer';
import { buildVisibilityMask, countVisible, isFilterActive, NO_GRADE_FILTER } from '../domain/filtering';
import { ExplorerStore, PointDensity } from '../state/explorer-store';
import { createPointCloudWorker, PointCloudClient } from '../workers/point-cloud-client';
import { autoBenchmarkRequested, Quality, QUALITY_SETTINGS } from '../state/quality';
import { installDebugHook } from './debug-hook';
import { BenchmarkState, DiagnosticsPanel } from './diagnostics-panel';

type WebGLState = 'pending' | 'ok' | 'unavailable' | 'lost';

const NICE_LENGTHS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500];

@Component({
  selector: 'app-viewport',
  template: `
    <div class="viewport__canvas" #canvasHost></div>

    <div class="overlay overlay--toolbar" role="toolbar" aria-label="Camera">
      <button class="btn" type="button" title="Reset camera to the default view" (click)="camera('reset')">Reset camera</button>
      <button class="btn" type="button" title="Fit all data in view, keeping the current direction" (click)="camera('fit')">Fit data</button>
      <button class="btn" type="button" title="Look straight down (North up)" (click)="camera('top')">Top</button>
      <button class="btn" type="button" title="Look north from the free face" (click)="camera('front')">Front</button>
      <button class="btn" type="button" title="Isometric view from the south-east" (click)="camera('iso')">Isometric</button>
      <button class="btn" type="button" data-testid="diag-toggle" [attr.aria-pressed]="showDiagnostics()" title="Show rendering diagnostics and the benchmark" (click)="showDiagnostics.set(!showDiagnostics())">Diagnostics</button>
    </div>

    <div class="overlay overlay--legend" aria-label="Colour legend">
      <div>{{ scale().label }} ({{ scale().unit }})</div>
      <div class="legend__bar" [style.background]="gradient()"></div>
      <div class="legend__ticks">
        <span>{{ scale().min.toFixed(1) }}</span>
        <span>{{ ((scale().min + scale().max) / 2).toFixed(1) }}</span>
        <span>≥ {{ scale().max.toFixed(1) }}</span>
      </div>
      <div class="section__note">Fixed scale{{ store.colorMode() === 'grade' ? " · cutoff " + store.cutoff() + " g/t" : "" }}</div>
    </div>

    <div class="overlay overlay--gizmo" aria-label="Orientation and scale">
      <svg width="64" height="64" viewBox="-32 -32 64 64" aria-hidden="true">
        <line #axE x1="0" y1="0" x2="20" y2="0" stroke="#ef7d74" stroke-width="2" />
        <line #axN x1="0" y1="0" x2="0" y2="-20" stroke="#7bd88f" stroke-width="2" />
        <line #axU x1="0" y1="0" x2="0" y2="-20" stroke="#6ab0f3" stroke-width="2" />
        <text #lbE fill="#ef7d74" font-size="10" text-anchor="middle" dominant-baseline="middle">E</text>
        <text #lbN fill="#7bd88f" font-size="10" text-anchor="middle" dominant-baseline="middle">N</text>
        <text #lbU fill="#6ab0f3" font-size="10" text-anchor="middle" dominant-baseline="middle">Up</text>
      </svg>
      <div class="scalebar">
        <div class="scalebar__bar" #scaleBar style="width: 60px"></div>
        <span #scaleLabel>— m</span>
        <span>Local coordinates</span>
      </div>
    </div>

    @if (store.layers().pointCloud && store.pointCloudStatus().state === 'ready') {
      <div class="overlay overlay--scan" data-testid="scan-label">Points: Synthetic surface scan (pre-blast) · not LiDAR</div>
    }
    @if (showDiagnostics()) {
      <app-diagnostics-panel [stats]="stats()" [quality]="store.quality()" [bench]="bench()"
        (closed)="showDiagnostics.set(false)" (run)="runBenchmark()" (download)="downloadBenchmark()" />
    }
    @if (store.status() === 'loading') {
      <div class="overlay overlay--status" role="status"><div class="status-card">Generating synthetic scene…</div></div>
    }
    @if (store.status() === 'error') {
      <div class="overlay overlay--status" role="alert">
        <div class="status-card status-card--error">
          <strong>Scene generation failed.</strong>
          <p>{{ store.errorMessage() }}</p>
        </div>
      </div>
    }
    @if (webgl() === 'unavailable') {
      <div class="overlay overlay--status" role="alert" data-testid="webgl-unavailable">
        <div class="status-card status-card--error">
          <strong>WebGL is not available.</strong>
          <p>This browser or device could not create a WebGL context, so the 3D view cannot be shown. Try a current desktop browser with hardware acceleration enabled.</p>
        </div>
      </div>
    }
    @if (store.status() === 'ready' && store.layers().blocks && store.visibleBlockCount() === 0) {
      <div class="overlay overlay--status" role="status" data-testid="empty-filter">
        <div class="status-card">
          <strong>No blocks match the current filters.</strong>
          <p>Grade {{ store.gradeFilter().minGrade }}–{{ store.gradeFilter().maxGrade }} g/t{{ store.gradeFilter().oreOnly ? ', ore only (≥ ' + store.cutoff() + ' g/t)' : '' }}.</p>
          <button class="btn" type="button" (click)="clearFilters()">Clear filters</button>
        </div>
      </div>
    }
    @if (store.notice(); as n) {
      <div class="overlay overlay--toast" role="status" data-testid="notice">{{ n }}</div>
    }
    @if (webgl() === 'lost') {
      <div class="overlay overlay--status" role="alert">
        <div class="status-card status-card--error">The graphics context was lost. Waiting for the browser to restore it…</div>
      </div>
    }
  `,
  imports: [DiagnosticsPanel],
  host: { class: 'viewport', 'data-testid': 'viewport' },
})
export class Viewport {
  protected readonly store = inject(ExplorerStore);
  protected readonly scale = computed(() => (this.store.colorMode() === 'grade' ? GRADE_SCALE : DISPLACEMENT_SCALE));
  protected readonly gradient = computed(() => scaleGradientCss(this.scale()));
  protected readonly webgl = signal<WebGLState>('pending');
  readonly stats = signal<RenderStats | null>(null);
  protected readonly showDiagnostics = signal(false);
  protected readonly bench = signal<BenchmarkState>({ state: 'idle' });

  private readonly canvasHost = viewChild.required<ElementRef<HTMLElement>>('canvasHost');
  private readonly axE = viewChild.required<ElementRef<SVGLineElement>>('axE');
  private readonly axN = viewChild.required<ElementRef<SVGLineElement>>('axN');
  private readonly axU = viewChild.required<ElementRef<SVGLineElement>>('axU');
  private readonly lbE = viewChild.required<ElementRef<SVGTextElement>>('lbE');
  private readonly lbN = viewChild.required<ElementRef<SVGTextElement>>('lbN');
  private readonly lbU = viewChild.required<ElementRef<SVGTextElement>>('lbU');
  private readonly scaleBar = viewChild.required<ElementRef<HTMLElement>>('scaleBar');
  private readonly scaleLabel = viewChild.required<ElementRef<HTMLElement>>('scaleLabel');

  private renderer: SceneRenderer | null = null;
  private removeHook: (() => void) | null = null;
  /** Increments each time a renderer is created; 0 = none. Effects re-apply state on change. */
  private readonly rendererGen = signal(0);
  private readonly viewReady = signal(false);
  private pointClient: PointCloudClient | null = null;
  private loadedPointKey = '';

  constructor() {
    afterNextRender(() => this.viewReady.set(true));

    // (Re)create the renderer when the view is ready and whenever quality changes:
    // antialiasing is fixed per WebGL context.
    effect(() => {
      const quality = this.store.quality();
      if (!this.viewReady()) return;
      untracked(() => this.createRenderer(quality));
    });

    // New dataset (or new renderer) → rebuild scene objects.
    effect(() => {
      const version = this.store.datasetVersion();
      if (!this.rendererGen() || version === 0) return;
      const dataset = this.store.currentDataset();
      const heightAt = this.store.heightFunction();
      if (!dataset || !heightAt || !this.renderer) return;
      this.renderer.setScene({
        blocks: dataset.blocks,
        blockBounds: dataset.metadata.blockBounds,
        finalBounds: dataset.metadata.finalBounds,
        terrainExtent: dataset.metadata.params.terrain.extent,
        floorZ: dataset.metadata.params.terrain.floorZ,
        heightAt,
      });
      untracked(() => {
        this.renderer?.setMovementT(this.store.movementT());
        this.renderer?.setSelection(this.store.selectedBlockId());
      });
    });

    effect(() => {
      const id = this.store.selectedBlockId();
      if (this.rendererGen()) this.renderer?.setSelection(id);
    });

    // t flows store → renderer except during playback, when the renderer owns it.
    effect(() => {
      const t = this.store.movementT();
      const playing = this.store.playing();
      if (!this.rendererGen() || playing) return;
      this.renderer?.setMovementT(t);
    });

    effect(() => {
      const playing = this.store.playing();
      if (!this.rendererGen() || !this.renderer) return;
      if (playing && !this.renderer.isPlaying) this.renderer.play();
      else if (!playing && this.renderer.isPlaying) this.renderer.pause();
    });

    effect(() => {
      const layers = this.store.layers();
      if (this.rendererGen()) this.renderer?.setLayers(layers);
    });

    effect(() => {
      const mode = this.store.colorMode();
      if (this.rendererGen()) this.renderer?.setColorMode(mode);
    });

    // Grade filters → visibility mask (view only; metrics never read it).
    effect(() => {
      this.store.datasetVersion();
      const filter = this.store.gradeFilter();
      const cutoff = this.store.cutoff();
      const ds = this.store.currentDataset();
      if (!ds) return;
      let maxGrade = 0;
      for (let i = 0; i < ds.blocks.count; i++) maxGrade = Math.max(maxGrade, ds.blocks.grade[i]);
      const active = isFilterActive(filter, maxGrade);
      const mask = active ? buildVisibilityMask(ds.blocks.grade, filter, cutoff) : null;
      untracked(() => this.store.visibleBlockCount.set(mask ? countVisible(mask) : ds.blocks.count));
      if (this.rendererGen()) this.renderer?.setVisibleMask(mask);
    });

    effect(() => {
      const s = this.store.section();
      if (this.rendererGen()) this.renderer?.setSection(s.enabled ? s.z : null);
    });

    effect(() => {
      this.store.datasetVersion();
      const original = this.store.originalRegion();
      const adjusted = this.store.adjustedRegion();
      const md = this.store.metadata();
      if (!this.rendererGen() || !md) return;
      this.renderer?.setDigRegions({
        original,
        adjusted,
        zMin: Math.min(md.blockBounds.min[2], md.finalBounds.min[2]),
        zMax: Math.max(md.blockBounds.max[2], md.finalBounds.max[2]),
      });
    });

    effect(() => {
      const style = { size: this.store.pointSize(), colorMode: this.store.pointColorMode() };
      if (this.rendererGen()) this.renderer?.setPointStyle(style);
    });

    // Surface point cloud: generated in a Worker only while the layer is visible.
    effect(() => {
      const visible = this.store.layers().pointCloud;
      const tier = this.store.pointDensity();
      const version = this.store.datasetVersion();
      const gen = this.rendererGen();
      if (!gen || version === 0) return;
      const key = `${version}|${tier}|${gen}`;
      untracked(() => {
        if (!visible) {
          this.pointClient?.cancel();
          if (this.store.pointCloudStatus().state === 'generating') this.store.pointCloudStatus.set({ state: 'idle' });
          return;
        }
        if (key !== this.loadedPointKey) void this.requestPoints(key, tier);
      });
    });

    // ?benchmark=auto: run once when the scene and any requested point cloud are ready.
    let autoBenchPending = autoBenchmarkRequested();
    effect(() => {
      if (!autoBenchPending || this.store.status() !== 'ready' || !this.rendererGen()) return;
      if (this.store.layers().pointCloud && this.store.pointCloudStatus().state !== 'ready') return;
      autoBenchPending = false;
      untracked(() => {
        this.showDiagnostics.set(true);
        setTimeout(() => void this.runBenchmark(), 500);
      });
    });

    // A selection that is no longer drawn is cleared, with a notice. Runs after the effects above.
    effect(() => {
      const id = this.store.selectedBlockId();
      this.store.gradeFilter();
      this.store.cutoff();
      this.store.section();
      this.store.movementT();
      this.store.layers();
      if (id === null || !this.rendererGen() || !this.renderer) return;
      if (!this.renderer.isBlockDrawn(id)) {
        untracked(() => {
          this.store.select(null);
          this.store.showNotice(`Selection cleared: block ${id} is hidden by the current filters, section or layers.`);
        });
      }
    });

    inject(DestroyRef).onDestroy(() => {
      this.pointClient?.dispose();
      this.pointClient = null;
      this.destroyRenderer();
    });
  }

  private createRenderer(quality: Quality): void {
    this.destroyRenderer();
    this.store.playing.set(false);
    const q = QUALITY_SETTINGS[quality];
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    try {
      this.renderer = SceneRenderer.create(
        this.canvasHost().nativeElement,
        {
          onStats: (s) => this.stats.set(s),
          onView: (v) => this.updateIndicators(v),
          onClickPick: (id) => this.store.select(id),
          onMovementT: (t, playing) => this.store.reportPlayback(t, playing),
          onContextLost: () => this.webgl.set('lost'),
          onContextRestored: () => this.webgl.set('ok'),
        },
        { antialias: q.antialias, maxPixelRatio: q.maxPixelRatio, damping: !reducedMotion },
      );
      this.webgl.set('ok');
      this.removeHook = installDebugHook(this.store, this.renderer, () => {
        const b = this.bench();
        return b.state === 'done' ? b.result : null;
      });
      this.rendererGen.update((g) => g + 1);
    } catch (e) {
      if (e instanceof WebGLUnavailableError) this.webgl.set('unavailable');
      else throw e;
    }
  }

  private async requestPoints(key: string, tier: PointDensity): Promise<void> {
    const ds = this.store.currentDataset();
    if (!ds) return;
    if (!this.pointClient) {
      const worker = createPointCloudWorker();
      if (!worker) {
        this.store.pointCloudStatus.set({ state: 'error', message: 'Web Workers are not available in this browser.' });
        return;
      }
      this.pointClient = new PointCloudClient(worker);
    }
    this.store.pointCloudStatus.set({ state: 'generating', tier });
    try {
      const res = await this.pointClient.request(ds.metadata.seed, ds.metadata.params, tier);
      if (!res || !this.renderer) return; // superseded or torn down
      // Ownership of res.positions passes to the renderer here.
      this.renderer.setPointCloud(res.positions, [res.bounds.min[2], res.bounds.max[2]]);
      this.loadedPointKey = key;
      this.store.pointCloudStatus.set({ state: 'ready', tier: res.tier, count: res.count, workerMs: res.ms });
    } catch (e) {
      this.store.pointCloudStatus.set({ state: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }

  private destroyRenderer(): void {
    this.loadedPointKey = '';
    this.removeHook?.();
    this.removeHook = null;
    this.renderer?.dispose();
    this.renderer = null;
  }

  protected async runBenchmark(): Promise<void> {
    if (!this.renderer || this.bench().state === 'running') return;
    this.store.playing.set(false);
    this.bench.set({ state: 'running' });
    try {
      const result = await this.renderer.runBenchmark();
      this.bench.set({ state: 'done', result });
    } catch (e) {
      this.bench.set({ state: 'idle' });
      this.store.showNotice(`Benchmark failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  protected downloadBenchmark(): void {
    const b = this.bench();
    const md = this.store.metadata();
    if (b.state !== 'done' || !md) return;
    const payload = {
      ...b.result,
      scene: { presetId: this.store.presetId(), seed: md.seed, generatorVersion: md.generatorVersion, quality: this.store.quality(), pointDensity: this.store.layers().pointCloud ? this.store.pointDensity() : 'off' },
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `bmx-benchmark-${b.result.startedAt.replace(/[:.]/g, '-')}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  protected clearFilters(): void {
    this.store.gradeFilter.set(NO_GRADE_FILTER);
  }

  protected camera(preset: CameraPreset): void {
    this.renderer?.applyCameraPreset(preset);
  }

  /** Direct DOM writes: called on every rendered frame, never touches signals. */
  private updateIndicators(v: ViewIndicator): void {
    const L = 20;
    const set = (line: SVGLineElement, label: SVGTextElement, d: readonly [number, number]) => {
      line.setAttribute('x2', (d[0] * L).toFixed(1));
      line.setAttribute('y2', (d[1] * L).toFixed(1));
      label.setAttribute('x', (d[0] * (L + 7)).toFixed(1));
      label.setAttribute('y', (d[1] * (L + 7)).toFixed(1));
    };
    set(this.axE().nativeElement, this.lbE().nativeElement, v.east);
    set(this.axN().nativeElement, this.lbN().nativeElement, v.north);
    set(this.axU().nativeElement, this.lbU().nativeElement, v.up);

    const pxPerMetre = 100 / v.metresPer100Px;
    let len = NICE_LENGTHS[NICE_LENGTHS.length - 1];
    for (const n of NICE_LENGTHS) {
      if (n * pxPerMetre >= 50) {
        len = n;
        break;
      }
    }
    this.scaleBar().nativeElement.style.width = `${Math.round(len * pxPerMetre)}px`;
    this.scaleLabel().nativeElement.textContent = `${len} m (at target)`;
  }
}
