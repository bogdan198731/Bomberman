import { test, expect } from '@playwright/test';
import { openGame, textContrast, READABLE_TEXT } from './helpers';

// 0.1 brings out an orb on every bat hit, on Mint's side of the net, holding a big paddle.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { Math.random = () => 0.1; });
});

test('sending the ball through an orb gives Mint its bonus', async ({ page }) => {
  await openGame(page, 'paddle');
  await page.locator('#paddleServeButton').click();

  // Play Mint like a person: drag the bat to meet the ball, angling the return at an orb when one is out.
  const caught = await page.locator('#paddleCanvas').evaluate(async (board: HTMLCanvasElement) => {
    const ctx = board.getContext('2d')!;
    const find = (rgb: number[]): { x: number; y: number } | null => {
      const data = ctx.getImageData(60, 0, 780, board.height).data;
      let sx = 0, sy = 0, n = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (Math.abs(data[i] - rgb[0]) + Math.abs(data[i + 1] - rgb[1]) + Math.abs(data[i + 2] - rgb[2]) < 24) {
          sx += 60 + (i / 4) % 780; sy += Math.floor(i / 4 / 780); n++;
        }
      }
      return n > 20 ? { x: sx / n, y: sy / n } : null;
    };
    const bounds = board.getBoundingClientRect();
    const dragTo = (y: number, type = 'pointermove') => board.dispatchEvent(new PointerEvent(type, {
      pointerId: 7, clientX: bounds.left + 20, clientY: bounds.top + (y / board.height) * bounds.height, bubbles: true,
    }));
    dragTo(board.height / 2, 'pointerdown');
    const status = document.getElementById('paddleStatus')!;
    const serve = document.getElementById('paddleServeButton') as HTMLButtonElement;
    const started = performance.now();
    let last: { x: number; y: number } | null = null;
    while (performance.now() - started < 25_000) {
      if (/Mint: Big paddle!/.test(status.textContent ?? '')) return true;
      if (!serve.disabled) serve.click();
      const ball = find([248, 250, 252]) ?? find([255, 200, 87]);
      if (ball && last && ball.x < last.x) {
        // Where the ball will meet Mint's bat, then which part of the bat sends it at the orb.
        const slope = (ball.y - last.y) / (ball.x - last.x || -1);
        const meet = Math.max(11, Math.min(board.height - 11, ball.y + slope * (67 - ball.x)));
        const orb = find([84, 227, 208]);
        const angle = orb ? Math.atan2(orb.y - meet, orb.x - 67) : 0;
        const offset = Math.max(-0.95, Math.min(0.95, angle / (Math.PI * 0.34)));
        dragTo(meet - offset * 54);
      }
      last = ball;
      await new Promise(resolve => requestAnimationFrame(resolve));
    }
    return false;
  });
  expect(caught).toBe(true);

  const status = page.locator('#paddleStatus');
  await expect(status).toContainText('Mint: Big paddle!');
  expect(await textContrast(status)).toBeGreaterThanOrEqual(READABLE_TEXT);
  await page.screenshot({ path: test.info().outputPath('paddle-big.png') });
});
