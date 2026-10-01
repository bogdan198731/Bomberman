import { test, expect, type Page } from '@playwright/test';
import { openGame, textContrast, READABLE_TEXT } from './helpers';

async function openOnline(page: Page): Promise<void> {
  await openGame(page, 'septica');
  const toggle = page.locator('#septicaView [data-room-toggle]');
  // Phones fold the mode picker behind a toggle; desktop always shows it.
  if (await toggle.isVisible() && await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
  await page.locator('#septicaView [data-room-mode="online"]').click();
}

test('three players on three devices share one online Șeptică table', async ({ page }) => {
  const host = page;
  await openOnline(host);
  await host.locator('#septicaView [data-room-size]').selectOption('3');
  await host.locator('#septicaView [data-room-create]').click();
  const code = host.locator('#septicaView [data-room-code]');
  await expect(code).toHaveText(/^[A-Z2-9]{5}$/);
  const roomCode = (await code.textContent())!;
  await expect(host.locator('#septicaView [data-room-status]')).toContainText('1 of 3 players here');

  const guests: Page[] = [];
  for (let i = 0; i < 2; i++) {
    const guest = await page.context().newPage();
    await openOnline(guest);
    await guest.locator('#septicaView [data-room-input]').fill(roomCode);
    await guest.locator('#septicaView [data-room-join]').click();
    guests.push(guest);
  }
  const [coral, sky] = guests;
  for (const [player, name] of [[host, 'Mint'], [coral, 'Coral'], [sky, 'Sky']] as const) {
    await expect(player.locator('#septicaView [data-room-status]')).toHaveText(`Online match ready · You are ${name}`);
    await expect(player.locator('#septicaBotHand .septica-seat')).toHaveCount(2);
    await expect(player.locator('#septicaHand .septica-card')).toHaveCount(4);
  }
  await expect(sky.locator('#septicaBotHand .septica-seat').nth(0)).toContainText('Mint');

  // Mint leads; the card reaches everyone, and it is Coral's turn - on Coral's device only.
  await host.locator('#septicaHand button.septica-card:not([disabled])').first().click();
  for (const player of [host, coral, sky]) await expect(player.locator('#septicaTable .septica-card')).toHaveCount(1);
  await expect(coral.locator('#septicaHand button.septica-card:not([disabled])')).not.toHaveCount(0);
  await expect(sky.locator('#septicaHand button.septica-card:not([disabled])')).toHaveCount(0);
  await expect(sky.locator('#septicaStatus')).toHaveText('Coral is choosing a card…');

  await coral.locator('#septicaHand button.septica-card:not([disabled])').first().click();
  await expect(sky.locator('#septicaTable .septica-card')).toHaveCount(2);
  await sky.locator('#septicaHand button.septica-card:not([disabled])').first().click();
  // The round is complete: the trick settles or goes back to Mint to decide.
  await expect(host.locator('#septicaStatus')).not.toHaveText('Sky is choosing a card…');
  for (const player of [host, coral, sky]) expect(await textContrast(player.locator('#septicaStatus'))).toBeGreaterThanOrEqual(READABLE_TEXT);
});
