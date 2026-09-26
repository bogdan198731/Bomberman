import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LEVEL_STORAGE_KEY, loadLevel, normalizeLevel, saveLevel } from './levels.js';
import { BOMBERMAN_LEVELS, EXPLOSION_RADIUS, TileType, createMapGrid } from './index.js';
import { OnlineRoom } from './multiplayer.js';
import { NeonSnakeGame, SNAKE_COLUMNS, SNAKE_LEVELS, SNAKE_ROWS, snakeWallKeys } from './snake.js';
import {
  MiniTanksGame,
  TANK_ARENA_HEIGHT,
  TANK_ARENA_WIDTH,
  TANK_LEVELS,
  tankLevelObstacles,
  type TankObstacle,
} from './tanks.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function memoryStorage(seed: Record<string, string> = {}) {
  const store = new Map(Object.entries(seed));
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    store,
  };
}

// ---------------------------------------------------------------- shared

test('levels are 1-based and anything unknown falls back to the first', () => {
  assert.equal(normalizeLevel(3, 4), 3);
  assert.equal(normalizeLevel('2', 4), 2, 'select values arrive as strings');
  for (const junk of [0, 5, -1, 1.5, NaN, null, undefined, 'x', {}]) {
    assert.equal(normalizeLevel(junk, 4), 1, `${String(junk)} should become level 1`);
  }
});

test('each game remembers its own level independently', () => {
  const storage = memoryStorage();
  assert.equal(loadLevel('snake', 4, storage), 1, 'first visit starts on level 1');
  saveLevel('snake', 3, 4, storage);
  saveLevel('tanks', 2, 4, storage);
  assert.equal(loadLevel('snake', 4, storage), 3);
  assert.equal(loadLevel('tanks', 4, storage), 2);
  assert.equal(loadLevel('bomberman', 4, storage), 1, 'untouched games keep the default');

  storage.store.set(LEVEL_STORAGE_KEY, 'not json');
  assert.equal(loadLevel('snake', 4, storage), 1, 'corrupt storage never breaks a game');
  const throwing = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(saveLevel('tanks', 4, 4, throwing), 4, 'the level still applies without storage');
});

test('every level has a picker and Romanian names', () => {
  for (const id of ['bombermanLevel', 'snakeLevel', 'tanksLevel']) {
    assert.match(html, new RegExp(`<select id="${id}"`), `${id} picker exists`);
  }
  const i18n = readFileSync(new URL('../src/i18n.ts', import.meta.url), 'utf8');
  const labels = [
    ...BOMBERMAN_LEVELS.map((level, index) => `${index + 1} · ${level.name}`),
    ...SNAKE_LEVELS.map((level, index) => `${index + 1} · ${level.name}`),
    ...TANK_LEVELS.map((level, index) => `${index + 1} · ${level.name}`),
  ];
  for (const label of labels) assert.ok(i18n.includes(`'${label}':`), `missing translation for "${label}"`);
});

// ------------------------------------------------------------- Blast Buddies

function reachable(grid: ReturnType<typeof createMapGrid>, from: [number, number], to: [number, number]): boolean {
  const seen = new Set<string>([from.join()]);
  const queue = [from];
  while (queue.length) {
    const [x, y] = queue.shift()!;
    if (x === to[0] && y === to[1]) return true;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      // Crates can be blasted, so only indestructible walls truly block a route.
      if (grid.tiles[ny]?.[nx] === undefined || grid.tiles[ny][nx] === TileType.WALL_INDESTRUCTIBLE) continue;
      if (seen.has(`${nx},${ny}`)) continue;
      seen.add(`${nx},${ny}`);
      queue.push([nx, ny]);
    }
  }
  return false;
}

test('Classic is exactly the map players already know', () => {
  // The original generator, verbatim, so the default level can never drift.
  const original = (width = 13, height = 13): TileType[][] => {
    const tiles: TileType[][] = Array(height).fill(null).map(() => Array(width).fill(TileType.EMPTY));
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const isEdge = row === 0 || row === height - 1 || col === 0 || col === width - 1;
        const isPillar = row % 2 === 0 && col % 2 === 0 && row > 0 && row < height - 1;
        if (isEdge || isPillar) tiles[row][col] = TileType.WALL_INDESTRUCTIBLE;
      }
    }
    for (let row = 1; row < height - 1; row++) {
      for (let col = 1; col < width - 1; col++) {
        if (tiles[row][col] !== TileType.EMPTY) continue;
        const nearOne = row - 1 + (col - 1) <= EXPLOSION_RADIUS + 1;
        const nearTwo = height - 2 - row + (width - 2 - col) <= EXPLOSION_RADIUS + 1;
        if (!nearOne && !nearTwo && (row * 17 + col * 31) % 10 < 6) tiles[row][col] = TileType.WALL_DESTRUCTIBLE;
      }
    }
    return tiles;
  };
  assert.deepEqual(createMapGrid().tiles, original(), 'the default map is unchanged');
  assert.deepEqual(createMapGrid(13, 13, 1).tiles, original());
});

test('every Blast Buddies map is fair and playable', () => {
  BOMBERMAN_LEVELS.forEach((level, index) => {
    const grid = createMapGrid(13, 13, index + 1);
    for (let row = 1; row < 12; row++) {
      for (let col = 1; col < 12; col++) {
        // Pillars have always stood near the spawns; crates never have, or a
        // player could be boxed in before the first bomb.
        const nearSpawn = row - 1 + (col - 1) <= EXPLOSION_RADIUS + 1 || 11 - row + (11 - col) <= EXPLOSION_RADIUS + 1;
        if (nearSpawn) assert.notEqual(grid.tiles[row][col], TileType.WALL_DESTRUCTIBLE, `${level.name}: crate in spawn zone at ${col},${row}`);
      }
    }
    // Each spawn needs its tile and both escape routes open.
    for (const [x, y] of [[1, 1], [2, 1], [1, 2], [11, 11], [10, 11], [11, 10]]) {
      assert.equal(grid.tiles[y][x], TileType.EMPTY, `${level.name}: ${x},${y} must be open`);
    }
    assert.ok(reachable(grid, [1, 1], [11, 11]), `${level.name}: the players must be able to reach each other`);
  });
});

test('the maps actually differ in the way their names promise', () => {
  const crates = (level: number): number =>
    createMapGrid(13, 13, level).tiles.flat().filter(tile => tile === TileType.WALL_DESTRUCTIBLE).length;
  assert.ok(crates(2) < crates(1), 'Open Field has fewer crates than Classic');
  assert.ok(crates(3) > crates(1), 'Crate Maze has more crates than Classic');

  const crossroads = createMapGrid(13, 13, 4);
  for (let i = 1; i < 12; i++) {
    assert.equal(crossroads.tiles[6][i], TileType.EMPTY, `Crossroads centre row is open at ${i}`);
    assert.equal(crossroads.tiles[i][6], TileType.EMPTY, `Crossroads centre column is open at ${i}`);
  }
});

test('a room plays the map it was created with, defaulting to Classic', () => {
  assert.equal(new OnlineRoom('A').level, 1);
  assert.equal(new OnlineRoom('B', 3).level, 3);
  assert.equal(new OnlineRoom('C', Number(undefined)).level, 1, 'a message with no level gets Classic');
  assert.equal(new OnlineRoom('D', 99).level, 1, 'a tampered level is rejected');

  const room = new OnlineRoom('E', 4);
  room.connectPlayer(1, 0);
  room.connectPlayer(2, 0);
  assert.deepEqual(room.snapshot(0).grid.tiles, createMapGrid(13, 13, 4).tiles, 'the round uses the chosen map');
});

// --------------------------------------------------------------- Neon Snake

const spawnLane = (): string[] => {
  const cells: string[] = [];
  // Both bodies plus a few cells ahead of each head, all on row 8.
  for (let x = 3; x <= 8; x++) cells.push(`${x},8`);
  for (let x = 15; x <= 20; x++) cells.push(`${x},8`);
  return cells;
};

test('every snake arena keeps the spawns and their first moves clear', () => {
  SNAKE_LEVELS.forEach((level, index) => {
    const walls = snakeWallKeys(index + 1);
    level.walls.forEach(cell => {
      assert.ok(cell.x >= 0 && cell.x < SNAKE_COLUMNS && cell.y >= 0 && cell.y < SNAKE_ROWS, `${level.name}: wall in bounds`);
    });
    spawnLane().forEach(key => assert.ok(!walls.has(key), `${level.name}: ${key} must stay open`));
  });
});

test('no snake arena has sealed-off pockets where food could be unreachable', () => {
  SNAKE_LEVELS.forEach((level, index) => {
    const walls = snakeWallKeys(index + 1);
    const open = SNAKE_COLUMNS * SNAKE_ROWS - walls.size;
    const seen = new Set(['5,8']);
    const queue: [number, number][] = [[5, 8]];
    while (queue.length) {
      const [x, y] = queue.shift()!;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        const key = `${nx},${ny}`;
        if (nx < 0 || ny < 0 || nx >= SNAKE_COLUMNS || ny >= SNAKE_ROWS || walls.has(key) || seen.has(key)) continue;
        seen.add(key);
        queue.push([nx, ny]);
      }
    }
    assert.equal(seen.size, open, `${level.name}: every open cell is reachable`);
  });
});

test('food never spawns inside a wall', () => {
  let seed = 7;
  const random = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  SNAKE_LEVELS.forEach((level, index) => {
    if (!level.walls.length) return;
    const game = new NeonSnakeGame(random, index + 1);
    for (let i = 0; i < 400; i++) {
      game.restart('solo');
      assert.ok(!game.isWall(game.food), `${level.name}: food landed on a wall at ${game.food.x},${game.food.y}`);
    }
  });
});

test('driving into an arena wall ends the run', () => {
  const game = new NeonSnakeGame(() => 0.5, 2); // Pillars: a block at x 5-6, y 3-4
  game.restart('solo');
  game.riders[1].body = [{ x: 5, y: 6 }, { x: 5, y: 7 }, { x: 5, y: 8 }];
  game.riders[1].direction = 'up';
  game.riders[1].queuedDirection = 'up';
  game.food = { x: 20, y: 14 };
  game.start();
  game.tick(); // into 5,5 - still open
  assert.equal(game.riders[1].alive, true);
  game.tick(); // into 5,4 - a wall
  assert.equal(game.riders[1].alive, false);
  assert.equal(game.collisionCause, 'wall');
  assert.equal(game.phase, 'finished');
});

test('switching arena restarts on the new layout', () => {
  const game = new NeonSnakeGame(() => 0.5);
  assert.equal(game.level, 1);
  assert.equal(game.isWall({ x: 5, y: 3 }), false);
  game.setLevel(2);
  assert.equal(game.level, 2);
  assert.equal(game.isWall({ x: 5, y: 3 }), true);
  assert.equal(game.phase, 'ready');
  game.setLevel(42);
  assert.equal(game.level, 1, 'an unknown arena falls back to Open Arena');
});

// ---------------------------------------------------------------- Mini Tanks

const TANK = 34;
const blocksTank = (x: number, y: number, obstacles: readonly TankObstacle[]): boolean => {
  const half = TANK / 2;
  if (x < half || y < half || x > TANK_ARENA_WIDTH - half || y > TANK_ARENA_HEIGHT - half) return true;
  return obstacles.some(o => x + half > o.x && x - half < o.x + o.width && y + half > o.y && y - half < o.y + o.height);
};

test('every tank arena is in bounds and keeps both spawns clear', () => {
  TANK_LEVELS.forEach(level => {
    level.obstacles.forEach(o => {
      assert.ok(o.x >= 0 && o.y >= 0 && o.x + o.width <= TANK_ARENA_WIDTH && o.y + o.height <= TANK_ARENA_HEIGHT,
        `${level.name}: obstacle inside the arena`);
    });
    assert.ok(!blocksTank(80, 300, level.obstacles), `${level.name}: Mint spawn is clear`);
    assert.ok(!blocksTank(820, 300, level.obstacles), `${level.name}: Coral spawn is clear`);
  });
});

test('in every tank arena the tanks can drive to each other without shooting', () => {
  const step = 10;
  TANK_LEVELS.forEach(level => {
    const seen = new Set(['80,300']);
    const queue: [number, number][] = [[80, 300]];
    let found = false;
    while (queue.length && !found) {
      const [x, y] = queue.shift()!;
      if (Math.abs(x - 820) <= step && Math.abs(y - 300) <= step) { found = true; break; }
      for (const [nx, ny] of [[x + step, y], [x - step, y], [x, y + step], [x, y - step]]) {
        const key = `${nx},${ny}`;
        if (seen.has(key) || blocksTank(nx, ny, level.obstacles)) continue;
        seen.add(key);
        queue.push([nx, ny]);
      }
    }
    assert.ok(found, `${level.name}: no drivable route between the spawns`);
  });
});

test('crates destroyed in one round are back for the next', () => {
  const first = tankLevelObstacles(4);
  first.splice(0, first.length);
  assert.equal(tankLevelObstacles(4).length, TANK_LEVELS[3].obstacles.length, 'each round gets a fresh copy');

  const game = new MiniTanksGame();
  game.setLevel(4);
  game.obstacles.pop();
  game.restart('bot');
  assert.equal(game.obstacles.length, TANK_LEVELS[3].obstacles.length);
  assert.equal(game.level, 4, 'restarting keeps the chosen arena');
});

test('the tank bot works its way around a wall instead of stalling behind it', () => {
  for (const pace of ['rookie', 'normal', 'ace'] as const) {
    const game = new MiniTanksGame();
    game.setLevel(3); // Crossfire: a steel spine at x 429-471, y 150-450
    game.setBotPace(pace);
    game.restart('bot');
    game.startRound();
    let crossed = false;
    for (let frame = 0; frame < 60 * 15 && game.phase === 'playing'; frame++) {
      game.update(1 / 60);
      if (game.tanks[2].x < 429) { crossed = true; break; }
    }
    assert.ok(
      crossed || game.roundWinner === 2,
      `${pace} bot never got past the wall (stuck at ${Math.round(game.tanks[2].x)},${Math.round(game.tanks[2].y)})`,
    );
  }
});
