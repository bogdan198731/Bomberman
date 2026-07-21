import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  GameState,
  TileType,
  BOMB_TIMER,
  EXPLOSION_DURATION,
  createMapGrid,
  createPlayers,
  canMoveTo,
  movePlayer,
  type MapGrid,
} from './index.js';

function createEmptyTestGrid(width: number = 13, height: number = 13): MapGrid {
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

  return { width, height, tiles };
}

test('createMapGrid - grid dimensions', () => {
  const grid = createMapGrid();
  assert.strictEqual(grid.width, 13);
  assert.strictEqual(grid.height, 13);
  assert.strictEqual(grid.tiles.length, 13);
  grid.tiles.forEach((row) => {
    assert.strictEqual(row.length, 13);
  });
});

test('createMapGrid - custom dimensions', () => {
  const grid = createMapGrid(15, 15);
  assert.strictEqual(grid.width, 15);
  assert.strictEqual(grid.height, 15);
  assert.strictEqual(grid.tiles.length, 15);
});

test('createMapGrid - border walls are indestructible', () => {
  const grid = createMapGrid();
  for (let col = 0; col < grid.width; col++) {
    assert.strictEqual(grid.tiles[0][col], TileType.WALL_INDESTRUCTIBLE, `top border (0, ${col})`);
    assert.strictEqual(grid.tiles[grid.height - 1][col], TileType.WALL_INDESTRUCTIBLE, `bottom border (${grid.height - 1}, ${col})`);
  }
  for (let row = 0; row < grid.height; row++) {
    assert.strictEqual(grid.tiles[row][0], TileType.WALL_INDESTRUCTIBLE, `left border (${row}, 0)`);
    assert.strictEqual(grid.tiles[row][grid.width - 1], TileType.WALL_INDESTRUCTIBLE, `right border (${row}, ${grid.width - 1})`);
  }
});

test('createMapGrid - pillar walls are at even coordinates', () => {
  const grid = createMapGrid();
  for (let row = 2; row < grid.height - 1; row += 2) {
    for (let col = 2; col < grid.width - 1; col += 2) {
      assert.strictEqual(grid.tiles[row][col], TileType.WALL_INDESTRUCTIBLE, `pillar at (${row}, ${col})`);
    }
  }
});

test('createMapGrid - player spawn areas are empty', () => {
  const grid = createMapGrid();
  assert.strictEqual(grid.tiles[1][1], TileType.EMPTY, 'player 1 spawn (1, 1)');
  assert.strictEqual(grid.tiles[grid.height - 2][grid.width - 2], TileType.EMPTY, `player 2 spawn (${grid.height - 2}, ${grid.width - 2})`);
});

test('createMapGrid - all tiles are valid types', () => {
  const grid = createMapGrid();
  grid.tiles.forEach((row, rowIdx) => {
    row.forEach((tile, colIdx) => {
      assert.ok(
        tile === TileType.EMPTY || tile === TileType.WALL_DESTRUCTIBLE || tile === TileType.WALL_INDESTRUCTIBLE,
        `tile at (${rowIdx}, ${colIdx}) is a valid type`,
      );
    });
  });
});

test('createMapGrid - contains destructible walls', () => {
  const grid = createMapGrid();
  let hasDestructible = false;
  grid.tiles.forEach((row) => {
    row.forEach((tile) => {
      if (tile === TileType.WALL_DESTRUCTIBLE) {
        hasDestructible = true;
      }
    });
  });
  assert.ok(hasDestructible, 'grid contains at least one destructible wall');
});

test('createMapGrid - contains empty tiles', () => {
  const grid = createMapGrid();
  let hasEmpty = false;
  grid.tiles.forEach((row) => {
    row.forEach((tile) => {
      if (tile === TileType.EMPTY) {
        hasEmpty = true;
      }
    });
  });
  assert.ok(hasEmpty, 'grid contains at least one empty tile');
});

test('createMapGrid - adjacent to spawn areas have walkable tiles', () => {
  const grid = createMapGrid();
  const rightOfSpawn = grid.tiles[1][2];
  const belowSpawn = grid.tiles[2][1];
  assert.ok(rightOfSpawn !== TileType.WALL_INDESTRUCTIBLE, 'right of spawn (1, 2) is walkable');
  assert.ok(belowSpawn !== TileType.WALL_INDESTRUCTIBLE, 'below spawn (2, 1) is walkable');
});

function createTestGrid(width: number, height: number) {
  const tiles: TileType[][] = Array(height)
    .fill(null)
    .map(() => Array(width).fill(TileType.EMPTY));

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      if (row === 0 || row === height - 1 || col === 0 || col === width - 1) {
        tiles[row][col] = TileType.WALL_INDESTRUCTIBLE;
      }
    }
  }

  return { width, height, tiles };
}

test('GameState initializes with grid', () => {
  const game = new GameState();
  assert.ok(game.grid.length > 0);
  assert.ok(game.grid[0].length > 0);
  assert.strictEqual(game.width, 13);
  assert.strictEqual(game.height, 13);
});

test('GameState initializes with indestructible walls at even coordinates', () => {
  const game = new GameState();
  for (let row = 2; row < game.height - 1; row += 2) {
    for (let col = 2; col < game.width - 1; col += 2) {
      assert.strictEqual(
        game.grid[row][col],
        TileType.WALL_INDESTRUCTIBLE,
        `Expected indestructible wall at (${row}, ${col})`
      );
    }
  }
});

test('placeBomb adds bomb to grid and game state', () => {
  const testGrid = createTestGrid(8, 8);
  const game = new GameState(testGrid);
  const pos = { x: 2, y: 2 };
  const result = game.placeBomb(pos);

  assert.strictEqual(result, true);
  assert.strictEqual(game.grid[pos.y][pos.x], TileType.BOMB);
  assert.strictEqual(game.bombs.length, 1);
  assert.strictEqual(game.bombs[0].position.x, pos.x);
  assert.strictEqual(game.bombs[0].position.y, pos.y);
});

test('placeBomb fails on occupied cell', () => {
  const testGrid = createTestGrid(8, 8);
  const game = new GameState(testGrid);
  const pos = { x: 2, y: 2 };

  game.placeBomb(pos);
  const result = game.placeBomb(pos);

  assert.strictEqual(result, false);
  assert.strictEqual(game.bombs.length, 1);
});

test('placeBomb fails on wall', () => {
  const testGrid = createTestGrid(8, 8);
  const game = new GameState(testGrid);
  const pos = { x: 0, y: 1 };

  const result = game.placeBomb(pos);

  assert.strictEqual(result, false);
  assert.strictEqual(game.bombs.length, 0);
});

test('placeBomb fails on out of bounds', () => {
  const testGrid = createTestGrid(8, 8);
  const game = new GameState(testGrid);
  const pos = { x: -1, y: 5 };

  const result = game.placeBomb(pos);

  assert.strictEqual(result, false);
});

test('placeBomb fails on second bomb in same cell', () => {
  const testGrid = createTestGrid(8, 8);
  const game = new GameState(testGrid);
  const pos = { x: 3, y: 3 };

  const result1 = game.placeBomb(pos);
  const result2 = game.placeBomb(pos);

  assert.strictEqual(result1, true);
  assert.strictEqual(result2, false);
  assert.strictEqual(game.bombs.length, 1);
});

test('explodeBomb creates explosion at center', () => {
  const testGrid = createTestGrid(8, 8);
  const game = new GameState(testGrid);
  game.placeBomb({ x: 2, y: 2 });

  const bomb = game.bombs[0];
  game.explodeBomb(bomb);

  assert.strictEqual(game.isExplosion(2, 2), true);
  assert.strictEqual(game.grid[2][2], TileType.EMPTY);
});

test('explodeBomb creates cross-shaped explosion', () => {
  const testGrid = createTestGrid(8, 8);
  const game = new GameState(testGrid);
  game.placeBomb({ x: 4, y: 4 });

  const bomb = game.bombs[0];
  game.explodeBomb(bomb);

  assert.strictEqual(game.isExplosion(4, 4), true);
  assert.strictEqual(game.isExplosion(5, 4), true);
  assert.strictEqual(game.isExplosion(3, 4), true);
  assert.strictEqual(game.isExplosion(4, 5), true);
  assert.strictEqual(game.isExplosion(4, 3), true);
});

test('explodeBomb is blocked by indestructible walls', () => {
  const testGrid = createTestGrid(8, 8);
  const game = new GameState(testGrid);
  game.placeBomb({ x: 2, y: 2 });

  const bomb = game.bombs[0];
  game.explodeBomb(bomb);

  assert.strictEqual(game.isExplosion(2, 2), true);
  assert.strictEqual(game.isExplosion(2, 3), true);
  assert.strictEqual(game.isExplosion(2, 4), true);
  assert.strictEqual(game.isExplosion(3, 2), true);
  assert.strictEqual(game.isExplosion(1, 2), true);
});

test('explodeBomb destroys destructible walls', () => {
  const testGrid = createTestGrid(8, 8);
  const game = new GameState(testGrid);
  game.grid[3][4] = TileType.WALL_DESTRUCTIBLE;
  const pos = { x: 3, y: 3 };
  game.placeBomb(pos);

  const bomb = game.bombs[0];
  game.explodeBomb(bomb);

  assert.strictEqual(game.grid[3][4], TileType.EMPTY);
  assert.strictEqual(game.isExplosion(3, 3), true);
});

test('explodeBomb stops at destructible wall', () => {
  const testGrid = createTestGrid(8, 8);
  const game = new GameState(testGrid);
  game.grid[4][4] = TileType.WALL_DESTRUCTIBLE;
  game.grid[4][5] = TileType.EMPTY;

  game.placeBomb({ x: 3, y: 4 });

  const bomb = game.bombs[0];
  game.explodeBomb(bomb);

  assert.strictEqual(game.isExplosion(4, 4), true);
  assert.strictEqual(game.isExplosion(5, 4), false);
});

test('explodeBomb chain reaction', () => {
  const testGrid = createTestGrid(8, 8);
  const game = new GameState(testGrid);
  game.grid[2][2] = TileType.EMPTY;
  game.grid[2][3] = TileType.EMPTY;
  game.grid[2][4] = TileType.EMPTY;

  game.placeBomb({ x: 2, y: 2 });
  game.placeBomb({ x: 4, y: 2 });

  const bomb1 = game.bombs[0];
  game.explodeBomb(bomb1);

  assert.strictEqual(game.isExplosion(2, 2), true);
  assert.strictEqual(game.isExplosion(3, 2), true);
  assert.strictEqual(game.isExplosion(4, 2), true);
  assert.strictEqual(game.bombs.length, 2);
  assert.ok(game.bombs[1].explodedAt !== undefined);
});

test('getCellAt returns correct cell type', () => {
  const testGrid = createTestGrid(8, 8);
  const game = new GameState(testGrid);
  game.grid[2][2] = TileType.WALL_DESTRUCTIBLE;

  assert.strictEqual(game.getCellAt({ x: 2, y: 2 }), TileType.WALL_DESTRUCTIBLE);
  assert.strictEqual(game.getCellAt({ x: 3, y: 3 }), TileType.EMPTY);
});

test('getCellAt returns wall for out of bounds', () => {
  const testGrid = createTestGrid(8, 8);
  const game = new GameState(testGrid);

  assert.strictEqual(
    game.getCellAt({ x: -1, y: 0 }),
    TileType.WALL_INDESTRUCTIBLE
  );
  assert.strictEqual(
    game.getCellAt({ x: game.width, y: 0 }),
    TileType.WALL_INDESTRUCTIBLE
  );
});

test('update removes old explosions', () => {
  const testGrid = createTestGrid(8, 8);
  const game = new GameState(testGrid);
  game.placeBomb({ x: 2, y: 2 });
  const bomb = game.bombs[0];
  game.explodeBomb(bomb);

  const explosionCount = game.explosions.size;
  assert.ok(explosionCount > 0);

  const futureTime = Date.now() + EXPLOSION_DURATION + 100;
  game.update(futureTime);

  assert.strictEqual(game.explosions.size, 0);
});

test('update removes expired bombs', () => {
  const testGrid = createTestGrid(8, 8);
  const game = new GameState(testGrid);
  game.placeBomb({ x: 2, y: 2 });
  const bomb = game.bombs[0];

  game.explodeBomb(bomb);
  assert.strictEqual(game.bombs.length, 1);

  const futureTime = Date.now() + EXPLOSION_DURATION + 100;
  game.update(futureTime);

  assert.strictEqual(game.bombs.length, 0);
});

test('createPlayers - creates two players at spawn locations', () => {
  const [player1, player2] = createPlayers();
  assert.strictEqual(player1.id, 1);
  assert.strictEqual(player1.x, 1);
  assert.strictEqual(player1.y, 1);
  assert.strictEqual(player2.id, 2);
  assert.strictEqual(player2.x, 11);
  assert.strictEqual(player2.y, 11);
});

test('canMoveTo - returns true for empty tiles', () => {
  const grid = createEmptyTestGrid();
  assert.ok(canMoveTo(grid, 1, 1), 'player spawn is empty');
  assert.ok(canMoveTo(grid, 2, 1), 'adjacent to spawn is empty');
  assert.ok(canMoveTo(grid, 1, 2), 'adjacent to spawn is empty');
});

test('canMoveTo - returns false for indestructible walls', () => {
  const grid = createMapGrid();
  assert.ok(!canMoveTo(grid, 0, 0), 'border wall blocks movement');
  assert.ok(!canMoveTo(grid, 0, 5), 'border wall blocks movement');
  assert.ok(!canMoveTo(grid, 12, 12), 'border wall blocks movement');
  assert.ok(!canMoveTo(grid, 2, 2), 'pillar wall blocks movement');
});

test('canMoveTo - returns false for destructible walls', () => {
  const grid = createMapGrid();
  let destructibleFound = false;
  for (let row = 1; row < grid.height - 1; row++) {
    for (let col = 1; col < grid.width - 1; col++) {
      if (grid.tiles[row][col] === TileType.WALL_DESTRUCTIBLE) {
        assert.ok(!canMoveTo(grid, col, row), `destructible wall at (${col}, ${row}) blocks movement`);
        destructibleFound = true;
        break;
      }
    }
    if (destructibleFound) break;
  }
  assert.ok(destructibleFound, 'grid contains destructible walls for testing');
});

test('canMoveTo - returns false for out of bounds', () => {
  const grid = createMapGrid();
  assert.ok(!canMoveTo(grid, -1, 5), 'negative x is out of bounds');
  assert.ok(!canMoveTo(grid, 5, -1), 'negative y is out of bounds');
  assert.ok(!canMoveTo(grid, 13, 5), 'x >= width is out of bounds');
  assert.ok(!canMoveTo(grid, 5, 13), 'y >= height is out of bounds');
});

test('movePlayer - moves to empty tile', () => {
  const grid = createEmptyTestGrid();
  const player: { id: 1 | 2; x: number; y: number } = { id: 1, x: 1, y: 1 };
  movePlayer(player, 1, 0, grid);
  assert.strictEqual(player.x, 2);
  assert.strictEqual(player.y, 1);
});

test('movePlayer - moves in all four directions', () => {
  const grid = createEmptyTestGrid();
  const player: { id: 1 | 2; x: number; y: number } = { id: 1, x: 5, y: 5 };

  movePlayer(player, 0, -1, grid);
  assert.strictEqual(player.y, 4, 'moves up');

  movePlayer(player, 0, 1, grid);
  assert.strictEqual(player.y, 5, 'moves down');

  movePlayer(player, -1, 0, grid);
  assert.strictEqual(player.x, 4, 'moves left');

  movePlayer(player, 1, 0, grid);
  assert.strictEqual(player.x, 5, 'moves right');
});

test('movePlayer - does not move into walls', () => {
  const grid = createMapGrid();
  const player: { id: 1 | 2; x: number; y: number } = { id: 1, x: 1, y: 1 };

  movePlayer(player, -1, 0, grid);
  assert.strictEqual(player.x, 1, 'does not move into border wall');
  assert.strictEqual(player.y, 1);
});

test('movePlayer - does not move out of bounds', () => {
  const grid = createEmptyTestGrid();
  const player: { id: 1 | 2; x: number; y: number } = { id: 2, x: 11, y: 11 };

  movePlayer(player, 1, 0, grid);
  assert.strictEqual(player.x, 11, 'does not move out of bounds right');

  movePlayer(player, 0, 1, grid);
  assert.strictEqual(player.y, 11, 'does not move out of bounds down');
});

test('movePlayer - player 2 can move on default grid', () => {
  const grid = createEmptyTestGrid();
  const player: { id: 1 | 2; x: number; y: number } = { id: 2, x: 11, y: 11 };

  movePlayer(player, 0, -1, grid);
  assert.strictEqual(player.y, 10, 'player 2 can move up');

  movePlayer(player, 1, 0, grid);
  assert.strictEqual(player.x, 11, 'player 2 stays in bounds when moving right from edge');
});
