import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const indexSource = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
const gameRoomSource = readFileSync(new URL('../src/game-room.ts', import.meta.url), 'utf8');
const catalogSource = readFileSync(new URL('../src/catalog.ts', import.meta.url), 'utf8');
const tintarSource = readFileSync(new URL('../src/tintar.ts', import.meta.url), 'utf8');
const snakeSource = readFileSync(new URL('../src/snake.ts', import.meta.url), 'utf8');
const tanksSource = readFileSync(new URL('../src/tanks.ts', import.meta.url), 'utf8');
const racingSource = readFileSync(new URL('../src/racing.ts', import.meta.url), 'utf8');
const blocksSource = readFileSync(new URL('../src/blocks.ts', import.meta.url), 'utf8');
const sudokuSource = readFileSync(new URL('../src/sudoku.ts', import.meta.url), 'utf8');
const mobileStart = html.indexOf('@media (max-width: 700px)');
const nextMediaQuery = html.indexOf('@media', mobileStart + 1);
const mobileStyles = html.slice(
  mobileStart,
  nextMediaQuery === -1 ? html.length : nextMediaQuery,
);

test('mobile Blast Buddies lobby exposes compact Local, Bot, and Online modes', () => {
  assert.notEqual(mobileStart, -1, 'expected the mobile breakpoint to exist');
  assert.match(
    mobileStyles,
    /\.lobby-overlay\s*\{[^}]*display:\s*flex;[^}]*overflow-y:\s*auto;[^}]*touch-action:\s*pan-y;/s,
  );
  assert.match(mobileStyles, /\.lobby-panel\s*\{[^}]*flex:\s*0 0 auto;/s);
  assert.equal((html.match(/data-bomberman-lobby-mode=/g) ?? []).length, 3);
  assert.match(html, /data-bomberman-mode-panel="online" hidden>[\s\S]*?id="createRoomButton"[\s\S]*?id="joinRoomButton"/);
  assert.doesNotMatch(html, /lobby-scroll-hint/);
});

test('multiplayer games share a mode-first room selector', () => {
  assert.match(gameRoomSource, /class="game-room-mode-tabs"[^>]*role="tablist"/);
  assert.match(gameRoomSource, /data-room-mode="online"/);
  assert.match(gameRoomSource, /data-room-online hidden/);
  assert.match(gameRoomSource, /class="game-room-compact-toggle"[^>]*data-room-toggle/);
  assert.match(gameRoomSource, /this\.setCompact\(mode !== 'online'\)/);
  assert.match(html, /\.game-room-panel\[data-room-collapsed="true"\] \.game-room-content\s*\{\s*display:\s*none;/s);
  assert.equal((gameRoomSource.match(/offlineModes/g) ?? []).length >= 6, true);
  assert.match(html, /\.room-mode-managed \.snake-modes\s*\{\s*display:\s*none;/s);
});

test('active game screens reserve short viewports for the playfield', () => {
  assert.match(html, /@media \(min-width: 761px\) and \(max-height: 920px\)/);
  assert.match(html, /#gameView \.arena-wrap\s*\{[^}]*width:\s*min\(680px, calc\(100dvh - 255px\), calc\(100% - 32px\)\);/s);
  assert.match(html, /\.paddle-shell\s*\{[^}]*width:\s*min\(100%, 900px\);[^}]*margin-inline:\s*auto;/s);
  assert.match(html, /\.sudoku-board-stage\s*\{[^}]*width:\s*min\(100%, calc\(100dvh - 400px\)\);/s);
  assert.match(html, /:is\(#paddleCanvas, #snakeCanvas, #tanksCanvas, #survivalCanvas, #starCanvas, #racingCanvas, #blocksCanvas\)\s*\{[^}]*width:\s*min\(100%, calc\(\(100dvh - 390px\) \* 1\.5\)\);/s);
  assert.match(html, /\.tintar-board\s*\{[^}]*width:\s*min\(100%, 620px, calc\(100dvh - 200px\)\);/s);
  assert.match(html, /\.twenty48-board-stage\s*\{[^}]*width:\s*min\(100%, 560px, calc\(100dvh - 295px\)\);/s);
  assert.match(html, /\.septica-felt\s*\{[^}]*min-height:\s*0;[^}]*grid-template-rows:\s*auto minmax\(120px, 1fr\) auto;[^}]*padding:\s*14px 24px;/s);
  assert.match(html, /\.room-mode-managed \.snake-toolbar\s*\{\s*display:\s*none;/s);
  assert.match(html, /\.tintar-board-frame\s*\{\s*order:\s*-1;/s);
  assert.match(html, /\.game-room-heading \.game-room-copy\s*\{\s*display:\s*none;/s);
});

test('mobile Blast Buddies uses a drag-and-hold virtual joystick', () => {
  assert.match(html, /id="mobileJoystick" class="mobile-joystick"[^>]*tabindex="0"[^>]*data-direction="idle"/);
  assert.match(html, /id="mobileJoystickKnob" class="mobile-joystick-knob"/);
  assert.match(html, /\.mobile-joystick\s*\{[^}]*aspect-ratio:\s*1;[^}]*border-radius:\s*50%;[^}]*touch-action:\s*none;/s);
  assert.match(html, /\.mobile-joystick-knob\s*\{[^}]*transform:\s*translate\(-50%, -50%\) translate\(var\(--joystick-x\), var\(--joystick-y\)\);/s);
  assert.equal((html.match(/data-move-x=/g) ?? []).length, 0);
  assert.equal((html.match(/data-bomberman-player=/g) ?? []).length, 2);
  assert.equal((html.match(/data-bomberman-local-joystick=/g) ?? []).length, 2);
});

test('mobile Blast Buddies defaults to joystick right and offers a persistent side swap', () => {
  assert.match(html, /id="mobileControls"[^>]*data-control-layout="joystick-right"/);
  assert.match(html, /id="mobileControlLayoutButton"[^>]*data-joystick-side="right"/);
  assert.match(html, /\.mobile-controls\[data-control-layout="joystick-right"\] \.mobile-joystick\s*\{[^}]*grid-column:\s*3;/s);
  assert.match(html, /\.mobile-controls\[data-control-layout="joystick-right"\] \.mobile-bomb-button\s*\{[^}]*grid-column:\s*1;/s);
  assert.match(html, /\.mobile-controls\[data-control-layout="joystick-left"\] \.mobile-joystick\s*\{[^}]*grid-column:\s*1;/s);
  assert.match(html, /\.mobile-controls\[data-control-layout="joystick-left"\] \.mobile-bomb-button\s*\{[^}]*grid-column:\s*3;/s);
  assert.match(html, /\.mobile-control-actions\s*\{[^}]*grid-column:\s*2;[^}]*grid-row:\s*1;[^}]*align-self:\s*center;/s);
  assert.match(html, /\.mobile-joystick,\s*\.mobile-bomb-button\s*\{[^}]*grid-row:\s*1;/s);
});

test('short landscape Bomberman keeps the arena visible between overlay controls', () => {
  assert.match(html, /@media \(orientation: landscape\) and \(max-height: 520px\)/);
  assert.match(html, /body\[data-view="bomberman"\]\s*\{[^}]*overflow:\s*hidden;/s);
  assert.match(html, /#gameView \.arena-wrap\s*\{[^}]*width:\s*min\(calc\(100dvh - 48px\), calc\(100vw - 288px\)\);[^}]*margin:\s*44px auto 0;/s);
  assert.match(html, /#gameView \.scoreboard\s*\{[^}]*position:\s*fixed;[^}]*width:\s*min\(360px, calc\(100vw - 260px\)\);/s);
  assert.match(html, /#gameView \.mobile-controls:not\(\.hidden\)\s*\{[^}]*position:\s*fixed;[^}]*height:\s*100dvh;[^}]*pointer-events:\s*none;/s);
  assert.match(html, /#gameView \.mobile-control-actions\s*\{[^}]*position:\s*fixed;[^}]*bottom:\s*6px;/s);
  assert.match(html, /#bombermanLocalControls:not\(\.hidden\)\s*\{[^}]*position:\s*fixed;[^}]*grid-template-columns:/s);
});

test('real-time mobile games use shared virtual joysticks', () => {
  for (const game of ['paddle', 'snake', 'tank', 'survival', 'star', 'racing']) {
    assert.equal((html.match(new RegExp(`data-${game}-joystick=`, 'g')) ?? []).length, 2, `${game} joysticks`);
  }
  assert.equal((html.match(/class="arcade-joystick"/g) ?? []).length, 14);
  assert.equal((html.match(/data-joystick-knob/g) ?? []).length, 14);
  assert.match(html, /\.arcade-joystick\s*\{[^}]*aspect-ratio:\s*1;[^}]*touch-action:\s*none;/s);
  assert.match(html, /\.tank-touch-team\.joystick-team\s*\{[^}]*grid-template-columns:/s);
  assert.equal((html.match(/data-paddle-direction=/g) ?? []).length, 0);
  assert.equal((html.match(/data-snake-direction=/g) ?? []).length, 0);
  assert.equal((html.match(/data-racing-action=/g) ?? []).length, 4);
  for (const id of ['snakeCoralControls', 'tanksCoralControls', 'racingCoralControls', 'blocksCoralControls']) {
    assert.match(html, new RegExp(`id="${id}"[^>]*solo-hidden`));
  }
  for (const source of [snakeSource, tanksSource, racingSource, blocksSource]) {
    assert.match(source, /touchSession\?\.online \? touchSession\.playerId !== 2/);
  }
});

test('mobile real-time games keep gameplay controls next to the playfield', () => {
  const affectedViews = ':is(#paddleView, #snakeView, #tanksView, #survivalView, #starView, #racingView, #blocksView)';
  assert.match(html, new RegExp(`${affectedViews.replace(/[()#.,]/g, '\\$&')} \\.paddle-shell \\{[\\s\\S]*?flex-direction: column;`));
  assert.match(html, /:is\(\.paddle-touch-controls, \.snake-touch-controls, \.tanks-touch-controls\) \{[\s\S]*?order: 3;/);
  assert.match(html, /#blocksView\) \.paddle-statusbar \{[\s\S]*?order: 4;/);
  assert.match(html, /#blocksView\) \.paddle-footer \{[\s\S]*?order: 5;/);
});

test('single-player joystick action controls mirror the Blast Buddies thumb layout', () => {
  assert.match(html, /> \.joystick-team:has\(\.tank-touch-button\.fire\):not\(\.solo-hidden\) \{[\s\S]*?grid-template-columns: 82px minmax\(8px, 1fr\) minmax\(104px, 112px\);/);
  assert.match(html, /> \.joystick-team:has\(\.tank-touch-button\.fire\):not\(\.solo-hidden\) > \.arcade-joystick \{[\s\S]*?grid-column: 3;[\s\S]*?justify-self: end;/);
  assert.match(html, /> \.joystick-team:has\(\.tank-touch-button\.fire\):not\(\.solo-hidden\) > \.tank-touch-button\.fire \{[\s\S]*?width: 82px;[\s\S]*?height: 82px;[\s\S]*?grid-column: 1;[\s\S]*?border-radius: 50%;/);
});

test('solo scoreboards replace the inactive Coral slot with useful live stats', () => {
  assert.match(snakeSource, /secondaryLabel\.textContent = solo \? 'Length' : 'Coral'/);
  assert.match(snakeSource, /game\.riders\[1\]\.body\.length/);
  assert.match(readFileSync(new URL('../src/survival.ts', import.meta.url), 'utf8'), /secondaryLabel\.textContent = solo \? 'Kills' : 'Coral score'/);
  assert.match(readFileSync(new URL('../src/star.ts', import.meta.url), 'utf8'), /solo \? String\(game\.kills\)/);
  assert.match(html, /\.paddle-score-player\.coral\.solo-stat \.paddle-score-swatch/);
});

test('remaining game setup and reset actions use clear, safe mobile copy', () => {
  assert.match(indexSource, /let selectedLobbyMode: 'local' \| 'bot' \| 'online' = 'local'/);
  assert.match(indexSource, /previewingLobby && selectedLobbyMode === 'local'/);
  assert.match(html, /class="game-room-panel star-mode-panel"/);
  assert.match(html, /data-star-mode="coop">Local co-op<\/button>/);
  assert.match(html, /\.tintar-turn-card \{ display: none; \}/);
  assert.match(html, /id="septicaRestartButton"[^>]*>New deal<\/button>/);
  assert.match(html, /class="new-puzzle"[^>]*data-sudoku-new/);
  assert.match(readFileSync(new URL('../src/twenty48.ts', import.meta.url), 'utf8'), /window\.confirm\(translateArcadeText\('Start a new 2048 game\?/);
  assert.match(sudokuSource, /window\.confirm\(translateArcadeText\('Start a new Sudoku puzzle\?/);
  assert.match(readFileSync(new URL('../src/septica.ts', import.meta.url), 'utf8'), /window\.confirm\(translateArcadeText\('Start a new deal\?/);
  assert.match(tintarSource, /window\.confirm\(translateArcadeText\('Reset this Țintar match\?/);
});

test('Block Drop prioritizes one large human board on mobile', () => {
  assert.match(blocksSource, /const singleBoardMobile = mobile && \(game\.mode === 'bot' \|\| Boolean\(room\?\.session\(\)\.online\)\)/);
  assert.match(blocksSource, /setCanvasSize\(mobile \? 360 : 900, mobile \? \(singleBoardMobile \? 470 : 390\) : 600\)/);
  assert.match(blocksSource, /drawBoard\(focusedPlayer, 29, 52, 20\)/);
  assert.match(blocksSource, /drawBoard\(rival, 282, 70, 6\)/);
  assert.match(html, /\.blocks-arena \{ padding: 6px; \}/);
  assert.match(html, /id="blocksMobileStartButton" class="blocks-mobile-start"/);
  assert.match(html, /\.blocks-mobile-start:not\(\[hidden\]\)\s*\{[^}]*position:\s*absolute;/s);
  assert.match(blocksSource, /game\.peekNextType\(focusedPlayer\)/);
});

test('mobile racing separates steering from throttle and brake pedals', () => {
  assert.equal((html.match(/class="racing-pedal racing-brake"/g) ?? []).length, 2);
  assert.equal((html.match(/class="racing-pedal racing-accelerate"/g) ?? []).length, 2);
  assert.match(racingSource, /direction === 'left' \|\| direction === 'right'/);
  assert.match(racingSource, /}, 'horizontal'\);/);
  assert.match(html, /\.racing-touch-controls:has\(\.solo-hidden\) > \.racing-team:not\(\.solo-hidden\)[\s\S]*?grid-template-columns: 96px minmax\(8px, 1fr\) minmax\(104px, 112px\);/);
});

test('mobile controls meet a 44px minimum and Sudoku supports pencil notes', () => {
  assert.match(html, /\.game-room-mode-tab,[\s\S]*?\.game-room-join input \{ min-height: 44px; \}/);
  assert.match(html, /id="sudokuNotesButton"[^>]*aria-pressed="false"[^>]*aria-label="Notes mode off"/);
  assert.match(html, /\.sudoku-notes\s*\{[^}]*grid-template-columns: repeat\(3, 1fr\)/s);
  assert.match(sudokuSource, /const notes = new Map<number, Set<number>>\(\)/);
});

test('Țintar board includes native fullscreen styling and a mobile fallback', () => {
  assert.match(html, /id="tintarBoardFrame" class="tintar-board-frame"/);
  assert.match(html, /id="tintarBoardActions" class="tintar-board-actions" hidden/);
  assert.match(html, /id="tintarFullscreenButton"[\s\S]*?aria-pressed="false"/);
  assert.match(html, /\.tintar-board-frame:fullscreen,[\s\S]*?\.tintar-board-frame\.is-fullscreen-layout/);
  assert.match(html, /\.tintar-board-frame\.is-fullscreen-fallback\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*0;/s);
  assert.match(html, /width:\s*min\(100vw, 100dvh, 1200px\)/);
  assert.match(html, /\.tintar-board-frame\.is-fullscreen-layout \.tintar-point\s*\{[^}]*width:\s*clamp\(29px, 7\.5vw, 56px\)/s);
  assert.match(html, /@media \(orientation: portrait\) and \(max-width: 820px\)/);
  assert.match(html, /--tintar-portrait-toolbar-space:\s*max\(120px, calc\(env\(safe-area-inset-top\) \+ 96px\)\)/);
  assert.match(html, /\.tintar-board-frame\.is-fullscreen-layout \.tintar-board\s*\{[^}]*width:\s*100vw;[^}]*height:\s*calc\(100dvh - var\(--tintar-portrait-toolbar-space\) - var\(--tintar-portrait-bottom-space\)\);[^}]*aspect-ratio:\s*auto;/s);
});

test('mobile Țintar keeps a live turn prompt beside the board', () => {
  assert.match(html, /id="tintarBoardStatus">Mint: place a piece\.<\/span>/);
  assert.match(html, /id="tintarBoardPhase">Placement phase<\/strong>/);
  assert.match(html, /@media \(max-width: 760px\)[\s\S]*?\.tintar-board-status \{ display: grid; \}/);
  assert.match(tintarSource, /boardStatusElement\.textContent = statusText/);
  assert.match(tintarSource, /const extendedTapRadius = Math\.max\(22, Math\.min\(34,/);
  assert.match(tintarSource, /nearestDistance <= extendedTapRadius\) playPoint\(nearestPoint\)/);
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
  assert.match(html, /\.twenty48-new-game \{ width: 100%; min-height: 44px; \}/);
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
  assert.match(mobileStyles, /\.game-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);[^}]*gap:\s*7px;/s);
  assert.match(mobileStyles, /\.game-cover\s*\{[^}]*min-height:\s*76px;/s);
  assert.match(mobileStyles, /\.game-glyph\s*\{[^}]*font-size:\s*1\.75rem;/s);
  assert.match(mobileStyles, /\.cover-label\s*\{[^}]*display:\s*none;/s);
  assert.match(mobileStyles, /\.catalog-card-body p,[\s\S]*?\.mode-label\s*\{[^}]*display:\s*none;/s);
  assert.match(mobileStyles, /\.catalog-card-footer\s*\{[^}]*display:\s*block;/s);
  assert.match(mobileStyles, /\.card-play-button\s*\{[^}]*position:\s*absolute;[^}]*inset:\s*0;[^}]*width:\s*100%;[^}]*height:\s*100%;/s);
  assert.equal((html.match(/class="card-play-button"[^>]*aria-label="Play /g) ?? []).length, 12);
  assert.doesNotMatch(catalogSource, /card\.tabIndex = 0/);
  assert.match(catalogSource, /const activateCard[\s\S]*?launchButton\.click\(\)/);
  assert.match(catalogSource, /card\.addEventListener\('click', event => activateCard\(event\.target\)\)/);
  assert.match(html, /@media \(max-width: 340px\)[\s\S]*?\.game-grid\s*\{[^}]*repeat\(2, minmax\(0, 1fr\)\)/s);
});

test('hub promotes game discovery directly after Quick Play with a compact responsive hero', () => {
  assert.match(indexSource, /quickPlay\.insertAdjacentElement\('afterend', gameLibrary\)/);
  assert.match(html, /\.hub-hero\s*\{[^}]*min-height:\s*460px;[^}]*padding:\s*clamp\(28px, 4\.5vw, 52px\);/s);
  assert.match(mobileStyles, /\.hub-hero\s*\{[^}]*gap:\s*18px;[^}]*padding:\s*22px 18px;/s);
  assert.match(mobileStyles, /\.hero-stats\s*\{[^}]*display:\s*none;/s);
});

test('mobile progression panels expose accessible fold controls and notice badges', () => {
  assert.equal((html.match(/data-mobile-fold-target=/g) ?? []).length, 5);
  assert.match(html, /data-mobile-fold-target="profilePanelBody"[^>]*aria-expanded="false"[^>]*aria-controls="profilePanelBody"/);
  assert.match(html, /data-mobile-fold-target="dailyChallengeFoldBody"[^>]*aria-expanded="false"/);
  assert.match(html, /id="dailyFoldNotice" class="mobile-fold-notice alert"/);
  assert.match(html, /data-mobile-fold-target="weeklyQuestFoldBody"[^>]*aria-expanded="false"/);
  assert.match(html, /id="weeklyFoldNotice" class="mobile-fold-notice"/);
  assert.match(html, /data-mobile-fold-target="achievementFoldBody"[^>]*aria-expanded="false"/);
  assert.match(html, /data-mobile-fold-target="activityFoldBody"[^>]*aria-expanded="false"/);
  assert.match(mobileStyles, /\.mobile-fold-toggle\s*\{[^}]*display:\s*grid;[^}]*min-height:\s*58px;/s);
  assert.match(mobileStyles, /\.mobile-fold-toggle\[aria-expanded="false"\][\s\S]*?\.mobile-fold-content\s*\{[^}]*display:\s*none;/s);
});

test('mobile hub adds thumb navigation and a visible horizontal-filter cue', () => {
  assert.equal((html.match(/data-mobile-hub-link=/g) ?? []).length, 4);
  assert.match(mobileStyles, /\.mobile-hub-nav\s*\{[^}]*position:\s*fixed;[^}]*grid-template-columns:\s*repeat\(4, 1fr\);/s);
  assert.match(mobileStyles, /\.mobile-hub-nav a\s*\{[^}]*min-height:\s*48px;/s);
  assert.match(html, /class="catalog-filter-cue" aria-hidden="true">›<\/span>/);
  assert.match(mobileStyles, /\.catalog-filter-cue\s*\{[^}]*display:\s*grid;/s);
  assert.match(indexSource, /function initMobileHubNavigation\(\)/);
  assert.match(indexSource, /setAttribute\('aria-current', 'page'\)/);
  assert.match(catalogSource, /function updateFilterCue\(\)/);
  assert.match(catalogSource, /filterScroller\.scrollLeft \+ filterScroller\.clientWidth/);
  assert.match(catalogSource, /button\.scrollIntoView/);
});

test('wide desktop game library uses a denser four-column arcade shelf', () => {
  assert.match(html, /@media \(min-width: 1100px\)[\s\S]*?\.game-grid\s*\{[^}]*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\);/);
  assert.match(html, /@media \(min-width: 1100px\)[\s\S]*?\.game-cover \{ min-height: 148px; \}/);
  assert.match(html, /@media \(min-width: 1100px\)[\s\S]*?\.catalog-card-body p\s*\{[^}]*font-size: \.78rem;/);
});

test('game launches reset scroll immediately and mobile hub actions meet touch targets', () => {
  assert.match(indexSource, /window\.scrollTo\(\{ top: 0, behavior: 'auto' \}\)/);
  assert.match(indexSource, /requestAnimationFrame\(resetGameScroll\)/);
  assert.match(html, /\.quick-play-filter,[\s\S]*?\.leaderboard-tab \{ min-height: 44px; \}/);
  assert.match(html, /\.favorite-button \{[\s\S]*?width: 44px;[\s\S]*?height: 44px;/);
  assert.match(html, /\.leaderboard-tabs::\-webkit-scrollbar \{ display: none; \}/);
});

test('interface polish includes consistent focus, touch, and twelve-game metadata', () => {
  assert.match(html, /:where\(button, a, input, select, \[tabindex\]\):focus-visible/);
  assert.match(html, /@media \(hover: none\)[\s\S]*?\.catalog-card:hover/);
  assert.match(html, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?animation-duration:\s*0\.001ms/);
  assert.match(html, /content="Blast Arcade is a mobile-friendly hub with twelve instant browser games/);
});
