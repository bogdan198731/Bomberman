import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const mobileStart = html.indexOf('@media (max-width: 700px)');
const nextMediaQuery = html.indexOf('@media', mobileStart + 1);
const mobileStyles = html.slice(
  mobileStart,
  nextMediaQuery === -1 ? html.length : nextMediaQuery,
);

test('mobile Blast Buddies lobby keeps online controls reachable', () => {
  assert.notEqual(mobileStart, -1, 'expected the mobile breakpoint to exist');
  assert.match(
    mobileStyles,
    /\.lobby-overlay\s*\{[^}]*display:\s*flex;[^}]*overflow-y:\s*auto;[^}]*touch-action:\s*pan-y;/s,
  );
  assert.match(mobileStyles, /\.lobby-panel\s*\{[^}]*flex:\s*0 0 auto;/s);
  assert.match(html, /class="lobby-scroll-hint"[^>]*>Swipe for online play<\/div>/);
});

test('Țintar board includes native fullscreen styling and a mobile fallback', () => {
  assert.match(html, /id="tintarBoardFrame" class="tintar-board-frame"/);
  assert.match(html, /id="tintarBoardActions" class="tintar-board-actions" hidden/);
  assert.match(html, /id="tintarFullscreenButton"[\s\S]*?aria-pressed="false"/);
  assert.match(html, /\.tintar-board-frame:fullscreen,[\s\S]*?\.tintar-board-frame\.is-fullscreen-layout/);
  assert.match(html, /\.tintar-board-frame\.is-fullscreen-fallback\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*0;/s);
  assert.match(html, /width:\s*min\(100vw, 100dvh, 1200px\)/);
  assert.match(html, /\.tintar-board-frame\.is-fullscreen-layout \.tintar-point\s*\{[^}]*width:\s*clamp\(29px, 7\.5vw, 56px\)/s);
});
