import { test, expect } from '@playwright/test';

test('fullscreen chosen in Settings stays on while the player moves around the arcade', async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('blast-arcade-settings-v1', JSON.stringify({
        soundEnabled: false, volume: 0, reducedMotion: true, highContrast: false, language: 'en', touchControls: 'auto',
      }));
    } catch { /* defaults are fine */ }
  });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.locator('[data-open-settings]').first().click();
  await page.locator('#settingsFullscreenButton').click();
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
  await page.locator('#settingsCloseButton').click();

  // Hub section tabs, wherever this screen size shows them.
  for (const section of ['profile', 'challenges', 'games']) {
    await page.locator(`[data-hub-section="${section}"]:visible`).first().click();
    await expect(page.locator('body')).toHaveAttribute('data-hub-section', section);
  }
  expect(await page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
});
