import { DecimalPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ExplorerStore, PointDensity } from '../state/explorer-store';

@Component({
  selector: 'app-point-cloud-controls',
  imports: [DecimalPipe],
  template: `
    <label class="check"><input type="checkbox" data-testid="layer-points" [checked]="store.layers().pointCloud"
      (change)="store.setLayer('pointCloud', $any($event.target).checked)" /> Surface point cloud (synthetic scan)</label>
    @if (store.layers().pointCloud) {
      <div class="subcontrols">
        <div class="field">
          <label for="pc-density">Density</label>
          <select id="pc-density" data-testid="pc-density" [value]="store.pointDensity()" (change)="store.pointDensity.set($any($event.target).value)">
            @for (d of densities; track d.id) {
              <option [value]="d.id">{{ d.label }}</option>
            }
          </select>
        </div>
        <div class="field">
          <label for="pc-size">Point size</label>
          <input id="pc-size" type="range" min="1" max="8" step="0.5" data-testid="pc-size" style="flex: 1"
            [value]="store.pointSize()" (input)="store.pointSize.set(+$any($event.target).value)" />
          <output>{{ store.pointSize() }} px</output>
        </div>
        <div class="field">
          <label for="pc-color">Colour</label>
          <select id="pc-color" data-testid="pc-color" [value]="store.pointColorMode()" (change)="store.pointColorMode.set($any($event.target).value)">
            <option value="height">By elevation</option>
            <option value="natural">Natural (fixed)</option>
          </select>
        </div>
        <p class="section__note" data-testid="pc-status" aria-live="polite">
          @switch (store.pointCloudStatus().state) {
            @case ('generating') { Generating points in a background worker… }
            @case ('ready') {
              {{ readyCount() | number }} points · generated in {{ readyMs() | number: '1.0-0' }} ms (worker)
            }
            @case ('error') { Point cloud unavailable: {{ errorMessage() }} }
          }
        </p>
        <p class="section__note">Sampled from the procedural pre-blast surface with simulated noise and gaps. Not LiDAR, not a measurement, and never used for grade or tonnes. The vertical free face is not captured (2.5D scan).</p>
      </div>
    }
  `,
})
export class PointCloudControls {
  protected readonly store = inject(ExplorerStore);
  protected readonly densities: { id: PointDensity; label: string }[] = [
    { id: '100k', label: '~100k (default)' },
    { id: '300k', label: '~300k' },
    { id: '1m', label: '~1M (stress test)' },
  ];

  protected readyCount(): number {
    const s = this.store.pointCloudStatus();
    return s.state === 'ready' ? s.count : 0;
  }

  protected readyMs(): number {
    const s = this.store.pointCloudStatus();
    return s.state === 'ready' ? s.workerMs : 0;
  }

  protected errorMessage(): string {
    const s = this.store.pointCloudStatus();
    return s.state === 'error' ? s.message : '';
  }
}
