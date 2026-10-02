import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, type Page } from '@playwright/test';
import { GAME_META } from '../../dist/game-metadata.js';

/**
 * Makes each game's share card (public/og/<game>.jpg, 1200x630): the game's
 * own board beside its name, so a link shared on WhatsApp or Facebook shows
 * the game itself. Runs only from `npm run share-images` (npm names the script
 * it runs in npm_lifecycle_event), never as part of the visual tests.
 */
const enabled = process.env.npm_lifecycle_event === 'share-images';
const OUT_DIR = join(process.cwd(), 'public', 'og');

type Recipe = { board: string; prepare?: (page: Page) => Promise<void> };
const click = (selector: string, wait = 1600) => async (page: Page): Promise<void> => {
  await page.locator(selector).first().click();
  await page.waitForTimeout(wait);
};
const keys = (keys: string[]) => async (page: Page): Promise<void> => {
  for (const key of keys) { await page.keyboard.press(key); await page.waitForTimeout(140); }
};

// What each card shows: the board, after a few seconds of play where a fresh board would look empty.
const RECIPES: Record<string, Recipe> = {
  bomberman: { board: '#gameCanvas', prepare: async page => {
    await page.locator('[data-bomberman-lobby-mode="bot"]').click();
    await page.locator('[data-bot-difficulty="normal"]').click();
    await page.waitForTimeout(4200);
  } },
  tintar: { board: '#tintarBoard' },
  paddle: { board: '#paddleCanvas', prepare: click('#paddleServeButton', 1400) },
  snake: { board: '#snakeCanvas', prepare: async page => {
    await click('#snakeStartButton', 300)(page);
    // Keys pressed on the focused Start button are ignored, so steer from the page.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    for (const [key, wait] of [['KeyW', 500], ['KeyA', 1400], ['KeyS', 700], ['KeyA', 500]] as const) {
      await page.keyboard.press(key);
      await page.waitForTimeout(wait);
    }
  } },
  tanks: { board: '#tanksCanvas', prepare: click('#tanksLaunchButton', 2200) },
  septica: { board: '.septica-felt', prepare: async page => {
    await page.locator('#septicaHand > *').first().click();
    await page.waitForTimeout(1800);
  } },
  survival: { board: '#survivalCanvas', prepare: click('#survivalStartButton', 4000) },
  star: { board: '#starCanvas', prepare: click('#starStartButton', 3000) },
  racing: { board: '#racingCanvas', prepare: click('#racingStartButton', 3500) },
  blocks: { board: '#blocksCanvas', prepare: click('#blocksStartButton', 6000) },
  twenty48: { board: '#twenty48Board', prepare: keys(['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'ArrowUp']) },
  sudoku: { board: '#sudokuBoard' },
  cycles: { board: '#cyclesCanvas', prepare: click('#cyclesStartButton', 2600) },
  fourrow: { board: '#fourrowCanvas', prepare: async page => {
    // Drop a few discs; the bot answers each one.
    for (const column of [3, 2, 4, 3]) {
      const canvas = await page.locator('#fourrowCanvas').boundingBox();
      if (canvas) await page.mouse.click(canvas.x + canvas.width * (column + .5) / 7, canvas.y + canvas.height / 2);
      await page.waitForTimeout(900);
    }
  } },
  bricks: { board: '#bricksCanvas', prepare: click('#bricksLaunchButton', 2600) },
  mines: { board: '#minesCanvas', prepare: async page => {
    const canvas = await page.locator('#minesCanvas').boundingBox();
    if (canvas) await page.mouse.click(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
    await page.waitForTimeout(500);
  } },
  hockey: { board: '#hockeyCanvas', prepare: click('#hockeyStartButton', 2600) },
  reversi: { board: '#reversiCanvas' },
  solitaire: { board: '#solitaireCanvas' },
  hangman: { board: '#hangmanCanvas', prepare: keys(['KeyE', 'KeyA', 'KeyZ', 'KeyQ']) },
  mathcross: { board: '#mathcrossBoard' },
};

function card(name: string, board: Buffer): string {
  return `<!doctype html><html><head><style>
    * { box-sizing: border-box; margin: 0; }
    body { width: 1200px; height: 630px; overflow: hidden; display: flex; align-items: center; gap: 48px; padding: 0 56px 0 72px;
      color: #f8fafc; font-family: Inter, "Segoe UI", system-ui, sans-serif;
      background: radial-gradient(circle at 12% 18%, rgba(84,227,142,.22), transparent 420px),
        radial-gradient(circle at 92% 88%, rgba(255,107,120,.2), transparent 460px), #0c111a; }
    .text { flex: 1 1 0; min-width: 0; }
    .brand { display: inline-block; padding: 8px 16px; border: 2px solid rgba(84,227,142,.55); border-radius: 999px;
      color: #54e38e; font-size: 24px; font-weight: 800; letter-spacing: .14em; }
    h1 { margin: 26px 0 22px; font-size: ${name.length > 10 ? 66 : 88}px; line-height: 1.02; font-weight: 900; letter-spacing: -.02em; }
    .site { color: #ffc857; font-size: 34px; font-weight: 800; }
    .board { flex: 0 0 auto; display: grid; place-items: center; width: 560px; height: 520px; }
    .board img { max-width: 560px; max-height: 520px; border-radius: 22px; border: 2px solid rgba(255,255,255,.14);
      box-shadow: 0 24px 70px rgba(0,0,0,.55), 0 0 60px rgba(84,227,142,.18); }
  </style></head><body>
    <div class="text"><span class="brand">BLAST ARCADE</span><h1>${name}</h1><div class="site">blastarcade.ro</div></div>
    <div class="board"><img src="data:image/png;base64,${board.toString('base64')}"></div>
  </body></html>`;
}

test.describe('share images', () => {
  test.skip(!enabled, 'Run with `npm run share-images`.');

  for (const [game, recipe] of Object.entries(RECIPES)) {
    test(game, async ({ browser }, info) => {
      test.skip(info.project.name !== 'desktop', 'One set of images.');
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
      await context.addInitScript(id => {
        localStorage.setItem('blast-arcade-settings-v1', JSON.stringify({
          soundEnabled: false, volume: 0, reducedMotion: true, highContrast: false, language: 'en', touchControls: 'auto',
        }));
        localStorage.setItem('blast-arcade-guides-v1', JSON.stringify([id]));
      }, game);
      const page = await context.newPage();
      await page.goto(`/play/${game}`);
      await page.waitForLoadState('networkidle');
      await recipe.prepare?.(page);
      const board = await page.locator(recipe.board).first().screenshot();
      const cardPage = await browser.newPage({ viewport: { width: 1200, height: 630 } });
      await cardPage.setContent(card(GAME_META[game as keyof typeof GAME_META].name, board));
      mkdirSync(OUT_DIR, { recursive: true });
      writeFileSync(join(OUT_DIR, `${game}.jpg`), await cardPage.screenshot({ type: 'jpeg', quality: 82 }));
      await context.close();
      await cardPage.close();
    });
  }
});
