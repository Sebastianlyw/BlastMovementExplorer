import { expect, Page, test } from '@playwright/test';
import { findPickable, openApp } from './helpers';

async function settle(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => window.__bmx!.lifecycle().pendingFrames), { timeout: 20_000 }).toBe(0);
}

async function waitReady(page: Page): Promise<void> {
  await expect(page.getByText('Generating synthetic scene')).toHaveCount(0);
  await page.waitForFunction(() => !!window.__bmx && window.__bmx.findPickableBlock() !== null, null, { timeout: 30_000 });
}

test.describe('performance-and-delivery: lifecycle and robustness', () => {
  test('repeated scene and quality changes do not accumulate renderers, frames or geometries', async ({ page }) => {
    await openApp(page);
    await settle(page);
    const baseline = await page.evaluate(() => window.__bmx!.lifecycle());
    expect(baseline.liveRenderers).toBe(1);

    for (const scene of ['bench-b', 'bench-c', 'bench-a', 'bench-b', 'bench-a']) {
      await page.getByTestId('scene-select').selectOption(scene);
      await waitReady(page);
    }
    for (const q of ['medium', 'high', 'low'] as const) {
      await page.getByTestId('quality-select').selectOption(q);
      await waitReady(page);
    }
    await settle(page);
    const after = await page.evaluate(() => window.__bmx!.lifecycle());
    expect(after.liveRenderers).toBe(1);
    expect(after.pendingFrames).toBe(0);
    expect(after.geometries).toBe(baseline.geometries);
    expect(after.textures).toBe(baseline.textures);
  });

  test('an idle viewport stops rendering', async ({ page }) => {
    await openApp(page);
    await settle(page);
    const f0 = (await page.evaluate(() => window.__bmx!.lifecycle())).framesRendered;
    await page.waitForTimeout(1000);
    const f1 = (await page.evaluate(() => window.__bmx!.lifecycle())).framesRendered;
    expect(f1).toBe(f0);
  });

  test('WebGL context loss shows a message and recovers on restore', async ({ page }) => {
    await openApp(page);
    expect(await page.evaluate(() => window.__bmx!.loseContext())).toBe(true);
    await expect(page.getByText('The graphics context was lost')).toBeVisible();
    await page.evaluate(() => window.__bmx!.restoreContext());
    await expect(page.getByText('The graphics context was lost')).toHaveCount(0);
    const p = await findPickable(page);
    await page.mouse.click(p.x, p.y);
    await expect(page.getByTestId('sel-id')).toHaveText(String(p.id));
  });

  test('diagnostics panel shows renderer counts and the benchmark reports a result', async ({ page }) => {
    test.setTimeout(120_000);
    await openApp(page);
    await page.getByTestId('diag-toggle').click();
    await expect(page.getByTestId('diag-instances')).toHaveText('28,800');
    await expect.poll(async () => Number(await page.getByTestId('diag-draws').textContent())).toBeGreaterThan(0);
    await page.getByTestId('bench-run').click();
    // Headless software rendering: this only checks the benchmark completes and reports.
    await expect(page.getByTestId('bench-result')).toContainText('Median / p95 frame', { timeout: 90_000 });
    const r = await page.evaluate(() => window.__bmx!.lastBenchmark());
    expect(r!.frames).toBeGreaterThan(0);
    expect(r!.measurement).toContain('not GPU timing');
    expect(r!.blockInstances).toBe(28_800);
  });
});
