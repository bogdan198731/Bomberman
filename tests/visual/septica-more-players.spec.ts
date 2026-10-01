import { test, expect } from '@playwright/test';
import { openGame, textContrast, READABLE_TEXT } from './helpers';

test('septica against bots can seat three or four players, with teams at four', async ({ page }) => {
  await openGame(page, 'septica');
  const players = page.locator('#septicaPlayers');
  await expect(players).toBeVisible();

  await players.selectOption('3');
  const seats = page.locator('#septicaBotHand .septica-seat');
  await expect(seats).toHaveCount(2);
  await expect(seats.nth(0)).toContainText('Coral');
  await expect(seats.nth(1)).toContainText('Sky');
  await expect(page.locator('#septicaGoal')).toHaveText('Most points wins');
  await expect(page.locator('#septicaDeckCount')).toHaveText('18');

  await players.selectOption('4');
  await expect(seats).toHaveCount(3);
  await expect(seats.nth(1)).toContainText('Sky · partner');
  await expect(page.locator('#septicaMintLabel')).toHaveText('Mint & Sky');
  await expect(page.locator('#septicaCoralLabel')).toHaveText('Coral & Gold');
  for (const index of [0, 1, 2]) expect(await textContrast(seats.nth(index).locator('span'))).toBeGreaterThanOrEqual(READABLE_TEXT);

  // Lead a card: the three bots answer in turn round the table.
  await page.locator('#septicaHand button.septica-card:not([disabled])').first().click();
  await expect(page.locator('#septicaTable .septica-card')).toHaveCount(4, { timeout: 5_000 });
  expect(await textContrast(page.locator('#septicaStatus'))).toBeGreaterThanOrEqual(READABLE_TEXT);
});
