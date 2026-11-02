import { Component, inject, signal } from '@angular/core';
import { ExplorerStore } from './state/explorer-store';
import { SCENE_PRESETS } from './state/scene-presets';
import { ControlPanel } from './ui/control-panel';
import { AnalysisPanel } from './ui/analysis-panel';
import { Inspector } from './ui/inspector';
import { SceneIo } from './ui/scene-io';
import { Timeline } from './ui/timeline';
import { Viewport } from './ui/viewport';

@Component({
  selector: 'app-root',
  imports: [Viewport, Inspector, ControlPanel, Timeline, AnalysisPanel, SceneIo],
  template: `
    <header class="topbar">
      <span class="topbar__title">Blast Movement Explorer</span>
      <label class="field" style="margin: 0">
        <span class="sr-only">Scene</span>
        <select aria-label="Scene" data-testid="scene-select" [value]="store.presetId()" (change)="onScene($event)">
          @for (p of presets; track p.id) {
            <option [value]="p.id">{{ p.label }}</option>
          }
        </select>
      </label>
      <span class="badge" data-testid="synthetic-label" title="All data is procedurally generated. Movement is an illustrative rule, not a blast physics prediction.">
        Synthetic data · Illustrative movement
      </span>
      <span class="topbar__spacer"></span>
      <app-scene-io />
      <button class="btn" type="button" data-testid="reset-all" title="Reload the current scene and restore default cutoff, filters, section, regions and display settings" (click)="resetScene()">Reset</button>
    </header>

    <aside class="panel panel--left" [class.panel--collapsed]="leftCollapsed()" aria-label="Controls">
      <div class="panel__toggle">
        <button class="btn btn--icon" type="button" [attr.aria-expanded]="!leftCollapsed()" aria-controls="left-body"
          [title]="leftCollapsed() ? 'Expand controls' : 'Collapse controls'" (click)="leftCollapsed.set(!leftCollapsed())">
          {{ leftCollapsed() ? '›' : '‹' }}
        </button>
      </div>
      <div class="panel__body" id="left-body"><app-control-panel /></div>
    </aside>

    <app-viewport />
    <app-timeline />

    <aside class="panel panel--right" [class.panel--collapsed]="rightCollapsed()" aria-label="Inspector and analysis">
      <div class="panel__toggle" style="justify-content: flex-start">
        <button class="btn btn--icon" type="button" [attr.aria-expanded]="!rightCollapsed()" aria-controls="right-body"
          [title]="rightCollapsed() ? 'Expand inspector' : 'Collapse inspector'" (click)="rightCollapsed.set(!rightCollapsed())">
          {{ rightCollapsed() ? '‹' : '›' }}
        </button>
      </div>
      <div class="panel__body" id="right-body"><app-inspector /><app-analysis-panel /></div>
    </aside>
  `,
  host: { class: 'shell' },
})
export class App {
  protected readonly store = inject(ExplorerStore);
  protected readonly presets = SCENE_PRESETS;
  protected readonly leftCollapsed = signal(false);
  protected readonly rightCollapsed = signal(false);

  constructor() {
    void this.store.loadPreset(this.store.presetId());
  }

  protected onScene(e: Event): void {
    void this.store.loadPreset((e.target as HTMLSelectElement).value);
  }

  protected resetScene(): void {
    void this.store.resetAll();
  }
}
