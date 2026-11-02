import { expect, test } from '@playwright/test';
import { findPickable, findSelfPickingBlock, FRONT_TOP_ROW, openApp } from './helpers';

// Tests added after the independent spec-to-test review (docs/agent-workflow.md).

test.describe('hidden selection and highlight', () => {
  test('outline is drawn at the selected block, follows t, and clears with the selection', async ({ page }) => {
    await openApp(page);
    const p = await findSelfPickingBlock(page, FRONT_TOP_ROW);
    await page.mouse.click(p.x, p.y);
    await expect(page.getByTestId('sel-id')).toHaveText(String(p.id));
    const b = (await page.evaluate((id) => window.__bmx!.block(id), p.id))!;
    const o0 = await page.evaluate(() => window.__bmx!.selectionOutline());
    expect(o0.visible).toBe(true);
    o0.center.forEach((v, k) => expect(v).toBeCloseTo(b.centerBefore[k], 4));

    await page.getByTestId('t-after').click();
    await expect.poll(() => page.evaluate(() => window.__bmx!.selectionOutline().center[1])).toBeCloseTo(b.centerAfter[1], 4);

    const box = (await page.getByTestId('viewport').boundingBox())!;
    await page.getByRole('button', { name: 'Reset camera' }).click();
    await page.mouse.click(box.x + 20, box.y + 120); // background
    await expect(page.getByTestId('sel-empty')).toBeVisible();
    expect((await page.evaluate(() => window.__bmx!.selectionOutline())).visible).toBe(false);
  });

  test('section clears a selected block above it', async ({ page }) => {
    await openApp(page);
    const p = await findPickable(page); // top layer, Z = 23 m
    await page.mouse.click(p.x, p.y);
    await expect(page.getByTestId('sel-id')).toHaveText(String(p.id));
    await page.getByTestId('section-enabled').check();
    await expect(page.getByTestId('sel-empty')).toBeVisible();
    await expect(page.getByTestId('notice')).toContainText(`block ${p.id} is hidden`);
  });

  test('hiding the block layer clears the selection', async ({ page }) => {
    await openApp(page);
    const p = await findPickable(page);
    await page.mouse.click(p.x, p.y);
    await page.getByTestId('layer-blocks').uncheck();
    await expect(page.getByTestId('sel-empty')).toBeVisible();
    await expect(page.getByTestId('notice')).toContainText('hidden');
  });

  test('movement that carries a selected block above the section clears it', async ({ page }) => {
    await openApp(page);
    // A block above Z = 12 m before movement that drops to or below it at t = 1.
    const id = await page.evaluate(() => {
      for (let i = 0; i < 28_800; i++) {
        const b = window.__bmx!.block(i)!;
        if (b.centerBefore[2] > 12 && b.centerAfter[2] <= 12) return i;
      }
      return null;
    });
    expect(id, 'the default movement drops some blocks across Z = 12 m').not.toBeNull();
    await page.getByTestId('t-after').click();
    await page.getByTestId('section-enabled').check(); // Z = 12
    await page.evaluate((blockId) => window.__bmx!.selectForTest(blockId), id!);
    await expect(page.getByTestId('sel-id')).toHaveText(String(id)); // drawn at t = 1, so it stays selected
    await page.getByTestId('t-before').click(); // back above the section
    await expect(page.getByTestId('sel-empty')).toBeVisible();
    await expect(page.getByTestId('notice')).toContainText(`block ${id} is hidden`);
  });
});

test.describe('view state never rescales or moves frozen things', () => {
  test('filters do not change the legend; cutoff does not change the original region', async ({ page }) => {
    await openApp(page);
    const legend = await page.getByLabel('Colour legend').locator('.legend__ticks').textContent();
    const original = await page.getByTestId('region-original').textContent();
    await page.getByTestId('ore-only').check();
    await page.getByTestId('grade-min').fill('1.5');
    await page.getByTestId('grade-min').press('Enter');
    expect(await page.getByLabel('Colour legend').locator('.legend__ticks').textContent()).toBe(legend);
    await page.getByTestId('cutoff-input').fill('1.4');
    await page.getByTestId('cutoff-input').press('Enter');
    await expect(page.getByTestId('m-A-totalOreTonnes')).not.toHaveText('92,862');
    expect(await page.getByTestId('region-original').textContent()).toBe(original);
  });

  test('orientation indicator shows E / N / Up and a metre scale', async ({ page }) => {
    await openApp(page);
    const gizmo = page.getByLabel('Orientation and scale');
    for (const label of ['E', 'N', 'Up']) await expect(gizmo.locator('text', { hasText: new RegExp(`^${label}$`) })).toHaveCount(1);
    await expect(gizmo).toContainText(/\d+ m \(at target\)/);
  });
});

test.describe('quality and reduced motion (with a control that can fail)', () => {
  test('High uses DPR 2 on a 2× display; Low uses 1; metrics unchanged', async ({ browser }) => {
    const context = await browser.newContext({ deviceScaleFactor: 2, viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    await openApp(page, './?quality=high');
    expect(await page.evaluate(() => window.__bmx!.pixelRatio())).toBe(2);
    const metrics = await page.locator('[data-testid^="m-"]').allTextContents();
    await page.getByTestId('quality-select').selectOption('low');
    await expect.poll(() => page.evaluate(() => window.__bmx?.pixelRatio())).toBe(1);
    expect(await page.locator('[data-testid^="m-"]').allTextContents()).toEqual(metrics);
    await context.close();
  });

  for (const motion of ['reduce', 'no-preference'] as const) {
    test(`camera inertia after a drag with prefers-reduced-motion: ${motion}`, async ({ browser }) => {
      const context = await browser.newContext({ reducedMotion: motion, viewport: { width: 1280, height: 720 } });
      const page = await context.newPage();
      await openApp(page);
      const p = await findPickable(page);
      await page.mouse.move(p.x, p.y);
      await page.mouse.down();
      await page.mouse.move(p.x + 60, p.y, { steps: 3 });
      const before = (await page.evaluate(() => window.__bmx!.lifecycle())).framesRendered;
      await page.mouse.up();
      await expect.poll(() => page.evaluate(() => window.__bmx!.lifecycle().pendingFrames), { timeout: 60_000 }).toBe(0);
      const framesAfterRelease = (await page.evaluate(() => window.__bmx!.lifecycle())).framesRendered - before;
      // With damping, OrbitControls keeps rendering for many frames after release.
      if (motion === 'reduce') expect(framesAfterRelease).toBeLessThanOrEqual(3);
      else expect(framesAfterRelease).toBeGreaterThan(5);
      await context.close();
    });
  }
});
