import { test, expect, type Page, type Locator } from '@playwright/test';
import { openGame, box } from './helpers';

/** The board's button layer sits exactly on the canvas picture it describes. */
async function expectLayerOnCanvas(page: Page, canvas: string, layer: Locator): Promise<void> {
  const picture = await box(page.locator(canvas));
  const buttons = await box(layer);
  for (const side of ['x', 'y', 'width', 'height'] as const) expect(Math.abs(buttons[side] - picture[side])).toBeLessThan(2);
  // Screen readers get the buttons instead of an unlabeled picture.
  await expect(page.locator(canvas)).toHaveAttribute('aria-hidden', 'true');
}

/** Keyboard focus shows as a gold ring on the board itself. */
async function expectVisibleFocus(spot: Locator): Promise<void> {
  await expect(spot).toBeFocused();
  const ring = await spot.evaluate(element => {
    const style = getComputedStyle(element);
    return { style: style.outlineStyle, color: style.outlineColor, width: parseFloat(style.outlineWidth) };
  });
  expect(ring.style).toBe('solid');
  expect(ring.color).toBe('rgb(255, 200, 87)');
  expect(ring.width).toBeGreaterThanOrEqual(3);
}

const live = (page: Page, view: string): Locator => page.locator(`${view} .board-access-live`);

test('Minesweeper squares are buttons a keyboard and a screen reader can use', async ({ page }) => {
  await openGame(page, 'mines');
  const field = page.getByRole('group', { name: 'Minesweeper field' });
  await expectLayerOnCanvas(page, '#minesCanvas', field);
  await expect(field.getByRole('button')).toHaveCount(81);

  const middle = field.getByRole('button', { name: 'Row 5, column 5: hidden' });
  await middle.focus();
  await page.keyboard.press('ArrowRight');
  const beside = field.getByRole('button', { name: 'Row 5, column 6: hidden' });
  await expectVisibleFocus(beside);
  // Spot and square line up: the ring sits on the square it names.
  const canvas = await box(page.locator('#minesCanvas'));
  const ring = await box(beside);
  expect(Math.abs(ring.x - (canvas.x + canvas.width * 5 / 9))).toBeLessThan(2);
  expect(Math.abs(ring.y - (canvas.y + canvas.height * 4 / 9))).toBeLessThan(2);

  await page.keyboard.press('f');
  await expect(field.getByRole('button', { name: 'Row 5, column 6: flagged' })).toBeFocused();
  await expect(live(page, '#minesView')).toHaveText('flagged');
  await page.keyboard.press('f');
  await page.keyboard.press('Enter');
  // The first square is always safe; whatever it opened is now read as a number or clear.
  await expect(field.getByRole('button', { name: /^Row 5, column 6: (clear|\d mines? next to it)$/ })).toBeFocused();
  await expect(live(page, '#minesView')).toHaveText(/^(clear|\d mines? next to it)$/);
  await expect(page.locator('#minesLeft')).toHaveText('10');
});

test('Reversi squares name their discs, legal moves, and every move made', async ({ page }) => {
  await openGame(page, 'reversi');
  const board = page.getByRole('group', { name: 'Reversi board' });
  await expectLayerOnCanvas(page, '#reversiCanvas', board);
  await expect(board.getByRole('button')).toHaveCount(64);
  await expect(board.getByRole('button', { name: 'Row 4, column 4: Coral' })).toHaveCount(1);
  await expect(board.getByRole('button', { name: /you can play here$/ })).toHaveCount(4);
  // One tab stop for the whole board, not 64.
  await expect(board.locator('button[tabindex="0"]')).toHaveCount(1);
  await expect(page.locator('#reversiCanvas')).not.toHaveAttribute('tabindex', '0');

  const move = board.getByRole('button', { name: 'Row 3, column 4: empty, you can play here' });
  await move.focus();
  await expectVisibleFocus(move);
  await page.keyboard.press('Enter');
  await expect(board.getByRole('button', { name: 'Row 3, column 4: Mint' })).toBeFocused();
  // The player's move, then the bot's reply, are both read out.
  await expect(live(page, '#reversiView')).toHaveText(/^Coral played row \d, column \d, flipping \d+\. Mint to play\.$/);
});

test('Four in a Row columns are buttons that read their discs from the bottom up', async ({ page }) => {
  await openGame(page, 'fourrow');
  const board = page.getByRole('group', { name: 'Four in a Row board' });
  await expectLayerOnCanvas(page, '#fourrowCanvas', board);
  await expect(board.getByRole('button')).toHaveCount(7);
  const middle = board.getByRole('button', { name: 'Column 4: 6 spaces free' });
  await middle.focus();
  await expectVisibleFocus(middle);
  await page.keyboard.press('Enter');
  await expect(board.getByRole('button', { name: /^Column 4: 5 spaces free\. From the bottom: Mint$|^Column 4: 4 spaces free\. From the bottom: Mint, Coral$/ })).toBeFocused();
  await expect(live(page, '#fourrowView')).toHaveText(/^Coral dropped in column \d\. Mint to drop a disc\.$/);
  await page.keyboard.press('ArrowLeft');
  await expect(board.getByRole('button', { name: /^Column 3: / })).toBeFocused();
});

test('the Solitaire table can be played from the keyboard, card by card', async ({ page }) => {
  await openGame(page, 'solitaire');
  const table = page.getByRole('group', { name: 'Solitaire table' });
  await expectLayerOnCanvas(page, '#solitaireCanvas', table);
  // Stock, waste, four foundations, and the seven face-up cards of a fresh deal.
  await expect(table.getByRole('button')).toHaveCount(13);
  await expect(table.getByRole('button', { name: /^Column 7: .+, covering 6 face-down cards$/ })).toHaveCount(1);

  const stock = table.getByRole('button', { name: 'Stock: 24 cards' });
  await stock.focus();
  await expectVisibleFocus(stock);
  await page.keyboard.press('Enter');
  await expect(live(page, '#solitaireView')).toHaveText(/^Drew (Ace|[2-9]|10|Jack|Queen|King) of (spades|hearts|diamonds|clubs)\.$/);
  await expect(table.getByRole('button', { name: 'Stock: 23 cards' })).toBeFocused();
  await expect(page.locator('#solitaireMoves')).toHaveText('1');

  // Walk down to the column under the stock (left on desktop, right on phones) and pick its card up.
  await page.keyboard.press('ArrowDown');
  const card = table.locator('button:focus');
  await expect(card).toHaveAccessibleName(/^Column [17]: /);
  await page.keyboard.press('Enter');
  await expect(live(page, '#solitaireView')).toHaveText(/^Picked up .+\. Choose where it goes\.$/);
  await expect(card).toHaveAttribute('aria-pressed', 'true');
  // Enter again sends it to its best place, or puts it back down.
  await page.keyboard.press('Enter');
  await expect(live(page, '#solitaireView')).toHaveText(/^(Moved\. .+|No move there\.)$/);
  await expect(table.locator('[aria-pressed="true"]')).toHaveCount(0);
});

test('board buttons are read in Romanian when the arcade is in Romanian', async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('blast-arcade-settings-v1', JSON.stringify({
        soundEnabled: false, volume: 0, reducedMotion: true, highContrast: false, language: 'ro', touchControls: 'auto',
      }));
      localStorage.setItem('blast-arcade-guides-v1', JSON.stringify(['mines']));
    } catch { /* defaults */ }
  });
  await page.goto('/play/mines');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('group', { name: 'Câmpul de mine' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Rândul 1, coloana 1: acoperit' })).toHaveCount(1);
});
