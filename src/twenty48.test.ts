import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addTwenty48Tile,
  canMoveTwenty48,
  createTwenty48Board,
  hasWonTwenty48,
  mergeTwenty48Line,
  moveTwenty48,
  loadTwenty48Session,
  saveTwenty48Session,
  shouldConfirmTwenty48Reset,
  formatTwenty48Tile,
  loadTwenty48Base,
  loadTwenty48Best,
  saveTwenty48Base,
  saveTwenty48Best,
  TWENTY48_BASES,
  twenty48Goal,
  twenty48TileLevel,
  Twenty48Game,
  type Twenty48Direction,
} from './twenty48.js';
import { translateArcadeText } from './i18n.js';

function seeded(seed: number): () => number {
  let state = seed;
  return () => { state = (state * 16807) % 2147483647; return state / 2147483647; };
}

function memoryStorage(): { getItem(key: string): string | null; setItem(key: string, value: string): void } {
  const values = new Map<string, string>();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } };
}

test('2048 starts with exactly two tiles', () => {
  const values = [0, 0, 0.99, 0.95];
  const board = createTwenty48Board(() => values.shift() ?? 0);
  assert.equal(board.filter(Boolean).length, 2);
  assert.equal(board[0], 2);
  assert.equal(board[15], 4);
});

test('2048 asks before discarding an active run with completed moves', () => {
  assert.equal(shouldConfirmTwenty48Reset('playing', 0), false);
  assert.equal(shouldConfirmTwenty48Reset('playing', 1), true);
  assert.equal(shouldConfirmTwenty48Reset('won', 12), false);
  assert.equal(shouldConfirmTwenty48Reset('over', 12), false);
});

test('line merging combines each tile only once', () => {
  assert.deepEqual(mergeTwenty48Line([2, 2, 2, 2]), { line: [4, 4, 0, 0], gained: 8 });
  assert.deepEqual(mergeTwenty48Line([4, 0, 4, 4]), { line: [8, 4, 0, 0], gained: 8 });
  assert.deepEqual(mergeTwenty48Line([2, 2, 4, 0]), { line: [4, 4, 0, 0], gained: 4 });
});

test('moves work in every direction without mutating the input', () => {
  const board = [
    2, 0, 2, 0,
    0, 4, 0, 4,
    2, 0, 2, 0,
    0, 0, 0, 0,
  ];
  const original = [...board];
  assert.deepEqual(moveTwenty48(board, 'left').board, [4, 0, 0, 0, 8, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(moveTwenty48(board, 'right').board, [0, 0, 0, 4, 0, 0, 0, 8, 0, 0, 0, 4, 0, 0, 0, 0]);
  assert.deepEqual(moveTwenty48(board, 'up').board, [4, 4, 4, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(moveTwenty48(board, 'down').board, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 4, 4, 4]);
  assert.deepEqual(board, original);
});

test('a random tile is added only to an empty cell', () => {
  const board = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2, 4, 8, 16, 0, 32];
  assert.deepEqual(addTwenty48Tile(board, () => 0), [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2, 4, 8, 16, 2, 32]);
});

test('move detection distinguishes game over, available merges, and victory', () => {
  const stuck = [2, 4, 2, 4, 4, 2, 4, 2, 2, 4, 2, 4, 4, 2, 4, 2];
  const mergeAvailable = [...stuck];
  mergeAvailable[1] = 2;
  assert.equal(canMoveTwenty48(stuck), false);
  assert.equal(canMoveTwenty48(mergeAvailable), true);
  assert.equal(hasWonTwenty48([...stuck.slice(0, 15), 2048]), true);
});

test('game tracks score, win pause, continuation, and game-over state', () => {
  const game = new Twenty48Game(() => 0);
  game.board = [1024, 1024, 2, 4, 8, 16, 32, 64, 128, 256, 0, 0, 4, 8, 0, 0];
  const move = game.move('left');
  assert.equal(move.gained, 2048);
  assert.equal(game.score, 2048);
  assert.equal(game.phase, 'won');
  game.continueAfterWin();
  assert.equal(game.phase, 'playing');

  game.board = [2, 4, 2, 4, 4, 2, 4, 2, 2, 4, 2, 4, 4, 2, 4, 2];
  game.move('left');
  assert.equal(game.phase, 'over');
});

test('casual undo restores exactly one previous move', () => {
  const game = new Twenty48Game(() => 0);
  game.board = [2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const before = [...game.board];
  game.move('left');
  assert.equal(game.canUndo(), true);
  assert.equal(game.undo(), true);
  assert.deepEqual(game.board, before);
  assert.equal(game.score, 0);
  assert.equal(game.undo(), false);
});

test('unfinished 2048 sessions persist board, score, moves, and active time', () => {
  const storage = memoryStorage();
  const game = new Twenty48Game(() => 0);
  game.board = [2, 4, 8, 16, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  game.score = 320;
  game.movesMade = 12;
  game.elapsedMs = 42_500;
  saveTwenty48Session(game.session(), storage);
  assert.deepEqual(loadTwenty48Session(storage), game.session());
  storage.setItem('blast-arcade-2048-session-v1', '{broken');
  assert.equal(loadTwenty48Session(storage), null);
});

test('prime bases merge equal pairs into the next power and spawn the base or its square', () => {
  assert.deepEqual(mergeTwenty48Line([3, 3, 9, 9], 3).line, [9, 27, 0, 0]);
  assert.deepEqual(mergeTwenty48Line([7, 7, 7, 0], 7).line, [49, 7, 0, 0]);
  assert.deepEqual(mergeTwenty48Line([5, 25, 5, 25], 5).line, [5, 25, 5, 25], 'unequal tiles never merge');
  const empty = Array<number>(16).fill(0);
  assert.equal(addTwenty48Tile(empty, () => 0, 5)[0], 5);
  const rolls = [0, 0.95];
  assert.equal(addTwenty48Tile(empty, () => rolls.shift() ?? 0, 5)[0], 25);
  assert.equal(createTwenty48Board(() => 0, 7).filter(value => value === 7).length, 2);
});

test('every base aims for its 11th power, as hard as reaching 2048', () => {
  assert.deepEqual(TWENTY48_BASES.map(base => twenty48Goal(base)), [2048, 177_147, 48_828_125, 1_977_326_743]);
  assert.equal(twenty48TileLevel(343, 7), 3);
  assert.equal(twenty48TileLevel(6, 3), 0, 'not a power of three');
  assert.equal(twenty48TileLevel(1, 2), 0, 'one is never a tile');
  // The biggest tile a 4x4 board can hold is the 17th power; it must stay an exact integer.
  assert.ok(Number.isSafeInteger(7 ** 17));
  const game = new Twenty48Game(() => 0, 5);
  game.board = [5 ** 10, 5 ** 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  game.move('left');
  assert.equal(game.board[0], 48_828_125);
  assert.equal(game.phase, 'won');
});

test('a prime base plays exactly like classic 2048, move for move and point for point', () => {
  for (const base of [3, 5, 7] as const) {
    const classic = new Twenty48Game(seeded(21), 2);
    const prime = new Twenty48Game(seeded(21), base);
    const pick = seeded(5);
    const directions: Twenty48Direction[] = ['left', 'up', 'right', 'down'];
    for (let turn = 0; turn < 400 && classic.phase === 'playing'; turn++) {
      const direction = directions[Math.floor(pick() * 4)];
      classic.move(direction);
      prime.move(direction);
      assert.deepEqual(prime.board.map(value => twenty48TileLevel(value, base)), classic.board.map(value => twenty48TileLevel(value, 2)));
    }
    assert.ok(classic.movesMade > 50, 'the run was long enough to mean something');
    assert.equal(prime.score, classic.score, `base ${base} scores like classic`);
    assert.equal(prime.phase, classic.phase);
  }
});

test('long tile values are shortened to fit a phone tile, never rounded up', () => {
  assert.equal(formatTwenty48Tile(2048), '2048');
  assert.equal(formatTwenty48Tile(59_049), '59049');
  assert.equal(formatTwenty48Tile(177_147), '177K');
  assert.equal(formatTwenty48Tile(1_594_323), '1.5M');
  assert.equal(formatTwenty48Tile(48_828_125), '48M');
  assert.equal(formatTwenty48Tile(1_977_326_743), '1.9B');
  assert.equal(formatTwenty48Tile(7 ** 17), '232T');
  for (const base of TWENTY48_BASES) {
    for (let level = 1; level <= 17; level++) assert.ok(formatTwenty48Tile(base ** level).length <= 5, `${base}^${level}`);
  }
});

test('the chosen base, its saved run and its best score are kept separately', () => {
  const storage = memoryStorage();
  assert.equal(loadTwenty48Base(storage), 2, 'classic by default');
  saveTwenty48Base(7, storage);
  assert.equal(loadTwenty48Base(storage), 7);
  storage.setItem('blast-arcade-2048-base-v1', '4');
  assert.equal(loadTwenty48Base(storage), 2, 'four is not an offered base');

  saveTwenty48Best(900, storage, 2);
  saveTwenty48Best(300, storage, 3);
  assert.equal(loadTwenty48Best(storage, 2), 900);
  assert.equal(loadTwenty48Best(storage, 3), 300);
  assert.equal(storage.getItem('blast-arcade-2048-best-v1'), '900', 'the classic record keeps its old key');

  const game = new Twenty48Game(() => 0, 7);
  game.board[5] = 343;
  saveTwenty48Session(game.session(), storage);
  const restored = new Twenty48Game(() => 0, 2);
  restored.restore(loadTwenty48Session(storage)!);
  assert.equal(restored.base, 7);
  assert.deepEqual(restored.board, game.board);
});

test('saves from before bases existed load as classic, and mismatched tiles are refused', () => {
  const storage = memoryStorage();
  const old = { version: 1, board: [2, 4, ...Array(14).fill(0)], score: 4, phase: 'playing', movesMade: 1, elapsedMs: 0, victoryAcknowledged: false };
  storage.setItem('blast-arcade-2048-session-v1', JSON.stringify(old));
  assert.equal(loadTwenty48Session(storage)?.base, 2);
  storage.setItem('blast-arcade-2048-session-v1', JSON.stringify({ ...old, base: 3 }));
  assert.equal(loadTwenty48Session(storage), null, 'a 2 or 4 tile cannot be in a powers-of-3 game');
  storage.setItem('blast-arcade-2048-session-v1', JSON.stringify({ ...old, base: 9, board: [9, ...Array(15).fill(0)] }));
  assert.equal(loadTwenty48Session(storage), null, 'nine is not an offered base');
});

test('the new goals are translated to Romanian', () => {
  assert.equal(translateArcadeText('You made 177,147!', 'ro'), 'Ai format 177,147!');
  assert.equal(translateArcadeText('Join equal numbers. Build 48,828,125.', 'ro'), 'Unește numere egale. Construiește 48,828,125.');
  assert.equal(translateArcadeText('Powers of 7 — merge your way to 1,977,326,743.', 'ro'), 'Puteri ale lui 7 — combină până ajungi la 1,977,326,743.');
  assert.equal(translateArcadeText('177,147 reached — keep building your high score!', 'ro'), 'Ai ajuns la 177,147 — continuă să-ți mărești recordul!');
  assert.equal(translateArcadeText('Tiles', 'ro'), 'Piese');
});
