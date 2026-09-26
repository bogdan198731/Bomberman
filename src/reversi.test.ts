import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ReversiGame,
  chooseReversiMove,
  countDiscs,
  flipsFor,
  legalMoves,
  startingBoard,
  type ReversiDisc,
} from './reversi.js';

const at = (row: number, column: number): number => row * 8 + column;

function seeded(seed = 19): () => number {
  let state = seed;
  return () => { state = (state * 16807) % 2147483647; return state / 2147483647; };
}

test('the opening has the four centre discs and exactly four legal replies', () => {
  const board = startingBoard();
  assert.deepEqual(countDiscs(board), { 1: 2, 2: 2 });
  assert.deepEqual(legalMoves(board, 1).sort((a, b) => a - b), [at(2, 3), at(3, 2), at(4, 5), at(5, 4)]);
});

test('a move flips the trapped line and nothing else', () => {
  const game = new ReversiGame();
  game.restart('duel');
  assert.equal(game.play(at(2, 3)), true);
  assert.equal(game.board[at(3, 3)], 1, 'the Coral disc between is flipped');
  assert.deepEqual(countDiscs(game.board), { 1: 4, 2: 1 });
  assert.equal(game.current, 2);
});

test('illegal moves are refused: occupied squares and moves that flip nothing', () => {
  const game = new ReversiGame();
  game.restart('duel');
  assert.equal(game.play(at(3, 3)), false, 'occupied');
  assert.equal(game.play(at(0, 0)), false, 'flips nothing');
  assert.equal(game.current, 1, 'a refused move keeps the turn');
});

test('one move can flip in several directions at once', () => {
  const board: ReversiDisc[] = Array(64).fill(0);
  // Mint at 4,4 surrounded by Coral lines, each capped by Mint.
  board[at(4, 4)] = 0;
  for (const [r, c] of [[4, 3], [3, 4], [3, 3]]) board[at(r, c)] = 2;
  for (const [r, c] of [[4, 2], [2, 4], [2, 2]]) board[at(r, c)] = 1;
  assert.deepEqual(flipsFor(board, at(4, 4), 1).sort((a, b) => a - b), [at(3, 3), at(3, 4), at(4, 3)]);
});

test('a player with no legal move is skipped', () => {
  const game = new ReversiGame();
  game.restart('duel');
  // Row 4 is Mint from the left edge up to one Coral disc: Coral has no empty
  // square that flanks anything, while Mint can still capture it from the right.
  const board: ReversiDisc[] = Array(64).fill(0);
  for (let column = 0; column < 4; column++) board[at(4, column)] = 1;
  board[at(4, 4)] = 2;
  // Mint's move: take the Coral disc on the top edge.
  board[at(0, 0)] = 1; board[at(0, 1)] = 2;
  game.board = board;
  game.current = 1;
  assert.equal(game.play(at(0, 2)), true);
  assert.deepEqual(legalMoves(game.board, 2), [], 'Coral is stuck');
  assert.ok(legalMoves(game.board, 1).length > 0, 'Mint still has moves');
  assert.equal(game.passed, 2, 'Coral had to pass');
  assert.equal(game.current, 1, 'Mint moves again');
  assert.equal(game.phase, 'playing');
  assert.match(game.statusText(), /Coral has no move - Mint plays again/);
});

test('the game ends when neither side can move, and the bigger count wins', () => {
  const game = new ReversiGame();
  game.restart('duel');
  const board: ReversiDisc[] = Array(64).fill(1);
  board[at(0, 0)] = 0; board[at(7, 7)] = 2; board[at(0, 1)] = 2;
  game.board = board;
  game.current = 1;
  // Mint takes 0,0 by flipping 0,1; afterwards nobody can move.
  assert.equal(game.play(at(0, 0)), true);
  assert.equal(game.phase, 'finished');
  assert.equal(game.winner, 1);
  assert.equal(game.wins[1], 1);
  assert.match(game.statusText(), /Mint wins 63-1!/);
});

test('the next game swaps who opens, and a reset clears the series', () => {
  const game = new ReversiGame();
  game.restart('duel');
  game.wins = { 1: 2, 2: 1 };
  game.nextGame();
  assert.equal(game.current, 2);
  assert.deepEqual(countDiscs(game.board), { 1: 2, 2: 2 });
  assert.deepEqual(game.wins, { 1: 2, 2: 1 }, 'the series carries over');
  game.restart('duel');
  assert.equal(game.current, 1);
  assert.deepEqual(game.wins, { 1: 0, 2: 0 });
});

test('every bot level plays only legal moves and passes when it must', () => {
  const random = seeded(4);
  for (const level of ['easy', 'normal', 'hard'] as const) {
    const game = new ReversiGame();
    game.restart('duel');
    let moves = 0;
    while (game.phase === 'playing' && moves < 70) {
      const choice = chooseReversiMove(game.board, game.current, level, random);
      assert.ok(game.canPlay(choice), `${level}: ${choice} is not legal`);
      game.play(choice);
      moves++;
    }
    assert.equal(game.phase, 'finished', `${level}: a bot-vs-bot game finishes`);
  }
  const full: ReversiDisc[] = Array(64).fill(1);
  assert.equal(chooseReversiMove(full, 2, 'hard'), -1, 'no move means pass');
});

test('the bot grabs a free corner', () => {
  const board: ReversiDisc[] = Array(64).fill(0);
  board[at(1, 1)] = 1; board[at(2, 2)] = 2; board[at(3, 3)] = 1; board[at(3, 4)] = 2;
  board[at(4, 4)] = 1;
  assert.ok(legalMoves(board, 2).includes(at(0, 0)));
  for (const level of ['easy', 'normal', 'hard'] as const) {
    assert.equal(chooseReversiMove(board, 2, level, () => 0), at(0, 0), `${level} takes the corner`);
  }
});

test('the hard bot beats random play', () => {
  const random = seeded(33);
  let wins = 0;
  const games = 8;
  for (let round = 0; round < games; round++) {
    const game = new ReversiGame();
    game.restart('duel');
    if (round % 2) game.nextGame();
    while (game.phase === 'playing') {
      const moves = legalMoves(game.board, game.current);
      game.play(game.current === 2 ? chooseReversiMove(game.board, 2, 'hard') : moves[Math.floor(random() * moves.length)]);
    }
    if (game.winner === 2) wins++;
  }
  assert.ok(wins >= games - 1, `hard bot won only ${wins} of ${games}`);
});

test('the hard bot answers quickly even in a busy middlegame', () => {
  const game = new ReversiGame();
  game.restart('duel');
  const random = seeded(8);
  for (let i = 0; i < 20 && game.phase === 'playing'; i++) {
    const moves = legalMoves(game.board, game.current);
    game.play(moves[Math.floor(random() * moves.length)]);
  }
  const started = performance.now();
  chooseReversiMove(game.board, game.current, 'hard');
  chooseReversiMove(startingBoard(), 1, 'hard');
  const took = performance.now() - started;
  assert.ok(took < 1500, `two hard moves took ${Math.round(took)}ms`);
});
