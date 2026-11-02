import { DecimalPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ExplorerStore } from '../state/explorer-store';

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

  protected onCutoff(e: Event): void {
    const input = e.target as HTMLInputElement;
    const v = Number(input.value);
    if (Number.isFinite(v) && v >= 0 && v <= 10) this.store.cutoff.set(v);
    else input.value = String(this.store.cutoff());
  }
}
