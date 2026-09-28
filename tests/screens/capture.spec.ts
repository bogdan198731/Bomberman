import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, type Page } from '@playwright/test';

/**
 * Screenshots of the hub and every game's start screen, for the fix
 * pipeline's side-effect check. Only runs when VISUAL_SCREENS_DIR is set.
 * Time and randomness are frozen so unchanged code gives unchanged pixels;
 * screens that still differ between two runs are treated as unstable.
 */
const dir = process.env.VISUAL_SCREENS_DIR;
const FROZEN_AT = new Date('2026-01-01T12:00:00Z');

async function freeze(page: Page, games: readonly string[]): Promise<void> {
  await page.addInitScript(ids => {
    // Same seed on every load, so shuffled boards and spawn points repeat.
    let seed = 0x2f6b1d3;
    Math.random = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    try {
      localStorage.setItem('blast-arcade-settings-v1', JSON.stringify({
        soundEnabled: false, volume: 0, reducedMotion: true, highContrast: false, language: 'en', touchControls: 'auto',
      }));
      localStorage.setItem('blast-arcade-guides-v1', JSON.stringify(ids));
    } catch { /* storage blocked: defaults are fine */ }
  }, games);
}

async function capture(page: Page, path: string, file: string): Promise<void> {
  await page.clock.install({ time: FROZEN_AT });
  await page.goto(path);
  await page.waitForLoadState('networkidle');
  // Stop the clock at the same moment every run, so animation frames match.
  await page.clock.pauseAt(new Date(FROZEN_AT.getTime() + 2000));
  await page.evaluate(() => document.fonts.ready);
  writeFileSync(file, await page.screenshot({ fullPage: true, animations: 'disabled', caret: 'hide' }));
}

test('capture every screen', async ({ browser }, info) => {
  test.skip(!dir, 'Only the fix pipeline captures screens.');
  test.setTimeout(5 * 60_000);
  mkdirSync(dir!, { recursive: true });

  const probe = await browser.newPage();
  await probe.goto('/');
  const games = await probe.$$eval('[data-launch-game]', elements => [...new Set(elements.map(element => element.getAttribute('data-launch-game') ?? ''))].filter(Boolean).sort());
  await probe.close();

  const screens: [string, string][] = [['hub', '/'], ...games.map(game => [game, `/play/${game}`] as [string, string])];
  for (const [name, path] of screens) {
    // A fresh page per screen, so one game's state cannot leak into the next.
    const page = await browser.newPage({ ...info.project.use, baseURL: info.project.use.baseURL });
    await freeze(page, games);
    await capture(page, path, join(dir!, `${info.project.name}-${name}.png`));
    await page.close();
  }
});
