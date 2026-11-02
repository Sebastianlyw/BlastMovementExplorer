import { expect, Page, test } from '@playwright/test';
import { findPickable, findSelfPickingBlock, FRONT_TOP_ROW, openApp } from './helpers';

/** Top-layer block in the front (south) row, middle of the bench: moves noticeably. */
const FRONT_TOP_BLOCK = 30 + 60 * (0 + 40 * 11);

async function viewportShot(page: Page): Promise<Buffer> {
  await page.waitForTimeout(150);
  return page.locator('[data-testid="viewport"] canvas').screenshot();
}

test.describe('movement-and-inspection', () => {
  test('Before / After change what is drawn and the slider value', async ({ page }) => {
    await openApp(page);
    const before = await page.evaluate((id) => window.__bmx!.projectBlock(id), FRONT_TOP_BLOCK);
    const imgBefore = await viewportShot(page);
    await page.getByTestId('t-after').click();
    await expect(page.getByTestId('t-value')).toHaveText('1.00');
    const after = await page.evaluate((id) => window.__bmx!.projectBlock(id), FRONT_TOP_BLOCK);
    expect(Math.hypot(after!.x - before!.x, after!.y - before!.y)).toBeGreaterThan(5);
    expect((await viewportShot(page)).equals(imgBefore)).toBe(false);

    await page.getByTestId('t-before').click();
    await expect(page.getByTestId('t-value')).toHaveText('0.00');
    const back = await page.evaluate((id) => window.__bmx!.projectBlock(id), FRONT_TOP_BLOCK);
    expect(back!.x).toBeCloseTo(before!.x, 6);
    expect(back!.y).toBeCloseTo(before!.y, 6);
  });

  test('dragging the slider moves blocks to the interpolated position', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('t-slider').fill('0.5');
    await expect(page.getByTestId('t-value')).toHaveText('0.50');
    // A block at t = 0.5 is picked where it is drawn, and clicking there selects it.
    const p = await findSelfPickingBlock(page, FRONT_TOP_ROW);
    const b = await page.evaluate((id) => window.__bmx!.block(id), p.id);
    const mid = b!.centerBefore.map((v, k) => 0.5 * v + 0.5 * b!.centerAfter[k]);
    expect(mid[1]).toBeLessThan(b!.centerBefore[1]); // moved south part-way
    await page.mouse.click(p.x, p.y);
    await expect(page.getByTestId('sel-id')).toHaveText(String(p.id));
  });

  test('picking at t = 1 uses moved positions and the inspector shows the displacement', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('t-after').click();
    await expect(page.getByTestId('t-value')).toHaveText('1.00');
    const p = await findSelfPickingBlock(page, FRONT_TOP_ROW);
    await page.getByTestId('t-before').click();
    await expect(page.getByTestId('t-value')).toHaveText('0.00');
    const atBefore = await page.evaluate((id) => window.__bmx!.projectBlock(id), p.id);
    await page.getByTestId('t-after').click();
    await expect(page.getByTestId('t-value')).toHaveText('1.00');
    await page.mouse.click(p.x, p.y);
    await expect(page.getByTestId('sel-id')).toHaveText(String(p.id));
    const b = await page.evaluate((id) => window.__bmx!.block(id), p.id);
    const d = b!.centerAfter.map((v, k) => v - b!.centerBefore[k]);
    await expect(page.getByTestId('sel-disp')).toHaveText(`${d.map((v) => v.toFixed(2)).join(' / ')} m`.replace(/-0\.00/g, '-0.00'));
    await expect(page.getByTestId('sel-disp-mag')).toHaveText(`${Math.hypot(d[0], d[1], d[2]).toFixed(2)} m`);
    // Its old screen position no longer resolves to it.
    expect(await page.evaluate(([x, y]) => window.__bmx!.pickAt(x, y), [atBefore!.x, atBefore!.y])).not.toBe(p.id);
  });

  test('Play runs the interpolation to t = 1 on user action only', async ({ page }) => {
    await openApp(page);
    await page.waitForTimeout(500);
    await expect(page.getByTestId('t-value')).toHaveText('0.00'); // nothing auto-plays
    await page.getByTestId('t-play').click();
    await expect(page.getByTestId('t-pause')).toBeVisible();
    await expect(page.getByTestId('t-value')).toHaveText('1.00', { timeout: 10_000 });
    await expect(page.getByTestId('t-play')).toBeVisible();
  });

  test('Pause stops playback before the end', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('t-play').click();
    // Click Pause without Playwright's stability wait: under software WebGL each frame can take
    // ~0.4 s, and waiting two frames lets the 4 s playback finish first.
    await page.evaluate(async () => {
      let btn: HTMLButtonElement | null = null;
      while (!(btn = document.querySelector('[data-testid="t-pause"]'))) await new Promise((r) => setTimeout(r, 5));
      btn.click();
    });
    await expect(page.getByTestId('t-play')).toBeVisible();
    const v = Number(await page.getByTestId('t-value').textContent());
    expect(v).toBeLessThan(1);
    await page.waitForTimeout(600);
    expect(Number(await page.getByTestId('t-value').textContent())).toBe(v);
  });

  test('colour mode switches the legend; layers toggle independently', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('color-displacement').check();
    await expect(page.getByLabel('Colour legend')).toContainText('Displacement magnitude (m)');
    await expect(page.getByLabel('Colour legend')).toContainText('≥ 12.0');

    const withTerrain = await viewportShot(page);
    await page.getByTestId('layer-terrain').uncheck();
    expect((await viewportShot(page)).equals(withTerrain)).toBe(false);
    await findPickable(page); // blocks still visible and pickable

    await page.getByTestId('layer-blocks').uncheck();
    await expect.poll(() => page.evaluate(() => window.__bmx!.findPickableBlock())).toBeNull();
  });
});
