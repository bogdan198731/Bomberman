import { test, expect } from '@playwright/test';
import {
  openGame, renderedColor, colorDifference, textContrast, box, insideViewport,
  CLEARLY_DIFFERENT, READABLE_TEXT, MIN_TAP_TARGET,
} from './helpers';

// A saved round of CANADA with one wrong guess (Z), so the test knows the word.
async function openWithCanada(page: import('@playwright/test').Page): Promise<void> {
  await page.addInitScript(saved => {
    try { localStorage.setItem('blast-arcade-hangman-session-v1', saved); } catch { /* storage blocked */ }
  }, JSON.stringify({ difficulty: 'normal', word: 'CANADA', category: 'Countries', guesses: 'Z', streak: 0 }));
  await openGame(page, 'hangman');
}

test('hangman keys fit the screen and show right and wrong guesses clearly', async ({ page }) => {
  await openWithCanada(page);
  const keys = page.locator('.hangman-key');
  await expect(keys).toHaveCount(26);
  for (const letter of ['A', 'M', 'Z']) {
    const key = page.locator(`.hangman-key[data-letter="${letter}"]`);
    expect(await insideViewport(key)).toBe(true);
    const size = await box(key);
    expect(size.width).toBeGreaterThanOrEqual(30);
    expect(size.height).toBeGreaterThanOrEqual(MIN_TAP_TARGET);
  }

  const untouched = page.locator('.hangman-key[data-letter="M"]');
  const wrong = page.locator('.hangman-key[data-letter="Z"]');
  const right = page.locator('.hangman-key[data-letter="A"]');
  await right.click();
  await expect(right).toBeDisabled();
  const untouchedColor = await renderedColor(untouched);
  expect(colorDifference(untouchedColor, await renderedColor(right))).toBeGreaterThanOrEqual(CLEARLY_DIFFERENT);
  expect(colorDifference(untouchedColor, await renderedColor(wrong))).toBeGreaterThanOrEqual(CLEARLY_DIFFERENT);
  for (const key of [untouched, right, wrong]) expect(await textContrast(key)).toBeGreaterThanOrEqual(READABLE_TEXT);

  await expect(page.locator('#hangmanWord .hangman-letter')).toHaveText(['', 'A', '', 'A', '', 'A']);
  await expect(page.locator('#hangmanLives')).toHaveText('5');
  expect(await textContrast(page.locator('#hangmanWord .hangman-letter').nth(1))).toBeGreaterThanOrEqual(READABLE_TEXT);
});

test('typing the last letters of the word wins the round', async ({ page }) => {
  await openWithCanada(page);
  for (const letter of 'cand') await page.keyboard.press(letter);
  await expect(page.locator('#hangmanWord .hangman-letter')).toHaveText(['C', 'A', 'N', 'A', 'D', 'A']);
  await expect(page.locator('#arcadeResultTitle')).toHaveText('VICTORY');
  expect(await textContrast(page.locator('#arcadeResultTitle'))).toBeGreaterThanOrEqual(READABLE_TEXT);
});
