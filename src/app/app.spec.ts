import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [App] }).compileComponents();
  });

  it('always shows the synthetic-data label', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="synthetic-label"]')?.textContent?.trim()).toBe('Synthetic data · Illustrative movement');
  });

  it('shows the WebGL-unavailable state when no context can be created (jsdom has no WebGL)', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="webgl-unavailable"]')?.textContent).toContain('WebGL is not available');
  });
});
