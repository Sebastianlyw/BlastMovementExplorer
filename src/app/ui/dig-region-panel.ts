import { DecimalPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { DigRegion } from '../domain/dig-analysis';
import { ExplorerStore } from '../state/explorer-store';

type RegionKey = keyof DigRegion;

@Component({
  selector: 'app-dig-region-panel',
  imports: [DecimalPipe],
  template: `
    <section class="section" aria-labelledby="region-title">
      <h2 class="section__title" id="region-title">Dig regions</h2>
      @if (store.originalRegion(); as o) {
        <p class="region-legend"><span class="swatch swatch--original" aria-hidden="true"></span> Original (frozen)</p>
        <dl class="kv" data-testid="region-original">
          <dt>Centre E / N</dt>
          <dd>{{ o.centerE | number: '1.1-1' }} / {{ o.centerN | number: '1.1-1' }} m</dd>
          <dt>Width × length</dt>
          <dd>{{ o.width | number: '1.1-1' }} × {{ o.length | number: '1.1-1' }} m</dd>
        </dl>
        <p class="section__note">Derived once from pre-movement ore (≥ 0.8 g/t, 5th–95th percentile E/N, snapped to the block grid). Not updated after movement.</p>
      } @else {
        <p class="empty">No ore in this scene, so no original region.</p>
      }

      @if (store.adjustedRegion(); as a) {
        <p class="region-legend"><span class="swatch swatch--adjusted" aria-hidden="true"></span> Adjusted</p>
        @for (f of fields; track f.key) {
          <div class="field">
            <label [for]="'adj-' + f.key">{{ f.label }}</label>
            <input type="number" [id]="'adj-' + f.key" [attr.data-testid]="'adj-' + f.key" step="1"
              [min]="f.min" [value]="a[f.key]" (change)="setField(f.key, $event)" />
          </div>
        }
        <div class="btn-row">
          <button class="btn" type="button" data-testid="adj-reset" (click)="resetAdjusted()">Reset to original</button>
          <button class="btn" type="button" data-testid="adj-offset"
            title="Moves the original region by the tonnage-weighted mean horizontal displacement of ore blocks. A simple heuristic, not an optimiser; it can make metrics worse."
            (click)="store.offsetAdjustedByMeanOreDisplacement()">Offset by mean ore displacement</button>
        </div>
      }
      <p class="section__note">A block is extracted when its centre lies inside the rectangle (edges inclusive), over the full height. Centre-point approximation; no partial volumes.</p>
    </section>
  `,
})
export class DigRegionPanel {
  protected readonly store = inject(ExplorerStore);
  protected readonly fields: { key: RegionKey; label: string; min: number | null }[] = [
    { key: 'centerE', label: 'Centre E (m)', min: null },
    { key: 'centerN', label: 'Centre N (m)', min: null },
    { key: 'width', label: 'Width E–W (m)', min: 1 },
    { key: 'length', label: 'Length N–S (m)', min: 1 },
  ];

  protected setField(key: RegionKey, e: Event): void {
    const input = e.target as HTMLInputElement;
    const current = this.store.adjustedRegion();
    if (!current) return;
    const v = Number(input.value);
    const sizeKey = key === 'width' || key === 'length';
    if (input.value === '' || !Number.isFinite(v) || Math.abs(v) > 10_000 || (sizeKey && v <= 0)) {
      input.value = String(current[key]);
      this.store.showNotice(sizeKey ? 'Width and length must be positive numbers (m).' : 'Centre must be a finite number within ±10000 m.');
      return;
    }
    this.store.adjustedRegion.set({ ...current, [key]: v });
  }

  protected resetAdjusted(): void {
    this.store.adjustedRegion.set(this.store.originalRegion());
  }
}
