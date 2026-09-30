import { test, expect, type Page } from '@playwright/test';
import { openGame, textContrast, READABLE_TEXT } from './helpers';

async function openHub(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('blast-arcade-settings-v1', JSON.stringify({
        soundEnabled: false, volume: 0, reducedMotion: true, highContrast: false, language: 'en', touchControls: 'auto',
      }));
    } catch { /* defaults are fine */ }
  });
  // The leaderboard lives in the Profile section of the hub.
  await page.goto('/#profile');
  await page.waitForLoadState('networkidle');
}

test('a finished game reaches the Everyone board under the chosen alias', async ({ page }, info) => {
  const alias = `Ana ${info.project.name}`;
  await openHub(page);
  await page.locator('[data-leaderboard-scope="everyone"]').click();
  const aliasInput = page.locator('#leaderboardAlias');
  await expect(aliasInput).toBeVisible();
  await expect(aliasInput).toHaveAttribute('placeholder', 'Unknown');
  await aliasInput.fill(alias);
  await aliasInput.press('Enter');
  await aliasInput.blur();

  // Win a Hangman round: CANADA with one wrong guess already made.
  await page.addInitScript(saved => {
    try { localStorage.setItem('blast-arcade-hangman-session-v1', saved); } catch { /* storage blocked */ }
  }, JSON.stringify({ difficulty: 'normal', word: 'CANADA', category: 'Countries', guesses: 'Z', streak: 0 }));
  await openGame(page, 'hangman');
  const submitted = page.waitForResponse(response => response.url().endsWith('/api/scores') && response.request().method() === 'POST');
  for (const letter of 'cand') await page.keyboard.press(letter);
  const response = await submitted;
  expect(response.status()).toBe(201);
  expect((await response.json()).rank).not.toBeNull();

  await openHub(page);
  await expect(page.locator('[data-leaderboard-scope="everyone"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-leaderboard-game="hangman"]').click();
  const row = page.locator('#leaderboardList .leaderboard-row', { hasText: alias });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('800');
  expect(await textContrast(row.locator('.leaderboard-player strong'))).toBeGreaterThanOrEqual(READABLE_TEXT);
  await expect(page.locator('#leaderboardCaption')).toContainText('all players');

  // This device still keeps its own board.
  await page.locator('[data-leaderboard-scope="device"]').click();
  await expect(page.locator('#leaderboardAliasRow')).toBeHidden();
});

test('the scores API refuses anything that is not a real result', async ({ request }) => {
  expect((await request.post('/api/scores', { data: { game: 'chess', score: 10, outcome: 'win' } })).status()).toBe(400);
  expect((await request.post('/api/scores', { data: { game: 'snake', score: -5, outcome: 'win' } })).status()).toBe(400);
  expect((await request.get('/api/scores?game=nope')).status()).toBe(400);
  const board = await request.get('/api/scores?game=snake');
  expect(board.status()).toBe(200);
  expect(Array.isArray((await board.json()).entries)).toBe(true);
});
