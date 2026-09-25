import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BOMBERMAN_SKINS,
  BOMBERMAN_SKIN_STORAGE_KEY,
  RETRO_GRID,
  drawRetroBomb,
  drawRetroBrick,
  drawRetroExplosion,
  drawRetroFloor,
  drawRetroPlayer,
  drawRetroPowerUp,
  drawRetroSolidBlock,
  loadBombermanSkin,
  normalizeBombermanSkin,
  otherSkin,
  saveBombermanSkin,
  type BombermanSkin,
} from './bomberman-skin.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const indexSource = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');

function memoryStorage(seed: Record<string, string> = {}) {
  const store = new Map(Object.entries(seed));
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    store,
  };
}

/** Records every fill so tests can assert on what the sprite actually painted. */
function recordingContext() {
  const rects: { x: number; y: number; w: number; h: number; color: string }[] = [];
  let fillStyle = '#000000';
  const ctx = {
    get fillStyle() { return fillStyle; },
    set fillStyle(value: string) { fillStyle = value; },
    fillRect(x: number, y: number, w: number, h: number) {
      rects.push({ x, y, w, h, color: fillStyle });
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, rects };
}

test('skin values normalize to a known skin and toggle between the two', () => {
  assert.deepEqual([...BOMBERMAN_SKINS], ['modern', 'retro']);
  assert.equal(normalizeBombermanSkin('retro'), 'retro');
  assert.equal(normalizeBombermanSkin('modern'), 'modern');
  for (const junk of [null, undefined, '', 'RETRO', 'classic', 7, {}]) {
    assert.equal(normalizeBombermanSkin(junk), 'modern', `${String(junk)} should fall back to modern`);
  }
  assert.equal(otherSkin('modern'), 'retro');
  assert.equal(otherSkin('retro'), 'modern');
});

test('the chosen skin survives a reload and defaults to modern for new players', () => {
  const storage = memoryStorage();
  assert.equal(loadBombermanSkin(storage), 'modern', 'first-time players get the current look');

  assert.equal(saveBombermanSkin('retro', storage), 'retro');
  assert.equal(storage.store.get(BOMBERMAN_SKIN_STORAGE_KEY), 'retro');
  assert.equal(loadBombermanSkin(storage), 'retro', 'the preference persists across reloads');

  saveBombermanSkin('modern', storage);
  assert.equal(loadBombermanSkin(storage), 'modern');
});

test('a corrupted or unavailable store never breaks the game', () => {
  assert.equal(loadBombermanSkin(memoryStorage({ [BOMBERMAN_SKIN_STORAGE_KEY]: 'garbage' })), 'modern');
  assert.equal(loadBombermanSkin(undefined), 'modern');

  const throwing = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
  };
  assert.equal(loadBombermanSkin(throwing), 'modern', 'a blocked store must not throw');
  assert.equal(saveBombermanSkin('retro', throwing), 'retro', 'saving still reports the chosen skin');
});

test('retro sprites paint inside their tile and snap to whole pixels', () => {
  const size = 48;
  const draws: [string, (ctx: CanvasRenderingContext2D) => void][] = [
    ['floor', c => drawRetroFloor(c, 96, 144, size, 2, 3)],
    ['solid', c => drawRetroSolidBlock(c, 96, 144, size)],
    ['brick', c => drawRetroBrick(c, 96, 144, size)],
    ['bomb', c => drawRetroBomb(c, 96, 144, size, 0, 0.5)],
    ['explosion', c => drawRetroExplosion(c, 96, 144, size, 0)],
    ['powerup', c => drawRetroPowerUp(c, 96, 144, size, 'fire', 0)],
  ];

  for (const [name, draw] of draws) {
    const { ctx, rects } = recordingContext();
    draw(ctx);
    assert.ok(rects.length > 0, `${name} should paint something`);
    for (const rect of rects) {
      assert.equal(Number.isInteger(rect.x), true, `${name} x must be a whole pixel, got ${rect.x}`);
      assert.equal(Number.isInteger(rect.y), true, `${name} y must be a whole pixel, got ${rect.y}`);
      // A sprite may lift slightly above its tile (power-up bob) but never sprawl.
      assert.ok(rect.x >= 96 - size && rect.x + rect.w <= 96 + size * 2, `${name} escaped horizontally`);
      assert.ok(rect.y >= 144 - size && rect.y + rect.h <= 144 + size * 2, `${name} escaped vertically`);
    }
  }
});

test('retro sprites use flat palette colours, never gradients', () => {
  const { ctx, rects } = recordingContext();
  drawRetroSolidBlock(ctx, 0, 0, 32);
  drawRetroBrick(ctx, 32, 0, 32);
  drawRetroPlayer(ctx, { playerId: 1, x: 64, y: 0, facing: 'down', walking: true }, 32, 0);
  for (const rect of rects) {
    assert.match(rect.color, /^#[0-9a-f]{6}$/i, `expected a flat hex colour, got ${rect.color}`);
  }
});

test('player sprites differ by player, facing, and walk frame', () => {
  const signature = (sprite: Parameters<typeof drawRetroPlayer>[1], now: number): string => {
    const { ctx, rects } = recordingContext();
    drawRetroPlayer(ctx, sprite, 32, now);
    return JSON.stringify(rects);
  };
  const base = { playerId: 1, x: 0, y: 0, facing: 'down' as const, walking: false };

  assert.notEqual(
    signature(base, 0),
    signature({ ...base, playerId: 2 }, 0),
    'each player needs a distinguishable colour',
  );
  assert.notEqual(
    signature(base, 0),
    signature({ ...base, facing: 'up' }, 0),
    'facing away should hide the face',
  );
  assert.notEqual(
    signature({ ...base, walking: true }, 0),
    signature({ ...base, walking: true }, 130),
    'walking should animate across frames',
  );
  assert.equal(
    signature(base, 0),
    signature(base, 130),
    'standing still should hold one frame',
  );
});

test('animated sprites actually change between frames', () => {
  const frames = (draw: (ctx: CanvasRenderingContext2D, now: number) => void): Set<string> => {
    const seen = new Set<string>();
    for (const now of [0, 60, 120, 180, 240]) {
      const { ctx, rects } = recordingContext();
      draw(ctx, now);
      seen.add(JSON.stringify(rects));
    }
    return seen;
  };
  assert.ok(frames((c, now) => drawRetroExplosion(c, 0, 0, 32, now)).size > 1, 'explosions should flicker');
  assert.ok(frames((c, now) => drawRetroBomb(c, 0, 0, 32, now, 0.9)).size > 1, 'bombs should pulse');
});

test('the retro grid divides evenly into the canvas tile size', () => {
  assert.equal(RETRO_GRID, 16);
  // 832px canvas over a 13-wide grid gives 64px tiles, a clean 4px per sprite pixel.
  assert.equal((832 / 13) % RETRO_GRID, 0);
});

test('the toggle is wired into the game and its canvas', () => {
  assert.match(html, /id="bombermanSkinButton"[^>]*aria-pressed="false"/);
  assert.match(html, /#gameCanvas\.retro-skin \{[^}]*image-rendering: pixelated;/);
  assert.match(html, /\.game-nav-actions \.skin-toggle-button::before/, 'the button collapses to an icon on mobile');

  assert.match(indexSource, /skin: activeSkin/, 'the live render path must receive the chosen skin');
  assert.match(indexSource, /activeSkin = saveBombermanSkin\(otherSkin\(activeSkin\)\)/);
  assert.match(indexSource, /ctx\.imageSmoothingEnabled = !retro/, 'pixel art must not be interpolated');
});

test('both skins are reachable and the default stays modern', () => {
  const skins: BombermanSkin[] = ['modern', 'retro'];
  for (const skin of skins) {
    const storage = memoryStorage();
    saveBombermanSkin(skin, storage);
    assert.equal(loadBombermanSkin(storage), skin);
  }
});
