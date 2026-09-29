import { test, expect } from '@playwright/test';
import { openGame, box, textContrast, READABLE_TEXT, MIN_TAP_TARGET } from './helpers';

test('septica concede button sits below your hand, at the bottom of the table', async ({ page }) => {
  await openGame(page, 'septica');
  // The button only appears when you are cut; its place in the layout does not depend on that.
  const concede = page.locator('#septicaPassButton');
  await concede.evaluate(button => { (button as HTMLButtonElement).hidden = false; });
  await expect(concede).toBeVisible();

  const hand = await box(page.locator('#septicaHand'));
  const button = await box(concede);
  expect(button.y).toBeGreaterThanOrEqual(hand.y + hand.height);
  // A thumb target on touch screens; desktop is played with a mouse.
  if (test.info().project.name === 'phone') expect(button.height).toBeGreaterThanOrEqual(MIN_TAP_TARGET);
  expect(await textContrast(concede)).toBeGreaterThanOrEqual(READABLE_TEXT);
  expect(await textContrast(page.locator('#septicaStatus'))).toBeGreaterThanOrEqual(READABLE_TEXT);
});
