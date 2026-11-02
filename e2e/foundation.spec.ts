import { expect, test } from '@playwright/test';
import { findPickable, openApp } from './helpers';

test.describe('foundation-and-synthetic-scene', () => {
  test('opens and finishes loading the default scene', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await openApp(page);
    await expect(page.getByRole('status')).toHaveCount(0);
    await expect(page.getByLabel('Colour legend')).toContainText('Grade (g/t)');
    await expect(page.getByLabel('Orientation and scale')).toContainText('Local coordinates');
    expect(errors).toEqual([]);
  });

  test('initial camera is above the terrain and outside the block model', async ({ page }) => {
    await openApp(page);
    const { position } = await page.evaluate(() => window.__bmx!.camera());
    const ground = await page.evaluate(([x, y]) => window.__bmx!.terrainHeight(x, y), [position[0], position[1]]);
    expect(position[2]).toBeGreaterThan(ground!);
    const inside = position[0] > 0 && position[0] < 120 && position[1] > 0 && position[1] < 80 && position[2] < 24;
    expect(inside).toBe(false);
  });

  test('Top preset looks down -Z with North up', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: 'Top', exact: true }).click();
    const { position, target } = await page.evaluate(() => window.__bmx!.camera());
    const d = [position[0] - target[0], position[1] - target[1], position[2] - target[2]];
    const len = Math.hypot(d[0], d[1], d[2]);
    expect(d[2] / len).toBeGreaterThan(0.999);
    // North up on screen: a block further north projects higher (smaller y).
    const south = await page.evaluate(() => window.__bmx!.projectBlock(30 + 60 * (5 + 40 * 11)));
    const north = await page.evaluate(() => window.__bmx!.projectBlock(30 + 60 * (35 + 40 * 11)));
    expect(north!.y).toBeLessThan(south!.y);
  });

  test('selecting a visible block shows its authoritative properties', async ({ page }) => {
    await openApp(page);
    await expect(page.getByTestId('sel-empty')).toBeVisible();
    const p = await findPickable(page);
    await page.mouse.click(p.x, p.y);
    await expect(page.getByTestId('sel-id')).toHaveText(String(p.id));
    const b = await page.evaluate((id) => window.__bmx!.block(id), p.id);
    expect(b).not.toBeNull();
    await expect(page.getByTestId('sel-grade')).toHaveText(`${b!.gradeGramsPerTonne.toFixed(3)} g/t`);
    await expect(page.getByTestId('sel-density')).toHaveText(`${b!.densityTonnesPerM3.toFixed(3)} t/m³`);
    const expectedTonnes = b!.size[0] * b!.size[1] * b!.size[2] * b!.densityTonnesPerM3;
    expect(b!.tonnes).toBeCloseTo(expectedTonnes, 9);
    await expect(page.getByTestId('sel-tonnes')).toHaveText(`${expectedTonnes.toFixed(2)} t`);
    await expect(page.getByTestId('sel-econ')).toHaveText(b!.gradeGramsPerTonne >= 0.8 ? 'Ore' : 'Waste');
  });

  test('clicking empty space clears the selection; dragging does not select', async ({ page }) => {
    await openApp(page);
    const p = await findPickable(page);
    await page.mouse.click(p.x, p.y);
    await expect(page.getByTestId('sel-id')).toHaveText(String(p.id));

    // A drag starting on a block orbits the camera and must not change the selection.
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await page.mouse.move(p.x + 60, p.y + 10, { steps: 5 });
    await page.mouse.up();
    await expect(page.getByTestId('sel-id')).toHaveText(String(p.id));

    // Top-left of the viewport (below the toolbar) shows only background in the default view.
    await page.getByRole('button', { name: 'Reset camera' }).click();
    const box = (await page.getByTestId('viewport').boundingBox())!;
    const empty = { x: box.x + 20, y: box.y + 120 };
    expect(await page.evaluate(([x, y]) => window.__bmx!.pickAt(x, y), [empty.x, empty.y])).toBeNull();
    await page.mouse.click(empty.x, empty.y);
    await expect(page.getByTestId('sel-empty')).toBeVisible();
  });
});
