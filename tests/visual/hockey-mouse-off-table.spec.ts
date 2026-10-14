import { test, expect, type Page } from '@playwright/test';
import { openGame, box } from './helpers';

// Rink size and mallet radius from src/hockey.ts.
const RINK = { width: 900, height: 540 };
const MALLET_R = 30;

/** Where the Mint mallet is drawn, in rink units, found by its colour on the canvas. */
async function mintMallet(page: Page): Promise<{ x: number; y: number }> {
  return page.evaluate(() => {
    const canvas = document.getElementById('hockeyCanvas') as HTMLCanvasElement;
    const { data, width, height } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
    let sumX = 0, sumY = 0, count = 0;
    // Skip the goal line drawn in the same colour along the left edge.
    for (let y = 0; y < height; y++) for (let x = 12; x < width; x++) {
      const i = (y * width + x) * 4;
      if (Math.abs(data[i] - 0x54) < 12 && Math.abs(data[i + 1] - 0xe3) < 12 && Math.abs(data[i + 2] - 0x8e) < 12) {
        sumX += x; sumY += y; count++;
      }
    }
    return { x: sumX / count, y: sumY / count };
  });
}

test('the mallet keeps following a mouse that slips off the table', async ({ page }) => {
  test.skip(Boolean(test.info().project.use.hasTouch), 'a finger stays with the table it pressed on');
  await openGame(page, 'hockey');
  const rink = await box(page.locator('#hockeyCanvas'));
  const at = (x: number, y: number) => ({ x: rink.x + x * rink.width / RINK.width, y: rink.y + y * rink.height / RINK.height });

  await page.keyboard.press('Space');
  const start = at(220, 270);
  await page.mouse.move(start.x, start.y, { steps: 5 });
  await expect.poll(async () => (await mintMallet(page)).x).toBeLessThan(240);

  // Leave the table in one jump, as a fast flick does: no move lands inside it.
  const viewport = page.viewportSize()!;
  const below = rink.y + rink.height + 40 < viewport.height;
  const outside = { x: at(120, 0).x, y: below ? rink.y + rink.height + 30 : rink.y - 30 };
  await page.mouse.move(outside.x, outside.y);

  const edgeY = below ? RINK.height - MALLET_R : MALLET_R;
  await expect.poll(async () => {
    const mallet = await mintMallet(page);
    return Math.hypot(mallet.x - 120, mallet.y - edgeY);
  }).toBeLessThan(12);
});
