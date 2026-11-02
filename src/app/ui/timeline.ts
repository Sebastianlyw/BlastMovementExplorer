import { DecimalPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ExplorerStore } from '../state/explorer-store';

@Component({
  selector: 'app-timeline',
  imports: [DecimalPipe],
  template: `
    <button class="btn" type="button" data-testid="t-before" title="Show blocks at their pre-movement positions (t = 0)"
      (click)="store.setMovementT(0)">Before (t = 0)</button>
    @if (store.playing()) {
      <button class="btn" type="button" data-testid="t-pause" (click)="store.playing.set(false)">Pause</button>
    } @else {
      <button class="btn" type="button" data-testid="t-play" title="Play the interpolation from the current t to 1"
        (click)="store.playing.set(true)">Play</button>
    }
    <button class="btn" type="button" data-testid="t-after" title="Show blocks at their post-movement positions (t = 1)"
      (click)="store.setMovementT(1)">After (t = 1)</button>
    <label class="timeline__slider" for="movement-t">
      <span title="Linear interpolation between the before and after positions. Not elapsed time and not a real trajectory.">Movement interpolation t</span>
      <input id="movement-t" type="range" min="0" max="1" step="0.01" data-testid="t-slider"
        [value]="store.movementT()" (input)="onSlide($event)" aria-describedby="t-help" />
      <output data-testid="t-value">{{ store.movementT() | number: '1.2-2' }}</output>
    </label>
    <span class="timeline__help" id="t-help" title="Illustrative interpolation — not time, not a trajectory.">Illustrative interpolation — not time, not a trajectory.</span>
  `,
  host: { class: 'timeline', role: 'group', 'aria-label': 'Movement interpolation' },
})
export class Timeline {
  protected readonly store = inject(ExplorerStore);

  protected onSlide(e: Event): void {
    this.store.setMovementT(Number((e.target as HTMLInputElement).value));
  }
}
