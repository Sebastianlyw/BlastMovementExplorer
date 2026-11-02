import { DecimalPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { DigMetrics } from '../domain/dig-analysis';
import { ExplorerStore } from '../state/explorer-store';

interface Row {
  readonly key: keyof DigMetrics;
  readonly label: string;
  readonly unit: 't' | '%' | 'g/t' | '';
}

@Component({
  selector: 'app-analysis-panel',
  template: `
    <section class="section" aria-labelledby="analysis-title" data-testid="analysis">
      <h2 class="section__title" id="analysis-title">Dig analysis · demo definitions</h2>
      @if (store.analysis(); as a) {
        <p class="section__note" style="margin-top: 0">Cutoff {{ store.cutoff() }} g/t · movement endpoints only (t is ignored)</p>
        <table class="metrics">
          <thead>
            <tr>
              <th scope="col">Metric</th>
              @for (s of a; track s.id) {
                <th scope="col" [title]="s.label">{{ s.id }}</th>
              }
            </tr>
          </thead>
          <tbody>
            @for (r of rows; track r.key) {
              <tr>
                <th scope="row">{{ r.label }}</th>
                @for (s of a; track s.id) {
                  <td [attr.data-testid]="'m-' + s.id + '-' + r.key">{{ fmt(s.metrics[r.key], r.unit) }}</td>
                }
              </tr>
            }
          </tbody>
        </table>
        <dl class="scenario-legend">
          @for (s of a; track s.id) {
            <dt>{{ s.id }}</dt>
            <dd>{{ s.label }}</dd>
          }
        </dl>
        <details class="definitions">
          <summary>Definitions</summary>
          <ul>
            <li>Block tonnes = block volume × density.</li>
            <li>Ore = grade ≥ cutoff. Total ore = all ore tonnes.</li>
            <li>Recovered / lost ore = ore tonnes with centre inside / outside the region.</li>
            <li>Extracted waste = tonnes below cutoff inside the region.</li>
            <li>Ore loss % = lost ore ÷ total ore × 100.</li>
            <li>Dilution % = extracted waste ÷ extracted total × 100.</li>
            <li>Avg extracted grade = Σ(grade × t) ÷ extracted t.</li>
            <li>N/A = zero denominator.</li>
          </ul>
          These are demo definitions for illustration, not an industry standard and not mine-planning advice.
        </details>
      } @else if (store.status() === 'ready') {
        <p class="empty">No analysis: the scene has no ore at the default cutoff, so no original region exists.</p>
      }
    </section>
  `,
})
export class AnalysisPanel {
  protected readonly store = inject(ExplorerStore);
  protected readonly rows: Row[] = [
    { key: 'totalOreTonnes', label: 'Total ore (t)', unit: 't' },
    { key: 'recoveredOreTonnes', label: 'Recovered ore (t)', unit: 't' },
    { key: 'lostOreTonnes', label: 'Lost ore (t)', unit: 't' },
    { key: 'extractedWasteTonnes', label: 'Extracted waste (t)', unit: 't' },
    { key: 'extractedTotalTonnes', label: 'Extracted total (t)', unit: 't' },
    { key: 'oreLossPercent', label: 'Ore loss (%)', unit: '%' },
    { key: 'dilutionPercent', label: 'Dilution (%)', unit: '%' },
    { key: 'averageExtractedGrade', label: 'Avg grade (g/t)', unit: 'g/t' },
  ];
  private readonly decimal = new DecimalPipe('en-US');

  protected fmt(v: number | null, unit: Row['unit']): string {
    if (v === null) return 'N/A';
    if (unit === 't') return this.decimal.transform(v, '1.0-0') ?? '';
    if (unit === '%') return this.decimal.transform(v, '1.1-1') ?? '';
    return this.decimal.transform(v, '1.2-2') ?? '';
  }
}
