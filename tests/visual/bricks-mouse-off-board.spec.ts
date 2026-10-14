import { test, expect, type Page } from '@playwright/test';
import { openGame, box } from './helpers';

// Arena width and paddle row from src/bricks.ts.
const ARENA_WIDTH = 800;
const PADDLE_Y = 560;

/** The left end of the Mint paddle, in arena units, found by its colour on the canvas. */
async function paddleLeft(page: Page): Promise<number> {
  return page.evaluate(y => {
    const canvas = document.getElementById('bricksCanvas') as HTMLCanvasElement;
    const { data, width } = canvas.getContext('2d')!.getImageData(0, y, canvas.width, 1);
    for (let x = 0; x < width; x++) {
      if (Math.abs(data[x * 4] - 0x54) < 12 && Math.abs(data[x * 4 + 1] - 0xe3) < 12 && Math.abs(data[x * 4 + 2] - 0x8e) < 12) return x;
    }
    return -1;
  }, PADDLE_Y);
}

test('the paddle keeps following a mouse that slips off the board', async ({ page }) => {
  test.skip(Boolean(test.info().project.use.hasTouch), 'a finger stays with the board it pressed on');
  await openGame(page, 'bricks');
  const board = await box(page.locator('#bricksCanvas'));
  const middle = { x: board.x + board.width / 2, y: board.y + board.height * PADDLE_Y / 600 };
  await page.mouse.move(middle.x, middle.y, { steps: 5 });
  await expect.poll(() => paddleLeft(page)).toBeGreaterThan(ARENA_WIDTH / 4);

  // Leave the board sideways in one jump, as a fast flick does: no move lands on it.
  await page.mouse.move(Math.max(1, board.x - 30), middle.y);
  await expect.poll(() => paddleLeft(page)).toBeLessThan(8);
});
