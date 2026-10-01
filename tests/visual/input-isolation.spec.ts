import { test, expect, type Page } from '@playwright/test';
import { openGame, box, textContrast, READABLE_TEXT, MIN_TAP_TARGET } from './helpers';

/** Keys a player might press in any game. */
const KEYS = ['Space', 'Enter', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyF', 'KeyR'];

async function collectCues(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { cues: string[] }).cues);
}

test('a Blast Buddies round left running does not hear keys pressed in Solitaire', async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem('blast-arcade-guides-v1', JSON.stringify(['bomberman', 'solitaire'])); } catch { /* defaults */ }
    const cues: string[] = [];
    (window as unknown as { cues: string[] }).cues = cues;
    window.addEventListener('arcade-game-cue', event => cues.push((event as CustomEvent<{ label?: string }>).detail.label ?? ''));
  });
  await openGame(page, 'bomberman');
  await page.locator('[data-bomberman-lobby-mode="bot"]').click();
  await page.locator('[data-bot-difficulty="easy"]').click();
  await expect(page.locator('#lobbyOverlay')).toBeHidden();

  // Back to the arcade with the round still running, then into Solitaire.
  await page.locator('#gameView .back-to-hub').click();
  await page.locator('[data-launch-game="solitaire"]').first().click();
  await expect(page.locator('#solitaireView')).toBeVisible();
  const moves = page.locator('#solitaireMoves');
  const before = Number(await moves.textContent());

  for (const key of KEYS) await page.keyboard.press(key);
  // Solitaire still takes its own keys (Space draws, A plays home)...
  await expect.poll(async () => Number(await moves.textContent())).toBeGreaterThan(before);
  // ...and the hidden Blast Buddies round heard none of them.
  expect((await collectCues(page)).filter(label => /FUSE/.test(label))).toEqual([]);
});

test('a paused Solitaire game stays exactly as it was until it is resumed', async ({ page }) => {
  await openGame(page, 'solitaire');
  const moves = page.locator('#solitaireMoves');
  await page.keyboard.press('Space');
  await expect(moves).toHaveText('1');

  await page.locator('#solitaireView [data-pause-game]').click();
  await expect(page.locator('#arcadeSessionOverlay')).toBeVisible();
  await page.locator('#arcadeSessionClose').click();
  await expect(page.locator('#arcadeSessionOverlay')).toBeHidden();
  await expect(page.locator('#solitaireView [data-pause-game]')).toHaveText(/Resume/);

  const waste = await page.locator('#solitaireCanvas').screenshot();
  // Closing the card puts focus back on the header's Resume button, as in the report:
  // Space there only presses Resume, it never reaches the cards.
  await page.keyboard.press('Space');
  await expect(page.locator('#arcadeSessionOverlay')).toBeVisible();
  await page.locator('#arcadeSessionClose').click();
  await expect(moves).toHaveText('1');
  for (const key of ['Space', 'a', 'u']) {
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press(key);
    // Trying to play brings the pause card back instead.
    await expect(page.locator('#arcadeSessionOverlay')).toBeVisible();
    await page.locator('#arcadeSessionClose').click();
  }
  for (const button of ['#solitaireAutoButton', '#solitaireUndoButton']) {
    if (await page.locator(button).isEnabled()) {
      await page.locator(button).click();
      await page.locator('#arcadeSessionClose').click();
    }
  }
  const table = page.locator('#solitaireCanvas');
  const tableBox = await box(table);
  await page.mouse.click(tableBox.x + tableBox.width * .1, tableBox.y + tableBox.height * .12);
  await expect(page.locator('#arcadeSessionOverlay')).toBeVisible();
  await page.locator('#arcadeSessionClose').click();
  await expect(moves).toHaveText('1');
  expect(Buffer.compare(await table.screenshot(), waste)).toBe(0);

  // Resuming gives play back, once.
  await page.locator('#solitaireView [data-pause-game]').click();
  await page.locator('#arcadeSessionResume').click();
  await expect(page.locator('#arcadeSessionOverlay')).toBeHidden();
  await page.keyboard.press('Space');
  await expect(moves).toHaveText('2');
});

test('closing a game\'s first guide goes straight to the board, not to a pause card', async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('blast-arcade-settings-v1', JSON.stringify({
        soundEnabled: false, volume: 0, reducedMotion: true, highContrast: false, language: 'en', touchControls: 'auto',
      }));
      localStorage.removeItem('blast-arcade-guides-v1');
    } catch { /* defaults */ }
  });
  await page.goto('/play/twenty48');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('.game-help-overlay')).toBeVisible();
  await page.locator('.game-help-close').click();
  await expect(page.locator('.game-help-overlay')).toBeHidden();
  await page.waitForTimeout(300);
  await expect(page.locator('#arcadeSessionOverlay')).toBeHidden();
  await expect(page.locator('#twenty48View [data-pause-game]')).not.toHaveText(/Resume/);

  // Asking for the guide later still pauses a game in progress, as before.
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowUp');
  await page.locator('#twenty48View [data-game-help]').click();
  await page.locator('.game-help-close').click();
  await expect(page.locator('#arcadeSessionOverlay')).toBeVisible();
});

test('the graphics switch in the Blast Buddies phone header is a clear icon with a name', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'the icon replaces the label only on phones');
  await openGame(page, 'bomberman');
  const toggle = page.locator('#bombermanSkinButton');
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAccessibleName(/graphics/);
  const icon = await toggle.evaluate(button => {
    const style = getComputedStyle(button, '::before');
    return { content: style.content, mask: style.maskImage || style.webkitMaskImage, width: parseFloat(style.width) };
  });
  // No text glyph that a phone font could be missing, just the drawn sprite.
  expect(icon.content).toBe('""');
  expect(icon.mask).toContain('svg');
  expect(icon.width).toBeGreaterThan(10);
  expect((await box(toggle)).height).toBeGreaterThanOrEqual(38);
  expect((await box(toggle)).width).toBeGreaterThanOrEqual(MIN_TAP_TARGET - 4);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(toggle).toHaveAccessibleName(/graphics/);
});

test('a run that crashes is called game over, not complete', async ({ page }) => {
  await openGame(page, 'snake');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('arcade-game-result', {
    detail: { gameId: 'snake', result: { outcome: 'complete', score: 0, runOver: true } },
  })));
  await expect(page.locator('#arcadeResultTitle')).toHaveText('GAME OVER');
  expect(await textContrast(page.locator('#arcadeResultTitle'))).toBeGreaterThanOrEqual(READABLE_TEXT);
});

test('an empty Favorites list explains how to add games', async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.removeItem('blast-arcade-favorites-v1'); } catch { /* defaults */ }
  });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.locator('[data-catalog-filter="favorites"]').click();
  await expect(page.locator('#catalogEmptyTitle')).toHaveText('No favorites yet');
  await expect(page.locator('#catalogEmptyText')).toContainText('star');
  expect(await textContrast(page.locator('#catalogEmptyText'))).toBeGreaterThanOrEqual(READABLE_TEXT);
  await page.locator('#catalogSearch').fill('zzzz');
  await expect(page.locator('#catalogEmptyTitle')).toHaveText('No games found');
});
