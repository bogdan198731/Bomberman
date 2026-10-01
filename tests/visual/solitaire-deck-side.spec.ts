import { test, expect, type Page } from '@playwright/test';
import { openGame } from './helpers';

// Table coordinates: the first and last top-row piles, sampled inside the card face.
const LEFT_PILE = { x: 30, y: 32 };
const RIGHT_PILE = { x: 642, y: 32 };
const CARD_BACK = { r: 0x1f, g: 0x7a, b: 0x52 };

/** True when a face-down stock card is drawn at this table point. */
async function stockAt(page: Page, point: { x: number; y: number }): Promise<boolean> {
  const [r, g, b] = await page.locator('#solitaireCanvas').evaluate((canvas: HTMLCanvasElement, p) => {
    return Array.from(canvas.getContext('2d')!.getImageData(p.x, p.y, 1, 1).data);
  }, point);
  return Math.abs(r - CARD_BACK.r) + Math.abs(g - CARD_BACK.g) + Math.abs(b - CARD_BACK.b) < 12;
}

async function tapTable(page: Page, point: { x: number; y: number }): Promise<void> {
  const table = (await page.locator('#solitaireCanvas').boundingBox())!;
  await page.mouse.click(table.x + (point.x / 724) * table.width, table.y + (point.y / 760) * table.height);
}

async function useJoystickSide(page: Page, side: 'joystick-left' | 'joystick-right'): Promise<void> {
  await page.addInitScript(value => {
    try { localStorage.setItem('blast-arcade-bomberman-touch-layout-v1', value); } catch { /* storage blocked */ }
  }, side);
}

test('the solitaire stock follows the joystick side on a phone and stays left on desktop', async ({ page }, testInfo) => {
  const phone = testInfo.project.name === 'phone';
  await useJoystickSide(page, 'joystick-right');
  await openGame(page, 'solitaire');

  const stock = phone ? RIGHT_PILE : LEFT_PILE;
  const other = phone ? LEFT_PILE : RIGHT_PILE;
  await expect.poll(() => stockAt(page, stock)).toBe(true);
  expect(await stockAt(page, other)).toBe(false);

  // Tapping where the stock is drawn is what draws a card.
  await tapTable(page, stock);
  await expect(page.locator('#solitaireMoves')).toHaveText('1');

  // Switching sides in Settings moves it straight away on a phone.
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('arcade-touch-layout-change', { detail: { layout: 'joystick-left' } })));
  await expect.poll(() => stockAt(page, LEFT_PILE)).toBe(true);
  expect(await stockAt(page, RIGHT_PILE)).toBe(false);
});

test('a phone player with the joystick on the left keeps the stock on the left', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', 'phone layout only');
  await useJoystickSide(page, 'joystick-left');
  await openGame(page, 'solitaire');
  await expect.poll(() => stockAt(page, LEFT_PILE)).toBe(true);
  expect(await stockAt(page, RIGHT_PILE)).toBe(false);
  await tapTable(page, LEFT_PILE);
  await expect(page.locator('#solitaireMoves')).toHaveText('1');
});
