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

// Common desktop windows, from a small laptop to a full-HD monitor.
const DESKTOPS = [[900, 700], [1280, 720], [1366, 768], [1920, 1080]] as const;

for (const [width, height] of DESKTOPS) {
  test(`on a ${width}x${height} desktop the whole game fits on one screen`, async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'Desktop layout only; phones stack the game.');
    await page.setViewportSize({ width, height });
    await openGame(page, 'hangman');
    const ids = ['#hangmanCanvas', '#hangmanWord', '#hangmanKeyboard', '#hangmanDifficulty', '#hangmanNewButton'];
    for (const id of ids) {
      const part = await box(page.locator(id));
      expect(part.y + part.height, `${id} ends inside the window`).toBeLessThanOrEqual(height);
    }
    // Side by side: the gallows on the left, the word and keyboard beside it, not under it.
    const gallows = await box(page.locator('#hangmanCanvas'));
    const keyboard = await box(page.locator('#hangmanKeyboard'));
    expect(keyboard.x).toBeGreaterThanOrEqual(gallows.x + gallows.width);
    expect(keyboard.y).toBeLessThan(gallows.y + gallows.height);
    for (const key of await page.locator('.hangman-key').all()) {
      expect((await box(key)).height).toBeGreaterThanOrEqual(MIN_TAP_TARGET);
    }
    expect(await textContrast(page.locator('#hangmanNewButton'))).toBeGreaterThanOrEqual(READABLE_TEXT);
  });
}

test('the longest word stays on one line beside the gallows, with the keyboard in view', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'Desktop layout only.');
  await page.setViewportSize({ width: 900, height: 700 });
  await page.addInitScript(saved => {
    try { localStorage.setItem('blast-arcade-hangman-session-v1', saved); } catch { /* storage blocked */ }
  }, JSON.stringify({ difficulty: 'normal', word: 'FIREFIGHTER', category: 'Jobs', guesses: 'ZQ', streak: 0 }));
  await openGame(page, 'hangman');
  await page.keyboard.press('e');
  // The word redraws on every guess, so it is measured in one go inside the page.
  const rows = await page.evaluate(() => new Set([...document.querySelectorAll('#hangmanWord .hangman-letter')]
    .map(letter => Math.round(letter.getBoundingClientRect().y))).size);
  expect(rows).toBe(1);
  const word = await box(page.locator('#hangmanWord'));
  expect(word.x).toBeGreaterThanOrEqual((await box(page.locator('#hangmanCanvas'))).x + 100);
  const keyboard = await box(page.locator('#hangmanKeyboard'));
  expect(keyboard.y + keyboard.height).toBeLessThanOrEqual(700);
});
