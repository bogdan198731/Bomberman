import test from 'node:test';
import assert from 'node:assert/strict';
import { MINE_SETUPS, MinesweeperGame, type MineDifficulty } from './mines.js';

function seeded(seed = 17): () => number {
  let state = seed;
  return () => { state = (state * 16807) % 2147483647; return state / 2147483647; };
}

/** A board with mines exactly where a test wants them. */
function rigged(mines: number[], columns = 9, rows = 9): MinesweeperGame {
  const game = new MinesweeperGame(seeded());
  game.newGame('easy');
  game.columns = columns;
  game.rows = rows;
  game.mineCount = mines.length;
  game.cells = Array.from({ length: columns * rows }, (_, index) => ({ mine: mines.includes(index), adjacent: 0, revealed: false, flagged: false }));
  game.cells.forEach((cell, index) => { cell.adjacent = game.neighbours(index).filter(n => game.cells[n].mine).length; });
  game.phase = 'playing';
  game.startedAt = 1;
  return game;
}

test('each board size fits a phone and keeps a sensible mine density', () => {
  for (const [name, setup] of Object.entries(MINE_SETUPS)) {
    assert.equal(setup.columns, setup.rows, `${name} is square`);
    assert.ok(setup.columns <= 16, `${name} stays tappable on a phone`);
    const density = setup.mines / (setup.columns * setup.rows);
    assert.ok(density > 0.1 && density < 0.22, `${name} density ${density.toFixed(2)}`);
  }
});

test('the first square opened is always safe and always opens an area', () => {
  for (const difficulty of ['easy', 'medium', 'hard'] as MineDifficulty[]) {
    const random = seeded(3);
    for (let trial = 0; trial < 60; trial++) {
      const game = new MinesweeperGame(random);
      game.newGame(difficulty);
      const first = Math.floor(random() * game.cells.length);
      game.reveal(first, 1_000);
      assert.equal(game.phase === 'lost', false, `${difficulty} trial ${trial}: first tap hit a mine`);
      assert.equal(game.cells[first].adjacent, 0, 'the first tap lands on a zero, so it opens an area');
      assert.equal(game.cells.filter(cell => cell.mine).length, MINE_SETUPS[difficulty].mines, 'every mine was placed');
    }
  }
});

test('numbers count the mines touching each square', () => {
  const game = rigged([0, 2, 10]);
  assert.equal(game.cells[1].adjacent, 3, 'touches 0, 2 and 10');
  assert.equal(game.cells[9].adjacent, 2, 'touches 0 and 10');
  assert.equal(game.cells[80].adjacent, 0);
});

test('opening a zero floods out to the numbered edge', () => {
  const game = rigged([0]);
  game.reveal(80, 5);
  assert.equal(game.cells[0].revealed, false, 'the mine stays hidden');
  assert.equal(game.cells.filter(cell => cell.revealed).length, 80, 'everything else opened at once');
  assert.equal(game.phase, 'won');
  assert.equal(game.cells[0].flagged, true, 'a win flags the remaining mines');
});

test('flags block reveals and can be removed', () => {
  const game = rigged([40]);
  assert.equal(game.toggleFlag(40), true);
  assert.equal(game.reveal(40), false, 'a flagged square cannot be opened');
  assert.equal(game.flagsPlaced(), 1);
  game.toggleFlag(40);
  assert.equal(game.flagsPlaced(), 0);
});

test('hitting a mine loses and shows every mine', () => {
  const game = rigged([10, 20, 30]);
  game.reveal(20, 9_000);
  assert.equal(game.phase, 'lost');
  assert.equal(game.exploded, 20);
  assert.ok([10, 20, 30].every(index => game.cells[index].revealed));
  assert.equal(game.reveal(0), false, 'no more moves after a loss');
  assert.equal(game.score(), 0);
});

test('tapping a satisfied number opens its other neighbours', () => {
  const game = rigged([0, 60]);
  game.reveal(1, 10);
  assert.equal(game.cells[1].adjacent, 1);
  assert.equal(game.chord(1), false, 'nothing happens before its mine is flagged');
  game.toggleFlag(0);
  assert.equal(game.chord(1, 20), true);
  assert.ok([2, 9, 10, 11].every(index => game.cells[index].revealed), 'unflagged neighbours opened');
  assert.notEqual(game.phase, 'lost');
});

test('chording on a wrong flag can still blow up', () => {
  const game = rigged([0, 60]);
  game.reveal(1, 10);
  game.toggleFlag(2); // wrong: the mine is at 0
  game.chord(1, 20);
  assert.equal(game.phase, 'lost');
  assert.equal(game.exploded, 0);
});

test('the clock starts on the first tap, stops at the end, and faster wins score higher', () => {
  const game = new MinesweeperGame(seeded(5));
  game.newGame('easy');
  assert.equal(game.elapsed(50_000), 0, 'no clock before the first tap');

  const quick = rigged([0]);
  quick.startedAt = 1_000;
  quick.reveal(80, 11_000);
  const slow = rigged([0]);
  slow.startedAt = 1_000;
  slow.reveal(80, 301_000);
  assert.equal(quick.elapsed(999_999), 10, 'the clock froze at the win');
  assert.ok(quick.score() > slow.score(), 'a faster clear is worth more');
  assert.ok(slow.score() > 0);
});

test('a harder board is worth more for the same time', () => {
  const easy = MINE_SETUPS.easy.base;
  const hard = MINE_SETUPS.hard.base;
  assert.ok(hard > easy);
});
