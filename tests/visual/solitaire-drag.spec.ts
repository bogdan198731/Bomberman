import { test, expect, type Page } from '@playwright/test';
import { openGame, box } from './helpers';

const card = (suit: number, rank: number, up = true) => ({ suit, rank, up });
// Table layout from src/solitaire.ts: 724 wide, cards 92 x 128, columns 10 apart, tableau from y 162.
const columnMiddle = (column: number): number => 10 + column * 102 + 46;

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
  const table = await box(page.locator('#solitaireCanvas'));
  const scale = table.width / 724;
  const at = (point: { x: number; y: number }) => ({ x: table.x + point.x * scale, y: table.y + point.y * scale });
  const path = Array.from({ length: 9 }, (_, step) => ({
    x: at(from).x + (at(to).x - at(from).x) * step / 8,
    y: at(from).y + (at(to).y - at(from).y) * step / 8,
  }));
  if (test.info().project.use.hasTouch) {
    // A real finger, so the page would scroll unless the game holds on to the card.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [path[0]] });
    for (const point of path.slice(1)) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
    return;
  }
  await page.mouse.move(path[0].x, path[0].y);
  await page.mouse.down();
  for (const point of path.slice(1)) await page.mouse.move(point.x, point.y);
  await page.mouse.up();
}

test('solitaire cards can be dragged onto a column and onto a foundation', async ({ page }) => {
  const placed = ['1:9', '0:8', '2:5', '1:4', '0:3', '2:2', '1:6', '3:1'];
  const rest = [0, 1, 2, 3].flatMap(suit => Array.from({ length: 13 }, (_, i) => card(suit, i + 1, false)))
    .filter(c => !placed.includes(`${c.suit}:${c.rank}`));
  const saved = {
    stock: rest,
    waste: [card(3, 1)],
    foundations: [[], [], [], []],
    tableau: [[card(1, 9)], [card(0, 8)], [card(2, 5)], [card(1, 4)], [card(0, 3)], [card(2, 2)], [card(1, 6)]],
    moves: 3,
    drawCount: 1,
    elapsedMs: 10_000,
  };
  await page.addInitScript(value => {
    try { localStorage.setItem('blast-arcade-solitaire-session-v1', value); } catch { /* storage blocked */ }
  }, JSON.stringify(saved));
  await openGame(page, 'solitaire');
  await expect(page.locator('#solitaireStatus')).toHaveText('Saved game restored - carry on.');
  const session = () => page.evaluate(() => JSON.parse(localStorage.getItem('blast-arcade-solitaire-session-v1') ?? 'null'));

  // The black 8 goes on the red 9; dropping it anywhere on that column's lower half is enough.
  await drag(page, { x: columnMiddle(1), y: 200 }, { x: columnMiddle(0), y: 330 });
  await expect(page.locator('#solitaireMoves')).toHaveText('4');
  expect((await session()).tableau[0].map((c: { rank: number }) => c.rank)).toEqual([9, 8]);

  // The ace of clubs flies from the waste to a foundation.
  // Phones follow the default joystick-right layout: deck on the right, foundations on the left.
  const deckRight = await page.evaluate(() => matchMedia('(max-width: 760px), (pointer: coarse)').matches);
  const wasteX = deckRight ? columnMiddle(5) : columnMiddle(1);
  const foundationX = deckRight ? columnMiddle(0) : columnMiddle(3);
  await drag(page, { x: wasteX, y: 70 }, { x: foundationX, y: 70 });
  await expect(page.locator('#solitaireMoves')).toHaveText('5');
  expect((await session()).foundations.flat().map((c: { rank: number }) => c.rank)).toEqual([1]);

  // A drop somewhere illegal puts the cards back where they were.
  await drag(page, { x: columnMiddle(2), y: 200 }, { x: columnMiddle(4), y: 300 });
  await expect(page.locator('#solitaireMoves')).toHaveText('5');

  // A plain tap still picks a card up, as before.
  await drag(page, { x: columnMiddle(4), y: 200 }, { x: columnMiddle(4), y: 200 });
  await drag(page, { x: columnMiddle(3), y: 200 }, { x: columnMiddle(3), y: 200 });
  await expect(page.locator('#solitaireMoves')).toHaveText('6');
});
