import { test, expect } from '@playwright/test';
import { openGame, textContrast, READABLE_TEXT } from './helpers';

const card = (suit: number, rank: number, up = true) => ({ suit, rank, up });
const run = (suit: number) => Array.from({ length: 13 }, (_, i) => card(suit, i + 1));

test('a solitaire deal that can no longer be won ends, tells the player, and stays put', async ({ page }) => {
  // Hearts and diamonds are home, and the king of clubs is about to join them. After that
  // only spades are left, and spades never stack on spades: the ace is hidden under the 5,
  // no column is empty, and the kings on the foundations have nowhere to come down to.
  const saved = {
    stock: [9, 10, 11, 12, 13].map(rank => card(0, rank, false)),
    waste: [card(3, 13)],
    foundations: [run(1), run(2), run(3).slice(0, 12), []],
    tableau: [[card(0, 1, false), card(0, 5)], ...[2, 3, 4, 6, 7, 8].map(rank => [card(0, rank)])],
    moves: 40,
    drawCount: 1,
    elapsedMs: 60_000,
  };
  await page.addInitScript(value => {
    try { localStorage.setItem('blast-arcade-solitaire-session-v1', value); } catch { /* storage blocked */ }
  }, JSON.stringify(saved));
  await openGame(page, 'solitaire');
  await expect(page.locator('#solitaireStatus')).toHaveText('Saved game restored - carry on.');
  // A sends the king of clubs home - the last move this deal allows.
  await page.keyboard.press('a');

  const status = page.locator('#solitaireStatus');
  await expect(status).toHaveText('No moves left - this deal can no longer be won. Deal again.');
  expect(await textContrast(status)).toBeGreaterThanOrEqual(READABLE_TEXT);
  await expect(page.locator('#arcadeResultTitle')).toHaveText('DEFEAT');
  await expect(page.locator('.arcade-result-explanation')).toContainText('No moves left');
  expect(await textContrast(page.locator('.arcade-result-explanation'))).toBeGreaterThanOrEqual(READABLE_TEXT);

  // The game is over: the cards stay where they are, whatever the player tries.
  // Esc hides the card and stays on the table; Exit would leave for the menu.
  await page.keyboard.press('Escape');
  await expect(page.locator('.arcade-result-overlay')).toBeHidden();
  await expect(page.locator('#solitaireUndoButton')).toBeDisabled();
  const moves = page.locator('#solitaireMoves');
  await expect(moves).toHaveText('41');
  await page.keyboard.press('u');
  await page.keyboard.press('Space');
  // Tap the king of hearts on the foundations, then the 5 of spades column.
  const table = (await page.locator('#solitaireCanvas').boundingBox())!;
  const tap = (x: number, y: number) => page.mouse.click(table.x + (x / 724) * table.width, table.y + (y / 760) * table.height);
  await tap(357, 70);
  await tap(56, 230);
  await expect(moves).toHaveText('41');
  await expect(status).toHaveText('No moves left - this deal can no longer be won. Deal again.');
});
