import { test, expect } from '@playwright/test';
import { openGame, textContrast, insideViewport, READABLE_TEXT } from './helpers';

test('solitaire offers Easy and Hard, starts on Easy, and remembers Hard', async ({ page }) => {
  await openGame(page, 'solitaire');
  const label = page.locator('#solitaireView label.gameplay-option');
  const picker = page.locator('#solitaireDraw');

  await expect(label).toContainText('Difficulty');
  await expect(picker.locator('option')).toHaveText(['Easy · draw 1', 'Hard · draw 3']);
  await expect(picker).toHaveValue('1');
  await picker.scrollIntoViewIfNeeded();
  expect(await insideViewport(picker)).toBe(true);
  expect(await textContrast(picker)).toBeGreaterThanOrEqual(READABLE_TEXT);
  expect(await textContrast(label)).toBeGreaterThanOrEqual(READABLE_TEXT);

  // Hard draws three cards at a time.
  await picker.selectOption('3');
  await page.keyboard.press('Space');
  await expect(page.locator('#solitaireMoves')).toHaveText('1');
  expect(await page.evaluate(() => {
    const session = JSON.parse(localStorage.getItem('blast-arcade-solitaire-session-v1') ?? 'null');
    return session?.waste?.length;
  })).toBe(3);

  await page.reload();
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#solitaireDraw')).toHaveValue('3');
});
