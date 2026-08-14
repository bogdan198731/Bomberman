import { initTintar } from './tintar.js';
import { initPaddleClash } from './paddle.js';
import { initNeonSnake } from './snake.js';
import { initMiniTanks } from './tanks.js';
import { initSeptica } from './septica.js';
import { initSurvivalArena } from './survival.js';
import { initStarDefender } from './star.js';
import { initMicroRacers } from './racing.js';
import { initBlockDrop } from './blocks.js';
import { ArcadeResultReporter, initArcadeProfile } from './stats.js';
import { initGameCatalog } from './catalog.js';
import { initArcadeSettings } from './settings.js';
import { initQuickPlay } from './quick-play.js';
import { initArcadePwa } from './pwa.js';
import type { OnlineRoom, PlayerAction } from './multiplayer.js';

export const CELL_SIZE = 64;
export const BOMB_TIMER = 3000;
export const EXPLOSION_DURATION = 500;
export const EXPLOSION_RADIUS = 2;
export const PLAYER_MOVE_DURATION = 125;
export const MIN_PLAYER_MOVE_DURATION = 75;

export enum PowerUpType {
  BOMB_UP = 'bomb-up',
  FIRE_UP = 'fire-up',
  SPEED_UP = 'speed-up',
}

export enum TileType {
  EMPTY = 0,
  WALL_DESTRUCTIBLE = 1,
  WALL_INDESTRUCTIBLE = 2,
  BOMB = 3,
}

export interface MapGrid {
  width: number;
  height: number;
  tiles: TileType[][];
}

export interface Position {
  x: number;
  y: number;
}

export interface Player {
  id: 1 | 2;
  x: number;
  y: number;
  alive: boolean;
  facing?: 'up' | 'down' | 'left' | 'right';
  moveFromX?: number;
  moveFromY?: number;
  moveStartedAt?: number;
  maxBombs?: number;
  blastRadius?: number;
  moveDuration?: number;
}

export interface Bomb {
  position: Position;
  timer: number;
  placedAt?: number;
  explodedAt?: number;
  ownerId?: 1 | 2;
  radius?: number;
}

export interface Explosion {
  x: number;
  y: number;
}

export interface PowerUp {
  x: number;
  y: number;
  type: PowerUpType;
}

export function createMapGrid(width: number = 13, height: number = 13): MapGrid {
  const tiles: TileType[][] = Array(height)
    .fill(null)
    .map(() => Array(width).fill(TileType.EMPTY));

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const isEdge = row === 0 || row === height - 1 || col === 0 || col === width - 1;
      const isPillar = row % 2 === 0 && col % 2 === 0 && row > 0 && row < height - 1;

      if (isEdge || isPillar) {
        tiles[row][col] = TileType.WALL_INDESTRUCTIBLE;
      }
    }
  }

  for (let row = 1; row < height - 1; row++) {
    for (let col = 1; col < width - 1; col++) {
      if (tiles[row][col] === TileType.EMPTY) {
        const distanceFromPlayerOne = row - 1 + (col - 1);
        const distanceFromPlayerTwo = height - 2 - row + (width - 2 - col);
        const isPlayerOneSpawnArea = distanceFromPlayerOne <= EXPLOSION_RADIUS + 1;
        const isPlayerTwoSpawnArea = distanceFromPlayerTwo <= EXPLOSION_RADIUS + 1;
        const hasDestructibleWall = (row * 17 + col * 31) % 10 < 6;

        if (!isPlayerOneSpawnArea && !isPlayerTwoSpawnArea && hasDestructibleWall) {
          tiles[row][col] = TileType.WALL_DESTRUCTIBLE;
        }
      }
    }
  }

  return { width, height, tiles };
}

export class GameState {
  grid: TileType[][];
  width: number;
  height: number;
  bombs: Bomb[];
  explosions: Map<string, number>;
  powerUps: Map<string, PowerUpType>;

  constructor(mapGrid?: MapGrid) {
    if (mapGrid) {
      this.grid = mapGrid.tiles;
      this.width = mapGrid.width;
      this.height = mapGrid.height;
    } else {
      const defaultMap = createMapGrid();
      this.grid = defaultMap.tiles;
      this.width = defaultMap.width;
      this.height = defaultMap.height;
    }
    this.bombs = [];
    this.explosions = new Map();
    this.powerUps = new Map();
  }

  placeBomb(
    pos: Position,
    now: number = Date.now(),
    ownerId?: 1 | 2,
    radius: number = EXPLOSION_RADIUS
  ): boolean {
    if (
      pos.x < 0 ||
      pos.x >= this.width ||
      pos.y < 0 ||
      pos.y >= this.height
    ) {
      return false;
    }

    if (this.grid[pos.y][pos.x] !== TileType.EMPTY) {
      return false;
    }

    if (this.bombs.some((b) => b.position.x === pos.x && b.position.y === pos.y)) {
      return false;
    }

    const bomb: Bomb = { position: pos, timer: BOMB_TIMER, placedAt: now, ownerId, radius };
    this.bombs.push(bomb);
    this.grid[pos.y][pos.x] = TileType.BOMB;
    return true;
  }

  explodeBomb(bomb: Bomb, now: number = Date.now()): void {
    if (bomb.explodedAt !== undefined) {
      return;
    }

    const { x, y } = bomb.position;
    const blastRadius = bomb.radius ?? EXPLOSION_RADIUS;
    bomb.explodedAt = now;

    this.grid[y][x] = TileType.EMPTY;
    this.powerUps.delete(`${x},${y}`);
    this.addExplosion(x, y, now);

    const directions = [
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: 0, dy: -1 },
    ];

    for (const dir of directions) {
      for (let i = 1; i <= blastRadius; i++) {
        const nx = x + dir.dx * i;
        const ny = y + dir.dy * i;

        if (nx < 0 || nx >= this.width || ny < 0 || ny >= this.height) break;

        const tile = this.grid[ny][nx];
        if (tile === TileType.WALL_INDESTRUCTIBLE) break;

        if (tile === TileType.WALL_DESTRUCTIBLE) {
          this.addExplosion(nx, ny, now);
          this.grid[ny][nx] = TileType.EMPTY;
          this.spawnPowerUp(nx, ny);
          break;
        }

        this.powerUps.delete(`${nx},${ny}`);
        this.addExplosion(nx, ny, now);

        if (tile === TileType.BOMB) {
          const targetBomb = this.bombs.find(
            (b) => b.position.x === nx && b.position.y === ny
          );
          if (targetBomb && targetBomb.explodedAt === undefined) {
            this.explodeBomb(targetBomb, now);
          }
          break;
        }
      }
    }
  }

  private spawnPowerUp(x: number, y: number): void {
    const dropRoll = (x * 37 + y * 19 + x * y * 7) % 10;
    if (dropRoll >= 4) return;

    const types = [PowerUpType.BOMB_UP, PowerUpType.FIRE_UP, PowerUpType.SPEED_UP];
    const type = types[(x * 11 + y * 5) % types.length];
    this.powerUps.set(`${x},${y}`, type);
  }

  collectPowerUp(player: Player): PowerUpType | undefined {
    const key = `${player.x},${player.y}`;
    const type = this.powerUps.get(key);
    if (!type) return undefined;

    this.powerUps.delete(key);
    if (type === PowerUpType.BOMB_UP) {
      player.maxBombs = Math.min(5, (player.maxBombs ?? 1) + 1);
    } else if (type === PowerUpType.FIRE_UP) {
      player.blastRadius = Math.min(6, (player.blastRadius ?? EXPLOSION_RADIUS) + 1);
    } else if (type === PowerUpType.SPEED_UP) {
      player.moveDuration = Math.max(
        MIN_PLAYER_MOVE_DURATION,
        (player.moveDuration ?? PLAYER_MOVE_DURATION) - 12.5
      );
    }

    return type;
  }

  private addExplosion(x: number, y: number, now: number): void {
    const key = `${x},${y}`;
    this.explosions.set(key, now);
  }

  update(now: number): void {
    const toExplode: Bomb[] = [];

    for (const bomb of this.bombs) {
      if (bomb.explodedAt === undefined) {
        const placedAt = bomb.placedAt ?? now;
        if (now - placedAt >= bomb.timer) {
          toExplode.push(bomb);
        }
      }
    }

    for (const bomb of toExplode) {
      if (bomb.explodedAt === undefined) {
        this.explodeBomb(bomb, now);
      }
    }

    const expiredExplosions: string[] = [];
    for (const [key, startTime] of this.explosions.entries()) {
      if (now - startTime >= EXPLOSION_DURATION) {
        expiredExplosions.push(key);
      }
    }

    for (const key of expiredExplosions) {
      this.explosions.delete(key);
    }

    this.bombs = this.bombs.filter((b) => {
      return b.explodedAt === undefined || now - b.explodedAt < EXPLOSION_DURATION;
    });
  }

  getCellAt(pos: Position): TileType {
    if (pos.x < 0 || pos.x >= this.width || pos.y < 0 || pos.y >= this.height) {
      return TileType.WALL_INDESTRUCTIBLE;
    }
    return this.grid[pos.y][pos.x];
  }

  isExplosion(x: number, y: number): boolean {
    return this.explosions.has(`${x},${y}`);
  }
}

export function createPlayers(): [Player, Player] {
  return [
    {
      id: 1,
      x: 1,
      y: 1,
      alive: true,
      facing: 'down',
      maxBombs: 1,
      blastRadius: EXPLOSION_RADIUS,
      moveDuration: PLAYER_MOVE_DURATION,
    },
    {
      id: 2,
      x: 11,
      y: 11,
      alive: true,
      facing: 'up',
      maxBombs: 1,
      blastRadius: EXPLOSION_RADIUS,
      moveDuration: PLAYER_MOVE_DURATION,
    },
  ];
}

export function canMoveTo(grid: MapGrid, x: number, y: number): boolean {
  if (x < 0 || x >= grid.width || y < 0 || y >= grid.height) {
    return false;
  }
  return grid.tiles[y][x] === TileType.EMPTY;
}

export function movePlayer(player: Player, dx: number, dy: number, grid: MapGrid): void {
  if (dx < 0) player.facing = 'left';
  if (dx > 0) player.facing = 'right';
  if (dy < 0) player.facing = 'up';
  if (dy > 0) player.facing = 'down';

  const newX = player.x + dx;
  const newY = player.y + dy;
  if (canMoveTo(grid, newX, newY)) {
    player.x = newX;
    player.y = newY;
  }
}

export interface RenderState {
  grid: MapGrid;
  players: Player[];
  bombs?: Array<{ x: number; y: number }>;
  explosions?: Explosion[];
  powerUps?: PowerUp[];
}

/** Draws a supplied plain game-state object without depending on live game internals. */
export function killPlayer(player: Player): void {
  player.alive = false;
}

export type GameStatus = 'playing' | 'player1-wins' | 'player2-wins' | 'draw';

export function getGameStatus(players: Player[]): GameStatus {
  const aliveCount = players.filter(p => p.alive).length;

  if (aliveCount === 2) {
    return 'playing';
  }
  if (aliveCount === 1) {
    return players[0].alive ? 'player1-wins' : 'player2-wins';
  }
  return 'draw';
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawStoneBlock(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number
): void {
  const inset = size * 0.07;
  const face = ctx.createLinearGradient(x, y, x, y + size);
  face.addColorStop(0, '#91a7ae');
  face.addColorStop(0.16, '#718991');
  face.addColorStop(1, '#3d5057');

  ctx.fillStyle = '#26373d';
  roundedRect(ctx, x + inset, y + inset, size - inset * 2, size - inset * 1.4, size * 0.11);
  ctx.fill();
  ctx.fillStyle = face;
  roundedRect(ctx, x + inset, y + inset, size - inset * 2, size - inset * 2.25, size * 0.09);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = Math.max(1, size * 0.025);
  roundedRect(ctx, x + inset * 1.6, y + inset * 1.5, size - inset * 3.2, size - inset * 3.7, size * 0.06);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(24,38,43,0.35)';
  ctx.lineWidth = Math.max(1, size * 0.02);
  ctx.beginPath();
  ctx.moveTo(x + size * 0.22, y + size * 0.47);
  ctx.lineTo(x + size * 0.42, y + size * 0.47);
  ctx.lineTo(x + size * 0.51, y + size * 0.37);
  ctx.moveTo(x + size * 0.66, y + size * 0.2);
  ctx.lineTo(x + size * 0.76, y + size * 0.29);
  ctx.stroke();
}

function drawCrate(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number
): void {
  const inset = size * 0.075;
  const plank = ctx.createLinearGradient(x, y, x + size, y + size);
  plank.addColorStop(0, '#e2a856');
  plank.addColorStop(0.52, '#b86c31');
  plank.addColorStop(1, '#834522');

  ctx.fillStyle = '#5f321d';
  roundedRect(ctx, x + inset, y + inset, size - inset * 2, size - inset * 1.35, size * 0.08);
  ctx.fill();
  ctx.fillStyle = plank;
  roundedRect(ctx, x + inset, y + inset, size - inset * 2, size - inset * 2.1, size * 0.06);
  ctx.fill();

  ctx.strokeStyle = 'rgba(92,45,22,0.72)';
  ctx.lineWidth = Math.max(2, size * 0.07);
  ctx.beginPath();
  ctx.moveTo(x + size * 0.2, y + size * 0.2);
  ctx.lineTo(x + size * 0.8, y + size * 0.73);
  ctx.moveTo(x + size * 0.8, y + size * 0.2);
  ctx.lineTo(x + size * 0.2, y + size * 0.73);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255,225,164,0.32)';
  ctx.lineWidth = Math.max(1, size * 0.025);
  roundedRect(ctx, x + inset * 1.7, y + inset * 1.7, size - inset * 3.4, size - inset * 3.7, size * 0.03);
  ctx.stroke();
}

function drawBomb(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  now: number
): void {
  const cx = x + size / 2;
  const cy = y + size * 0.56;
  const radius = size * 0.29;
  const pulse = 1 + Math.sin(now / 115) * 0.035;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(pulse, pulse);
  ctx.fillStyle = 'rgba(5, 8, 12, 0.32)';
  ctx.beginPath();
  ctx.ellipse(0, radius * 0.83, radius * 0.9, radius * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();

  const shell = ctx.createRadialGradient(-radius * 0.38, -radius * 0.45, 1, 0, 0, radius);
  shell.addColorStop(0, '#708092');
  shell.addColorStop(0.24, '#303b4a');
  shell.addColorStop(1, '#080c12');
  ctx.fillStyle = shell;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#1b202b';
  ctx.lineWidth = size * 0.07;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(radius * 0.22, -radius * 0.84);
  ctx.quadraticCurveTo(radius * 0.35, -radius * 1.45, radius * 0.78, -radius * 1.5);
  ctx.stroke();

  const sparkPhase = (now / 100) % 3;
  ctx.fillStyle = sparkPhase < 1 ? '#fff2a8' : sparkPhase < 2 ? '#ffb627' : '#ff5f3a';
  ctx.beginPath();
  ctx.arc(radius * 0.85, -radius * 1.52, size * 0.075, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.48)';
  ctx.beginPath();
  ctx.ellipse(-radius * 0.38, -radius * 0.43, radius * 0.17, radius * 0.25, -0.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawExplosion(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  now: number
): void {
  const pulse = 0.86 + Math.sin(now / 55) * 0.08;
  const cx = x + size / 2;
  const cy = y + size / 2;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.55);
  glow.addColorStop(0, 'rgba(255,255,220,0.98)');
  glow.addColorStop(0.25, 'rgba(255,229,75,0.96)');
  glow.addColorStop(0.62, 'rgba(255,102,28,0.82)');
  glow.addColorStop(1, 'rgba(255,44,25,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(x - size * 0.08, y - size * 0.08, size * 1.16, size * 1.16);

  ctx.translate(cx, cy);
  ctx.scale(pulse, pulse);
  ctx.fillStyle = '#fff7c4';
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const angle = (Math.PI * 2 * i) / 16;
    const radius = i % 2 === 0 ? size * 0.42 : size * 0.22;
    const px = Math.cos(angle) * radius;
    const py = Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawPowerUp(
  ctx: CanvasRenderingContext2D,
  powerUp: PowerUp,
  size: number,
  now: number
): void {
  const cx = powerUp.x * size + size / 2;
  const cy = powerUp.y * size + size / 2 + Math.sin(now / 220 + powerUp.x) * size * 0.045;
  const radius = size * 0.31;
  const colors: Record<PowerUpType, [string, string]> = {
    [PowerUpType.BOMB_UP]: ['#ffd76b', '#e89622'],
    [PowerUpType.FIRE_UP]: ['#ff8b4a', '#e73832'],
    [PowerUpType.SPEED_UP]: ['#72e4ff', '#278ccf'],
  };
  const [topColor, bottomColor] = colors[powerUp.type];

  ctx.save();
  ctx.fillStyle = 'rgba(5, 10, 14, 0.28)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + radius * 0.9, radius * 0.88, radius * 0.24, 0, 0, Math.PI * 2);
  ctx.fill();

  const badge = ctx.createLinearGradient(cx, cy - radius, cx, cy + radius);
  badge.addColorStop(0, topColor);
  badge.addColorStop(1, bottomColor);
  ctx.fillStyle = badge;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.82)';
  ctx.lineWidth = size * 0.045;
  ctx.stroke();

  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.beginPath();
  ctx.ellipse(cx - radius * 0.32, cy - radius * 0.42, radius * 0.27, radius * 0.12, -0.6, 0, Math.PI * 2);
  ctx.fill();

  if (powerUp.type === PowerUpType.BOMB_UP) {
    ctx.fillStyle = '#15202c';
    ctx.beginPath();
    ctx.arc(cx, cy + size * 0.035, size * 0.145, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#27394a';
    ctx.lineWidth = size * 0.045;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx + size * 0.04, cy - size * 0.105);
    ctx.quadraticCurveTo(cx + size * 0.08, cy - size * 0.21, cx + size * 0.15, cy - size * 0.17);
    ctx.stroke();
    ctx.fillStyle = '#fff0a6';
    ctx.beginPath();
    ctx.arc(cx + size * 0.165, cy - size * 0.175, size * 0.04, 0, Math.PI * 2);
    ctx.fill();
  } else if (powerUp.type === PowerUpType.FIRE_UP) {
    ctx.fillStyle = '#fff4b3';
    ctx.beginPath();
    ctx.moveTo(cx, cy + size * 0.18);
    ctx.bezierCurveTo(
      cx - size * 0.21,
      cy + size * 0.07,
      cx - size * 0.1,
      cy - size * 0.13,
      cx + size * 0.025,
      cy - size * 0.22
    );
    ctx.bezierCurveTo(
      cx + size * 0.01,
      cy - size * 0.05,
      cx + size * 0.23,
      cy,
      cx,
      cy + size * 0.18
    );
    ctx.fill();
    ctx.fillStyle = '#ff8b24';
    ctx.beginPath();
    ctx.moveTo(cx, cy + size * 0.13);
    ctx.quadraticCurveTo(cx - size * 0.08, cy + size * 0.02, cx + size * 0.035, cy - size * 0.08);
    ctx.quadraticCurveTo(cx + size * 0.11, cy + size * 0.06, cx, cy + size * 0.13);
    ctx.fill();
  } else {
    ctx.fillStyle = '#f4fdff';
    ctx.beginPath();
    ctx.moveTo(cx + size * 0.035, cy - size * 0.22);
    ctx.lineTo(cx - size * 0.145, cy + size * 0.02);
    ctx.lineTo(cx - size * 0.015, cy + size * 0.02);
    ctx.lineTo(cx - size * 0.07, cy + size * 0.22);
    ctx.lineTo(cx + size * 0.17, cy - size * 0.065);
    ctx.lineTo(cx + size * 0.045, cy - size * 0.065);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

function drawPlayer(
  ctx: CanvasRenderingContext2D,
  player: Player,
  size: number,
  now: number
): void {
  let visualX = player.x;
  let visualY = player.y;

  if (
    player.moveStartedAt !== undefined &&
    player.moveFromX !== undefined &&
    player.moveFromY !== undefined
  ) {
    const moveDuration = player.moveDuration ?? PLAYER_MOVE_DURATION;
    const progress = Math.min(1, Math.max(0, (now - player.moveStartedAt) / moveDuration));
    const easedProgress = progress * progress * (3 - 2 * progress);
    visualX = player.moveFromX + (player.x - player.moveFromX) * easedProgress;
    visualY = player.moveFromY + (player.y - player.moveFromY) * easedProgress;
  }

  const x = visualX * size;
  const y = visualY * size;
  const cx = x + size / 2;
  const bob = Math.sin(now / 180 + player.id) * size * 0.018;
  const suit = player.id === 1 ? '#54e38e' : '#ff6b78';
  const suitDark = player.id === 1 ? '#168f50' : '#cb3048';

  ctx.save();
  ctx.translate(0, bob);

  ctx.fillStyle = 'rgba(4, 9, 13, 0.28)';
  ctx.beginPath();
  ctx.ellipse(cx, y + size * 0.81, size * 0.28, size * 0.105, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = suitDark;
  roundedRect(ctx, x + size * 0.24, y + size * 0.48, size * 0.52, size * 0.34, size * 0.14);
  ctx.fill();
  ctx.fillStyle = suit;
  roundedRect(ctx, x + size * 0.28, y + size * 0.43, size * 0.44, size * 0.31, size * 0.13);
  ctx.fill();

  ctx.fillStyle = '#f4f6f4';
  ctx.beginPath();
  ctx.arc(cx, y + size * 0.38, size * 0.275, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(5, 12, 18, 0.18)';
  ctx.lineWidth = size * 0.025;
  ctx.stroke();

  ctx.fillStyle = suit;
  ctx.beginPath();
  ctx.arc(cx, y + size * 0.34, size * 0.205, Math.PI, Math.PI * 2);
  ctx.lineTo(x + size * 0.705, y + size * 0.4);
  ctx.lineTo(x + size * 0.295, y + size * 0.4);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#152638';
  roundedRect(ctx, x + size * 0.3, y + size * 0.34, size * 0.4, size * 0.17, size * 0.075);
  ctx.fill();
  const visor = ctx.createLinearGradient(x, y, x + size, y + size);
  visor.addColorStop(0, '#9ce9ff');
  visor.addColorStop(0.45, '#3ba8d3');
  visor.addColorStop(1, '#17516f');
  ctx.fillStyle = visor;
  roundedRect(ctx, x + size * 0.335, y + size * 0.365, size * 0.33, size * 0.105, size * 0.045);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  roundedRect(ctx, x + size * 0.365, y + size * 0.38, size * 0.105, size * 0.025, size * 0.012);
  ctx.fill();

  ctx.fillStyle = '#f4f6f4';
  ctx.beginPath();
  ctx.arc(x + size * 0.22, y + size * 0.6, size * 0.09, 0, Math.PI * 2);
  ctx.arc(x + size * 0.78, y + size * 0.6, size * 0.09, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

export function render(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  state: RenderState
): void {
  const { grid, players, bombs = [], explosions = [], powerUps = [] } = state;
  const tileSize = canvas.width / grid.width;
  const now = performance.now();

  ctx.fillStyle = '#284b39';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const tile = grid.tiles[y][x];
      ctx.fillStyle = (x + y) % 2 === 0 ? '#315d43' : '#2c563e';
      ctx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
      ctx.fillStyle = 'rgba(255,255,255,0.025)';
      ctx.fillRect(x * tileSize + tileSize * 0.12, y * tileSize + tileSize * 0.12, tileSize * 0.76, tileSize * 0.035);

      if (tile === TileType.WALL_INDESTRUCTIBLE) {
        drawStoneBlock(ctx, x * tileSize, y * tileSize, tileSize);
      } else if (tile === TileType.WALL_DESTRUCTIBLE) {
        drawCrate(ctx, x * tileSize, y * tileSize, tileSize);
      }
    }
  }

  for (const powerUp of powerUps) {
    drawPowerUp(ctx, powerUp, tileSize, now);
  }

  for (const bomb of bombs) {
    drawBomb(ctx, bomb.x * tileSize, bomb.y * tileSize, tileSize, now);
  }

  for (const explosion of explosions) {
    drawExplosion(ctx, explosion.x * tileSize, explosion.y * tileSize, tileSize, now);
  }

  for (const player of players) {
    if (player.alive) {
      drawPlayer(ctx, player, tileSize, now);
    }
  }
}

function movePlayerSmoothly(
  player: Player,
  dx: number,
  dy: number,
  grid: MapGrid,
  now: number
): void {
  const moveDuration = player.moveDuration ?? PLAYER_MOVE_DURATION;
  if (
    player.moveStartedAt !== undefined &&
    now - player.moveStartedAt < moveDuration
  ) {
    return;
  }

  const previousX = player.x;
  const previousY = player.y;
  movePlayer(player, dx, dy, grid);

  if (player.x !== previousX || player.y !== previousY) {
    player.moveFromX = previousX;
    player.moveFromY = previousY;
    player.moveStartedAt = now;
  }
}

export function renderWinScreen(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  winnerId: 1 | 2
): void {
  ctx.fillStyle = 'rgba(5, 8, 13, 0.78)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const winnerColor = winnerId === 1 ? '#54e38e' : '#ff6b78';
  ctx.fillStyle = winnerColor;
  ctx.font = '900 58px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${winnerId === 1 ? 'MINT' : 'CORAL'} WINS!`, canvas.width / 2, canvas.height / 2 - 34);

  ctx.font = '700 21px system-ui, sans-serif';
  ctx.fillStyle = '#dce5ef';
  ctx.fillText('Press R or choose New round', canvas.width / 2, canvas.height / 2 + 38);
}

export function renderDrawScreen(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement
): void {
  ctx.fillStyle = 'rgba(5, 8, 13, 0.78)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#ffc857';
  ctx.font = '900 58px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('DOUBLE BLAST!', canvas.width / 2, canvas.height / 2 - 34);

  ctx.font = '700 21px system-ui, sans-serif';
  ctx.fillStyle = '#dce5ef';
  ctx.fillText('Press R or choose New round', canvas.width / 2, canvas.height / 2 + 38);
}

function initLocalGameLegacy() {
  if (typeof document === 'undefined') {
    return;
  }

  const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
  const ctx = canvas?.getContext('2d');
  const statusText = document.getElementById('gameStatusText');
  const roundLabel = document.getElementById('roundLabel');
  const playerOneScore = document.getElementById('playerOneScore');
  const playerTwoScore = document.getElementById('playerTwoScore');
  const roundOverlay = document.getElementById('roundOverlay');
  const roundOverlayText = document.getElementById('roundOverlayText');
  const restartButton = document.getElementById('restartButton');
  const playerOneStats = document.getElementById('playerOneStats');
  const playerTwoStats = document.getElementById('playerTwoStats');

  if (!canvas || !ctx) {
    console.error('Canvas not found');
    return;
  }

  let mapGrid = createMapGrid();
  let gameState = new GameState(mapGrid);
  let players = createPlayers();
  let gameStatus: GameStatus = 'playing';
  let round = 1;
  let roundStartedAt = Date.now();
  let roundActive = false;
  let statusMessageUntil = 0;
  const scores = { 1: 0, 2: 0 };
  const ROUND_INTRO_DURATION = 1750;

  canvas.width = gameState.width * CELL_SIZE;
  canvas.height = gameState.height * CELL_SIZE;

  function playerStatsText(player: Player): string {
    const maxBombs = player.maxBombs ?? 1;
    const blastRadius = player.blastRadius ?? EXPLOSION_RADIUS;
    const moveDuration = player.moveDuration ?? PLAYER_MOVE_DURATION;
    const speedPercent = Math.round((PLAYER_MOVE_DURATION / moveDuration) * 100);
    const speedText = speedPercent === 100 ? 'normal speed' : `${speedPercent}% speed`;
    return `${maxBombs} bomb${maxBombs === 1 ? '' : 's'} · ${blastRadius} tile blast · ${speedText}`;
  }

  function syncMatchUi(message: string): void {
    if (statusText) statusText.textContent = message;
    if (roundLabel) roundLabel.textContent = `Round ${round}`;
    if (playerOneScore) playerOneScore.textContent = String(scores[1]);
    if (playerTwoScore) playerTwoScore.textContent = String(scores[2]);
    if (playerOneStats) playerOneStats.textContent = playerStatsText(players[0]);
    if (playerTwoStats) playerTwoStats.textContent = playerStatsText(players[1]);
  }

  function reset(incrementRound: boolean = true): void {
    if (incrementRound) round += 1;
    mapGrid = createMapGrid();
    gameState = new GameState(mapGrid);
    players = createPlayers();
    gameStatus = 'playing';
    roundStartedAt = Date.now();
    roundActive = false;
    statusMessageUntil = 0;
    syncMatchUi('Get ready');
    roundOverlay?.classList.add('visible');
    if (roundOverlayText) roundOverlayText.textContent = `ROUND ${round}`;
  }

  const handledKeys = new Set([
    'KeyW',
    'KeyA',
    'KeyS',
    'KeyD',
    'Space',
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'Enter',
    'KeyR',
  ]);
  const keyFallbacks: Record<string, string> = {
    w: 'KeyW',
    a: 'KeyA',
    s: 'KeyS',
    d: 'KeyD',
    ' ': 'Space',
    spacebar: 'Space',
    arrowup: 'ArrowUp',
    arrowdown: 'ArrowDown',
    arrowleft: 'ArrowLeft',
    arrowright: 'ArrowRight',
    enter: 'Enter',
    r: 'KeyR',
  };

  window.addEventListener('keydown', (event) => {
    const code = keyFallbacks[event.key.toLowerCase()] ?? event.code;

    if (handledKeys.has(code)) {
      event.preventDefault();
    }

    if (code === 'KeyR' && !event.repeat) {
      reset();
      return;
    }

    if (gameStatus !== 'playing' || !roundActive) return;

    const inputTime = performance.now();

    switch (code) {
      case 'KeyW':
        movePlayerSmoothly(players[0], 0, -1, mapGrid, inputTime);
        break;
      case 'KeyS':
        movePlayerSmoothly(players[0], 0, 1, mapGrid, inputTime);
        break;
      case 'KeyA':
        movePlayerSmoothly(players[0], -1, 0, mapGrid, inputTime);
        break;
      case 'KeyD':
        movePlayerSmoothly(players[0], 1, 0, mapGrid, inputTime);
        break;
      case 'ArrowUp':
        movePlayerSmoothly(players[1], 0, -1, mapGrid, inputTime);
        break;
      case 'ArrowDown':
        movePlayerSmoothly(players[1], 0, 1, mapGrid, inputTime);
        break;
      case 'ArrowLeft':
        movePlayerSmoothly(players[1], -1, 0, mapGrid, inputTime);
        break;
      case 'ArrowRight':
        movePlayerSmoothly(players[1], 1, 0, mapGrid, inputTime);
        break;
      case 'Space':
        if (!event.repeat) {
          const activeBombs = gameState.bombs.filter(
            bomb => bomb.ownerId === 1 && bomb.explodedAt === undefined
          ).length;
          if (activeBombs < (players[0].maxBombs ?? 1)) {
            gameState.placeBomb(
              { x: players[0].x, y: players[0].y },
              Date.now(),
              1,
              players[0].blastRadius ?? EXPLOSION_RADIUS
            );
          }
        }
        break;
      case 'Enter':
        if (!event.repeat) {
          const activeBombs = gameState.bombs.filter(
            bomb => bomb.ownerId === 2 && bomb.explodedAt === undefined
          ).length;
          if (activeBombs < (players[1].maxBombs ?? 1)) {
            gameState.placeBomb(
              { x: players[1].x, y: players[1].y },
              Date.now(),
              2,
              players[1].blastRadius ?? EXPLOSION_RADIUS
            );
          }
        }
        break;
    }
  });

  restartButton?.addEventListener('click', () => reset());

  function updateRoundIntro(now: number): void {
    if (roundActive || gameStatus !== 'playing') return;

    const elapsed = now - roundStartedAt;
    if (elapsed < 650) {
      if (roundOverlayText) roundOverlayText.textContent = `ROUND ${round}`;
    } else if (elapsed < 1300) {
      if (roundOverlayText) roundOverlayText.textContent = 'READY';
    } else if (elapsed < ROUND_INTRO_DURATION) {
      if (roundOverlayText) roundOverlayText.textContent = 'BLAST!';
    } else {
      roundActive = true;
      roundOverlay?.classList.remove('visible');
      syncMatchUi('Round live');
    }
  }

  function update() {
    const now = Date.now();
    updateRoundIntro(now);

    if (gameStatus !== 'playing') {
      return;
    }

    if (!roundActive) return;

    gameState.update(now);

    for (const player of players) {
      if (player.alive && gameState.isExplosion(player.x, player.y)) {
        killPlayer(player);
      }
    }

    const powerUpNames: Record<PowerUpType, string> = {
      [PowerUpType.BOMB_UP]: 'Bomb Up',
      [PowerUpType.FIRE_UP]: 'Fire Up',
      [PowerUpType.SPEED_UP]: 'Speed Up',
    };
    for (const player of players) {
      if (!player.alive) continue;
      const collected = gameState.collectPowerUp(player);
      if (collected) {
        const playerName = player.id === 1 ? 'Mint' : 'Coral';
        statusMessageUntil = now + 1600;
        syncMatchUi(`${playerName}: ${powerUpNames[collected]}!`);
      }
    }

    if (statusMessageUntil > 0 && now >= statusMessageUntil) {
      statusMessageUntil = 0;
      syncMatchUi('Round live');
    }

    const nextStatus = getGameStatus(players);
    if (nextStatus !== 'playing') {
      gameStatus = nextStatus;
      roundActive = false;

      if (nextStatus === 'player1-wins') {
        scores[1] += 1;
        syncMatchUi('Mint wins');
      } else if (nextStatus === 'player2-wins') {
        scores[2] += 1;
        syncMatchUi('Coral wins');
      } else {
        syncMatchUi('Double knockout');
      }
    }
  }

  function gameLoop() {
    update();

    const explosions: Explosion[] = [];
    for (const [key] of gameState.explosions) {
      const [x, y] = key.split(',').map(Number);
      explosions.push({ x, y });
    }

    const bombs: NonNullable<RenderState['bombs']> = gameState.bombs
      .filter(b => b.explodedAt === undefined)
      .map((b) => ({
        x: b.position.x,
        y: b.position.y,
      }));

    const powerUps: PowerUp[] = [];
    for (const [key, type] of gameState.powerUps) {
      const [x, y] = key.split(',').map(Number);
      powerUps.push({ x, y, type });
    }

    const state = {
      grid: mapGrid,
      players,
      bombs,
      explosions,
      powerUps,
    };

    render(ctx as CanvasRenderingContext2D, canvas, state);

    if (gameStatus === 'draw') {
      renderDrawScreen(ctx as CanvasRenderingContext2D, canvas);
    } else if (gameStatus === 'player1-wins') {
      renderWinScreen(ctx as CanvasRenderingContext2D, canvas, 1);
    } else if (gameStatus === 'player2-wins') {
      renderWinScreen(ctx as CanvasRenderingContext2D, canvas, 2);
    }

    requestAnimationFrame(gameLoop);
  }

  syncMatchUi('Get ready');
  gameLoop();
}

interface OnlineClientState extends RenderState {
  phase: 'waiting' | 'countdown' | 'playing' | 'finished';
  round: number;
  scores: Record<1 | 2, number>;
  gameStatus: GameStatus;
  connectedPlayers: Array<1 | 2>;
  botDifficulty?: 'easy' | 'normal' | 'hard';
  overlayText: string;
  statusText: string;
}

type ClientMessage =
  | {
      type: 'joined';
      roomCode: string;
      playerId: 1 | 2;
      botDifficulty?: 'easy' | 'normal' | 'hard';
    }
  | { type: 'state'; state: OnlineClientState }
  | { type: 'error'; message: string };

export function initGame(): void {
  if (typeof document === 'undefined') return;

  const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement | null;
  const ctx = canvas?.getContext('2d');
  if (!canvas || !ctx) return;

  const elements = {
    hubView: document.getElementById('hubView'),
    gameView: document.getElementById('gameView'),
    tintarView: document.getElementById('tintarView'),
    paddleView: document.getElementById('paddleView'),
    snakeView: document.getElementById('snakeView'),
    tanksView: document.getElementById('tanksView'),
    septicaView: document.getElementById('septicaView'),
    survivalView: document.getElementById('survivalView'),
    starView: document.getElementById('starView'),
    racingView: document.getElementById('racingView'),
    blocksView: document.getElementById('blocksView'),
    launchGameButtons: document.querySelectorAll<HTMLButtonElement>('[data-launch-game]'),
    backToHubButtons: document.querySelectorAll<HTMLButtonElement>('[data-back-to-hub]'),
    statusText: document.getElementById('gameStatusText'),
    roundLabel: document.getElementById('roundLabel'),
    playerOneScore: document.getElementById('playerOneScore'),
    playerTwoScore: document.getElementById('playerTwoScore'),
    roundOverlay: document.getElementById('roundOverlay'),
    roundOverlayText: document.getElementById('roundOverlayText'),
    restartButton: document.getElementById('restartButton'),
    playerOneStats: document.getElementById('playerOneStats'),
    playerTwoStats: document.getElementById('playerTwoStats'),
    playerOneRole: document.getElementById('playerOneRole'),
    playerTwoRole: document.getElementById('playerTwoRole'),
    lobbyOverlay: document.getElementById('lobbyOverlay'),
    lobbyActions: document.getElementById('lobbyActions'),
    roomReady: document.getElementById('roomReady'),
    roomCode: document.getElementById('roomCode'),
    roomCodeInput: document.getElementById('roomCodeInput') as HTMLInputElement | null,
    connectionMessage: document.getElementById('connectionMessage'),
    createRoomButton: document.getElementById('createRoomButton'),
    playLocalButton: document.getElementById('playLocalButton'),
    joinRoomButton: document.getElementById('joinRoomButton'),
    copyRoomButton: document.getElementById('copyRoomButton'),
    botButtons: document.querySelectorAll<HTMLButtonElement>('[data-bot-difficulty]'),
    mobileControls: document.getElementById('mobileControls'),
    mobilePlayerLabel: document.getElementById('mobilePlayerLabel'),
    mobileBombButton: document.getElementById('mobileBombButton') as HTMLButtonElement | null,
    mobileRestartButton: document.getElementById('mobileRestartButton'),
    localMobileControls: document.getElementById('bombermanLocalControls'),
    localMobileRestartButton: document.getElementById('bombermanLocalRestartButton'),
  };

  const initialMap = createMapGrid();
  let onlineState: OnlineClientState = {
    grid: initialMap,
    players: createPlayers(),
    bombs: [],
    explosions: [],
    powerUps: [],
    phase: 'waiting',
    round: 1,
    scores: { 1: 0, 2: 0 },
    gameStatus: 'playing',
    connectedPlayers: [],
    overlayText: 'ONLINE',
    statusText: 'Choose a room',
  };
  let renderedPlayers: Player[] = createPlayers();
  let renderedRound = 0;
  let socket: WebSocket | undefined;
  let localRoom: OnlineRoom | undefined;
  let localMode = false;
  let localPlayerId: 1 | 2 | undefined;
  let activeRoomCode = '';
  let activeBotDifficulty: 'easy' | 'normal' | 'hard' | undefined;
  const resultReporter = new ArcadeResultReporter('bomberman');

  function setActiveView(view: 'hub' | 'bomberman' | 'tintar' | 'paddle' | 'snake' | 'tanks' | 'septica' | 'survival' | 'star' | 'racing' | 'blocks'): void {
    elements.hubView?.classList.toggle('view-hidden', view !== 'hub');
    elements.gameView?.classList.toggle('view-hidden', view !== 'bomberman');
    elements.tintarView?.classList.toggle('view-hidden', view !== 'tintar');
    elements.paddleView?.classList.toggle('view-hidden', view !== 'paddle');
    elements.snakeView?.classList.toggle('view-hidden', view !== 'snake');
    elements.tanksView?.classList.toggle('view-hidden', view !== 'tanks');
    elements.septicaView?.classList.toggle('view-hidden', view !== 'septica');
    elements.survivalView?.classList.toggle('view-hidden', view !== 'survival');
    elements.starView?.classList.toggle('view-hidden', view !== 'star');
    elements.racingView?.classList.toggle('view-hidden', view !== 'racing');
    elements.blocksView?.classList.toggle('view-hidden', view !== 'blocks');
    document.body.dataset.view = view;
    if (view !== 'hub') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  canvas.width = initialMap.width * CELL_SIZE;
  canvas.height = initialMap.height * CELL_SIZE;

  function playerStatsText(player: Player): string {
    const maxBombs = player.maxBombs ?? 1;
    const blastRadius = player.blastRadius ?? EXPLOSION_RADIUS;
    const moveDuration = player.moveDuration ?? PLAYER_MOVE_DURATION;
    const speedPercent = Math.round((PLAYER_MOVE_DURATION / moveDuration) * 100);
    const speedText = speedPercent === 100 ? 'normal speed' : `${speedPercent}% speed`;
    return `${maxBombs} bomb${maxBombs === 1 ? '' : 's'} · ${blastRadius} tile blast · ${speedText}`;
  }

  function syncUi(): void {
    if (elements.statusText) elements.statusText.textContent = onlineState.statusText;
    if (elements.roundLabel) elements.roundLabel.textContent = `Round ${onlineState.round}`;
    if (elements.playerOneScore) elements.playerOneScore.textContent = String(onlineState.scores[1]);
    if (elements.playerTwoScore) elements.playerTwoScore.textContent = String(onlineState.scores[2]);
    if (elements.playerOneStats) elements.playerOneStats.textContent = playerStatsText(renderedPlayers[0]);
    if (elements.playerTwoStats) elements.playerTwoStats.textContent = playerStatsText(renderedPlayers[1]);
    if (elements.playerOneRole) elements.playerOneRole.textContent = localMode ? 'Local P1' : localPlayerId === 1 ? 'You' : 'Online';
    if (elements.playerTwoRole) {
      elements.playerTwoRole.textContent = localMode
        ? 'Local P2'
        : localPlayerId === 2
        ? 'You'
        : activeBotDifficulty
          ? `${activeBotDifficulty} bot`
          : 'Online';
    }

    const showRoundOverlay = onlineState.phase === 'waiting' || onlineState.phase === 'countdown';
    elements.roundOverlay?.classList.toggle('visible', showRoundOverlay);
    if (elements.roundOverlayText) elements.roundOverlayText.textContent = onlineState.overlayText;

    const waiting = !localMode && Boolean(localPlayerId) && onlineState.connectedPlayers.length < 2;
    const onlineReady = !localMode && Boolean(localPlayerId) && onlineState.connectedPlayers.length === 2;
    elements.lobbyOverlay?.classList.toggle('hidden', localMode || Boolean(localPlayerId) && !waiting);
    elements.lobbyActions?.classList.toggle('hidden', localMode || Boolean(localPlayerId));
    elements.roomReady?.classList.toggle('hidden', localMode || !localPlayerId);
    if (elements.roomCode) elements.roomCode.textContent = activeRoomCode || '-----';
    elements.mobileControls?.classList.toggle('hidden', !onlineReady);
    elements.localMobileControls?.classList.toggle('hidden', !localMode);
    if (elements.mobilePlayerLabel) {
      elements.mobilePlayerLabel.textContent = localPlayerId
        ? `Playing as ${localPlayerId === 1 ? 'Mint' : 'Coral'}`
        : 'Your controls';
    }
    if (elements.connectionMessage && localPlayerId) {
      elements.connectionMessage.classList.remove('error');
      elements.connectionMessage.textContent = waiting
        ? 'Share this code with your opponent. The match starts when they join.'
        : `You are ${localPlayerId === 1 ? 'Mint' : 'Coral'}.`;
    }
    const trackedPlayer = localMode ? 1 : localPlayerId ?? 1;
    const winner = onlineState.gameStatus === 'player1-wins' ? 1 : onlineState.gameStatus === 'player2-wins' ? 2 : 0;
    resultReporter.report(onlineState.phase === 'finished', {
      outcome: winner === 0 ? 'draw' : winner === trackedPlayer ? 'win' : 'loss',
      score: onlineState.scores[trackedPlayer],
    });
  }

  function mergePlayers(incoming: Player[], round: number): void {
    if (round !== renderedRound) {
      renderedRound = round;
      renderedPlayers = incoming.map(player => ({ ...player }));
      return;
    }

    incoming.forEach((remotePlayer, index) => {
      const current = renderedPlayers[index];
      if (!current) {
        renderedPlayers[index] = { ...remotePlayer };
        return;
      }
      const moved = current.x !== remotePlayer.x || current.y !== remotePlayer.y;
      const previousX = current.x;
      const previousY = current.y;
      const moveStartedAt = current.moveStartedAt;
      Object.assign(current, remotePlayer);
      if (moved) {
        current.moveFromX = previousX;
        current.moveFromY = previousY;
        current.moveStartedAt = performance.now();
      } else if (moveStartedAt !== undefined) {
        current.moveStartedAt = moveStartedAt;
      }
    });
  }

  function showLobbyMessage(message: string, isError = false): void {
    if (!elements.connectionMessage) return;
    elements.connectionMessage.textContent = message;
    elements.connectionMessage.classList.toggle('error', isError);
  }

  function connectAndSend(
    message:
      | { type: 'create' }
      | { type: 'join'; roomCode: string }
      | { type: 'createBot'; difficulty: 'easy' | 'normal' | 'hard' }
  ): void {
    localMode = false;
    localRoom = undefined;
    elements.localMobileControls?.classList.add('hidden');
    if (socket && socket.readyState <= WebSocket.OPEN) socket.close();
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    socket = new WebSocket(`${protocol}//${location.host}`);
    showLobbyMessage('Connecting to the game server…');

    socket.addEventListener('open', () => socket?.send(JSON.stringify(message)));
    socket.addEventListener('message', event => {
      const response = JSON.parse(String(event.data)) as ClientMessage;
      if (response.type === 'error') {
        showLobbyMessage(response.message, true);
        return;
      }
      if (response.type === 'joined') {
        localPlayerId = response.playerId;
        activeRoomCode = response.roomCode;
        activeBotDifficulty = response.botDifficulty;
        if (activeBotDifficulty) history.replaceState(null, '', location.pathname);
        else history.replaceState(null, '', `?room=${activeRoomCode}`);
        syncUi();
        return;
      }

      mergePlayers(response.state.players, response.state.round);
      onlineState = response.state;
      syncUi();
    });
    socket.addEventListener('close', () => {
      if (localMode) return;
      if (!localPlayerId) return;
      localPlayerId = undefined;
      activeRoomCode = '';
      activeBotDifficulty = undefined;
      elements.lobbyOverlay?.classList.remove('hidden');
      elements.lobbyActions?.classList.remove('hidden');
      elements.roomReady?.classList.add('hidden');
      elements.mobileControls?.classList.add('hidden');
      showLobbyMessage('Disconnected. Create or join a room to reconnect.', true);
    });
    socket.addEventListener('error', () => showLobbyMessage('Could not reach the online server.', true));
  }

  function sendAction(action: unknown): void {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'action', action }));
    }
  }

  function sendPlayerAction(player: 1 | 2, action: PlayerAction): void {
    if (localMode && localRoom) localRoom.handleAction(player, action);
    else sendAction(action);
  }

  async function startLocalMatch(): Promise<void> {
    localPlayerId = undefined;
    const previousSocket = socket;
    socket = undefined;
    previousSocket?.close();
    const { OnlineRoom: LocalRoom } = await import('./multiplayer.js');
    const now = Date.now();
    localRoom = new LocalRoom('LOCAL');
    localRoom.connectPlayer(1, now);
    localRoom.connectPlayer(2, now);
    localMode = true;
    activeRoomCode = '';
    activeBotDifficulty = undefined;
    onlineState = localRoom.snapshot(now);
    mergePlayers(onlineState.players, onlineState.round);
    history.replaceState(null, '', location.pathname);
    syncUi();
  }

  elements.createRoomButton?.addEventListener('click', () => connectAndSend({ type: 'create' }));
  elements.playLocalButton?.addEventListener('click', () => { void startLocalMatch(); });
  elements.launchGameButtons.forEach(button => {
    button.addEventListener('click', () => {
      const game = button.dataset.launchGame;
      if (game === 'bomberman' || game === 'tintar' || game === 'paddle' || game === 'snake' || game === 'tanks' || game === 'septica' || game === 'survival' || game === 'star' || game === 'racing' || game === 'blocks') setActiveView(game);
    });
  });
  elements.backToHubButtons.forEach(button => {
    button.addEventListener('click', () => {
      if (socket && socket.readyState <= WebSocket.OPEN) socket.close();
      socket = undefined;
      localRoom = undefined;
      localMode = false;
      localPlayerId = undefined;
      activeRoomCode = '';
      activeBotDifficulty = undefined;
      history.replaceState(null, '', location.pathname);
      elements.lobbyOverlay?.classList.remove('hidden');
      elements.lobbyActions?.classList.remove('hidden');
      elements.roomReady?.classList.add('hidden');
      elements.mobileControls?.classList.add('hidden');
      elements.localMobileControls?.classList.add('hidden');
      showLobbyMessage('Choose a bot difficulty, create a room, or enter an invitation code.');
      setActiveView('hub');
    });
  });
  elements.botButtons.forEach(button => {
    button.addEventListener('click', () => {
      const difficulty = button.dataset.botDifficulty;
      if (difficulty === 'easy' || difficulty === 'normal' || difficulty === 'hard') {
        connectAndSend({ type: 'createBot', difficulty });
      }
    });
  });
  elements.joinRoomButton?.addEventListener('click', () => {
    const roomCode = elements.roomCodeInput?.value.trim().toUpperCase() || '';
    if (!/^[A-Z2-9]{5}$/.test(roomCode)) {
      showLobbyMessage('Enter the five-character room code.', true);
      return;
    }
    connectAndSend({ type: 'join', roomCode });
  });
  elements.roomCodeInput?.addEventListener('input', () => {
    if (elements.roomCodeInput) elements.roomCodeInput.value = elements.roomCodeInput.value.toUpperCase();
  });
  elements.roomCodeInput?.addEventListener('keydown', event => {
    if (event.key === 'Enter') elements.joinRoomButton?.click();
  });
  elements.copyRoomButton?.addEventListener('click', async () => {
    if (!activeRoomCode) return;
    await navigator.clipboard.writeText(`${location.origin}/?room=${activeRoomCode}`);
    if (elements.copyRoomButton) elements.copyRoomButton.textContent = 'Copied!';
    window.setTimeout(() => {
      if (elements.copyRoomButton) elements.copyRoomButton.textContent = 'Copy invite';
    }, 1_200);
  });
  elements.restartButton?.addEventListener('click', () => sendPlayerAction(1, { type: 'restart' }));
  elements.mobileRestartButton?.addEventListener('click', () => sendPlayerAction(1, { type: 'restart' }));
  elements.localMobileRestartButton?.addEventListener('click', () => sendPlayerAction(1, { type: 'restart' }));

  const touchTimers = new Map<number, number>();
  function bindTouchControl(
    button: HTMLButtonElement,
    action: PlayerAction,
    repeat: boolean,
    haptic: boolean = false,
    player?: 1 | 2
  ): void {
    const dispatch = (): void => player ? sendPlayerAction(player, action) : sendAction(action);
    const release = (pointerId: number): void => {
      const timer = touchTimers.get(pointerId);
      if (timer !== undefined && timer >= 0) window.clearInterval(timer);
      touchTimers.delete(pointerId);
      button.classList.remove('pressed');
    };

    button.addEventListener('pointerdown', event => {
      event.preventDefault();
      if (touchTimers.has(event.pointerId)) return;
      button.classList.add('pressed');
      button.setPointerCapture?.(event.pointerId);
      dispatch();
      if (haptic && 'vibrate' in navigator) navigator.vibrate(24);
      const timer = repeat
        ? window.setInterval(dispatch, 35)
        : -1;
      touchTimers.set(event.pointerId, timer);
    });
    button.addEventListener('pointerup', event => release(event.pointerId));
    button.addEventListener('pointercancel', event => release(event.pointerId));
    button.addEventListener('lostpointercapture', event => release(event.pointerId));
    button.addEventListener('contextmenu', event => event.preventDefault());
    button.addEventListener('click', event => {
      if (event.detail === 0) dispatch();
    });
  }

  document.querySelectorAll<HTMLButtonElement>('[data-move-x][data-move-y]').forEach(button => {
    const dx = Number(button.dataset.moveX) as -1 | 0 | 1;
    const dy = Number(button.dataset.moveY) as -1 | 0 | 1;
    bindTouchControl(button, { type: 'move', dx, dy }, true);
  });
  if (elements.mobileBombButton) {
    bindTouchControl(elements.mobileBombButton, { type: 'bomb' }, false, true);
  }
  document.querySelectorAll<HTMLButtonElement>('[data-bomberman-player][data-bomberman-action]').forEach(button => {
    const player = Number(button.dataset.bombermanPlayer) as 1 | 2;
    const actionName = button.dataset.bombermanAction;
    const moves: Record<string, PlayerAction> = {
      up: { type: 'move', dx: 0, dy: -1 }, down: { type: 'move', dx: 0, dy: 1 },
      left: { type: 'move', dx: -1, dy: 0 }, right: { type: 'move', dx: 1, dy: 0 },
      bomb: { type: 'bomb' },
    };
    const action = actionName ? moves[actionName] : undefined;
    if (action) bindTouchControl(button, action, action.type === 'move', action.type === 'bomb', player);
  });

  const handledKeys = new Set([
    'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    'Space', 'Enter', 'KeyR',
  ]);
  window.addEventListener('keydown', event => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLButtonElement) return;
    if (!handledKeys.has(event.code)) return;
    event.preventDefault();

    const moves: Record<string, readonly [1 | 2, PlayerAction]> = {
      KeyW: [1, { type: 'move', dx: 0, dy: -1 }],
      ArrowUp: [2, { type: 'move', dx: 0, dy: -1 }],
      KeyS: [1, { type: 'move', dx: 0, dy: 1 }],
      ArrowDown: [2, { type: 'move', dx: 0, dy: 1 }],
      KeyA: [1, { type: 'move', dx: -1, dy: 0 }],
      ArrowLeft: [2, { type: 'move', dx: -1, dy: 0 }],
      KeyD: [1, { type: 'move', dx: 1, dy: 0 }],
      ArrowRight: [2, { type: 'move', dx: 1, dy: 0 }],
    };
    if (moves[event.code]) sendPlayerAction(moves[event.code][0], moves[event.code][1]);
    else if ((event.code === 'Space' || event.code === 'Enter') && !event.repeat) {
      sendPlayerAction(event.code === 'Space' ? 1 : 2, { type: 'bomb' });
    } else if (event.code === 'KeyR' && !event.repeat) {
      sendPlayerAction(1, { type: 'restart' });
    }
  });

  const roomFromUrl = new URLSearchParams(location.search).get('room')?.toUpperCase();
  if (roomFromUrl && elements.roomCodeInput) elements.roomCodeInput.value = roomFromUrl;
  setActiveView(roomFromUrl ? 'bomberman' : 'hub');

  function gameLoop(): void {
    if (localRoom) {
      const now = Date.now();
      localRoom.update(now);
      const snapshot = localRoom.snapshot(now);
      mergePlayers(snapshot.players, snapshot.round);
      onlineState = snapshot;
      syncUi();
    }
    render(ctx as CanvasRenderingContext2D, canvas as HTMLCanvasElement, { ...onlineState, players: renderedPlayers });
    if (onlineState.phase === 'finished') {
      if (onlineState.gameStatus === 'draw') renderDrawScreen(ctx as CanvasRenderingContext2D, canvas as HTMLCanvasElement);
      else if (onlineState.gameStatus === 'player1-wins') renderWinScreen(ctx as CanvasRenderingContext2D, canvas as HTMLCanvasElement, 1);
      else if (onlineState.gameStatus === 'player2-wins') renderWinScreen(ctx as CanvasRenderingContext2D, canvas as HTMLCanvasElement, 2);
    }
    requestAnimationFrame(gameLoop);
  }

  syncUi();
  gameLoop();
}

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    initArcadeSettings();
    initArcadePwa();
    initArcadeProfile();
    initGameCatalog();
    initQuickPlay();
    initGame();
    initTintar();
    initPaddleClash();
    initNeonSnake();
    initMiniTanks();
    initSeptica();
    initSurvivalArena();
    initStarDefender();
    initMicroRacers();
    initBlockDrop();
  });
}
