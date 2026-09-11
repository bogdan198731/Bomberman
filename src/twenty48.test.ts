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
  Twenty48Game,
} from './twenty48.js';

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
