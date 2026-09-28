import { expect, test } from '@playwright/test';
import { CLEARLY_DIFFERENT, colorDifference, openGame, READABLE_TEXT, renderedColor, textContrast } from './helpers';

test('flag mode button visibly changes colour when toggled on', async ({ page }) => {
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
