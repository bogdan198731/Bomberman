import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FOUR_COLUMNS,
  FOUR_ROWS,
  FourInARowGame,
  chooseFourMove,
  landingCell,
  winningLine,
  type FourDisc,
} from './fourrow.js';

const empty = (): FourDisc[] => Array(FOUR_COLUMNS * FOUR_ROWS).fill(0);
const at = (row: number, column: number): number => row * FOUR_COLUMNS + column;

/** Full board with no four in a row anywhere (checked independently). */
const DRAW_ROWS = ['1122112', '2211221', '1122112', '2211221', '1122112', '2211221'];

function seeded(seed = 5): () => number {
  let state = seed;
  return () => { state = (state * 16807) % 2147483647; return state / 2147483647; };
}

test('discs land on the lowest open cell and full columns refuse more', () => {
  const board = empty();
  assert.equal(landingCell(board, 3), at(5, 3));
  board[at(5, 3)] = 1;
  assert.equal(landingCell(board, 3), at(4, 3));
  for (let row = 0; row < FOUR_ROWS; row++) board[at(row, 0)] = 2;
  assert.equal(landingCell(board, 0), -1);
  assert.equal(landingCell(board, -1), -1);
  assert.equal(landingCell(board, FOUR_COLUMNS), -1);
});

test('four in a row is found across, down, and on both diagonals', () => {
  const lines: [string, number[]][] = [
    ['across', [at(5, 1), at(5, 2), at(5, 3), at(5, 4)]],
    ['down', [at(2, 6), at(3, 6), at(4, 6), at(5, 6)]],
    ['rising diagonal', [at(5, 0), at(4, 1), at(3, 2), at(2, 3)]],
    ['falling diagonal', [at(2, 2), at(3, 3), at(4, 4), at(5, 5)]],
  ];
  for (const [name, cells] of lines) {
    const board = empty();
    cells.forEach(cell => { board[cell] = 1; });
    for (const cell of cells) {
      assert.deepEqual(winningLine(board, cell), [...cells].sort((a, b) => a - b), `${name} from ${cell}`);
    }
    board[cells[3]] = 2;
    assert.equal(winningLine(board, cells[0]), null, `${name}: three is not enough`);
  }
});

test('players alternate, and the finished board takes no more discs', () => {
  const game = new FourInARowGame();
  game.restart('duel');
  assert.equal(game.current, 1);
  for (const column of [0, 1, 0, 1, 0, 1]) game.drop(column);
  assert.equal(game.current, 1);
  assert.equal(game.drop(0), true, 'Mint completes the column');
  assert.equal(game.phase, 'finished');
  assert.equal(game.winner, 1);
  assert.equal(game.scores[1], 1);
  assert.equal(game.drop(2), false, 'no moves after the game ends');
});

test('a full board with no line is a draw', () => {
  const game = new FourInARowGame();
  game.restart('duel');
  const flat = DRAW_ROWS.join('').split('').map(Number) as FourDisc[];
  flat.forEach((disc, index) => assert.equal(winningLine(flat, index), null, 'the fixture itself has no line'));
  game.board = [...flat];
  game.board[at(0, 6)] = 0;
  game.current = flat[at(0, 6)] as 1 | 2;
  assert.equal(game.drop(6), true);
  assert.equal(game.phase, 'finished');
  assert.equal(game.winner, 0);
  assert.deepEqual(game.scores, { 1: 0, 2: 0 });
});

test('the next game swaps who opens, and a restart clears the series', () => {
  const game = new FourInARowGame();
  game.restart('duel');
  for (const column of [0, 1, 0, 1, 0, 1, 0]) game.drop(column);
  game.nextGame();
  assert.equal(game.current, 2, 'Coral opens game two');
  assert.equal(game.scores[1], 1, 'the series score carries over');
  game.restart('duel');
  assert.equal(game.current, 1);
  assert.deepEqual(game.scores, { 1: 0, 2: 0 });
});

test('every bot level takes a winning move when it has one', () => {
  for (const level of ['easy', 'normal', 'hard'] as const) {
    const board = empty();
    [at(5, 2), at(5, 3), at(5, 4)].forEach(cell => { board[cell] = 2; });
    board[at(5, 0)] = 1; board[at(4, 0)] = 1;
    const choice = chooseFourMove(board, 2, level, () => 0);
    assert.ok(choice === 1 || choice === 5, `${level} should complete the row, chose ${choice}`);
  }
});

test('every bot level blocks an immediate loss', () => {
  for (const level of ['easy', 'normal', 'hard'] as const) {
    const board = empty();
    [at(5, 6), at(4, 6), at(3, 6)].forEach(cell => { board[cell] = 1; });
    board[at(5, 0)] = 2; board[at(5, 1)] = 2;
    assert.equal(chooseFourMove(board, 2, level, () => 0), 6, `${level} must cap Mint's column`);
  }
});

test('the bot only ever picks a column that has room', () => {
  const random = seeded(9);
  for (let trial = 0; trial < 40; trial++) {
    const game = new FourInARowGame();
    game.restart('duel');
    for (let move = 0; move < 30 && game.phase === 'playing'; move++) {
      const choice = chooseFourMove(game.board, game.current, (['easy', 'normal', 'hard'] as const)[trial % 3], random);
      assert.ok(landingCell(game.board, choice) >= 0, `trial ${trial}: column ${choice} is full`);
      game.drop(choice);
    }
  }
});

test('the hard bot never loses to random play', () => {
  const random = seeded(21);
  for (let round = 0; round < 8; round++) {
    const game = new FourInARowGame();
    game.restart('duel');
    if (round % 2) game.nextGame(); // alternate who opens
    while (game.phase === 'playing') {
      const legal = [0, 1, 2, 3, 4, 5, 6].filter(column => game.canDrop(column));
      game.drop(game.current === 2 ? chooseFourMove(game.board, 2, 'hard') : legal[Math.floor(random() * legal.length)]);
    }
    assert.notEqual(game.winner, 1, `round ${round}: hard bot lost to random moves`);
  }
});

test('the hard bot answers fast enough to feel instant', () => {
  const started = performance.now();
  chooseFourMove(empty(), 2, 'hard');
  const board = empty();
  [at(5, 3), at(4, 3), at(5, 2), at(5, 4)].forEach((cell, i) => { board[cell] = (i % 2 + 1) as 1 | 2; });
  chooseFourMove(board, 1, 'hard');
  assert.ok(performance.now() - started < 1500, `two hard moves took ${Math.round(performance.now() - started)}ms`);
});
