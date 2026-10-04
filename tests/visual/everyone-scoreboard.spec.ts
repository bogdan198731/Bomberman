import { test, expect, type Page } from '@playwright/test';
import { openGame, box, overlaps, textContrast, READABLE_TEXT, MIN_TAP_TARGET } from './helpers';

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

  // The score makes the board, so the result card announces it and asks for a name first.
  const claim = page.locator('.arcade-result-highscore');
  await expect(claim).toBeVisible();
  await expect(claim.locator('[data-highscore-title]')).toContainText('New high score! #');
  await expect(claim.locator('[data-highscore-title]')).toContainText('Hangman');
  expect(await textContrast(claim.locator('[data-highscore-title]'))).toBeGreaterThanOrEqual(READABLE_TEXT);
  await expect(claim.locator('input')).toHaveValue(alias);
  await claim.getByRole('button', { name: 'Post my name' }).click();
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
  await expect(page.locator('#leaderboardBoardGame')).toHaveText(/Hangman/);

  // This device still keeps its own board.
  await page.locator('[data-leaderboard-scope="device"]').click();
  await expect(page.locator('#leaderboardAliasRow')).toBeHidden();
});

test('a high score can be posted anonymously, and nothing is posted before the choice', async ({ page }) => {
  await openHub(page);
  const posts: { alias: string }[] = [];
  page.on('request', request => {
    if (request.url().endsWith('/api/scores') && request.method() === 'POST') posts.push(request.postDataJSON());
  });
  await page.addInitScript(saved => {
    try { localStorage.setItem('blast-arcade-hangman-session-v1', saved); } catch { /* storage blocked */ }
  }, JSON.stringify({ difficulty: 'normal', word: 'CANADA', category: 'Countries', guesses: 'Z', streak: 0 }));
  await openGame(page, 'hangman');
  for (const letter of 'cand') await page.keyboard.press(letter);
  const claim = page.locator('.arcade-result-highscore');
  await expect(claim).toBeVisible();
  expect(posts, 'nothing is posted before the player chooses').toHaveLength(0);
  // The announcement still leaves the solved word in view, and its buttons are easy to tap.
  expect(overlaps(await box(page.locator('.arcade-result-card')), await box(page.locator('#hangmanWord')))).toBe(false);
  for (const button of await claim.locator('button').all()) {
    expect((await box(button)).height).toBeGreaterThanOrEqual(MIN_TAP_TARGET);
    // The label fits inside its button.
    expect(await button.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    expect(await textContrast(button)).toBeGreaterThanOrEqual(READABLE_TEXT);
  }
  await claim.getByRole('button', { name: 'Post anonymously' }).click();
  await expect(claim.locator('[data-highscore-note]')).toContainText('Posted as Unknown · #');
  await expect(claim.locator('input')).toBeHidden();
  expect(posts.map(post => post.alias)).toEqual(['Unknown']);
});

test('a high score can be kept private: nothing is sent', async ({ page }) => {
  await openHub(page);
  const posts: unknown[] = [];
  page.on('request', request => {
    if (request.url().endsWith('/api/scores') && request.method() === 'POST') posts.push(request.postDataJSON());
  });
  await page.addInitScript(saved => {
    try { localStorage.setItem('blast-arcade-hangman-session-v1', saved); } catch { /* storage blocked */ }
  }, JSON.stringify({ difficulty: 'normal', word: 'CANADA', category: 'Countries', guesses: 'Z', streak: 0 }));
  await openGame(page, 'hangman');
  for (const letter of 'cand') await page.keyboard.press(letter);
  const claim = page.locator('.arcade-result-highscore');
  // Says the board is public before anything is shared.
  await expect(claim.locator('[data-highscore-title]')).toContainText('public');
  await claim.getByRole('button', { name: 'Keep private' }).click();
  await expect(claim.locator('[data-highscore-note]')).toHaveText('Kept private · saved on this device only.');
  expect(await textContrast(claim.locator('[data-highscore-note]'))).toBeGreaterThanOrEqual(READABLE_TEXT);
  // Leaving the card afterwards does not send it either.
  await page.locator('[data-result-close]').click();
  await page.waitForTimeout(300);
  expect(posts).toEqual([]);
});

test('the scores API refuses anything that is not a real result', async ({ request }) => {
  expect((await request.post('/api/scores', { data: { game: 'chess', score: 10, outcome: 'win' } })).status()).toBe(400);
  expect((await request.post('/api/scores', { data: { game: 'snake', score: -5, outcome: 'win' } })).status()).toBe(400);
  expect((await request.get('/api/scores?game=nope')).status()).toBe(400);
  const board = await request.get('/api/scores?game=snake');
  expect(board.status()).toBe(200);
  expect(Array.isArray((await board.json()).entries)).toBe(true);
});

test('a named player is not told "New high score" for a score below their own best', async ({ page, request }, info) => {
  const alias = `Mara ${info.project.name}`;
  // Their best is already on the board; the round below scores 800.
  expect((await request.post('/api/scores', { data: { game: 'hangman', score: 900, outcome: 'win', alias } })).status()).toBe(201);
  await page.addInitScript(name => {
    try { localStorage.setItem('blast-arcade-scoreboard-alias-v1', name); } catch { /* storage blocked */ }
  }, alias);
  await openHub(page);
  const posts: unknown[] = [];
  page.on('request', sent => {
    if (sent.url().endsWith('/api/scores') && sent.method() === 'POST') posts.push(sent.postDataJSON());
  });
  await page.addInitScript(saved => {
    try { localStorage.setItem('blast-arcade-hangman-session-v1', saved); } catch { /* storage blocked */ }
  }, JSON.stringify({ difficulty: 'normal', word: 'CANADA', category: 'Countries', guesses: 'Z', streak: 0 }));
  await openGame(page, 'hangman');
  const checked = page.waitForResponse(response => response.url().includes('/api/scores?game=hangman'));
  for (const letter of 'cand') await page.keyboard.press(letter);
  await checked;
  await expect(page.locator('.arcade-result-card')).toBeVisible();
  await page.waitForTimeout(300);
  await expect(page.locator('.arcade-result-highscore')).toBeHidden();
  expect(posts).toEqual([]);
});
