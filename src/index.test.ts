import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  GameState,
  CellType,
  GRID_SIZE,
  BOMB_TIMER,
  EXPLOSION_DURATION,
} from './index.js';

test('GameState initializes with grid', () => {
  const game = new GameState();
  assert.strictEqual(game.grid.length, GRID_SIZE);
  assert.strictEqual(game.grid[0].length, GRID_SIZE);
});

test('GameState initializes with indestructible walls at odd positions', () => {
  const game = new GameState();
  for (let x = 1; x < GRID_SIZE; x += 2) {
    for (let y = 1; y < GRID_SIZE; y += 2) {
      assert.strictEqual(
        game.grid[x][y],
        CellType.IndestructibleWall,
        `Expected indestructible wall at (${x}, ${y})`
      );
    }
  }
});

test('placeBomb adds bomb to grid and game state', () => {
  const game = new GameState();
  game.grid[2][2] = CellType.Empty;
  const pos = { x: 2, y: 2 };
  const result = game.placeBomb(pos);

  assert.strictEqual(result, true);
  assert.strictEqual(game.grid[pos.x][pos.y], CellType.Bomb);
  assert.strictEqual(game.bombs.length, 1);
  assert.strictEqual(game.bombs[0].position.x, pos.x);
  assert.strictEqual(game.bombs[0].position.y, pos.y);
});

test('placeBomb fails on occupied cell', () => {
  const game = new GameState();
  game.grid[2][2] = CellType.Empty;
  const pos = { x: 2, y: 2 };

  game.placeBomb(pos);
  const result = game.placeBomb(pos);

  assert.strictEqual(result, false);
  assert.strictEqual(game.bombs.length, 1);
});

test('placeBomb fails on wall', () => {
  const game = new GameState();
  const pos = { x: 1, y: 1 };

  const result = game.placeBomb(pos);

  assert.strictEqual(result, false);
  assert.strictEqual(game.bombs.length, 0);
});

test('placeBomb fails on out of bounds', () => {
  const game = new GameState();
  const pos = { x: -1, y: 5 };

  const result = game.placeBomb(pos);

  assert.strictEqual(result, false);
});

test('placeBomb fails on second bomb in same cell', () => {
  const game = new GameState();
  game.grid[3][3] = CellType.Empty;
  const pos = { x: 3, y: 3 };

  const result1 = game.placeBomb(pos);
  const result2 = game.placeBomb(pos);

  assert.strictEqual(result1, true);
  assert.strictEqual(result2, false);
  assert.strictEqual(game.bombs.length, 1);
});

test('explodeBomb creates explosion at center', () => {
  const game = new GameState();
  game.grid[2][2] = CellType.Empty;
  game.placeBomb({ x: 2, y: 2 });

  const bomb = game.bombs[0];
  game.explodeBomb(bomb);

  assert.strictEqual(game.isExplosion(2, 2), true);
  assert.strictEqual(game.grid[2][2], CellType.Empty);
});

test('explodeBomb creates cross-shaped explosion', () => {
  const game = new GameState();
  for (let i = 0; i < 8; i++) {
    game.grid[4][i] = CellType.Empty;
    game.grid[i][4] = CellType.Empty;
  }
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
  const game = new GameState();
  for (let i = 0; i < 8; i++) {
    game.grid[i][2] = CellType.Empty;
  }
  game.grid[2][1] = CellType.Empty;
  game.grid[2][3] = CellType.Empty;
  game.placeBomb({ x: 2, y: 2 });

  const bomb = game.bombs[0];
  game.explodeBomb(bomb);

  assert.strictEqual(game.isExplosion(2, 2), true);
  assert.strictEqual(game.isExplosion(3, 2), true);
  assert.strictEqual(game.isExplosion(4, 2), true);
  assert.strictEqual(game.isExplosion(2, 3), true);
  assert.strictEqual(game.isExplosion(2, 1), true);
});

test('explodeBomb destroys destructible walls', () => {
  const game = new GameState();
  game.grid[3][4] = CellType.DestructibleWall;
  game.grid[2][4] = CellType.Empty;
  const pos = { x: 2, y: 4 };
  game.placeBomb(pos);

  const bomb = game.bombs[0];
  game.explodeBomb(bomb);

  assert.strictEqual(game.grid[3][4], CellType.Empty);
  assert.strictEqual(game.isExplosion(3, 4), true);
});

test('explodeBomb stops at destructible wall', () => {
  const game = new GameState();
  game.grid[4][4] = CellType.DestructibleWall;
  game.grid[5][4] = CellType.Empty;
  game.grid[2][4] = CellType.Empty;
  game.grid[3][4] = CellType.Empty;

  game.placeBomb({ x: 2, y: 4 });

  const bomb = game.bombs[0];
  game.explodeBomb(bomb);

  assert.strictEqual(game.isExplosion(4, 4), true);
  assert.strictEqual(game.isExplosion(5, 4), false);
});

test('explodeBomb chain reaction', () => {
  const game = new GameState();
  game.grid[2][2] = CellType.Empty;
  game.grid[3][2] = CellType.Empty;
  game.grid[4][2] = CellType.Empty;

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
  const game = new GameState();
  game.grid[2][2] = CellType.DestructibleWall;

  assert.strictEqual(game.getCellAt({ x: 2, y: 2 }), CellType.DestructibleWall);
  assert.strictEqual(game.getCellAt({ x: 0, y: 0 }), CellType.Empty);
});

test('getCellAt returns wall for out of bounds', () => {
  const game = new GameState();

  assert.strictEqual(
    game.getCellAt({ x: -1, y: 0 }),
    CellType.IndestructibleWall
  );
  assert.strictEqual(
    game.getCellAt({ x: GRID_SIZE, y: 0 }),
    CellType.IndestructibleWall
  );
});

test('update removes old explosions', () => {
  const game = new GameState();
  game.grid[2][2] = CellType.Empty;
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
  const game = new GameState();
  game.grid[2][2] = CellType.Empty;
  game.placeBomb({ x: 2, y: 2 });
  const bomb = game.bombs[0];

  game.explodeBomb(bomb);
  assert.strictEqual(game.bombs.length, 1);

  const futureTime = Date.now() + EXPLOSION_DURATION + 100;
  game.update(futureTime);

  assert.strictEqual(game.bombs.length, 0);
});
