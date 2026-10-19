import { test, expect } from '@playwright/test';
import { openGame, box, textContrast, READABLE_TEXT, MIN_TAP_TARGET } from './helpers';

test('the whole battlefield, the turn order and the actions fit on screen', async ({ page }, info) => {
  await openGame(page, 'hexclash');
  const viewport = page.viewportSize()!;
  const board = await box(page.locator('#hexclashCanvas'));
  expect(board.x).toBeGreaterThanOrEqual(0);
  expect(board.x + board.width).toBeLessThanOrEqual(viewport.width + 1);
  // A hex must stay big enough to tap: the board is 11.5 hexes wide.
  expect(board.width / 11.5).toBeGreaterThanOrEqual(28);
  const actions = await box(page.locator('#hexclashDefendButton'));
  expect(actions.y + actions.height).toBeLessThanOrEqual(viewport.height);
  if (info.project.name === 'phone') expect(actions.height).toBeGreaterThanOrEqual(MIN_TAP_TARGET);
  // Ten stacks less any that already acted this round (the bot's dragon is fast).
  expect(await page.locator('#hexclashQueue .hexclash-chip').count()).toBeGreaterThanOrEqual(8);
  await expect(page.locator('#hexclashQueue .hexclash-chip').first()).toHaveClass(/active/);
  expect(await textContrast(page.locator('#hexclashStatus'))).toBeGreaterThanOrEqual(READABLE_TEXT);
  expect(await textContrast(page.locator('#hexclashQueue .hexclash-chip').first())).toBeGreaterThanOrEqual(READABLE_TEXT);
});

test('a tap on an enemy previews the strike and a second tap makes it', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'The two-tap strike is the touch flow.');
  await openGame(page, 'hexclash');
  const status = page.locator('#hexclashStatus');
  await expect(status).toHaveText(/^Mint .* to act\.$/);
  // The screen-reader buttons over the board take the same taps.
  const enemy = page.locator('#hexclashView [data-spot][aria-label*="Coral"]').first();
  const firstMint = await status.textContent();
  // Walk the acting stack towards the enemy until one is in reach, then strike.
  for (let turn = 0; turn < 12; turn++) {
    await expect(status).toHaveText(/^Mint .* to act\.$/, { timeout: 10_000 });
    // Let the last blow finish playing; taps during it are ignored.
    await page.waitForTimeout(400);
    const targets = page.locator('#hexclashView [data-spot][aria-label*="Coral"]');
    let previewed = false;
    for (const target of await targets.all()) {
      // As a screen reader or switch does it: the canvas above them takes pointer taps.
      await target.dispatchEvent('click');
      const text = await status.textContent();
      if (/^(Attack|Shoot) /.test(text ?? '')) { previewed = true; await target.dispatchEvent('click'); break; }
    }
    if (previewed) {
      await expect(page.locator('#hexclashLog span').last()).toHaveText(/damage, \d+ killed\.$/, { timeout: 5_000 });
      return;
    }
    await page.locator('#hexclashDefendButton').click();
  }
  throw new Error(`no enemy came in reach (first status: ${firstMint}, enemy: ${await enemy.getAttribute('aria-label')})`);
});

test('a battle runs to the end and offers the next one', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'Same flow on every screen.');
  test.setTimeout(90_000);
  await openGame(page, 'hexclash');
  const defend = page.locator('#hexclashDefendButton');
  // Mint only defends, so the Coral bot wins in the end.
  for (let turn = 0; turn < 300; turn++) {
    if (await page.locator('.arcade-result-card').isVisible()) break;
    if (await defend.isEnabled()) await defend.click();
    else await page.waitForTimeout(150);
  }
  await expect(page.locator('.arcade-result-card')).toBeVisible();
  await expect(page.locator('#hexclashStatus')).toHaveText('Coral wins the battle!');
  await expect(page.locator('#hexclashSeries')).toHaveText('Series 0-1');
  // "Play again" starts the next battle of the series.
  await page.locator('.arcade-result-card [data-result-replay]').click();
  await expect(page.locator('#hexclashMintStrength')).toHaveText('100%');
  await expect(page.locator('#hexclashSeries')).toHaveText('Series 0-1', { timeout: 2_000 });
});
