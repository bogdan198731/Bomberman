import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createMapGrid, TileType, createPlayers, canMoveTo, movePlayer, killPlayer, getGameStatus, type MapGrid, type GameStatus } from './index.js';

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
  const player = { id: 1 as const, x: 1, y: 1, alive: true };
  movePlayer(player, 1, 0, grid);
  assert.strictEqual(player.x, 2);
  assert.strictEqual(player.y, 1);
});

test('movePlayer - moves in all four directions', () => {
  const grid = createEmptyTestGrid();
  const player = { id: 1 as const, x: 5, y: 5, alive: true };

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
  const player = { id: 1 as const, x: 1, y: 1, alive: true };

  movePlayer(player, -1, 0, grid);
  assert.strictEqual(player.x, 1, 'does not move into border wall');
  assert.strictEqual(player.y, 1);
});

test('movePlayer - does not move out of bounds', () => {
  const grid = createEmptyTestGrid();
  const player = { id: 2 as const, x: 11, y: 11, alive: true };

  movePlayer(player, 1, 0, grid);
  assert.strictEqual(player.x, 11, 'does not move out of bounds right');

  movePlayer(player, 0, 1, grid);
  assert.strictEqual(player.y, 11, 'does not move out of bounds down');
});

test('movePlayer - player 2 can move on default grid', () => {
  const grid = createEmptyTestGrid();
  const player = { id: 2 as const, x: 11, y: 11, alive: true };

  movePlayer(player, 0, -1, grid);
  assert.strictEqual(player.y, 10, 'player 2 can move up');

  movePlayer(player, 1, 0, grid);
  assert.strictEqual(player.x, 11, 'player 2 stays in bounds when moving right from edge');
});

test('killPlayer - marks player as dead', () => {
  const [player1, player2] = createPlayers();
  assert.strictEqual(player1.alive, true, 'player 1 starts alive');
  assert.strictEqual(player2.alive, true, 'player 2 starts alive');

  killPlayer(player1);
  assert.strictEqual(player1.alive, false, 'player 1 is dead after killPlayer');
  assert.strictEqual(player2.alive, true, 'player 2 remains alive');
});

test('getGameStatus - returns "playing" when both players are alive', () => {
  const players = createPlayers();
  const status: GameStatus = getGameStatus(players);
  assert.strictEqual(status, 'playing', 'game status is playing when both alive');
});

test('getGameStatus - returns "player1-wins" when player 2 dies', () => {
  const [player1, player2] = createPlayers();
  killPlayer(player2);
  const status: GameStatus = getGameStatus([player1, player2]);
  assert.strictEqual(status, 'player1-wins', 'player 1 wins when player 2 dies');
});

test('getGameStatus - returns "player2-wins" when player 1 dies', () => {
  const [player1, player2] = createPlayers();
  killPlayer(player1);
  const status: GameStatus = getGameStatus([player1, player2]);
  assert.strictEqual(status, 'player2-wins', 'player 2 wins when player 1 dies');
});

test('getGameStatus - returns "draw" when both players die', () => {
  const [player1, player2] = createPlayers();
  killPlayer(player1);
  killPlayer(player2);
  const status: GameStatus = getGameStatus([player1, player2]);
  assert.strictEqual(status, 'draw', 'game ends in draw when both die');
});

test('createPlayers - players start alive', () => {
  const [player1, player2] = createPlayers();
  assert.strictEqual(player1.alive, true, 'player 1 starts alive');
  assert.strictEqual(player2.alive, true, 'player 2 starts alive');
});
