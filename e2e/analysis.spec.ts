import { expect, Page, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { findPickable, openApp } from './helpers';

async function metrics(page: Page): Promise<string[]> {
  return page.locator('[data-testid^="m-"]').allTextContents();
}

async function metric(page: Page, scenario: 'A' | 'B' | 'C', key: string): Promise<string> {
  return (await page.getByTestId(`m-${scenario}-${key}`).textContent())!.trim();
}

async function setNumber(page: Page, testId: string, value: string): Promise<void> {
  const input = page.getByTestId(testId);
  await input.fill(value);
  await input.press('Enter');
  await input.blur();
}

test.describe('filtering-and-dig-analysis', () => {
  test('empty grade filter shows an explicit empty state', async ({ page }) => {
    await openApp(page);
    await setNumber(page, 'grade-max', '60');
    await setNumber(page, 'grade-min', '50');
    await expect(page.getByTestId('empty-filter')).toContainText('No blocks match the current filters');
    await expect.poll(() => page.evaluate(() => window.__bmx!.findPickableBlock())).toBeNull();
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(page.getByTestId('empty-filter')).toHaveCount(0);
  });

  test('ore-only clears a selected waste block with a notice', async ({ page }) => {
    await openApp(page);
    const p = await findPickable(page); // top layer of the default view is waste
    await page.mouse.click(p.x, p.y);
    await expect(page.getByTestId('sel-econ')).toHaveText('Waste');
    await page.getByTestId('ore-only').check();
    await expect(page.getByTestId('sel-empty')).toBeVisible();
    await expect(page.getByTestId('notice')).toContainText(`block ${p.id} is hidden`);
  });

  test('blocks above the section are neither drawn nor pickable', async ({ page }) => {
    await openApp(page);
    const p = await findPickable(page);
    const b = await page.evaluate((id) => window.__bmx!.block(id), p.id);
    expect(b!.centerBefore[2]).toBeGreaterThan(12);
    await page.getByTestId('section-enabled').check(); // Z = 12 m
    await expect.poll(() => page.evaluate(([x, y]) => window.__bmx!.pickAt(x, y), [p.x, p.y])).not.toBe(p.id);
    expect(await page.evaluate((id) => window.__bmx!.projectBlock(id), p.id)).toBeNull();
    // The click resolves to whatever is drawn there now (a block at or below the section, or nothing).
    const picked = await page.evaluate(([x, y]) => window.__bmx!.pickAt(x, y), [p.x, p.y]);
    await page.mouse.click(p.x, p.y);
    if (picked === null) {
      await expect(page.getByTestId('sel-empty')).toBeVisible();
    } else {
      await expect(page.getByTestId('sel-id')).toHaveText(String(picked));
      const pb = await page.evaluate((id) => window.__bmx!.block(id), picked);
      expect(pb!.centerBefore[2]).toBeLessThanOrEqual(12);
    }
  });

  test('editing the adjusted region changes scenario C only', async ({ page }) => {
    await openApp(page);
    const a = await metric(page, 'A', 'lostOreTonnes');
    const b = await metric(page, 'B', 'lostOreTonnes');
    expect(await metric(page, 'C', 'lostOreTonnes')).toBe(b); // adjusted starts equal to original
    await setNumber(page, 'adj-centerN', '20');
    await expect(page.getByTestId('m-C-lostOreTonnes')).not.toHaveText(b);
    expect(await metric(page, 'A', 'lostOreTonnes')).toBe(a);
    expect(await metric(page, 'B', 'lostOreTonnes')).toBe(b);
  });

  test('view settings and t never change metrics; cutoff does', async ({ page }) => {
    await openApp(page);
    const baseline = await metrics(page);
    expect(baseline.length).toBe(24);
    await page.getByTestId('layer-terrain').uncheck();
    await page.getByTestId('layer-blocks').uncheck();
    await page.getByTestId('color-displacement').check();
    await page.getByTestId('ore-only').check();
    await page.getByTestId('section-enabled').check();
    await page.getByTestId('t-slider').fill('0.5');
    await page.getByTestId('quality-select').selectOption('medium');
    await expect(page.getByTestId('t-value')).toHaveText('0.50');
    expect(await metrics(page)).toEqual(baseline);

    await setNumber(page, 'cutoff-input', '1.2');
    await expect.poll(() => metrics(page)).not.toEqual(baseline);
  });

  test('exports a CSV whose values match the table', async ({ page }) => {
    await openApp(page);
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-csv').click()]);
    const csv = readFileSync((await download.path())!, 'utf8').trim().split('\r\n');
    expect(csv[0].split(',').slice(0, 3)).toEqual(['scenario', 'description', 'endpoint']);
    expect(csv.length).toBe(4);
    const header = csv[0].split(',');
    for (const [row, id] of [[1, 'A'], [2, 'B'], [3, 'C']] as const) {
      const cells = csv[row].split(',');
      expect(cells[0]).toBe(id);
      const lost = Number(cells[header.indexOf('lost_ore_t')]);
      expect((await metric(page, id, 'lostOreTonnes')).replace(/,/g, '')).toBe(String(Math.round(lost)));
      const loss = Number(cells[header.indexOf('ore_loss_pct')]);
      expect(await metric(page, id, 'oreLossPercent')).toBe(loss.toFixed(1));
    }
  });

  test('exported config restores cutoff, regions and metrics', async ({ page }) => {
    await openApp(page);
    await setNumber(page, 'cutoff-input', '1.1');
    await setNumber(page, 'adj-centerE', '60');
    await page.getByTestId('ore-only').check();
    const saved = await metrics(page);
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-config').click()]);
    const file = (await download.path())!;
    const json = JSON.parse(readFileSync(file, 'utf8'));
    expect(json.cutoff).toBe(1.1);
    expect(json.regions.adjusted.centerE).toBe(60);
    expect(json.scene.seed).toBe(20261103);
    expect(json.scene.generation.movement.throwMetres).toBe(6);

    await setNumber(page, 'cutoff-input', '0.5');
    await setNumber(page, 'adj-centerE', '40');
    await page.getByTestId('ore-only').uncheck();
    expect(await metrics(page)).not.toEqual(saved);

    await page.getByTestId('import-config').setInputFiles(file);
    await expect(page.getByTestId('notice')).toContainText('imported');
    await expect.poll(() => metrics(page)).toEqual(saved);
    await expect(page.getByTestId('cutoff-input')).toHaveValue('1.1');
    await expect(page.getByTestId('adj-centerE')).toHaveValue('60');
    await expect(page.getByTestId('ore-only')).toBeChecked();
  });

  test('invalid config files show errors and leave the scene unchanged', async ({ page }) => {
    await openApp(page);
    const before = await metrics(page);
    await page.getByTestId('import-config').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{not json') });
    await expect(page.getByTestId('import-errors')).toContainText('not valid JSON');
    await page.getByRole('button', { name: 'Dismiss' }).click();

    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-config').click()]);
    const cfg = JSON.parse(readFileSync((await download.path())!, 'utf8'));
    cfg.cutoff = -1;
    await page.getByTestId('import-config').setInputFiles({ name: 'bad-cutoff.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(cfg)) });
    await expect(page.getByTestId('import-errors')).toContainText('cutoff');
    expect(await metrics(page)).toEqual(before);
    await expect(page.getByTestId('cutoff-input')).toHaveValue('0.8');
  });
});
