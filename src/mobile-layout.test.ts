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

test('mobile Blast Buddies uses a drag-and-hold virtual joystick', () => {
  assert.match(html, /id="mobileJoystick" class="mobile-joystick"[^>]*tabindex="0"[^>]*data-direction="idle"/);
  assert.match(html, /id="mobileJoystickKnob" class="mobile-joystick-knob"/);
  assert.match(html, /\.mobile-joystick\s*\{[^}]*aspect-ratio:\s*1;[^}]*border-radius:\s*50%;[^}]*touch-action:\s*none;/s);
  assert.match(html, /\.mobile-joystick-knob\s*\{[^}]*transform:\s*translate\(-50%, -50%\) translate\(var\(--joystick-x\), var\(--joystick-y\)\);/s);
  assert.equal((html.match(/data-move-x=/g) ?? []).length, 0);
  assert.equal((html.match(/data-bomberman-player=/g) ?? []).length, 10);
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

test('Țintar board includes a non-blocking reduced-motion winner celebration', () => {
  assert.match(html, /id="tintarVictoryOverlay" class="tintar-victory-overlay"[^>]*role="dialog"[^>]*hidden/);
  assert.match(html, /\.tintar-victory-overlay\s*\{[^}]*pointer-events:\s*none;/s);
  assert.match(html, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.tintar-victory-overlay\.is-celebrating/);
  assert.match(html, /html\.reduce-motion \.tintar-victory-overlay\.is-celebrating/);
  assert.equal((html.match(/<i><\/i>/g) ?? []).length >= 14, true);
  assert.match(html, /id="tintarRevengeButton"[^>]*>Play revenge match<\/button>/);
  assert.match(html, /\.tintar-revenge-button\s*\{[^}]*pointer-events:\s*auto;/s);
});

test('arcade settings expose persistent English and Romanian language choices', () => {
  assert.match(html, /id="settingsLanguageSelect" class="settings-language-select"/);
  assert.match(html, /<option value="en">English<\/option>/);
  assert.match(html, /<option value="ro">Română<\/option>/);
});

test('2048 exposes a responsive swipe board and touch fallback controls', () => {
  assert.match(html, /id="twenty48View" class="paddle-app twenty48-app view-hidden"/);
  assert.match(html, /id="twenty48Board" class="twenty48-board"[^>]*role="grid"[^>]*tabindex="0"/);
  assert.match(html, /\.twenty48-board\s*\{[^}]*aspect-ratio:\s*1;[^}]*touch-action:\s*none;/s);
  assert.equal((html.match(/data-twenty48-direction=/g) ?? []).length, 4);
  assert.match(html, /Use arrow keys or WASD\. Swipe the board on touch screens\./);
});

test('Sudoku exposes a responsive board and complete touch controls', () => {
  assert.match(html, /id="sudokuView" class="paddle-app sudoku-app view-hidden"/);
  assert.match(html, /id="sudokuBoard" class="sudoku-board"[^>]*role="grid"/);
  assert.match(html, /\.sudoku-board\s*\{[^}]*aspect-ratio:\s*1;[^}]*grid-template-columns:\s*repeat\(9, 1fr\);/s);
  assert.equal((html.match(/data-sudoku-number=/g) ?? []).length, 9);
  assert.equal((html.match(/data-sudoku-difficulty=/g) ?? []).length, 3);
  assert.match(html, /id="sudokuHintButton"/);
  assert.match(html, /id="sudokuHints">2<\/b>/);
  assert.match(html, /id="sudokuScore">10,000<\/b>/);
  assert.match(html, /Tougher puzzles start with a higher score/);
});

test('Țintar exposes three responsive single-player bot levels', () => {
  assert.equal((html.match(/<button[^>]*data-tintar-bot-difficulty=/g) ?? []).length, 3);
  assert.match(html, /class="game-room-panel tintar-bot-panel"[^>]*aria-label="Țintar bot difficulty"/);
  assert.match(html, /data-catalog-game="tintar" data-catalog-modes="solo local online"/);
  assert.match(html, /id="tintarCoralName"/);
});

test('mobile game library uses compact three-column tiles with a narrow-screen fallback', () => {
  assert.match(mobileStyles, /\.game-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);[^}]*gap:\s*8px;/s);
  assert.match(mobileStyles, /\.game-cover\s*\{[^}]*min-height:\s*82px;/s);
  assert.match(mobileStyles, /\.game-glyph\s*\{[^}]*font-size:\s*2rem;/s);
  assert.match(mobileStyles, /\.cover-label\s*\{[^}]*display:\s*none;/s);
  assert.match(mobileStyles, /\.catalog-card-body p,[\s\S]*?\.mode-label\s*\{[^}]*display:\s*none;/s);
  assert.match(mobileStyles, /\.card-play-button\s*\{[^}]*width:\s*100%;[^}]*min-height:\s*34px;/s);
  assert.match(html, /@media \(max-width: 340px\)[\s\S]*?\.game-grid\s*\{[^}]*repeat\(2, minmax\(0, 1fr\)\)/s);
});

test('mobile progression panels expose accessible fold controls and notice badges', () => {
  assert.equal((html.match(/data-mobile-fold-target=/g) ?? []).length, 4);
  assert.match(html, /data-mobile-fold-target="profilePanelBody"[^>]*aria-expanded="false"[^>]*aria-controls="profilePanelBody"/);
  assert.match(html, /data-mobile-fold-target="dailyChallengeFoldBody"[^>]*aria-expanded="false"/);
  assert.match(html, /id="dailyFoldNotice" class="mobile-fold-notice alert"/);
  assert.match(html, /data-mobile-fold-target="achievementFoldBody"[^>]*aria-expanded="false"/);
  assert.match(html, /data-mobile-fold-target="activityFoldBody"[^>]*aria-expanded="false"/);
  assert.match(mobileStyles, /\.mobile-fold-toggle\s*\{[^}]*display:\s*grid;[^}]*min-height:\s*66px;/s);
  assert.match(mobileStyles, /\.mobile-fold-toggle\[aria-expanded="false"\][\s\S]*?\.mobile-fold-content\s*\{[^}]*display:\s*none;/s);
});
