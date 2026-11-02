import { expect, test } from '@playwright/test';
import { openApp } from './helpers';

// Runs in the "subpath" project against `npm run build:pages` served at /BlastMovementExplorer/.
test('static build works under a sub-path, including the worker chunk', async ({ page }) => {
  const failed: string[] = [];
  page.on('response', (r) => {
    if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`);
  });
  await openApp(page);
  expect(page.url()).toContain('/BlastMovementExplorer/');
  await expect(page.getByTestId('analysis')).toContainText('Total ore');
  await page.getByTestId('layer-points').check();
  await expect(page.getByTestId('pc-status')).toContainText('points', { timeout: 20_000 });
  expect(failed).toEqual([]);
});
