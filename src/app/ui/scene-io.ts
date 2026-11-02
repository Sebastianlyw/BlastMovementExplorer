import { Component, inject, signal } from '@angular/core';
import { MAX_CONFIG_BYTES } from '../domain/scene-config';
import { ExplorerStore } from '../state/explorer-store';

/** Export / import buttons for the top bar. */
@Component({
  selector: 'app-scene-io',
  template: `
    <button class="btn" type="button" data-testid="export-csv" title="Download the A/B/C analysis summary as CSV"
      [disabled]="!store.analysis()" (click)="exportCsv()">Export CSV</button>
    <button class="btn" type="button" data-testid="export-config" title="Download the scene configuration as JSON"
      [disabled]="store.status() !== 'ready'" (click)="exportConfig()">Export config</button>
    <label class="btn" title="Restore a scene from a configuration JSON file (max 256 kB)">
      Import config
      <input type="file" accept="application/json,.json" class="sr-only" data-testid="import-config" (change)="onFile($event)" />
    </label>
    @if (errors().length) {
      <div class="import-errors" role="alert" data-testid="import-errors">
        <strong>Import failed — the current scene is unchanged.</strong>
        <ul>
          @for (e of errors(); track $index) {
            <li>{{ e }}</li>
          }
        </ul>
        <button class="btn" type="button" (click)="errors.set([])">Dismiss</button>
      </div>
    }
  `,
  host: { class: 'scene-io' },
})
export class SceneIo {
  protected readonly store = inject(ExplorerStore);
  protected readonly errors = signal<string[]>([]);

  protected exportCsv(): void {
    const csv = this.store.exportAnalysisCsv();
    if (csv) download(csv, `bmx-analysis-seed${this.store.metadata()?.seed}.csv`, 'text/csv');
  }

  protected exportConfig(): void {
    const json = this.store.exportConfigText();
    if (json) download(json, `bmx-scene-seed${this.store.metadata()?.seed}.json`, 'application/json');
  }

  protected async onFile(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // allow re-importing the same file
    if (!file) return;
    if (input.files && input.files.length > 1) {
      this.errors.set(['Select a single configuration file.']);
      return;
    }
    if (file.size > MAX_CONFIG_BYTES) {
      this.errors.set([`File is larger than ${MAX_CONFIG_BYTES / 1024} kB.`]);
      return;
    }
    const errors = await this.store.importConfigText(await file.text());
    this.errors.set(errors);
    if (!errors.length) this.store.showNotice(`Configuration "${file.name}" imported.`);
  }
}

function download(text: string, filename: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
