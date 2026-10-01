import { test, expect } from '@playwright/test';
import { openGame, textContrast, READABLE_TEXT } from './helpers';

// Every broken brick drops a power capsule: 0.1 is under the drop chance and lands on "power".
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { Math.random = () => 0.1; });
});

/** Pixels on the canvas (in arena units) within a few shades of a colour. */
const findColor = `(canvas, rgb, top, bottom) => {
  const data = canvas.getContext('2d').getImageData(0, top, canvas.width, bottom - top).data;
  const hits = [];
  for (let i = 0; i < data.length; i += 4) {
    if (Math.abs(data[i] - rgb[0]) + Math.abs(data[i + 1] - rgb[1]) + Math.abs(data[i + 2] - rgb[2]) < 24) {
      const p = i / 4;
      hits.push({ x: p % canvas.width, y: top + Math.floor(p / canvas.width) });
    }
  }
  return hits;
}`;

test('a falling capsule can be caught and its bonus shows on the board', async ({ page }) => {
  await openGame(page, 'bricks');
  const canvas = page.locator('#bricksCanvas');
  await page.locator('#bricksLaunchButton').click();

  // Play like a person: chase the capsule when it is the lower thing, otherwise keep the ball up.
  const caught = await canvas.evaluate(async (board: HTMLCanvasElement, source: string) => {
    const find = new Function(`return ${source}`)() as (c: HTMLCanvasElement, rgb: number[], top: number, bottom: number) => { x: number; y: number }[];
    const centre = (hits: { x: number; y: number }[]) => hits.length
      ? { x: hits.reduce((s, h) => s + h.x, 0) / hits.length, y: hits.reduce((s, h) => s + h.y, 0) / hits.length } : null;
    const steer = (x: number) => {
      const bounds = board.getBoundingClientRect();
      board.dispatchEvent(new PointerEvent('pointermove', { clientX: bounds.left + (x / board.width) * bounds.width, pointerType: 'mouse', bubbles: true }));
    };
    const status = document.getElementById('bricksStatus')!;
    const started = performance.now();
    while (performance.now() - started < 20_000) {
      if (/Power ball/.test(status.textContent ?? '')) return true;
      if (document.getElementById('bricksLaunchButton')!.textContent === 'Launch') document.getElementById('bricksLaunchButton')!.click();
      const capsule = centre(find(board, [255, 159, 67], 80, 590));
      const ball = centre(find(board, [255, 255, 255], 80, 590));
      const target = capsule && (!ball || capsule.y > ball.y) ? capsule : ball;
      if (target) steer(target.x);
      await new Promise(resolve => requestAnimationFrame(resolve));
    }
    return false;
  }, findColor);
  expect(caught).toBe(true);

  const status = page.locator('#bricksStatus');
  await expect(status).toContainText('Power ball');
  expect(await textContrast(status)).toBeGreaterThanOrEqual(READABLE_TEXT);

  // The running bonus is labelled in the band above the wall.
  const chip = await canvas.evaluate((board: HTMLCanvasElement, source: string) => {
    const find = new Function(`return ${source}`)();
    return find(board, [255, 159, 67], 0, 70).length;
  }, findColor);
  expect(chip).toBeGreaterThan(50);
  await page.screenshot({ path: test.info().outputPath('bricks-power.png') });
});
