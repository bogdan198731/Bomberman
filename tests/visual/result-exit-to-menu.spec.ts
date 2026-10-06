import { test, expect } from '@playwright/test';
import { openGame, textContrast, READABLE_TEXT } from './helpers';

test('Exit on the end-of-game card goes back to the main menu', async ({ page }) => {
  // Hard mode, three of four tries used on CANADA: one more wrong letter loses.
  await page.addInitScript(saved => {
    try { localStorage.setItem('blast-arcade-hangman-session-v1', saved); } catch { /* storage blocked */ }
  }, JSON.stringify({ difficulty: 'hard', word: 'CANADA', category: 'Countries', guesses: 'ZQX', streak: 0 }));
  await openGame(page, 'hangman');
  await page.keyboard.press('w');

  const card = page.locator('.arcade-result-card');
  await expect(card).toBeVisible();
  await expect(card.getByRole('button', { name: 'Play again' })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Close' })).toHaveCount(0);
  const exit = card.getByRole('button', { name: 'Exit' });
  expect(await textContrast(exit)).toBeGreaterThanOrEqual(READABLE_TEXT);

  await exit.click();
  await expect(page.locator('.arcade-result-overlay')).toBeHidden();
  await expect(page.locator('body')).toHaveAttribute('data-view', 'hub');
  await expect(page.locator('#hubView')).toBeVisible();
  await expect(page.locator('#hangmanView')).toBeHidden();
});

test('Romanian players see Ieșire and it also leaves for the menu', async ({ page }) => {
  await page.addInitScript(saved => {
    try {
      localStorage.setItem('blast-arcade-settings-v1', JSON.stringify({
        soundEnabled: false, volume: 0, reducedMotion: true, highContrast: false, language: 'ro', touchControls: 'auto',
      }));
      localStorage.setItem('blast-arcade-guides-v1', JSON.stringify(['hangman']));
      localStorage.setItem('blast-arcade-hangman-session-v1', saved);
    } catch { /* storage blocked */ }
  }, JSON.stringify({ difficulty: 'hard', word: 'CANADA', category: 'Countries', guesses: 'ZQX', streak: 0 }));
  await page.goto('/ro/joc/hangman');
  await page.waitForLoadState('networkidle');
  await page.keyboard.press('w');

  const exit = page.locator('.arcade-result-card').getByRole('button', { name: 'Ieșire' });
  await expect(exit).toBeVisible();
  await exit.click();
  await expect(page.locator('body')).toHaveAttribute('data-view', 'hub');
});
