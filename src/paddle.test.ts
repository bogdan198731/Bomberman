import test from 'node:test';
import assert from 'node:assert/strict';
import { PADDLE_HEIGHT, PADDLE_TARGET_SCORE, PaddleClashGame } from './paddle.js';

test('Paddle Clash starts ready with a centered stationary ball', () => {
  const game = new PaddleClashGame();
  assert.equal(game.phase, 'ready');
  assert.equal(game.ball.vx, 0);
  assert.equal(game.players[1].score, 0);
  assert.equal(game.players[2].score, 0);
});

test('serve launches the ball and starts play', () => {
  const game = new PaddleClashGame();
  assert.equal(game.serve(), true);
  assert.equal(game.phase, 'playing');
  assert.notEqual(game.ball.vx, 0);
  assert.equal(game.serve(), false);
});

test('held controls move paddles while keeping them inside the arena', () => {
  const game = new PaddleClashGame();
  game.setInput(1, 'up', true);
  for (let step = 0; step < 100; step += 1) game.update(0.04);
  assert.equal(game.players[1].y, 0);
  game.setInput(1, 'up', false);
  game.setInput(1, 'down', true);
  for (let step = 0; step < 100; step += 1) game.update(0.04);
  assert.ok(game.players[1].y < PADDLE_HEIGHT);
});

test('the ball bounces off the top wall', () => {
  const game = new PaddleClashGame();
  game.phase = 'playing';
  game.ball.y = 5;
  game.ball.vy = -300;
  game.ball.vx = 200;
  game.update(0.02);
  assert.ok(game.ball.vy > 0);
});

test('missing a ball awards a point and prepares the next serve', () => {
  const game = new PaddleClashGame();
  game.phase = 'playing';
  game.ball.x = -20;
  game.ball.vx = -300;
  game.update(0.02);
  assert.equal(game.players[2].score, 1);
  assert.equal(game.phase, 'ready');
});

test('a paddle hit reverses and accelerates the ball', () => {
  const game = new PaddleClashGame();
  game.phase = 'playing';
  game.ball.x = 66;
  game.ball.y = game.players[1].y + 54;
  game.ball.vx = -360;
  game.ball.vy = 0;
  game.update(0.01);
  assert.ok(game.ball.vx > 360);
  assert.equal(game.rallyHits, 1);
});

test('the first player to seven points wins the match', () => {
  const game = new PaddleClashGame();
  game.players[1].score = PADDLE_TARGET_SCORE - 1;
  game.phase = 'playing';
  game.ball.x = 920;
  game.ball.vx = 300;
  game.update(0.02);
  assert.equal(game.players[1].score, PADDLE_TARGET_SCORE);
  assert.equal(game.phase, 'finished');
  assert.equal(game.winner, 1);
});
