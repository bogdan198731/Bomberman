import { test, expect } from '@playwright/test';
import { openGame, textContrast, READABLE_TEXT } from './helpers';

// "Start at" picks where a new game begins; it should not pop back up for every ball or wall.
test('the start level picker shows for a new game only, not mid-run', async ({ page }) => {
  await openGame(page, 'bricks');
  const picker = page.locator('#bricksLevel');
  const status = page.locator('#bricksStatus');
  await expect(picker).toBeVisible();
  expect(await textContrast(page.locator('.gameplay-option', { has: picker }))).toBeGreaterThanOrEqual(READABLE_TEXT);

  // Park the paddle at the far right: the ball serves to the left and soon gets past it.
  const canvas = page.locator('#bricksCanvas');
  const parkRight = () => canvas.evaluate((board: HTMLCanvasElement) => {
    const bounds = board.getBoundingClientRect();
    board.dispatchEvent(new PointerEvent('pointermove', { clientX: bounds.right - 1, pointerType: 'mouse', bubbles: true }));
  });
  await parkRight();
  await page.locator('#bricksLaunchButton').click();
  await expect(picker).toBeHidden();

  const lostBall = await canvas.evaluate(async (board: HTMLCanvasElement) => {
    const bounds = board.getBoundingClientRect();
    const started = performance.now();
    while (performance.now() - started < 20_000) {
      board.dispatchEvent(new PointerEvent('pointermove', { clientX: bounds.right - 1, pointerType: 'mouse', bubbles: true }));
      if (document.getElementById('bricksLives')!.textContent !== '3') return true;
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    return false;
  });
  expect(lostBall).toBe(true);
  await expect(status).toContainText('Launch when ready');
  await expect(picker, 'waiting to serve the next ball is not a new game').toBeHidden();

  // Starting over is a new game, so the choice comes back.
  await page.locator('#bricksRestartButton').evaluate((button: HTMLButtonElement) => button.click());
  await expect(picker).toBeVisible();
});
