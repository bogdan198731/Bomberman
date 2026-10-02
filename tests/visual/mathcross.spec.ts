import { test, expect, type Page } from '@playwright/test';
import {
  openGame, renderedColor, colorDifference, textContrast, box, insideViewport, overlaps,
  CLEARLY_DIFFERENT, READABLE_TEXT, MIN_TAP_TARGET,
} from './helpers';

// A saved Easy puzzle the test knows the answers to:
//   3 + [4] = 7        across the top
//   7 + [5] = 12       down the right
//   [8] + 4 = 12       across the middle
// One number is already typed, so the game restores it instead of making a new puzzle.
const SAVED = {
  difficulty: 'easy',
  puzzle: {
    size: 5,
    equations: [
      { nodes: [0, 1, 2], op: '+', across: true },
      { nodes: [2, 7, 12], op: '+', across: false },
      { nodes: [10, 11, 12], op: '+', across: true },
    ],
    values: [3, 4, 7, null, null, null, null, 5, null, null, 8, 4, 12, ...Array(12).fill(null)],
    given: [true, false, true, false, false, false, false, false, false, false, false, true, true, ...Array(12).fill(false)],
  },
  entries: [null, 4, ...Array(23).fill(null)],
  elapsedSeconds: 0,
};

async function openSavedPuzzle(page: Page): Promise<void> {
  await page.addInitScript(saved => {
    try { localStorage.setItem('blast-arcade-mathcross-session-v1', saved); } catch { /* storage blocked */ }
  }, JSON.stringify(SAVED));
  await openGame(page, 'mathcross');
}

const node = (page: Page, index: number) => page.locator(`.mathcross-node[data-node="${index}"]`);

test('math crossword circles and keypad fit the screen and read clearly', async ({ page }) => {
  await openSavedPuzzle(page);
  await expect(page.locator('#mathcrossBoard .mathcross-node')).toHaveCount(7);
  await expect(page.locator('#mathcrossBoard .mathcross-link b')).toHaveText(['+', '=', '+', '=', '+', '=']);
  await expect(node(page, 1)).toHaveText('4');
  await expect(page.locator('#mathcrossLeft')).toHaveText('2');

  for (const circle of [node(page, 1), node(page, 7), node(page, 10)]) {
    expect(await insideViewport(circle)).toBe(true);
    expect((await box(circle)).height).toBeGreaterThanOrEqual(MIN_TAP_TARGET);
  }
  const keys = page.locator('.mathcross-key');
  await expect(keys).toHaveCount(11);
  for (const key of await keys.all()) {
    expect(await insideViewport(key)).toBe(true);
    expect((await box(key)).height).toBeGreaterThanOrEqual(MIN_TAP_TARGET);
  }
  // The keypad never sits on top of the grid.
  expect(overlaps(await box(page.locator('#mathcrossBoard')), await box(page.locator('#mathcrossPad')))).toBe(false);

  const given = page.locator('.mathcross-node.given').first();
  expect(await textContrast(given)).toBeGreaterThanOrEqual(READABLE_TEXT);
  expect(await textContrast(node(page, 1))).toBeGreaterThanOrEqual(READABLE_TEXT);
  expect(await textContrast(page.locator('.mathcross-link b').first())).toBeGreaterThanOrEqual(READABLE_TEXT);

  // The circle being filled stands out from the other empty ones.
  await node(page, 7).click();
  await expect(node(page, 7)).toHaveClass(/selected/);
  expect(colorDifference(await renderedColor(node(page, 7)), await renderedColor(node(page, 10)))).toBeGreaterThanOrEqual(CLEARLY_DIFFERENT);
});

test('a wrong answer turns red, and fixing it solves the puzzle', async ({ page }) => {
  await openSavedPuzzle(page);
  await node(page, 7).click();
  await page.locator('.mathcross-key[data-digit="5"]').click();
  await node(page, 10).click();
  await page.keyboard.press('9');
  await expect(node(page, 10)).toHaveClass(/wrong/);
  await expect(page.locator('#mathcrossStatus')).toHaveText('Not quite - the red circles break an equation.');
  expect(colorDifference(await renderedColor(node(page, 10)), await renderedColor(node(page, 7)))).toBeGreaterThanOrEqual(CLEARLY_DIFFERENT);
  expect(await textContrast(node(page, 10))).toBeGreaterThanOrEqual(READABLE_TEXT);

  await page.keyboard.press('Backspace');
  await page.keyboard.press('8');
  await expect(page.locator('#arcadeResultTitle')).toHaveText('VICTORY');
  expect(await textContrast(page.locator('#arcadeResultTitle'))).toBeGreaterThanOrEqual(READABLE_TEXT);
  await expect(page.locator('#mathcrossStatus')).toHaveText(/^Solved in \d+:\d{2}! \d+ points\.$/);
  // The finished grid stays readable behind the card.
  expect(await textContrast(node(page, 10))).toBeGreaterThanOrEqual(READABLE_TEXT);
});

test('a solved puzzle offers its score to the Everyone board', async ({ page }) => {
  await openSavedPuzzle(page);
  await node(page, 7).click();
  await page.keyboard.press('5');
  await node(page, 10).click();
  await page.keyboard.press('8');
  const claim = page.locator('.arcade-result-highscore');
  await expect(claim).toBeVisible();
  await expect(claim.locator('[data-highscore-title]')).toContainText('Math Crossword');
  expect(await textContrast(claim.locator('[data-highscore-title]'))).toBeGreaterThanOrEqual(READABLE_TEXT);
});
