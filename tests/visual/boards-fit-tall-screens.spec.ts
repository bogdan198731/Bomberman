import { test, expect } from '@playwright/test';
import { box, openGame } from './helpers';

// On tall monitors the shared board once grew to the full column width and
// pushed each game's controls below the bottom edge.
const SCREENS = [[1920, 1080], [1600, 1300]] as const;
const GAMES = ['mines', 'reversi', 'fourrow', 'solitaire'] as const;

for (const [width, height] of SCREENS) {
  test(`board games keep their controls on screen at ${width}x${height}`, async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'Tall desktop screens only.');
    await page.setViewportSize({ width, height });
    for (const game of GAMES) {
      await openGame(page, game);
      const controls = await box(page.locator(`#${game}View .paddle-statusbar`).first());
      expect(controls.y + controls.height, `${game} controls end inside the window`).toBeLessThanOrEqual(height);
    }
  });
}
