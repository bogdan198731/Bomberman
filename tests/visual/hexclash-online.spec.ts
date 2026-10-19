import { test, expect, type Page } from '@playwright/test';
import { openGame } from './helpers';

async function openOnline(page: Page): Promise<void> {
  await openGame(page, 'hexclash');
  const toggle = page.locator('#hexclashView [data-room-toggle]');
  // Phones fold the mode picker behind a toggle; desktop always shows it.
  if (await toggle.isVisible() && await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
  await page.locator('#hexclashView [data-room-mode="online"]').click();
}

test('two players fight one battle on two devices, each acting only on their own turn', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'One pair of devices is enough.');
  const host = page;
  await openOnline(host);
  await host.locator('#hexclashView [data-room-create]').click();
  const code = host.locator('#hexclashView [data-room-code]');
  await expect(code).toHaveText(/^[A-Z2-9]{5}$/);
  const guest = await page.context().newPage();
  await openOnline(guest);
  await guest.locator('#hexclashView [data-room-input]').fill((await code.textContent())!);
  await guest.locator('#hexclashView [data-room-join]').click();
  await expect(host.locator('#hexclashView [data-room-status]')).toHaveText('Online match ready · You are Mint');
  await expect(guest.locator('#hexclashView [data-room-status]')).toHaveText('Online match ready · You are Coral');

  // The host leads the Kingdom, so Coral's dragon - the fastest stack - opens, on Coral's device only.
  for (const player of [host, guest]) await expect(player.locator('#hexclashStatus')).toHaveText('Coral Dragons ×1 to act.');
  await expect(host.locator('#hexclashDefendButton')).toBeDisabled();
  await expect(guest.locator('#hexclashDefendButton')).toBeEnabled();
  await expect(guest.locator('#hexclashArmy')).toBeDisabled();

  await guest.locator('#hexclashDefendButton').click();
  for (const player of [host, guest]) await expect(player.locator('#hexclashLog span').last()).toHaveText('Dragons defend.');
  await expect(host.locator('#hexclashStatus')).toHaveText(/^Mint Griffins ×\d+ to act\.$/);
  await expect(host.locator('#hexclashDefendButton')).toBeEnabled();
  await expect(guest.locator('#hexclashDefendButton')).toBeDisabled();

  await host.locator('#hexclashDefendButton').click();
  await expect(guest.locator('#hexclashLog span').last()).toHaveText('Griffins defend.');
  await expect(guest.locator('#hexclashRound')).toHaveText('Round 1');
});
