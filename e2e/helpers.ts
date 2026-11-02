import { expect, Page } from '@playwright/test';

/** Open the app and wait until the default scene has been generated and rendered. */
export async function openApp(page: Page, path = '/'): Promise<void> {
  await page.goto(path);
  await expect(page.getByTestId('synthetic-label')).toHaveText('Synthetic data · Illustrative movement');
  await page.waitForFunction(() => !!window.__bmx && window.__bmx.findPickableBlock() !== null, null, { timeout: 30_000 });
}

export async function findPickable(page: Page): Promise<{ id: number; x: number; y: number }> {
  const p = await page.evaluate(() => window.__bmx!.findPickableBlock());
  expect(p, 'a visible block should exist in the default view').not.toBeNull();
  return p!;
}
