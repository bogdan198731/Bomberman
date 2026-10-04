import { test, expect } from '@playwright/test';
import { box, MIN_TAP_TARGET } from './helpers';

test('arrows on the sides reach every game tab without a scroll bar', async ({ page }) => {
  await page.goto('/#profile');
  await page.waitForLoadState('networkidle');
  const tabs = page.locator('#leaderboardGameTabs');
  const left = page.locator('[data-leaderboard-scroll="-1"]');
  const right = page.locator('[data-leaderboard-scroll="1"]');
  await tabs.scrollIntoViewIfNeeded();
  // The arrows scroll smoothly; wait until the strip stops moving.
  const settled = async (): Promise<void> => {
    let previous = -1;
    await expect.poll(async () => {
      const now = await tabs.evaluate(element => element.scrollLeft);
      const still = now === previous;
      previous = now;
      return still;
    }, { intervals: [150] }).toBe(true);
  };

  // More games than fit: only the right arrow at the start, and no visible scroll bar.
  expect(await tabs.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
  expect(await tabs.evaluate(element => element.offsetHeight - element.clientHeight)).toBe(0);
  await expect(left).toBeHidden();
  await expect(right).toBeVisible();
  expect((await box(right)).height).toBeGreaterThanOrEqual(MIN_TAP_TARGET);
  expect((await box(right)).width).toBeGreaterThanOrEqual(MIN_TAP_TARGET);

  const last = tabs.locator('.leaderboard-tab').last();
  for (let i = 0; i < 20 && await right.isVisible(); i++) {
    const before = await tabs.evaluate(element => element.scrollLeft);
    await right.click();
    await expect.poll(() => tabs.evaluate(element => element.scrollLeft)).toBeGreaterThan(before);
    await settled();
  }
  await expect(right).toBeHidden();
  await expect(left).toBeVisible();
  // The last game's tab is fully in view and can be chosen.
  const strip = await box(tabs);
  const lastBox = await box(last);
  expect(lastBox.x + lastBox.width).toBeLessThanOrEqual(strip.x + strip.width + 1);
  await last.click();
  await expect(last).toHaveAttribute('aria-selected', 'true');

  await left.click();
  await settled();
  await expect(right).toBeVisible();
});
