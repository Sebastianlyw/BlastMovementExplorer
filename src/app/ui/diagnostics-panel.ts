import { DecimalPipe } from '@angular/common';
import { Component, input, output } from '@angular/core';
import { BenchmarkResult, RenderStats } from '../renderer/scene-renderer';

export type BenchmarkState = { readonly state: 'idle' } | { readonly state: 'running' } | { readonly state: 'done'; readonly result: BenchmarkResult };

@Component({
  selector: 'app-diagnostics-panel',
  imports: [DecimalPipe],
  template: `
    <div class="diag__head">
      <strong>Diagnostics</strong>
      <button class="btn btn--icon" type="button" aria-label="Close diagnostics" (click)="closed.emit()">×</button>
    </div>
    @if (stats(); as s) {
      <dl class="kv" data-testid="diag-stats">
        <dt>Frame interval (median)</dt>
        <dd>{{ s.frameIntervalMedianMs === null ? 'idle (on-demand)' : (s.frameIntervalMedianMs | number: '1.1-1') + ' ms' }}</dd>
        <dt>Draw calls</dt>
        <dd data-testid="diag-draws">{{ s.drawCalls }}</dd>
        <dt>Triangles</dt>
        <dd>{{ s.triangles | number }}</dd>
        <dt>Points drawn</dt>
        <dd>{{ s.points | number }}</dd>
        <dt>Block instances</dt>
        <dd data-testid="diag-instances">{{ s.instances | number }}</dd>
        <dt>Surface points loaded</dt>
        <dd>{{ s.pointCloudPoints | number }}</dd>
        <dt>Geometries / textures</dt>
        <dd>{{ s.geometries }} / {{ s.textures }}</dd>
        <dt>Pixel ratio · canvas</dt>
        <dd>{{ s.pixelRatio }} · {{ s.canvasSize[0] }}×{{ s.canvasSize[1] }}</dd>
        <dt>Quality</dt>
        <dd>{{ quality() }}</dd>
        <dt>Frames rendered</dt>
        <dd>{{ s.framesRendered | number }}</dd>
      </dl>
    } @else {
      <p class="empty">Waiting for the first frame…</p>
    }
    <p class="section__note">
      Browser frame intervals (requestAnimationFrame), sampled only while frames render continuously, and renderer object
      counts — not GPU timings or memory sizes. Updated twice per second.
    </p>
    <div class="btn-row">
      <button class="btn" type="button" data-testid="bench-run" [disabled]="bench().state === 'running'"
        title="Orbit the camera and loop the movement for 2 s warm-up + 10 s sampling" (click)="run.emit()">
        {{ bench().state === 'running' ? 'Benchmark running… (12 s)' : 'Run benchmark' }}
      </button>
      @if (bench().state === 'done') {
        <button class="btn" type="button" data-testid="bench-download" (click)="download.emit()">Download JSON</button>
      }
    </div>
    @if (benchResult(); as r) {
      <dl class="kv" data-testid="bench-result" style="margin-top: 8px">
        <dt>Median / p95 frame</dt>
        <dd>{{ r.medianFrameMs | number: '1.2-2' }} / {{ r.p95FrameMs | number: '1.2-2' }} ms</dd>
        <dt>≈ FPS (median)</dt>
        <dd>{{ r.fpsFromMedian | number: '1.0-0' }}</dd>
        <dt>Frames sampled</dt>
        <dd>{{ r.frames }}</dd>
        <dt>GPU</dt>
        <dd class="diag__gpu" [title]="r.gpuRenderer">{{ r.gpuRenderer }}</dd>
      </dl>
    }
  `,
  host: { class: 'overlay overlay--diag', role: 'region', 'aria-label': 'Diagnostics' },
})
export class DiagnosticsPanel {
  readonly stats = input<RenderStats | null>(null);
  readonly quality = input('');
  readonly bench = input<BenchmarkState>({ state: 'idle' });
  readonly closed = output<void>();
  readonly run = output<void>();
  readonly download = output<void>();

  protected benchResult(): BenchmarkResult | null {
    const b = this.bench();
    return b.state === 'done' ? b.result : null;
  }
}
