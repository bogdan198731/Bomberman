import { test, expect } from '@playwright/test';
import { openGame, textContrast, READABLE_TEXT } from './helpers';

// 0.1 places fruit, always brings out a bonus after a fruit, and picks the star fruit.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { Math.random = () => 0.1; });
});

/** Centre (in canvas pixels) of the pixels within a few shades of a colour, or null. */
const findColor = `(canvas, rgb) => {
  const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  let x = 0, y = 0, n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (Math.abs(data[i] - rgb[0]) + Math.abs(data[i + 1] - rgb[1]) + Math.abs(data[i + 2] - rgb[2]) < 24) {
      const p = i / 4; x += p % canvas.width; y += Math.floor(p / canvas.width); n++;
    }
  }
  return n > 40 ? { x: x / n, y: y / n } : null;
}`;

test('a bonus appears after a fruit and catching it scores', async ({ page }) => {
  await openGame(page, 'snake');
  await page.locator('#snakeSpeed').selectOption('155');
  await page.locator('#snakeStartButton').click();

  // Steer like a person: head for the bonus when one is out, else the fruit.
  const caught = await page.locator('#snakeCanvas').evaluate(async (board: HTMLCanvasElement, source: string) => {
    const find = new Function(`return ${source}`)() as (c: HTMLCanvasElement, rgb: number[]) => { x: number; y: number } | null;
    const status = document.getElementById('snakeStatus')!;
    const press = (code: string) => window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
    const started = performance.now();
    let last = '';
    while (performance.now() - started < 25_000) {
      if (/Star fruit/.test(status.textContent ?? '')) return true;
      const head = find(board, [84, 227, 142]);
      const target = find(board, [255, 159, 67]) ?? find(board, [255, 200, 87]);
      if (head && target) {
        const dx = Math.round((target.x - head.x) / 32);
        const dy = Math.round((target.y - head.y) / 32);
        const want = Math.abs(dx) >= Math.abs(dy) && dx !== 0 ? (dx > 0 ? 'KeyD' : 'KeyA') : dy !== 0 ? (dy > 0 ? 'KeyS' : 'KeyW') : '';
        const reverse: Record<string, string> = { KeyD: 'KeyA', KeyA: 'KeyD', KeyW: 'KeyS', KeyS: 'KeyW' };
        if (want && want !== last) {
          // A U-turn is refused, so side-step first.
          if (reverse[want] === last) press(want === 'KeyA' || want === 'KeyD' ? 'KeyW' : 'KeyA');
          else press(want);
          last = want;
        }
      }
      await new Promise(resolve => setTimeout(resolve, 40));
    }
    return false;
  }, findColor);
  expect(caught).toBe(true);

  const status = page.locator('#snakeStatus');
  await expect(status).toContainText('Star fruit - 5 points!');
  expect(Number(await page.locator('#snakeMintScore').textContent())).toBeGreaterThanOrEqual(6);
  expect(await textContrast(status)).toBeGreaterThanOrEqual(READABLE_TEXT);
  await page.screenshot({ path: test.info().outputPath('snake-star.png') });
});
