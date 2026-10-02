import { test, expect, type Page } from '@playwright/test';
import { openGame, box, renderedColor, colorDifference, textContrast, READABLE_TEXT, type Rgb } from './helpers';

const THEMES = ['midnight', 'ocean', 'sunset', 'forest', 'galaxy'] as const;

/** Stores the theme the way the Settings picker does, before the page loads. */
async function useTheme(page: Page, theme: string): Promise<void> {
  await page.addInitScript(chosen => {
    try {
      localStorage.setItem('blast-arcade-settings-v1', JSON.stringify({
        soundEnabled: false, volume: 0, reducedMotion: true, highContrast: false, theme: chosen, language: 'en', touchControls: 'auto',
      }));
    } catch { /* storage blocked: defaults are fine */ }
  }, theme);
}

test('the Settings picker switches the colour theme and remembers it', async ({ page }) => {
  await useTheme(page, 'midnight');
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.locator('[data-open-settings]').first().click();
  const picker = page.locator('#settingsThemeSelect');
  await expect(picker).toBeVisible();
  expect(await textContrast(page.locator('label[for="settingsThemeSelect"] strong'))).toBeGreaterThanOrEqual(READABLE_TEXT);
  await picker.selectOption('sunset');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'sunset');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#1e0816');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('blast-arcade-settings-v1') ?? '{}').theme);
  expect(saved).toBe('sunset');
});

test('every colour theme looks different on the arcade home', async ({ page }) => {
  const panels: Rgb[] = [];
  for (const theme of THEMES) {
    await useTheme(page, theme);
    // A fresh load each time: the leaderboard is reached by a hash, which alone would not reload.
    await page.goto(`/?theme-check=${theme}#profile`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    const panel = page.locator('.leaderboard-panel');
    panels.push(await renderedColor(panel));
    expect(await textContrast(page.locator('#leaderboardCaption'))).toBeGreaterThanOrEqual(READABLE_TEXT);
  }
  // Dark panels sit close together in delta E; 10 is still an obvious change of hue side by side.
  for (let a = 0; a < panels.length; a++) {
    for (let b = a + 1; b < panels.length; b++) {
      expect(colorDifference(panels[a], panels[b]), `${THEMES[a]} vs ${THEMES[b]}`).toBeGreaterThan(10);
    }
  }
});

for (const theme of THEMES) {
  test(`end screens stay readable in the ${theme} theme`, async ({ page }) => {
    // Minesweeper: a saved Easy board with the mines in the top row, so the first tap loses.
    await useTheme(page, theme);
    await page.addInitScript(saved => {
      try { localStorage.setItem('blast-arcade-mines-session-v1', saved); } catch { /* storage blocked */ }
    }, JSON.stringify({ difficulty: 'easy', cells: '1'.repeat(10) + '0'.repeat(71), elapsedMs: 0 }));
    await openGame(page, 'mines');
    // openGame stores its own settings; the theme's are added after, so they win on reload.
    await useTheme(page, theme);
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    const board = page.locator('#minesCanvas');
    const field = await box(board);
    await board.click({ position: { x: field.width / 18, y: field.width / 18 } });
    await expect(page.locator('.arcade-result-overlay')).toBeVisible();
    expect(await textContrast(page.locator('#arcadeResultTitle'))).toBeGreaterThanOrEqual(READABLE_TEXT);
    expect(await textContrast(page.locator('.arcade-result-explanation'))).toBeGreaterThanOrEqual(READABLE_TEXT);
  });
}
