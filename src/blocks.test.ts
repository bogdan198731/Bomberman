import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyBlockDropSnapshot,
  BLOCK_BOARD_HEIGHT,
  BLOCK_BOARD_WIDTH,
  BlockDropGame,
  createBlockDropSnapshot,
  pieceCells,
} from './blocks.js';

test('Block Drop starts with two empty ten-by-twenty boards', () => {
  const game = new BlockDropGame(() => 0);
  assert.equal(game.mode, 'bot');
  assert.equal(game.phase, 'ready');
  assert.equal(game.boards[1].length, BLOCK_BOARD_HEIGHT);
  assert.equal(game.boards[1][0].length, BLOCK_BOARD_WIDTH);
  assert.equal(game.boards[1].flat().every(cell => cell === null), true);
  assert.equal(game.active[1].type, game.active[2].type);
});

test('players receive the same deterministic piece sequence', () => {
  const game = new BlockDropGame(() => .72);
  game.restart('duel');
  game.start();
  for (let index = 0; index < 5; index += 1) {
    assert.equal(game.active[1].type, game.active[2].type);
    game.hardDrop(1);
    game.hardDrop(2);
  }
});

test('a falling piece moves and rotates only into legal cells', () => {
  const game = new BlockDropGame(() => 0);
  game.restart('duel');
  game.start();
  const startX = game.active[1].x;
  assert.equal(game.move(1, -1), true);
  assert.equal(game.active[1].x, startX - 1);
  assert.equal(game.rotate(1), true);
  while (game.move(1, -1)) { /* reach the wall */ }
  assert.equal(game.move(1, -1), false);
  assert.ok(pieceCells(game.active[1]).every(([x]) => game.active[1].x + x >= 0));
});

test('hard drop locks a piece and spawns the next one', () => {
  const game = new BlockDropGame(() => 0);
  game.restart('duel');
  game.start();
  const pieceId = game.active[1].id;
  assert.equal(game.hardDrop(1), true);
  assert.notEqual(game.active[1].id, pieceId);
  assert.equal(game.boards[1].flat().filter(Boolean).length, 4);
  assert.ok(game.scores[1] > 0);
});

test('automatic gravity moves pieces without awarding soft-drop points', () => {
  const game = new BlockDropGame(() => 0);
  game.restart('duel');
  game.start();
  game.update(.25); game.update(.25); game.update(.25);
  assert.equal(game.active[1].y, 1);
  assert.equal(game.scores[1], 0);
});

test('cleared lines queue garbage against the opponent', () => {
  const game = new BlockDropGame(() => 0);
  game.restart('duel');
  game.start();
  game.active[1] = { id: 99, type: 'O', rotation: 0, x: 0, y: 0 };
  for (let column = 2; column < BLOCK_BOARD_WIDTH; column += 1) game.boards[1][BLOCK_BOARD_HEIGHT - 1][column] = 'G';
  game.hardDrop(1);
  assert.equal(game.lines[1], 1);
  assert.equal(game.pendingGarbage[2], 1);
});

test('queued garbage arrives with one playable hole after the rival locks', () => {
  const game = new BlockDropGame(() => 0);
  game.restart('duel');
  game.start();
  game.pendingGarbage[2] = 2;
  game.hardDrop(2);
  const garbageRows = game.boards[2].slice(-2);
  assert.equal(garbageRows.length, 2);
  assert.equal(garbageRows.every(row => row.filter(cell => cell === null).length === 1), true);
  assert.equal(garbageRows.every(row => row.filter(cell => cell === 'G').length === 9), true);
});

test('counter-clears cancel incoming garbage before it lands', () => {
  const game = new BlockDropGame(() => 0);
  game.restart('duel');
  game.start();
  game.pendingGarbage[1] = 1;
  game.active[1] = { id: 99, type: 'O', rotation: 0, x: 0, y: 0 };
  for (let column = 2; column < BLOCK_BOARD_WIDTH; column += 1) game.boards[1][BLOCK_BOARD_HEIGHT - 1][column] = 'G';
  game.hardDrop(1);
  assert.equal(game.pendingGarbage[1], 0);
  assert.equal(game.pendingGarbage[2], 0);
  assert.equal(game.boards[1][BLOCK_BOARD_HEIGHT - 1].some(cell => cell === 'G'), false);
});

test('a blocked spawn tops out and awards the duel to the rival', () => {
  const game = new BlockDropGame(() => 0);
  game.restart('duel');
  game.start();
  game.boards[1][0].fill('G');
  assert.equal(game.spawnPiece(1), false);
  assert.equal(game.phase, 'finished');
  assert.equal(game.winner, 2);
});

test('the Coral bot evaluates and locks pieces on its board', () => {
  const game = new BlockDropGame(() => .4);
  game.start();
  game.update(.25);
  game.update(.25);
  game.update(.25);
  assert.ok(game.boards[2].flat().some(cell => cell !== null));
});

test('the Coral bot can finish a complete duel against an idle player', () => {
  let seed = 12_345;
  const random = (): number => ((seed = (seed * 1_664_525 + 1_013_904_223) >>> 0) / 4_294_967_296);
  const game = new BlockDropGame(random);
  game.start();
  for (let tick = 0; tick < 2_000 && game.phase === 'playing'; tick += 1) game.update(.05);
  assert.equal(game.phase, 'finished');
  assert.equal(game.winner, 2);
  assert.ok(game.lines[2] > 0);
});

test('online snapshots restore both battle boards and attack queues', () => {
  const host = new BlockDropGame(() => .3);
  host.restart('duel');
  host.start();
  host.hardDrop(1);
  host.pendingGarbage[2] = 3;
  const encoded = JSON.stringify(createBlockDropSnapshot(host));

  const guest = new BlockDropGame(() => .8);
  applyBlockDropSnapshot(guest, JSON.parse(encoded));
  assert.equal(guest.mode, 'duel');
  assert.equal(guest.phase, 'playing');
  assert.equal(guest.pendingGarbage[2], 3);
  assert.deepEqual(guest.boards[1], host.boards[1]);
});
