import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createMapGrid, TileType } from './index.js';

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
