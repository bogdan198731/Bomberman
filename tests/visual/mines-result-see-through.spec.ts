import { test, expect } from '@playwright/test';
import { openGame, box, renderedColorAt, colorDifference, textContrast, CLEARLY_DIFFERENT, READABLE_TEXT } from './helpers';

test('mines end message leaves the final board visible behind it', async ({ page }) => {
  // A saved Easy board with the ten mines in the top row, so the first tap loses.
  const cells = '1'.repeat(10) + '0'.repeat(71);
  await page.addInitScript(saved => {
    try { localStorage.setItem('blast-arcade-mines-session-v1', saved); } catch { /* storage blocked */ }
  }, JSON.stringify({ difficulty: 'easy', cells, elapsedMs: 0 }));
  await openGame(page, 'mines');

  const board = page.locator('#minesCanvas');
  const field = await box(board);
  const tile = field.width / 9;
  await board.click({ position: { x: tile / 2, y: tile / 2 } });
  const result = page.locator('.arcade-result-overlay');
  await expect(result).toBeVisible();

  // The red exploded tile and a mine the player missed, with and without the message on top.
  const exploded = { x: field.x + tile * .3, y: field.y + tile * .3, width: tile * .4, height: tile * .15 };
  const missedMine = { x: field.x + tile * 4.2, y: field.y + tile * .2, width: tile * .6, height: tile * .6 };
  await result.evaluate(overlay => { overlay.style.visibility = 'hidden'; });
  const explodedAlone = await renderedColorAt(page, exploded);
  const missedAlone = await renderedColorAt(page, missedMine);
  await result.evaluate(overlay => { overlay.style.visibility = ''; });

  expect(colorDifference(explodedAlone, await renderedColorAt(page, exploded))).toBeLessThan(CLEARLY_DIFFERENT);
  expect(colorDifference(missedAlone, await renderedColorAt(page, missedMine))).toBeLessThan(CLEARLY_DIFFERENT);
  expect(await textContrast(page.locator('#arcadeResultTitle'))).toBeGreaterThanOrEqual(READABLE_TEXT);
  expect(await textContrast(page.locator('.arcade-result-explanation'))).toBeGreaterThanOrEqual(READABLE_TEXT);
});
