import { DecimalPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { GEO_CLASS_LABELS } from '../domain/types';
import { ExplorerStore } from '../state/explorer-store';

@Component({
  selector: 'app-inspector',
  imports: [DecimalPipe],
  template: `
    <section class="section" aria-labelledby="sel-title" data-testid="inspector">
      <h2 class="section__title" id="sel-title">Selected block</h2>
      @if (store.selectedBlock(); as b) {
        <dl class="kv">
          <dt>Block id</dt>
          <dd data-testid="sel-id">{{ b.id }}</dd>
          <dt>Grid index (i, j, k)</dt>
          <dd>{{ b.gridIndex[0] }}, {{ b.gridIndex[1] }}, {{ b.gridIndex[2] }}</dd>
          <dt>Centre E / N / Z</dt>
          <dd data-testid="sel-center">{{ b.centerBefore[0] | number: '1.2-2' }} / {{ b.centerBefore[1] | number: '1.2-2' }} / {{ b.centerBefore[2] | number: '1.2-2' }} m</dd>
          <dt>Dimensions</dt>
          <dd>{{ b.size[0] }} × {{ b.size[1] }} × {{ b.size[2] }} m</dd>
          <dt>Density</dt>
          <dd data-testid="sel-density">{{ b.densityTonnesPerM3 | number: '1.3-3' }} t/m³</dd>
          <dt>Grade</dt>
          <dd data-testid="sel-grade">{{ b.gradeGramsPerTonne | number: '1.3-3' }} g/t</dd>
          <dt>Tonnes</dt>
          <dd data-testid="sel-tonnes">{{ b.tonnes | number: '1.2-2' }} t</dd>
          <dt>Geological class</dt>
          <dd>{{ geoLabel(b.geoClass) }}</dd>
          <dt>At cutoff {{ store.cutoff() }} g/t</dt>
          <dd>
            @if (store.selectedIsOre()) {
              <span class="tag tag--ore" data-testid="sel-econ">Ore</span>
            } @else {
              <span class="tag tag--waste" data-testid="sel-econ">Waste</span>
            }
          </dd>
        </dl>
        <p class="section__note">Tonnes = block volume × density. Ore/waste is derived from the current cutoff.</p>
      } @else {
        <p class="empty" data-testid="sel-empty">No block selected. Click a block in the 3D view.</p>
      }
    </section>
  `,
})
export class Inspector {
  protected readonly store = inject(ExplorerStore);

  protected geoLabel(c: number): string {
    return GEO_CLASS_LABELS[c] ?? 'Unknown';
  }
}
