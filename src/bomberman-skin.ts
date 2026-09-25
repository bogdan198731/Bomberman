/**
 * Retro graphics for Blast Buddies.
 *
 * This is original pixel art in the style of 8-bit era maze-bomber games: a
 * fixed 16x16 grid per tile, a small flat palette, hard black outlines, and
 * stepped animation instead of smooth tweening. It deliberately contains no
 * assets from any commercial Bomberman release.
 */

export type BombermanSkin = 'modern' | 'retro';

export const BOMBERMAN_SKIN_STORAGE_KEY = 'blast-arcade-bomberman-skin-v1';
export const BOMBERMAN_SKINS: readonly BombermanSkin[] = ['modern', 'retro'];

/** Every retro sprite is authored on this grid, so art stays aligned at any canvas size. */
export const RETRO_GRID = 16;

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function normalizeBombermanSkin(value: unknown): BombermanSkin {
  return value === 'retro' ? 'retro' : 'modern';
}

export function otherSkin(skin: BombermanSkin): BombermanSkin {
  return skin === 'retro' ? 'modern' : 'retro';
}

function browserStorage(): StorageLike | undefined {
  try { return typeof localStorage === 'undefined' ? undefined : localStorage; }
  catch { return undefined; }
}

export function loadBombermanSkin(storage: StorageLike | undefined = browserStorage()): BombermanSkin {
  try { return normalizeBombermanSkin(storage?.getItem(BOMBERMAN_SKIN_STORAGE_KEY)); }
  catch { return 'modern'; }
}

export function saveBombermanSkin(
  skin: BombermanSkin,
  storage: StorageLike | undefined = browserStorage(),
): BombermanSkin {
  const normalized = normalizeBombermanSkin(skin);
  try { storage?.setItem(BOMBERMAN_SKIN_STORAGE_KEY, normalized); }
  catch { /* The chosen skin is a convenience; play continues without storage. */ }
  return normalized;
}

/** Flat, limited palette. No gradients anywhere in the retro skin. */
export const RETRO_PALETTE = {
  floorLight: '#2c8a4a',
  floorDark: '#24743e',
  floorSpeck: '#3aa05a',
  solidFace: '#8c9cb4',
  solidLight: '#c3d0e0',
  solidShadow: '#4a5870',
  solidLine: '#151b26',
  brickFace: '#c2643a',
  brickLight: '#e08a53',
  brickShadow: '#8a3f22',
  outline: '#101018',
  bombBody: '#181822',
  bombSheen: '#6a7285',
  fuse: '#c8a24a',
  flameCore: '#fff6d2',
  flameMid: '#ffb02e',
  flameEdge: '#ef3b25',
  p1: '#4ad86a',
  p1Dark: '#1d8f42',
  p2: '#ff6b78',
  p2Dark: '#bf2f45',
  skin: '#f6d7b0',
  visor: '#9fe4ff',
  boot: '#e4ebf5',
  white: '#ffffff',
} as const;

/** Draws one sprite pixel, snapped so cells never leave seams between them. */
function px(
  ctx: CanvasRenderingContext2D,
  originX: number,
  originY: number,
  unit: number,
  gx: number,
  gy: number,
  width = 1,
  height = 1,
): void {
  const x = Math.round(originX + gx * unit);
  const y = Math.round(originY + gy * unit);
  const right = Math.round(originX + (gx + width) * unit);
  const bottom = Math.round(originY + (gy + height) * unit);
  ctx.fillRect(x, y, right - x, bottom - y);
}

function fill(ctx: CanvasRenderingContext2D, color: string): void {
  ctx.fillStyle = color;
}

export function drawRetroFloor(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  tileX: number,
  tileY: number,
): void {
  const unit = size / RETRO_GRID;
  fill(ctx, (tileX + tileY) % 2 === 0 ? RETRO_PALETTE.floorLight : RETRO_PALETTE.floorDark);
  ctx.fillRect(Math.round(x), Math.round(y), Math.ceil(size), Math.ceil(size));

  // A fixed speck pattern per tile keeps the ground textured without noise.
  fill(ctx, RETRO_PALETTE.floorSpeck);
  const pattern = (tileX * 7 + tileY * 13) % 4;
  if (pattern === 0) { px(ctx, x, y, unit, 3, 4); px(ctx, x, y, unit, 11, 9); }
  else if (pattern === 1) { px(ctx, x, y, unit, 6, 11); px(ctx, x, y, unit, 12, 3); }
  else if (pattern === 2) { px(ctx, x, y, unit, 2, 10); px(ctx, x, y, unit, 9, 6); }
  else { px(ctx, x, y, unit, 5, 2); px(ctx, x, y, unit, 13, 12); }
}

export function drawRetroSolidBlock(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
): void {
  const unit = size / RETRO_GRID;
  fill(ctx, RETRO_PALETTE.solidLine);
  ctx.fillRect(Math.round(x), Math.round(y), Math.ceil(size), Math.ceil(size));
  fill(ctx, RETRO_PALETTE.solidFace);
  px(ctx, x, y, unit, 1, 1, 14, 14);
  fill(ctx, RETRO_PALETTE.solidLight);
  px(ctx, x, y, unit, 1, 1, 14, 2);
  px(ctx, x, y, unit, 1, 1, 2, 13);
  fill(ctx, RETRO_PALETTE.solidShadow);
  px(ctx, x, y, unit, 1, 12, 14, 3);
  px(ctx, x, y, unit, 12, 1, 3, 14);
  // Riveted plate detail.
  fill(ctx, RETRO_PALETTE.solidLight);
  px(ctx, x, y, unit, 4, 4, 2, 2);
  px(ctx, x, y, unit, 10, 4, 2, 2);
  px(ctx, x, y, unit, 4, 10, 2, 2);
  px(ctx, x, y, unit, 10, 10, 2, 2);
}

export function drawRetroBrick(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
): void {
  const unit = size / RETRO_GRID;
  fill(ctx, RETRO_PALETTE.outline);
  ctx.fillRect(Math.round(x), Math.round(y), Math.ceil(size), Math.ceil(size));
  fill(ctx, RETRO_PALETTE.brickFace);
  px(ctx, x, y, unit, 1, 1, 14, 14);
  fill(ctx, RETRO_PALETTE.brickLight);
  px(ctx, x, y, unit, 1, 1, 14, 1);

  // Offset courses of masonry, mortar drawn as gaps.
  fill(ctx, RETRO_PALETTE.brickShadow);
  px(ctx, x, y, unit, 1, 5, 14, 1);
  px(ctx, x, y, unit, 1, 10, 14, 1);
  px(ctx, x, y, unit, 7, 1, 1, 4);
  px(ctx, x, y, unit, 3, 6, 1, 4);
  px(ctx, x, y, unit, 11, 6, 1, 4);
  px(ctx, x, y, unit, 7, 11, 1, 4);
  px(ctx, x, y, unit, 1, 14, 14, 1);
}

export function drawRetroBomb(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  now: number,
  fuseProgress = 0,
): void {
  const unit = size / RETRO_GRID;
  // Two-frame squash, the way sprite-era bombs pulsed.
  const swell = Math.floor(now / 180) % 2 === 0 ? 0 : 1;
  const top = 4 - swell;

  fill(ctx, RETRO_PALETTE.outline);
  px(ctx, x, y, unit, 4, top + 1, 8, 10 + swell);
  px(ctx, x, y, unit, 3, top + 3, 10, 6 + swell);

  fill(ctx, RETRO_PALETTE.bombBody);
  px(ctx, x, y, unit, 5, top + 2, 6, 8 + swell);
  px(ctx, x, y, unit, 4, top + 4, 8, 4 + swell);

  fill(ctx, RETRO_PALETTE.bombSheen);
  px(ctx, x, y, unit, 6, top + 4, 2, 2);

  fill(ctx, RETRO_PALETTE.fuse);
  px(ctx, x, y, unit, 10, top, 1, 2);
  px(ctx, x, y, unit, 11, top - 1, 1, 2);

  // The spark blinks faster as the fuse runs down.
  const blink = Math.floor(now / (fuseProgress > 0.66 ? 70 : 140)) % 2 === 0;
  fill(ctx, blink ? RETRO_PALETTE.flameCore : RETRO_PALETTE.flameEdge);
  px(ctx, x, y, unit, 12, top - 2, 2, 2);
}

export function drawRetroExplosion(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  now: number,
): void {
  const unit = size / RETRO_GRID;
  // Three-frame flame cycle: wide, narrow, wide.
  const frame = Math.floor(now / 60) % 3;
  const inset = frame === 1 ? 2 : frame === 2 ? 1 : 0;

  fill(ctx, RETRO_PALETTE.flameEdge);
  px(ctx, x, y, unit, inset, 3 + inset, 16 - inset * 2, 10 - inset * 2);
  px(ctx, x, y, unit, 3 + inset, inset, 10 - inset * 2, 16 - inset * 2);

  fill(ctx, RETRO_PALETTE.flameMid);
  px(ctx, x, y, unit, 1 + inset, 5 + inset, 14 - inset * 2, 6 - inset * 2);
  px(ctx, x, y, unit, 5 + inset, 1 + inset, 6 - inset * 2, 14 - inset * 2);

  fill(ctx, RETRO_PALETTE.flameCore);
  px(ctx, x, y, unit, 3 + inset, 6 + inset, 10 - inset * 2, 4 - inset * 2);
  px(ctx, x, y, unit, 6 + inset, 3 + inset, 4 - inset * 2, 10 - inset * 2);
}

export type RetroPowerUpKind = 'bomb' | 'fire' | 'speed';

export function drawRetroPowerUp(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  kind: RetroPowerUpKind,
  now: number,
): void {
  const unit = size / RETRO_GRID;
  const lift = Math.floor(now / 300) % 2;

  fill(ctx, RETRO_PALETTE.outline);
  px(ctx, x, y, unit, 2, 2 - lift, 12, 12);
  fill(ctx, kind === 'bomb' ? '#3d63c8' : kind === 'fire' ? '#c8362e' : '#2f9fd0');
  px(ctx, x, y, unit, 3, 3 - lift, 10, 10);
  fill(ctx, RETRO_PALETTE.white);
  px(ctx, x, y, unit, 3, 3 - lift, 10, 1);

  const iconY = 5 - lift;
  if (kind === 'bomb') {
    fill(ctx, RETRO_PALETTE.outline);
    px(ctx, x, y, unit, 6, iconY + 1, 4, 4);
    px(ctx, x, y, unit, 5, iconY + 2, 6, 2);
    fill(ctx, RETRO_PALETTE.fuse);
    px(ctx, x, y, unit, 9, iconY, 1, 1);
  } else if (kind === 'fire') {
    fill(ctx, RETRO_PALETTE.flameCore);
    px(ctx, x, y, unit, 7, iconY, 2, 6);
    px(ctx, x, y, unit, 6, iconY + 2, 4, 3);
    fill(ctx, RETRO_PALETTE.flameMid);
    px(ctx, x, y, unit, 7, iconY + 3, 2, 2);
  } else {
    fill(ctx, RETRO_PALETTE.flameCore);
    px(ctx, x, y, unit, 8, iconY, 2, 3);
    px(ctx, x, y, unit, 6, iconY + 2, 3, 2);
    px(ctx, x, y, unit, 7, iconY + 3, 2, 3);
  }
}

export interface RetroPlayerSprite {
  playerId: number;
  /** Pixel-space top-left of the tile the sprite occupies. */
  x: number;
  y: number;
  facing: 'up' | 'down' | 'left' | 'right';
  walking: boolean;
}

export function drawRetroPlayer(
  ctx: CanvasRenderingContext2D,
  sprite: RetroPlayerSprite,
  size: number,
  now: number,
): void {
  const { x, y, playerId, facing, walking } = sprite;
  const unit = size / RETRO_GRID;
  const body = playerId === 1 ? RETRO_PALETTE.p1 : RETRO_PALETTE.p2;
  const bodyDark = playerId === 1 ? RETRO_PALETTE.p1Dark : RETRO_PALETTE.p2Dark;
  // Two-frame walk cycle; standing still holds the neutral frame.
  const step = walking && Math.floor(now / 130) % 2 === 0 ? 1 : 0;

  // Silhouette with the top corners cut, so the head reads as a dome.
  fill(ctx, RETRO_PALETTE.outline);
  px(ctx, x, y, unit, 5, 2, 6, 1);
  px(ctx, x, y, unit, 4, 3, 8, 11);

  // Helmet dome.
  fill(ctx, body);
  px(ctx, x, y, unit, 5, 3, 6, 4);
  fill(ctx, RETRO_PALETTE.white);
  px(ctx, x, y, unit, 5, 3, 6, 1);

  // Face or back of the head, depending on which way the sprite looks.
  if (facing === 'up') {
    fill(ctx, bodyDark);
    px(ctx, x, y, unit, 5, 7, 6, 3);
  } else {
    fill(ctx, RETRO_PALETTE.skin);
    px(ctx, x, y, unit, 5, 7, 6, 3);
    fill(ctx, RETRO_PALETTE.outline);
    if (facing === 'left') px(ctx, x, y, unit, 5, 8, 2, 1);
    else if (facing === 'right') px(ctx, x, y, unit, 9, 8, 2, 1);
    else { px(ctx, x, y, unit, 6, 8, 1, 1); px(ctx, x, y, unit, 9, 8, 1, 1); }
  }

  // Torso with a contrasting chest panel.
  fill(ctx, body);
  px(ctx, x, y, unit, 5, 10, 6, 3);
  fill(ctx, RETRO_PALETTE.white);
  px(ctx, x, y, unit, 7, 10, 2, 2);
  fill(ctx, bodyDark);
  px(ctx, x, y, unit, 4, 10, 1, 3);
  px(ctx, x, y, unit, 11, 10, 1, 3);

  // Boots alternate to sell the walk. They must be light: drawn in the outline
  // colour they would vanish against the silhouette and the walk would not read.
  fill(ctx, RETRO_PALETTE.boot);
  px(ctx, x, y, unit, 5 - step, 13, 2, 1);
  px(ctx, x, y, unit, 9 + step, 13, 2, 1);
}
