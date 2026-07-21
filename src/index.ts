export const CELL_SIZE = 64;
export const BOMB_TIMER = 3000;
export const EXPLOSION_DURATION = 500;

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
}

export interface Bomb {
  position: Position;
  timer: number;
  explodedAt?: number;
}

export interface Explosion {
  x: number;
  y: number;
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
        const isPlayerSpawn = (row === 1 && col === 1) || (row === height - 2 && col === width - 2);
        if (!isPlayerSpawn && Math.random() < 0.6) {
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
  }

  placeBomb(pos: Position): boolean {
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

    const bomb: any = { position: pos, timer: BOMB_TIMER, __createdAt: Date.now() };
    this.bombs.push(bomb);
    this.grid[pos.y][pos.x] = TileType.BOMB;
    return true;
  }

  explodeBomb(bomb: Bomb): void {
    const { x, y } = bomb.position;
    bomb.explodedAt = Date.now();

    this.grid[y][x] = TileType.EMPTY;
    this.addExplosion(x, y);

    const directions = [
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: 0, dy: -1 },
    ];

    for (const dir of directions) {
      for (let i = 1; i < Math.max(this.width, this.height); i++) {
        const nx = x + dir.dx * i;
        const ny = y + dir.dy * i;

        if (nx < 0 || nx >= this.width || ny < 0 || ny >= this.height) break;

        if (this.grid[ny][nx] === TileType.WALL_INDESTRUCTIBLE) break;

        this.addExplosion(nx, ny);

        if (this.grid[ny][nx] === TileType.WALL_DESTRUCTIBLE) {
          this.grid[ny][nx] = TileType.EMPTY;
          break;
        }

        if (this.grid[ny][nx] === TileType.BOMB) {
          const targetBomb = this.bombs.find(
            (b) => b.position.x === nx && b.position.y === ny
          );
          if (targetBomb && !targetBomb.explodedAt) {
            this.explodeBomb(targetBomb);
          }
          break;
        }
      }
    }
  }

  private addExplosion(x: number, y: number): void {
    const key = `${x},${y}`;
    this.explosions.set(key, Date.now());
  }

  update(now: number): void {
    const toExplode: Bomb[] = [];

    for (const bomb of this.bombs) {
      if (!bomb.explodedAt) {
        const createdAt = (bomb as any).__createdAt || now;
        if (now - createdAt >= bomb.timer) {
          toExplode.push(bomb);
        }
      }
    }

    for (const bomb of toExplode) {
      if (bomb.explodedAt === undefined) {
        this.explodeBomb(bomb);
      }
    }

    const expiredExplosions: string[] = [];
    for (const [key, startTime] of this.explosions.entries()) {
      if (now - startTime > EXPLOSION_DURATION) {
        expiredExplosions.push(key);
      }
    }

    for (const key of expiredExplosions) {
      this.explosions.delete(key);
    }

    this.bombs = this.bombs.filter((b) => {
      const timeSinceExplode = b.explodedAt ? now - b.explodedAt : 0;
      return !b.explodedAt || timeSinceExplode < EXPLOSION_DURATION;
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
    { id: 1, x: 1, y: 1 },
    { id: 2, x: 11, y: 11 },
  ];
}

export function canMoveTo(grid: MapGrid, x: number, y: number): boolean {
  if (x < 0 || x >= grid.width || y < 0 || y >= grid.height) {
    return false;
  }
  return grid.tiles[y][x] === TileType.EMPTY;
}

export function movePlayer(player: Player, dx: number, dy: number, grid: MapGrid): void {
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
}

/** Draws a supplied plain game-state object without depending on live game internals. */
export function render(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  state: RenderState
): void {
  const { grid, players, bombs = [], explosions = [] } = state;
  const tileSize = canvas.width / grid.width;

  ctx.fillStyle = '#222';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const tile = grid.tiles[y][x];
      if (tile === TileType.WALL_INDESTRUCTIBLE) {
        ctx.fillStyle = '#666';
        ctx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
      } else if (tile === TileType.WALL_DESTRUCTIBLE) {
        ctx.fillStyle = '#b8860b';
        ctx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
      }
    }
  }

  for (const bomb of bombs) {
    ctx.fillStyle = '#000';
    ctx.fillRect(bomb.x * tileSize, bomb.y * tileSize, tileSize, tileSize);
    ctx.fillStyle = '#f00';
    ctx.beginPath();
    ctx.arc(bomb.x * tileSize + tileSize / 2, bomb.y * tileSize + tileSize / 2, tileSize / 3, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const explosion of explosions) {
    ctx.fillStyle = 'rgba(255, 165, 0, 0.7)';
    ctx.fillRect(explosion.x * tileSize, explosion.y * tileSize, tileSize, tileSize);
  }

  for (const player of players) {
    ctx.fillStyle = player.id === 1 ? '#00ff00' : '#ff0000';
    ctx.fillRect(player.x * tileSize, player.y * tileSize, tileSize, tileSize);
  }
}

export function initGame() {
  if (typeof document === 'undefined') {
    return;
  }

  const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
  const ctx = canvas?.getContext('2d');

  if (!canvas || !ctx) {
    console.error('Canvas not found');
    return;
  }

  const mapGrid = createMapGrid();
  const gameState = new GameState(mapGrid);
  const players = createPlayers();

  canvas.width = gameState.width * CELL_SIZE;
  canvas.height = gameState.height * CELL_SIZE;

  const keysPressed: Record<string, boolean> = {};

  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / CELL_SIZE);
    const y = Math.floor((e.clientY - rect.top) / CELL_SIZE);
    gameState.placeBomb({ x, y });
  });

  window.addEventListener('keydown', (e) => {
    keysPressed[e.key.toLowerCase()] = true;
  });

  window.addEventListener('keyup', (e) => {
    keysPressed[e.key.toLowerCase()] = false;
  });

  function update() {
    if (keysPressed['w']) movePlayer(players[0], 0, -1, mapGrid);
    if (keysPressed['s']) movePlayer(players[0], 0, 1, mapGrid);
    if (keysPressed['a']) movePlayer(players[0], -1, 0, mapGrid);
    if (keysPressed['d']) movePlayer(players[0], 1, 0, mapGrid);

    if (keysPressed['arrowup']) movePlayer(players[1], 0, -1, mapGrid);
    if (keysPressed['arrowdown']) movePlayer(players[1], 0, 1, mapGrid);
    if (keysPressed['arrowleft']) movePlayer(players[1], -1, 0, mapGrid);
    if (keysPressed['arrowright']) movePlayer(players[1], 1, 0, mapGrid);

    const now = Date.now();
    gameState.update(now);
  }

  function gameLoop() {
    update();

    const explosions: Explosion[] = [];
    for (const [key] of gameState.explosions) {
      const [x, y] = key.split(',').map(Number);
      explosions.push({ x, y });
    }

    const bombs: NonNullable<RenderState['bombs']> = gameState.bombs.map((b) => ({
      x: b.position.x,
      y: b.position.y,
    }));

    const state = {
      grid: mapGrid,
      players,
      bombs,
      explosions,
    };

    render(ctx as CanvasRenderingContext2D, canvas, state);
    requestAnimationFrame(gameLoop);
  }

  gameLoop();
}

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', initGame);
}
