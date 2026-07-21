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

export interface Bomb {
  position: Position;
  timer: number;
  explodedAt?: number;
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
      this.explodeBomb(bomb);
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

let gameState: GameState;

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

  gameState = new GameState();
  canvas.width = gameState.width * CELL_SIZE;
  canvas.height = gameState.height * CELL_SIZE;

  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / CELL_SIZE);
    const y = Math.floor((e.clientY - rect.top) / CELL_SIZE);
    gameState.placeBomb({ x, y });
  });

  function gameLoop() {
    const now = Date.now();
    gameState.update(now);
    render();
    requestAnimationFrame(gameLoop);
  }

  function render() {
    if (!ctx || !canvas) return;

    ctx.fillStyle = '#222';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let y = 0; y < gameState.height; y++) {
      for (let x = 0; x < gameState.width; x++) {
        const cell = gameState.grid[y][x];

        if (cell === TileType.WALL_INDESTRUCTIBLE) {
          ctx.fillStyle = '#666';
          ctx.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
        } else if (cell === TileType.WALL_DESTRUCTIBLE) {
          ctx.fillStyle = '#999';
          ctx.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
        } else if (cell === TileType.BOMB) {
          ctx.fillStyle = '#000';
          ctx.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
          ctx.fillStyle = '#f00';
          ctx.beginPath();
          ctx.arc(
            x * CELL_SIZE + CELL_SIZE / 2,
            y * CELL_SIZE + CELL_SIZE / 2,
            CELL_SIZE / 3,
            0,
            Math.PI * 2
          );
          ctx.fill();
        }

        if (gameState.isExplosion(x, y)) {
          ctx.fillStyle = 'rgba(255, 165, 0, 0.7)';
          ctx.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
        }
      }
    }

    ctx.strokeStyle = '#444';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= gameState.width; i++) {
      ctx.beginPath();
      ctx.moveTo(i * CELL_SIZE, 0);
      ctx.lineTo(i * CELL_SIZE, canvas.height);
      ctx.stroke();
    }
    for (let i = 0; i <= gameState.height; i++) {
      ctx.beginPath();
      ctx.moveTo(0, i * CELL_SIZE);
      ctx.lineTo(canvas.width, i * CELL_SIZE);
      ctx.stroke();
    }
  }

  gameLoop();
}

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', initGame);
}
