import { test, expect } from '@playwright/test';
import { openGame, textContrast, READABLE_TEXT } from './helpers';

// 0.1 is under the drop chance and picks a shield, so every smashed crate leaves one.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { Math.random = () => 0.1; });
});

test('a smashed crate leaves a bonus that Mint picks up by driving over it', async ({ page }) => {
  await openGame(page, 'tanks');
  // Same device, so no bot fires back while Mint drives.
  await page.locator('[data-tanks-mode="duel"]').evaluate((button: HTMLButtonElement) => button.click());
  await page.locator('#tanksLaunchButton').click();

  // Steel shields the spawn, so Mint drives down to the bottom crate's row, turns to face it,
  // shoots it, then drives into what it leaves.
  await page.keyboard.down('KeyS');
  await page.waitForTimeout(1_050);
  await page.keyboard.up('KeyS');
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(60);
  await page.keyboard.up('KeyD');
  await page.keyboard.down('KeyF');
  await page.waitForTimeout(150);
  await page.keyboard.up('KeyF');
  await page.waitForTimeout(800);
  await page.keyboard.down('KeyD');
  const status = page.locator('#tanksStatus');
  await expect(status).toContainText('Mint: Shield - blocks one hit!', { timeout: 5_000 });
  await page.keyboard.up('KeyD');
  expect(await textContrast(status)).toBeGreaterThanOrEqual(READABLE_TEXT);

  // The shield is labelled in Mint's corner of the arena.
  const chip = await page.locator('#tanksCanvas').evaluate((board: HTMLCanvasElement) => {
    const data = board.getContext('2d')!.getImageData(0, 0, 300, 60).data;
    let hits = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (Math.abs(data[i] - 92) + Math.abs(data[i + 1] - 216) + Math.abs(data[i + 2] - 255) < 24) hits++;
    }
    return hits;
  });
  expect(chip).toBeGreaterThan(40);
  await page.screenshot({ path: test.info().outputPath('tanks-shield.png') });
});
