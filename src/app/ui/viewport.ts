import { afterNextRender, Component, DestroyRef, effect, ElementRef, inject, signal, viewChild } from '@angular/core';
import { GRADE_SCALE, scaleGradientCss } from '../renderer/colormap';
import { CameraPreset, RenderStats, SceneRenderer, ViewIndicator, WebGLUnavailableError } from '../renderer/scene-renderer';
import { ExplorerStore } from '../state/explorer-store';
import { installDebugHook } from './debug-hook';

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
    </div>

    <div class="overlay overlay--legend" aria-label="Colour legend">
      <div>{{ scale.label }} ({{ scale.unit }})</div>
      <div class="legend__bar" [style.background]="gradient"></div>
      <div class="legend__ticks">
        <span>{{ scale.min.toFixed(1) }}</span>
        <span>{{ ((scale.min + scale.max) / 2).toFixed(1) }}</span>
        <span>≥ {{ scale.max.toFixed(1) }}</span>
      </div>
      <div class="section__note">Fixed scale · cutoff {{ store.cutoff() }} g/t</div>
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
    @if (webgl() === 'lost') {
      <div class="overlay overlay--status" role="alert">
        <div class="status-card status-card--error">The graphics context was lost. Waiting for the browser to restore it…</div>
      </div>
    }
  `,
  host: { class: 'viewport', 'data-testid': 'viewport' },
})
export class Viewport {
  protected readonly store = inject(ExplorerStore);
  protected readonly scale = GRADE_SCALE;
  protected readonly gradient = scaleGradientCss(GRADE_SCALE);
  protected readonly webgl = signal<WebGLState>('pending');
  readonly stats = signal<RenderStats | null>(null);

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
  private readonly rendererReady = signal(false);

  constructor() {
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      try {
        this.renderer = SceneRenderer.create(this.canvasHost().nativeElement, {
          onStats: (s) => this.stats.set(s),
          onView: (v) => this.updateIndicators(v),
          onClickPick: (id) => this.store.select(id),
          onContextLost: () => this.webgl.set('lost'),
          onContextRestored: () => this.webgl.set('ok'),
        });
        this.webgl.set('ok');
        this.rendererReady.set(true);
        const removeHook = installDebugHook(this.store, this.renderer);
        destroyRef.onDestroy(removeHook);
      } catch (e) {
        if (e instanceof WebGLUnavailableError) this.webgl.set('unavailable');
        else throw e;
      }
    });

    // New dataset → rebuild scene objects.
    effect(() => {
      const version = this.store.datasetVersion();
      if (!this.rendererReady() || version === 0) return;
      const dataset = this.store.currentDataset();
      const heightAt = this.store.heightFunction();
      if (!dataset || !heightAt || !this.renderer) return;
      this.renderer.setScene({
        blocks: dataset.blocks,
        blockBounds: dataset.metadata.blockBounds,
        terrainExtent: dataset.metadata.params.terrain.extent,
        heightAt,
      });
    });

    effect(() => {
      const id = this.store.selectedBlockId();
      this.store.datasetVersion();
      if (this.rendererReady()) this.renderer?.setSelection(id);
    });

    destroyRef.onDestroy(() => {
      this.renderer?.dispose();
      this.renderer = null;
    });
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
