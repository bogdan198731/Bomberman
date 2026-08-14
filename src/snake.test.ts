import test from 'node:test';
import assert from 'node:assert/strict';
import { NeonSnakeGame } from './snake.js';

test('Neon Snake starts in solo mode with only Mint active', () => {
  const game = new NeonSnakeGame(() => 0.5);
  assert.equal(game.mode, 'solo');
  assert.equal(game.riders[1].alive, true);
  assert.equal(game.riders[2].alive, false);
});

test('a snake advances one cell per tick', () => {
  const game = new NeonSnakeGame(() => 0.5);
  game.start();
  const startX = game.riders[1].body[0].x;
  game.tick();
  assert.equal(game.riders[1].body[0].x, startX + 1);
});

test('a snake cannot reverse directly into itself', () => {
  const game = new NeonSnakeGame(() => 0.5);
  assert.equal(game.turn(1, 'left'), false);
  assert.equal(game.turn(1, 'up'), true);
});

test('collecting food grows the snake and increases score', () => {
  const game = new NeonSnakeGame(() => 0.5);
  game.food = { x: 6, y: 8 };
  const length = game.riders[1].body.length;
  game.start();
  game.tick();
  assert.equal(game.riders[1].score, 1);
  assert.equal(game.riders[1].body.length, length + 1);
});

test('hitting the arena wall ends a solo run', () => {
  const game = new NeonSnakeGame(() => 0.5);
  game.riders[1].body = [{ x: 23, y: 8 }, { x: 22, y: 8 }, { x: 21, y: 8 }];
  game.start();
  game.tick();
  assert.equal(game.phase, 'finished');
  assert.equal(game.riders[1].alive, false);
});

test('a head-on duel crash is a draw', () => {
  const game = new NeonSnakeGame(() => 0.5);
  game.restart('duel');
  game.riders[1].body = [{ x: 10, y: 8 }, { x: 9, y: 8 }];
  game.riders[2].body = [{ x: 12, y: 8 }, { x: 13, y: 8 }];
  game.start();
  game.tick();
  assert.equal(game.phase, 'finished');
  assert.equal(game.winner, 0);
});
