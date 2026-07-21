export const GRID_SIZE = 8;
export const CELL_SIZE = 64;
export const BOMB_TIMER = 3000;
export const EXPLOSION_DURATION = 500;

export enum CellType {
  Empty = 0,
  IndestructibleWall = 1,
  DestructibleWall = 2,
  Bomb = 3,
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

export class GameState {
  grid: CellType[][];
  bombs: Bomb[];
  explosions: Map<string, number>;

  constructor() {
    this.grid = this.initializeGrid();
    this.bombs = [];
    this.explosions = new Map();
  }

  private initializeGrid(): CellType[][] {
    const grid: CellType[][] = Array(GRID_SIZE)
      .fill(null)
      .map(() => Array(GRID_SIZE).fill(CellType.Empty));

    for (let x = 0; x < GRID_SIZE; x++) {
      for (let y = 0; y < GRID_SIZE; y++) {
        if (x % 2 === 1 && y % 2 === 1) {
          grid[x][y] = CellType.IndestructibleWall;
        } else if (
          (x > 1 || y > 1) &&
          (x < GRID_SIZE - 2 || y < GRID_SIZE - 2) &&
          Math.random() < 0.3
        ) {
          grid[x][y] = CellType.DestructibleWall;
        }
      }
    }

    return grid;
  }

  placeBomb(pos: Position): boolean {
    if (
      pos.x < 0 ||
      pos.x >= GRID_SIZE ||
      pos.y < 0 ||
      pos.y >= GRID_SIZE
    ) {
      return false;
    }

    if (this.grid[pos.x][pos.y] !== CellType.Empty) {
      return false;
    }

    if (this.bombs.some((b) => b.position.x === pos.x && b.position.y === pos.y)) {
      return false;
    }

    const bomb: any = { position: pos, timer: BOMB_TIMER, __createdAt: Date.now() };
    this.bombs.push(bomb);
    this.grid[pos.x][pos.y] = CellType.Bomb;
    return true;
  }

  explodeBomb(bomb: Bomb): void {
    const { x, y } = bomb.position;
    bomb.explodedAt = Date.now();

    this.grid[x][y] = CellType.Empty;
    this.addExplosion(x, y);

    const directions = [
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: 0, dy: -1 },
    ];

    for (const dir of directions) {
      for (let i = 1; i < GRID_SIZE; i++) {
        const nx = x + dir.dx * i;
        const ny = y + dir.dy * i;

        if (nx < 0 || nx >= GRID_SIZE || ny < 0 || ny >= GRID_SIZE) break;

        if (this.grid[nx][ny] === CellType.IndestructibleWall) break;

        this.addExplosion(nx, ny);

        if (this.grid[nx][ny] === CellType.DestructibleWall) {
          this.grid[nx][ny] = CellType.Empty;
          break;
        }

        if (this.grid[nx][ny] === CellType.Bomb) {
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

  getCellAt(pos: Position): CellType {
    if (pos.x < 0 || pos.x >= GRID_SIZE || pos.y < 0 || pos.y >= GRID_SIZE) {
      return CellType.IndestructibleWall;
    }
    return this.grid[pos.x][pos.y];
  }

  isExplosion(x: number, y: number): boolean {
    return this.explosions.has(`${x},${y}`);
  }
}

let gameState: GameState;

export function initGame() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
  const ctx = canvas?.getContext('2d');

  if (!canvas || !ctx) {
    console.error('Canvas not found');
    return;
  }

  gameState = new GameState();
  canvas.width = GRID_SIZE * CELL_SIZE;
  canvas.height = GRID_SIZE * CELL_SIZE;

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

    for (let x = 0; x < GRID_SIZE; x++) {
      for (let y = 0; y < GRID_SIZE; y++) {
        const cell = gameState.grid[x][y];

        if (cell === CellType.IndestructibleWall) {
          ctx.fillStyle = '#666';
          ctx.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
        } else if (cell === CellType.DestructibleWall) {
          ctx.fillStyle = '#999';
          ctx.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
        } else if (cell === CellType.Bomb) {
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
    for (let i = 0; i <= GRID_SIZE; i++) {
      ctx.beginPath();
      ctx.moveTo(i * CELL_SIZE, 0);
      ctx.lineTo(i * CELL_SIZE, canvas.height);
      ctx.stroke();

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
