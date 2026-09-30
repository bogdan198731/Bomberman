import { test, expect, type Page } from '@playwright/test';
import { openGame } from './helpers';

async function openOnline(page: Page): Promise<void> {
  await openGame(page, 'septica');
  const toggle = page.locator('#septicaView [data-room-toggle]');
  // Phones fold the mode picker behind a toggle; desktop always shows it.
  if (await toggle.isVisible() && await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
  await page.locator('#septicaView [data-room-mode="online"]').click();
}

test('the host of an online Șeptică room can fill empty seats with bots', async ({ page }) => {
  const host = page;
  await openOnline(host);
  await host.locator('#septicaView [data-room-size]').selectOption('4');
  await host.locator('#septicaView [data-room-create]').click();
  const code = host.locator('#septicaView [data-room-code]');
  await expect(code).toHaveText(/^[A-Z2-9]{5}$/);
  const roomCode = (await code.textContent())!;

  const coral = await page.context().newPage();
  await openOnline(coral);
  await coral.locator('#septicaView [data-room-input]').fill(roomCode);
  await coral.locator('#septicaView [data-room-join]').click();
  await expect(host.locator('#septicaView [data-room-status]')).toContainText('2 of 4 players here');
  // Only the host decides to bring in bots.
  await expect(coral.locator('#septicaView [data-room-fill-bots]')).toBeHidden();
  await host.locator('#septicaView [data-room-fill-bots]').click();

  for (const [player, name] of [[host, 'Mint'], [coral, 'Coral']] as const) {
    await expect(player.locator('#septicaView [data-room-status]')).toHaveText(`Online match ready · You are ${name}`);
  }
  await expect(host.locator('#septicaView [data-room-fill-bots]')).toBeHidden();
  const seats = coral.locator('#septicaBotHand .septica-seat');
  await expect(seats).toHaveCount(3);
  await expect(seats.nth(1)).toContainText('Sky · bot');
  await expect(seats.nth(2)).toContainText('Gold · partner · bot');

  // Mint leads, Coral answers, and the two bots finish the round on their own.
  await host.locator('#septicaHand button.septica-card:not([disabled])').first().click();
  await coral.locator('#septicaHand button.septica-card:not([disabled])').first().click();
  await expect(coral.locator('#septicaTable .septica-card')).toHaveCount(4, { timeout: 5_000 });

  // The bot seats are taken: a latecomer cannot join.
  const late = await page.context().newPage();
  await openOnline(late);
  await late.locator('#septicaView [data-room-input]').fill(roomCode);
  await late.locator('#septicaView [data-room-join]').click();
  await expect(late.locator('#septicaView [data-room-status]')).toHaveText('That room is already full.');
});
