import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyTintarBotAction,
  chooseTintarBotAction,
  legalTintarBotActions,
  TintarGame,
  type TintarBotAction,
} from './tintar.js';

function movementGame(): TintarGame {
  const game = new TintarGame();
  game.piecesToPlace = { 1: 0, 2: 0 };
  game.phase = 'moving';
  return game;
}

test('Țintar starts with nine pieces per player and an empty board', () => {
  const game = new TintarGame();
  assert.deepEqual(game.piecesToPlace, { 1: 9, 2: 9 });
  assert.equal(game.board.every(piece => piece === 0), true);
  assert.equal(game.phase, 'placing');
});

test('placing three aligned pieces forms a mill and requires a capture', () => {
  const game = new TintarGame();
  game.click(0); game.click(3);
  game.click(1); game.click(4);
  game.click(2);
  assert.equal(game.phase, 'removing');
  assert.equal(game.currentPlayer, 1);
  assert.equal(game.canRemove(3), true);
});

test('a piece inside a mill is protected while another rival piece is available', () => {
  const game = new TintarGame();
  game.board[0] = 2;
  game.board[1] = 2;
  game.board[2] = 2;
  game.board[3] = 2;
  game.currentPlayer = 1;
  game.phase = 'removing';
  assert.equal(game.canRemove(0), false);
  assert.equal(game.canRemove(3), true);
});

test('movement is limited to connected points while a player has more than three pieces', () => {
  const game = movementGame();
  game.board[0] = 1;
  game.board[3] = 1;
  game.board[5] = 1;
  game.board[8] = 1;
  game.board[14] = 2;
  game.board[18] = 2;
  game.board[20] = 2;
  game.board[23] = 2;
  game.click(0);
  assert.deepEqual(game.legalDestinations(0), [1, 9]);
  assert.equal(game.click(6), false);
  assert.equal(game.click(1), true);
});

test('a player with exactly three pieces can fly to any empty point', () => {
  const game = movementGame();
  game.board[0] = 1;
  game.board[3] = 1;
  game.board[5] = 1;
  game.board[14] = 2;
  game.board[18] = 2;
  game.board[20] = 2;
  game.board[23] = 2;
  game.click(0);
  assert.equal(game.legalDestinations(0).includes(22), true);
  assert.equal(game.click(22), true);
  assert.equal(game.board[22], 1);
});

test('removing an opponent third-to-last piece wins after placement is complete', () => {
  const game = movementGame();
  game.currentPlayer = 1;
  game.phase = 'removing';
  game.board[0] = 1;
  game.board[1] = 1;
  game.board[2] = 1;
  game.board[3] = 2;
  game.board[4] = 2;
  game.board[6] = 2;
  assert.equal(game.click(6), true);
  assert.equal(game.phase, 'finished');
  assert.equal(game.winner, 1);
});

test('a player who cannot make a legal movement loses', () => {
  const game = movementGame();
  game.board[0] = 1;
  game.board[1] = 1;
  game.board[2] = 1;
  game.board[9] = 1;
  game.board[4] = 2;
  game.board[5] = 2;
  game.board[10] = 2;
  game.board[14] = 2;
  game.board[21] = 2;
  game.currentPlayer = 2;
  game.click(5);
  game.click(13);
  assert.equal(game.phase, 'finished');
  assert.equal(game.winner, 2);
});

test('easy bot chooses a legal action in every game phase', () => {
  const placing = new TintarGame();
  assert.equal(applyTintarBotAction(placing, { type: 'remove', point: 0 }), false);
  const placement = chooseTintarBotAction(placing, 'easy', () => 0);
  assert.deepEqual(placement, { type: 'place', point: 0 });
  assert.equal(applyTintarBotAction(placing, placement!), true);

  const moving = movementGame();
  moving.currentPlayer = 2;
  moving.board[0] = 1;
  moving.board[3] = 1;
  moving.board[5] = 1;
  moving.board[8] = 1;
  moving.board[14] = 2;
  moving.board[18] = 2;
  moving.board[20] = 2;
  moving.board[23] = 2;
  const movement = chooseTintarBotAction(moving, 'easy', () => 0);
  assert.ok(movement && legalTintarBotActions(moving).some(action => JSON.stringify(action) === JSON.stringify(movement)));
  assert.equal(applyTintarBotAction(moving, movement!), true);

  const removing = movementGame();
  removing.currentPlayer = 2;
  removing.phase = 'removing';
  removing.board[0] = 1;
  removing.board[1] = 1;
  removing.board[2] = 1;
  removing.board[3] = 1;
  removing.board[4] = 2;
  removing.board[5] = 2;
  removing.board[6] = 2;
  assert.deepEqual(chooseTintarBotAction(removing, 'easy', () => 0), { type: 'remove', point: 3 });
});

test('normal bot completes its own mill before other placements', () => {
  const game = new TintarGame();
  game.currentPlayer = 2;
  game.board[0] = 2;
  game.board[1] = 2;
  game.piecesToPlace = { 1: 7, 2: 7 };
  assert.deepEqual(chooseTintarBotAction(game, 'normal', () => 0), { type: 'place', point: 2 });
});

test('normal bot blocks an opponent mill when it cannot make one', () => {
  const game = new TintarGame();
  game.currentPlayer = 2;
  game.board[0] = 1;
  game.board[1] = 1;
  game.piecesToPlace = { 1: 7, 2: 9 };
  assert.deepEqual(chooseTintarBotAction(game, 'normal', () => 0), { type: 'place', point: 2 });
});

test('hard bot takes an immediate winning capture', () => {
  const game = movementGame();
  game.currentPlayer = 2;
  game.phase = 'removing';
  game.board[0] = 1;
  game.board[3] = 1;
  game.board[5] = 1;
  game.board[1] = 2;
  game.board[4] = 2;
  game.board[7] = 2;
  const action = chooseTintarBotAction(game, 'hard', () => 0) as TintarBotAction;
  assert.equal(applyTintarBotAction(game, action), true);
  assert.equal(game.phase, 'finished');
  assert.equal(game.winner, 2);
});

test('bot decisions can play a complete legal match', () => {
  const game = new TintarGame();
  let actions = 0;
  while (game.phase !== 'finished' && actions < 250) {
    const difficulty = game.currentPlayer === 1 ? 'easy' : 'normal';
    const action = chooseTintarBotAction(game, difficulty, () => 0.37);
    assert.ok(action, `expected a legal action during ${game.phase}`);
    assert.equal(applyTintarBotAction(game, action!), true);
    actions += 1;
  }
  assert.equal(game.phase, 'finished');
  assert.ok(actions < 250);
});
