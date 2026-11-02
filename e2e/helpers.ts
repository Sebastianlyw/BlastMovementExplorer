import { expect, Page } from '@playwright/test';

/** Open the app and wait until the default scene has been generated and rendered. */
export async function openApp(page: Page, path = '/?quality=low'): Promise<void> {
  await page.goto(path);
  await expect(page.getByTestId('synthetic-label')).toHaveText('Synthetic data · Illustrative movement');
  await page.waitForFunction(() => !!window.__bmx && window.__bmx.findPickableBlock() !== null, null, { timeout: 30_000 });
}

export async function findPickable(page: Page): Promise<{ id: number; x: number; y: number }> {
  const p = await page.evaluate(() => window.__bmx!.findPickableBlock());
  expect(p, 'a visible block should exist in the default view').not.toBeNull();
  return p!;
}

/**
 * Among candidate block ids, return one that is drawn and that unambiguously owns the
 * pixels around its projected centre (blocks may overlap after movement, so a centre can
 * sit on an overlap edge). Coordinates are rounded to whole pixels like real clicks.
 */
export async function findSelfPickingBlock(page: Page, ids: number[]): Promise<{ id: number; x: number; y: number }> {
  const hit = await page.evaluate((candidates) => {
    const h = window.__bmx!;
    for (const id of candidates) {
      const p = h.projectBlock(id);
      if (!p) continue;
      const x = Math.round(p.x);
      const y = Math.round(p.y);
      const around = [[0, 0], [2, 0], [-2, 0], [0, 2], [0, -2]];
      if (around.every(([dx, dy]) => h.pickAt(x + dx, y + dy) === id)) return { id, x, y };
    }
    return null;
  }, ids);
  expect(hit, 'some candidate block should be unambiguously visible').not.toBeNull();
  return hit!;
}

/** Ids of the top-layer blocks in the south (front) row of the default 60 × 40 × 12 grid. */
export const FRONT_TOP_ROW = Array.from({ length: 40 }, (_, i) => 10 + i + 60 * 40 * 11);
