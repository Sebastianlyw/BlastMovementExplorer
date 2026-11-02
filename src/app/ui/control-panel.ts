import { DecimalPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ExplorerStore } from '../state/explorer-store';
import { QUALITY_SETTINGS } from '../state/quality';

@Component({
  selector: 'app-control-panel',
  imports: [DecimalPipe],
  template: `
    <section class="section" aria-labelledby="scene-title">
      <h2 class="section__title" id="scene-title">Scene</h2>
      @if (store.metadata(); as m) {
        <dl class="kv">
          <dt>Seed</dt>
          <dd>{{ m.seed }}</dd>
          <dt>Generator</dt>
          <dd>v{{ m.generatorVersion }}</dd>
          <dt>Blocks</dt>
          <dd>{{ m.params.grid.nx }} × {{ m.params.grid.ny }} × {{ m.params.grid.nz }}</dd>
          <dt>Block size</dt>
          <dd>{{ m.params.grid.blockSize }} m</dd>
          <dt>Extent E × N × Z</dt>
          <dd>{{ m.blockBounds.max[0] - m.blockBounds.min[0] }} × {{ m.blockBounds.max[1] - m.blockBounds.min[1] }} × {{ m.blockBounds.max[2] - m.blockBounds.min[2] }} m</dd>
          <dt>Coordinates</dt>
          <dd>Local (E, N, Up)</dd>
          @if (store.generationMs() !== null) {
            <dt>Generated in</dt>
            <dd>{{ store.generationMs() | number: '1.0-0' }} ms</dd>
          }
        </dl>
      }
    </section>

    <section class="section" aria-labelledby="layers-title">
      <h2 class="section__title" id="layers-title">Layers</h2>
      <label class="check"><input type="checkbox" data-testid="layer-blocks" [checked]="store.layers().blocks"
        (change)="store.setLayer('blocks', $any($event.target).checked)" /> Block model</label>
      <label class="check"><input type="checkbox" data-testid="layer-terrain" [checked]="store.layers().terrain"
        (change)="store.setLayer('terrain', $any($event.target).checked)" /> Terrain surface (pre-blast)</label>
    </section>

    <section class="section" aria-labelledby="color-title">
      <h2 class="section__title" id="color-title">Colour blocks by</h2>
      <div class="radio-row" role="radiogroup" aria-labelledby="color-title">
        <label class="check"><input type="radio" name="color-mode" value="grade" data-testid="color-grade"
          [checked]="store.colorMode() === 'grade'" (change)="store.colorMode.set('grade')" /> Grade (g/t)</label>
        <label class="check"><input type="radio" name="color-mode" value="displacement" data-testid="color-displacement"
          [checked]="store.colorMode() === 'displacement'" (change)="store.colorMode.set('displacement')" /> Displacement magnitude (m)</label>
      </div>
    </section>

    <section class="section" aria-labelledby="render-title">
      <h2 class="section__title" id="render-title">Rendering</h2>
      <div class="field">
        <label for="quality">Quality</label>
        <select id="quality" data-testid="quality-select" [value]="store.quality()" (change)="store.quality.set($any($event.target).value)">
          @for (q of qualities; track q[0]) {
            <option [value]="q[0]">{{ q[1].label }}</option>
          }
        </select>
      </div>
      <p class="section__note">Changing quality recreates the WebGL context.</p>
    </section>

    <section class="section" aria-labelledby="cutoff-title">
      <h2 class="section__title" id="cutoff-title">Cutoff</h2>
      <div class="field">
        <label for="cutoff">Cutoff grade (g/t)</label>
        <input id="cutoff" type="number" min="0" max="10" step="0.1" data-testid="cutoff-input"
          [value]="store.cutoff()" (change)="onCutoff($event)" />
      </div>
      <p class="section__note">Demo parameter. Blocks with grade ≥ cutoff are ore.</p>
    </section>
  `,
})
export class ControlPanel {
  protected readonly store = inject(ExplorerStore);
  protected readonly qualities = Object.entries(QUALITY_SETTINGS);

  protected onCutoff(e: Event): void {
    const input = e.target as HTMLInputElement;
    const v = Number(input.value);
    if (Number.isFinite(v) && v >= 0 && v <= 10) this.store.cutoff.set(v);
    else input.value = String(this.store.cutoff());
  }
}
