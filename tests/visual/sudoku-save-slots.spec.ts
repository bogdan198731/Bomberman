import { test, expect, type Page } from '@playwright/test';
import { openGame, textContrast, box, insideViewport, READABLE_TEXT, MIN_TAP_TARGET } from './helpers';

const firstEmptyCell = (page: Page) => page.locator('.sudoku-cell:not(.given)').first();

async function enterOne(page: Page, number: string): Promise<void> {
  await firstEmptyCell(page).click();
  await page.locator(`[data-sudoku-number="${number}"]`).click();
}

test('saved Sudoku tables fill their slots, ask which to overwrite, and reopen later', async ({ page }) => {
  page.on('dialog', dialog => dialog.accept());
  await openGame(page, 'sudoku');
  const saveButton = page.locator('#sudokuSaveButton');
  const rows = page.locator('#sudokuSavesList li:not(.empty)');
  await expect(page.locator('#sudokuSavesList')).toHaveText('No saved tables yet.');
  await expect(page.locator('#sudokuSavesCount')).toHaveText('Easy 0/3Medium 0/2Hard 0/1');

  await saveButton.scrollIntoViewIfNeeded();
  expect(await insideViewport(saveButton)).toBe(true);
  expect((await box(saveButton)).height).toBeGreaterThanOrEqual(page.viewportSize()!.width < 620 ? MIN_TAP_TARGET : 40);
  expect(await textContrast(saveButton)).toBeGreaterThanOrEqual(READABLE_TEXT);

  // Three different Easy tables take the three Easy slots.
  await enterOne(page, '1');
  await saveButton.click();
  await expect(page.locator('#sudokuStatus')).toHaveText('Table saved to Easy slot 1.');
  for (let slot = 2; slot <= 3; slot += 1) {
    await page.locator('.sudoku-actions [data-sudoku-new]').click();
    await enterOne(page, String(slot));
    await saveButton.click();
    await expect(page.locator('#sudokuStatus')).toHaveText(`Table saved to Easy slot ${slot}.`);
  }
  await expect(rows).toHaveCount(3);
  await expect(page.locator('#sudokuSavesCount')).toHaveText('Easy 3/3Medium 0/2Hard 0/1');
  for (const text of [rows.first().locator('b'), rows.first().locator('small'), page.locator('#sudokuSavesTitle')]) {
    expect(await textContrast(text)).toBeGreaterThanOrEqual(READABLE_TEXT);
  }

  // A fourth table has nowhere free, so the player picks a slot to replace.
  await page.locator('.sudoku-actions [data-sudoku-new]').click();
  await enterOne(page, '4');
  await saveButton.click();
  await expect(page.locator('#sudokuStatus')).toHaveText('All Easy slots are full. Pick one to overwrite.');
  await expect(saveButton).toHaveText('Cancel');
  await expect(page.getByRole('button', { name: 'Overwrite Easy slot 2' })).toBeVisible();
  await page.getByRole('button', { name: 'Overwrite Easy slot 2' }).click();
  await expect(page.locator('#sudokuStatus')).toHaveText('Easy slot 2 overwritten.');
  await expect(rows).toHaveCount(3);

  // Hard has a single slot.
  await page.locator('[data-sudoku-difficulty="hard"]').click();
  await enterOne(page, '5');
  await saveButton.click();
  await page.locator('.sudoku-actions [data-sudoku-new]').click();
  await enterOne(page, '6');
  await saveButton.click();
  await expect(page.locator('#sudokuStatus')).toHaveText('All Hard slots are full. Pick one to overwrite.');
  await saveButton.click();
  await expect(page.locator('#sudokuStatus')).toHaveText('Save cancelled.');

  // After a reload the saved table comes back exactly as it was left.
  await page.reload();
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#sudokuSavesCount')).toHaveText('Easy 3/3Medium 0/2Hard 1/1');
  await page.getByRole('button', { name: 'Open Easy slot 2' }).click();
  await expect(page.locator('#sudokuStatus')).toHaveText('Easy slot 2 opened. Keep going.');
  await expect(page.locator('[data-sudoku-difficulty="easy"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(firstEmptyCell(page)).toHaveText('4');

  await page.getByRole('button', { name: 'Delete Easy slot 1' }).click();
  await expect(rows).toHaveCount(3);
  await expect(page.locator('#sudokuSavesCount')).toHaveText('Easy 2/3Medium 0/2Hard 1/1');
});
