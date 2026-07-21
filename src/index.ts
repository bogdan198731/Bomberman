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
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#fff';
  ctx.font = '20px Arial';
  ctx.fillText('Bomberman - Coming Soon', 150, 250);
}

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', initGame);
}
