import { test, expect } from '@playwright/test';
import { openGame, box, overlaps, textContrast, READABLE_TEXT, MIN_TAP_TARGET } from './helpers';

test('end-of-game card is small and leaves the hangman word readable', async ({ page }) => {
  // Hard mode, three of four tries used on CANADA: one more wrong letter loses.
  await page.addInitScript(saved => {
    try { localStorage.setItem('blast-arcade-hangman-session-v1', saved); } catch { /* storage blocked */ }
  }, JSON.stringify({ difficulty: 'hard', word: 'CANADA', category: 'Countries', guesses: 'ZQX', streak: 0 }));
  await openGame(page, 'hangman');
  await page.keyboard.press('w');

  const card = page.locator('.arcade-result-card');
  await expect(card).toBeVisible();
  const word = page.locator('#hangmanWord');
  await expect(word.locator('.hangman-letter')).toHaveText(['C', 'A', 'N', 'A', 'D', 'A']);

  const viewport = page.viewportSize()!;
  const cardBox = await box(card);
  expect(cardBox.height).toBeLessThanOrEqual(viewport.height * .3);
  expect(overlaps(cardBox, await box(word))).toBe(false);
  // Readable through the backdrop, not just uncovered.
  expect(await textContrast(word.locator('.hangman-letter').first())).toBeGreaterThanOrEqual(READABLE_TEXT);
  expect(await textContrast(page.locator('#arcadeResultTitle'))).toBeGreaterThanOrEqual(READABLE_TEXT);
  expect(await textContrast(page.locator('.arcade-result-explanation'))).toBeGreaterThanOrEqual(READABLE_TEXT);
  for (const button of await card.locator('button:visible').all()) {
    expect(await textContrast(button)).toBeGreaterThanOrEqual(READABLE_TEXT);
    expect((await box(button)).height).toBeGreaterThanOrEqual(MIN_TAP_TARGET);
  }
});
