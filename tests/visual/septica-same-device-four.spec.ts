import { test, expect, type Page } from '@playwright/test';
import { openGame, textContrast, READABLE_TEXT } from './helpers';

async function reveal(page: Page, name: string): Promise<void> {
  await expect(page.locator('#septicaStatus')).toHaveText(`Pass the device to ${name}, then reveal the hand.`);
  await expect(page.locator('#septicaHand button.septica-card')).toHaveCount(0);
  await page.locator('#septicaRevealButton').click();
}

test('four players can pass one device round the Șeptică table', async ({ page }) => {
  await openGame(page, 'septica');
  const toggle = page.locator('#septicaView [data-room-toggle]');
  if (await toggle.isVisible() && await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
  await page.locator('#septicaView [data-room-mode="local"]').click();
  const players = page.locator('#septicaPlayers');
  await expect(players).toBeVisible();
  await players.selectOption('4');
  await expect(page.locator('#septicaMintLabel')).toHaveText('Mint & Sky');

  // Each player reveals their own hand, plays, and the device moves on round the table.
  for (const name of ['Mint', 'Coral', 'Sky', 'Gold']) {
    await reveal(page, name);
    const seats = page.locator('#septicaBotHand .septica-seat');
    await expect(seats).toHaveCount(3);
    await expect(seats).not.toContainText([name]);
    expect(await textContrast(page.locator('#septicaStatus'))).toBeGreaterThanOrEqual(READABLE_TEXT);
    await page.locator('#septicaHand button.septica-card:not([disabled])').first().click();
    if (name === 'Gold') break;
    await expect(page.locator('#septicaTable .septica-card')).toHaveCount(['Mint', 'Coral', 'Sky'].indexOf(name) + 1);
  }
  await expect(page.locator('#septicaTable .septica-card')).toHaveCount(4);
});
