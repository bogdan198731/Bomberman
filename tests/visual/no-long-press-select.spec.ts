import { test, expect, type Locator } from '@playwright/test';
import { openGame } from './helpers';

/** Chromium has no touch callout (that part is iOS-only), so the selection rule is what can be checked here. */
async function userSelect(locator: Locator): Promise<string> {
  return locator.evaluate(element => getComputedStyle(element).userSelect);
}

test('pressing and holding a button does not select its label', async ({ page }) => {
  await openGame(page, 'mines');
  const button = page.locator('button:visible').first();
  await expect(button).toBeVisible();
  expect(await userSelect(button)).toBe('none');
  // A double click is the desktop version of a long press: it would normally highlight the word.
  await button.dblclick();
  expect(await page.evaluate(() => String(window.getSelection()))).toBe('');
});

test('the bug report box still lets players select and copy what they typed', async ({ page }) => {
  await openGame(page, 'mines');
  const description = page.locator('#bugReportDescription');
  expect(await userSelect(description)).toBe('text');
});
