import { test, expect, type Page } from '@playwright/test';
import { openGame, textContrast, box, insideViewport, READABLE_TEXT, MIN_TAP_TARGET } from './helpers';

const emptyCell = (page: Page, nth: number) => page.locator('.sudoku-cell:not(.given)').nth(nth);

async function enter(page: Page, nth: number, number: string): Promise<void> {
  await emptyCell(page, nth).click();
  await page.locator(`[data-sudoku-number="${number}"]`).click();
}

test('a Sudoku player saves positions in the same puzzle and goes back to one', async ({ page }) => {
  page.on('dialog', dialog => dialog.accept());
  await openGame(page, 'sudoku');
  const saveButton = page.locator('#sudokuSaveButton');
  const rows = page.locator('#sudokuSavesList li:not(.empty)');
  const status = page.locator('#sudokuStatus');
  await expect(page.locator('#sudokuSavesCount')).toHaveText('0 of 3 saved');

  await saveButton.scrollIntoViewIfNeeded();
  expect(await insideViewport(saveButton)).toBe(true);
  expect((await box(saveButton)).height).toBeGreaterThanOrEqual(page.viewportSize()!.width < 620 ? MIN_TAP_TARGET : 40);
  expect(await textContrast(saveButton)).toBeGreaterThanOrEqual(READABLE_TEXT);
  expect(await textContrast(page.locator('#sudokuSavesList li.empty'))).toBeGreaterThanOrEqual(READABLE_TEXT);

  // Easy holds three positions of the same puzzle.
  await enter(page, 0, '1');
  await saveButton.click();
  await expect(status).toHaveText('Position 1 saved.');
  await enter(page, 1, '2');
  await saveButton.click();
  await enter(page, 2, '3');
  await saveButton.click();
  await expect(status).toHaveText('Position 3 saved.');
  await expect(rows).toHaveCount(3);
  await expect(page.locator('#sudokuSavesCount')).toHaveText('3 of 3 saved');
  for (const text of [rows.first().locator('b'), rows.first().locator('small'), page.locator('#sudokuSavesTitle')]) {
    expect(await textContrast(text)).toBeGreaterThanOrEqual(READABLE_TEXT);
  }

  // A fourth save asks which position to replace; Cancel keeps them all.
  await enter(page, 3, '4');
  await saveButton.click();
  await expect(status).toHaveText('All position slots are full. Pick one to overwrite.');
  await expect(saveButton).toHaveText('Cancel');
  await saveButton.click();
  await expect(status).toHaveText('Save cancelled.');

  // Going back to position 1 removes everything entered after it, even after a reload.
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.locator('#sudokuResumeSession').click();
  await expect(rows).toHaveCount(3);
  await page.getByRole('button', { name: 'Go back: Position 1' }).click();
  await expect(status).toHaveText('Back at position 1. Try another way.');
  await expect(emptyCell(page, 0)).toHaveText('1');
  for (const nth of [1, 2, 3]) await expect(emptyCell(page, nth)).toHaveText('');
  await expect(rows).toHaveCount(3);

  await saveButton.click();
  await page.getByRole('button', { name: 'Overwrite: Position 2' }).click();
  await expect(status).toHaveText('Position 2 overwritten.');
  await page.getByRole('button', { name: 'Delete: Position 3' }).click();
  await expect(page.locator('#sudokuSavesCount')).toHaveText('2 of 3 saved');

  // Positions belong to this puzzle; a new puzzle starts with none, and Hard has room for one.
  await page.locator('[data-sudoku-difficulty="hard"]').click();
  await expect(page.locator('#sudokuSavesCount')).toHaveText('0 of 1 saved');
  await enter(page, 0, '5');
  await saveButton.click();
  await saveButton.click();
  await expect(status).toHaveText('All position slots are full. Pick one to overwrite.');
});
