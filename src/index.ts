export enum TileType {
  EMPTY = 0,
  WALL_DESTRUCTIBLE = 1,
  WALL_INDESTRUCTIBLE = 2,
}

export interface MapGrid {
  width: number;
  height: number;
  tiles: TileType[][];
}

export interface Player {
  id: 1 | 2;
  x: number;
  y: number;
  alive: boolean;
}

export interface Bomb {
  x: number;
  y: number;
  playerId: 1 | 2;
}

export interface Explosion {
  x: number;
  y: number;
}

export interface GameState {
  grid: MapGrid;
  players: Player[];
  bombs?: Bomb[];
  explosions?: Explosion[];
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

export function createPlayers(): [Player, Player] {
  return [
    { id: 1, x: 1, y: 1, alive: true },
    { id: 2, x: 11, y: 11, alive: true },
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

export function render(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  state: GameState
): void {
  const { grid, players, bombs = [], explosions = [] } = state;

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const tileSize = canvas.width / grid.width;

  for (let row = 0; row < grid.height; row++) {
    for (let col = 0; col < grid.width; col++) {
      const tile = grid.tiles[row][col];
      const x = col * tileSize;
      const y = row * tileSize;

      if (tile === TileType.WALL_INDESTRUCTIBLE) {
        ctx.fillStyle = '#666';
        ctx.fillRect(x, y, tileSize, tileSize);
      } else if (tile === TileType.WALL_DESTRUCTIBLE) {
        ctx.fillStyle = '#b8860b';
        ctx.fillRect(x, y, tileSize, tileSize);
      }
    }
  }

  for (const bomb of bombs) {
    ctx.fillStyle = '#000';
    ctx.fillRect(bomb.x * tileSize, bomb.y * tileSize, tileSize, tileSize);
    ctx.fillStyle = '#999';
    ctx.beginPath();
    ctx.arc(bomb.x * tileSize + tileSize / 2, bomb.y * tileSize + tileSize / 2, tileSize / 3, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const explosion of explosions) {
    ctx.fillStyle = 'rgba(255, 165, 0, 0.7)';
    ctx.fillRect(explosion.x * tileSize, explosion.y * tileSize, tileSize, tileSize);
  }

  for (const player of players) {
    if (player.alive) {
      ctx.fillStyle = player.id === 1 ? '#00ff00' : '#ff0000';
      ctx.fillRect(player.x * tileSize, player.y * tileSize, tileSize, tileSize);
    }
  }
}

export function renderWinScreen(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  winnerId: 1 | 2
): void {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = winnerId === 1 ? '#00ff00' : '#ff0000';
  ctx.font = 'bold 48px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`Player ${winnerId} Wins!`, canvas.width / 2, canvas.height / 2 - 40);

  ctx.font = '24px Arial';
  ctx.fillStyle = '#fff';
  ctx.fillText('Press R to restart', canvas.width / 2, canvas.height / 2 + 40);
}

export function renderDrawScreen(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement
): void {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#ffff00';
  ctx.font = 'bold 48px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('It\'s a Draw!', canvas.width / 2, canvas.height / 2 - 40);

  ctx.font = '24px Arial';
  ctx.fillStyle = '#fff';
  ctx.fillText('Press R to restart', canvas.width / 2, canvas.height / 2 + 40);
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

  canvas.width = 512;
  canvas.height = 512;

  let grid = createMapGrid();
  let players = createPlayers();
  let bombs: Bomb[] = [];
  let explosions: Explosion[] = [];
  let gameStatus: GameStatus = 'playing';

  const keysPressed: Record<string, boolean> = {};

  window.addEventListener('keydown', (e) => {
    keysPressed[e.key.toLowerCase()] = true;
  });

  window.addEventListener('keyup', (e) => {
    keysPressed[e.key.toLowerCase()] = false;
  });

  function reset() {
    grid = createMapGrid();
    players = createPlayers();
    bombs = [];
    explosions = [];
    gameStatus = 'playing';
  }

  function update() {
    if (gameStatus !== 'playing') {
      if (keysPressed['r']) {
        reset();
      }
      return;
    }

    if (keysPressed['w']) movePlayer(players[0], 0, -1, grid);
    if (keysPressed['s']) movePlayer(players[0], 0, 1, grid);
    if (keysPressed['a']) movePlayer(players[0], -1, 0, grid);
    if (keysPressed['d']) movePlayer(players[0], 1, 0, grid);

    if (keysPressed['arrowup']) movePlayer(players[1], 0, -1, grid);
    if (keysPressed['arrowdown']) movePlayer(players[1], 0, 1, grid);
    if (keysPressed['arrowleft']) movePlayer(players[1], -1, 0, grid);
    if (keysPressed['arrowright']) movePlayer(players[1], 1, 0, grid);

    gameStatus = getGameStatus(players);
  }

  function gameLoop() {
    update();

    if (gameStatus === 'playing') {
      const gameState: GameState = {
        grid,
        players,
        bombs,
        explosions,
      };
      render(ctx as CanvasRenderingContext2D, canvas, gameState);
    } else if (gameStatus === 'draw') {
      renderDrawScreen(ctx as CanvasRenderingContext2D, canvas);
    } else if (gameStatus === 'player1-wins') {
      renderWinScreen(ctx as CanvasRenderingContext2D, canvas, 1);
    } else if (gameStatus === 'player2-wins') {
      renderWinScreen(ctx as CanvasRenderingContext2D, canvas, 2);
    }

    requestAnimationFrame(gameLoop);
  }

  gameLoop();
}

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', initGame);
}
