import { expect, test } from '@playwright/test';
import { openApp } from './helpers';

test.describe('surface-point-cloud', () => {
  test('is off by default and shows a labelled synthetic scan when enabled', async ({ page }) => {
    await openApp(page);
    expect(await page.evaluate(() => window.__bmx!.pointCount())).toBe(0);
    await page.getByTestId('layer-points').check();
    await expect(page.getByTestId('pc-status')).toContainText('points', { timeout: 20_000 });
    await expect(page.getByTestId('scan-label')).toContainText('Synthetic surface scan');
    const n = await page.evaluate(() => window.__bmx!.pointCount());
    expect(n).toBeGreaterThan(70_000);
    expect(n).toBeLessThan(100_000);
  });

  test('density tiers change the count; rapid switching ends on the last choice', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('layer-points').check();
    await expect(page.getByTestId('pc-status')).toContainText('points', { timeout: 20_000 });

    await page.getByTestId('pc-density').selectOption('300k');
    await expect.poll(() => page.evaluate(() => window.__bmx!.pointCount()), { timeout: 20_000 }).toBeGreaterThan(210_000);
    expect(await page.evaluate(() => window.__bmx!.pointCount())).toBeLessThan(300_000);

    // 1M request immediately superseded by 100k: the 1M result must never be shown.
    await page.getByTestId('pc-density').selectOption('1m');
    await page.getByTestId('pc-density').selectOption('100k');
    await expect.poll(() => page.evaluate(() => window.__bmx!.pointCount()), { timeout: 20_000 }).toBeLessThan(100_000);
    await page.waitForTimeout(1500); // give a stale 1M response time to (wrongly) arrive
    expect(await page.evaluate(() => window.__bmx!.pointCount())).toBeLessThan(100_000);
    await expect(page.getByTestId('pc-density')).toHaveValue('100k');
  });

  test('point cloud visibility, density and size never change metrics', async ({ page }) => {
    await openApp(page);
    const before = await page.locator('[data-testid^="m-"]').allTextContents();
    await page.getByTestId('layer-points').check();
    await page.getByTestId('pc-density').selectOption('300k');
    await expect.poll(() => page.evaluate(() => window.__bmx!.pointCount()), { timeout: 20_000 }).toBeGreaterThan(210_000);
    await page.getByTestId('pc-size').fill('5');
    await page.getByTestId('pc-color').selectOption('natural');
    expect(await page.locator('[data-testid^="m-"]').allTextContents()).toEqual(before);
  });
});
