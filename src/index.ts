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

  const grid = createMapGrid();
  const [player1, player2] = createPlayers();

  const keysPressed: Record<string, boolean> = {};

  window.addEventListener('keydown', (e) => {
    keysPressed[e.key.toLowerCase()] = true;
  });

  window.addEventListener('keyup', (e) => {
    keysPressed[e.key.toLowerCase()] = false;
  });

  function update() {
    if (keysPressed['w']) movePlayer(player1, 0, -1, grid);
    if (keysPressed['s']) movePlayer(player1, 0, 1, grid);
    if (keysPressed['a']) movePlayer(player1, -1, 0, grid);
    if (keysPressed['d']) movePlayer(player1, 1, 0, grid);

    if (keysPressed['arrowup']) movePlayer(player2, 0, -1, grid);
    if (keysPressed['arrowdown']) movePlayer(player2, 0, 1, grid);
    if (keysPressed['arrowleft']) movePlayer(player2, -1, 0, grid);
    if (keysPressed['arrowright']) movePlayer(player2, 1, 0, grid);
  }

  function draw() {
    const context = ctx as CanvasRenderingContext2D;
    context.fillStyle = '#000';
    context.fillRect(0, 0, canvas.width, canvas.height);

    const tileSize = canvas.width / grid.width;

    for (let row = 0; row < grid.height; row++) {
      for (let col = 0; col < grid.width; col++) {
        const tile = grid.tiles[row][col];
        const x = col * tileSize;
        const y = row * tileSize;

        if (tile === TileType.WALL_INDESTRUCTIBLE) {
          context.fillStyle = '#666';
          context.fillRect(x, y, tileSize, tileSize);
        } else if (tile === TileType.WALL_DESTRUCTIBLE) {
          context.fillStyle = '#b8860b';
          context.fillRect(x, y, tileSize, tileSize);
        }
      }
    }

    context.fillStyle = '#00ff00';
    context.fillRect(player1.x * tileSize, player1.y * tileSize, tileSize, tileSize);

    context.fillStyle = '#ff0000';
    context.fillRect(player2.x * tileSize, player2.y * tileSize, tileSize, tileSize);
  }

  function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
  }

  gameLoop();
}

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', initGame);
}
