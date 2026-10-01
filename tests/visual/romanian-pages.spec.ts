import { test, expect, type Page } from '@playwright/test';
import { box, textContrast, READABLE_TEXT } from './helpers';
import { ARCADE_GAME_IDS } from '../../dist/game-metadata.js';

// Each game has a Romanian page (/ro/joc/<game>) sent in Romanian, with a
// "how to play" article under the game for search engines and new players.

async function openRomanianPage(page: Page, game: string, language: 'en' | 'ro' = 'en'): Promise<void> {
  await page.addInitScript(([id, saved]) => {
    try {
      localStorage.setItem('blast-arcade-settings-v1', JSON.stringify({
        soundEnabled: false, volume: 0, reducedMotion: true, highContrast: false, language: saved, touchControls: 'auto',
      }));
      localStorage.setItem('blast-arcade-guides-v1', JSON.stringify([id]));
    } catch { /* storage blocked: defaults are fine */ }
  }, [game, language]);
  await page.goto(`/ro/joc/${game}`);
  await page.waitForLoadState('networkidle');
}

test('every Romanian game page opens in Romanian with its article below the game', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'The article sits under the game on desktop; phones play full screen.');
  test.setTimeout(120_000);
  for (const game of ARCADE_GAME_IDS) {
    await openRomanianPage(page, game);
    await expect(page.locator('html'), game).toHaveAttribute('lang', 'ro');
    const about = page.locator('#gameAbout');
    await expect(about, `${game} shows its article`).toBeVisible();
    await expect(about.locator('h2'), game).toHaveText(/^Cum se joacă /);
    const view = await box(page.locator('main:not(.view-hidden)'));
    const article = await box(about);
    expect(article.y, `${game}: the article starts below the game`).toBeGreaterThanOrEqual(view.y + view.height);
    expect(await textContrast(about.locator('.game-about-intro')), `${game}: article text is readable`).toBeGreaterThanOrEqual(READABLE_TEXT);
  }
});

test('a phone playing full screen keeps the article out of the game', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'Phones only.');
  await openRomanianPage(page, 'septica');
  const immersive = await page.evaluate(() => document.body.classList.contains('immersive-play'));
  if (immersive) {
    await expect(page.locator('#gameAbout')).toBeHidden();
  } else {
    const view = await box(page.locator('#septicaView'));
    expect((await box(page.locator('#gameAbout'))).y).toBeGreaterThanOrEqual(view.y + view.height);
  }
});

test('switching a Romanian page to English turns the whole page back into English', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'Same code on every screen size.');
  await openRomanianPage(page, 'septica');
  await expect(page.locator('#septicaView .back-to-hub')).toHaveText('← Arcadă');
  await page.evaluate(() => {
    const select = document.getElementById('settingsLanguageSelect') as HTMLSelectElement;
    select.value = 'en';
    select.dispatchEvent(new Event('change'));
  });
  await expect(page).toHaveURL(/\/play\/septica$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('#septicaView .back-to-hub')).toHaveText('← Arcade');
  await expect(page.locator('#settingsTitle')).toHaveText('Arcade settings');
  await expect(page.locator('#gameAbout'), 'the Romanian article is hidden in English').toBeHidden();
  await expect(page).toHaveTitle(/^Șeptică — Play the Romanian Card Game Online$/);
});

test('a player who chose Romanian is moved to the Romanian address of an English link', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'Same code on every screen size.');
  await page.addInitScript(() => {
    localStorage.setItem('blast-arcade-settings-v1', JSON.stringify({
      soundEnabled: false, volume: 0, reducedMotion: true, highContrast: false, language: 'ro', touchControls: 'auto',
    }));
    localStorage.setItem('blast-arcade-guides-v1', JSON.stringify(['reversi']));
  });
  await page.goto('/play/reversi');
  await expect(page).toHaveURL(/\/ro\/joc\/reversi$/);
  await expect(page.locator('#reversiView .back-to-hub')).toHaveText('← Arcadă');
  await page.locator('#reversiView .back-to-hub').click();
  await expect(page).toHaveURL(/\/ro\/(#games)?$/);
});
