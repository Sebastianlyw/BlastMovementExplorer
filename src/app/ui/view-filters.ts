import { Component, computed, inject } from '@angular/core';
import { ExplorerStore } from '../state/explorer-store';

@Component({
  selector: 'app-view-filters',
  template: `
    <section class="section" aria-labelledby="filter-title">
      <h2 class="section__title" id="filter-title">Grade filter</h2>
      <div class="field">
        <label for="grade-min">Min grade (g/t)</label>
        <input id="grade-min" type="number" min="0" max="100" step="0.1" data-testid="grade-min"
          [value]="store.gradeFilter().minGrade" (change)="setRange('minGrade', $event)" />
      </div>
      <div class="field">
        <label for="grade-max">Max grade (g/t)</label>
        <input id="grade-max" type="number" min="0" max="100" step="0.1" data-testid="grade-max"
          [value]="store.gradeFilter().maxGrade" (change)="setRange('maxGrade', $event)" />
      </div>
      <label class="check"><input type="checkbox" data-testid="ore-only" [checked]="store.gradeFilter().oreOnly"
        (change)="setOreOnly($any($event.target).checked)" /> Ore only (grade ≥ cutoff {{ store.cutoff() }} g/t)</label>
      <p class="section__note" data-testid="visible-count">
        @if (store.visibleBlockCount() !== null) {
          {{ store.visibleBlockCount() }} of {{ total() }} blocks shown.
        }
        View filter only — analysis always uses every block.
      </p>
    </section>

    <section class="section" aria-labelledby="section-title">
      <h2 class="section__title" id="section-title">Horizontal section</h2>
      <label class="check"><input type="checkbox" data-testid="section-enabled" [checked]="store.section().enabled"
        (change)="store.section.set({ enabled: $any($event.target).checked, z: store.section().z })" /> Hide blocks above Z</label>
      <div class="field">
        <label for="section-z">Z (m)</label>
        <input id="section-z" type="range" min="0" max="24" step="2" data-testid="section-z" style="flex: 1"
          [value]="store.section().z" [disabled]="!store.section().enabled"
          (input)="store.section.set({ enabled: true, z: +$any($event.target).value })" />
        <output>{{ store.section().z }} m</output>
      </div>
      <p class="section__note">Uses each block's current (interpolated) centre. Hidden blocks cannot be selected.</p>
    </section>
  `,
})
export class ViewFilters {
  protected readonly store = inject(ExplorerStore);
  protected readonly total = computed(() => this.store.metadata() && this.store.currentDataset()?.blocks.count);

  protected setRange(key: 'minGrade' | 'maxGrade', e: Event): void {
    const input = e.target as HTMLInputElement;
    const v = Number(input.value);
    const f = this.store.gradeFilter();
    const next = { ...f, [key]: v };
    if (input.value === '' || !Number.isFinite(v) || v < 0 || v > 100 || next.minGrade > next.maxGrade) {
      input.value = String(f[key]);
      this.store.showNotice('Grade range must satisfy 0 ≤ min ≤ max ≤ 100 g/t.');
      return;
    }
    this.store.gradeFilter.set(next);
  }

  protected setOreOnly(on: boolean): void {
    this.store.gradeFilter.update((f) => ({ ...f, oreOnly: on }));
  }
}
