import { test, expect, type Page } from '@playwright/test';
import { openGame, box, textContrast, READABLE_TEXT, MIN_TAP_TARGET } from './helpers';

// One left move makes 2048; after Continue, one right move fills the last gap
// and leaves no moves. New tiles are always a 2 in the first empty cell.
const NEARLY_WON = {
  version: 1, base: 2, score: 20_000, phase: 'playing', movesMade: 500, elapsedMs: 0, victoryAcknowledged: false,
  board: [
    1024, 1024, 16, 32,
    64, 128, 64, 128,
    128, 64, 128, 64,
    4, 8, 4, 0,
  ],
};

async function openNearlyWon(page: Page): Promise<void> {
  await page.addInitScript(saved => {
    Math.random = () => 0;
    try { localStorage.setItem('blast-arcade-2048-session-v1', saved); } catch { /* storage blocked */ }
  }, JSON.stringify(NEARLY_WON));
  await openGame(page, 'twenty48');
  await page.locator('#twenty48ResumeSession').click();
}

// Arrow keys on the board work on phone and desktop alike (desktop hides the touch arrows).
async function slide(page: Page, key: 'ArrowLeft' | 'ArrowRight'): Promise<void> {
  await page.locator('#twenty48Board').focus();
  await page.keyboard.press(key);
}

test('continuing after 2048 still ends with a game-over card and a scoreboard offer', async ({ page }) => {
  const posts: { score: number; alias: string }[] = [];
  page.on('request', request => {
    if (request.url().endsWith('/api/scores') && request.method() === 'POST') posts.push(request.postDataJSON());
  });
  await openNearlyWon(page);
  const card = page.locator('.arcade-result-card');

  await slide(page, 'ArrowLeft');
  await expect(card).toBeVisible();
  await expect(card.locator('.arcade-result-explanation')).toContainText('You made 2048!');
  // The 2048 score can be claimed now, but the run can also keep going.
  await expect(page.locator('.arcade-result-highscore')).toBeVisible();
  const keepPlaying = card.locator('[data-result-continue]');
  await expect(keepPlaying).toBeVisible();
  expect((await box(keepPlaying)).height).toBeGreaterThanOrEqual(MIN_TAP_TARGET);
  expect(await textContrast(keepPlaying)).toBeGreaterThanOrEqual(READABLE_TEXT);
  await page.screenshot({ path: test.info().outputPath('won.png') });
  await card.locator('[data-result-continue]').click();
  await expect(card).toBeHidden();
  expect(posts, 'a run that keeps going has no final score to post yet').toHaveLength(0);

  await slide(page, 'ArrowRight');
  await expect(card).toBeVisible();
  const explanation = card.locator('.arcade-result-explanation');
  await expect(explanation).toContainText('No moves left');
  await expect(explanation).toContainText('22,048');
  expect(await textContrast(explanation)).toBeGreaterThanOrEqual(READABLE_TEXT);
  await expect(card.locator('[data-result-continue]')).toBeHidden();

  const claim = page.locator('.arcade-result-highscore');
  await expect(claim).toBeVisible();
  await expect(claim.locator('[data-highscore-title]')).toContainText('2048');
  for (const button of await claim.locator('button').all()) {
    expect((await box(button)).height).toBeGreaterThanOrEqual(MIN_TAP_TARGET);
    expect(await textContrast(button)).toBeGreaterThanOrEqual(READABLE_TEXT);
  }
  await page.screenshot({ path: test.info().outputPath('over.png') });
  await claim.getByRole('button', { name: 'Stay Unknown' }).click();
  await expect(claim.locator('[data-highscore-note]')).toContainText('Posted as Unknown · #');
  expect(posts).toEqual([expect.objectContaining({ score: 22_048, alias: 'Unknown' })]);
});
