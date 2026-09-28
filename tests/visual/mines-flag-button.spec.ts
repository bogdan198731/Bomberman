import { test, expect } from '@playwright/test';
import { openGame, renderedColor, colorDifference, textContrast, CLEARLY_DIFFERENT, READABLE_TEXT } from './helpers';

test('mines flag-mode button visibly changes appearance when toggled', async ({ page }) => {
  await openGame(page, 'mines');

  const flagButton = page.locator('#minesFlagButton');
  await expect(flagButton).toHaveAttribute('aria-pressed', 'false');

  const offColor = await renderedColor(flagButton);
  expect(await textContrast(flagButton)).toBeGreaterThanOrEqual(READABLE_TEXT);

  await flagButton.click();
  await expect(flagButton).toHaveAttribute('aria-pressed', 'true');

  const onColor = await renderedColor(flagButton);
  expect(await textContrast(flagButton)).toBeGreaterThanOrEqual(READABLE_TEXT);

  expect(colorDifference(offColor, onColor)).toBeGreaterThanOrEqual(CLEARLY_DIFFERENT);
});
