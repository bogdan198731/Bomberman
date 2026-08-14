import test from 'node:test';
import assert from 'node:assert/strict';
import { MiniTanksGame, TANK_TARGET_SCORE } from './tanks.js';

test('Mini Tanks starts ready in bot mode', () => {
  const game = new MiniTanksGame();
  assert.equal(game.mode, 'bot');
  assert.equal(game.phase, 'ready');
});

test('starting a round enables movement and firing', () => {
  const game = new MiniTanksGame();
  assert.equal(game.startRound(), true);
  assert.equal(game.fire(1), true);
  assert.equal(game.bullets.length, 1);
});

test('tank movement stays within the arena', () => {
  const game = new MiniTanksGame();
  game.restart('duel'); game.startRound();
  game.setInput(1, 'left', true);
  for (let index = 0; index < 100; index += 1) game.update(.04);
  assert.ok(game.tanks[1].x >= 17);
});

test('a bullet can ricochet once from an arena wall', () => {
  const game = new MiniTanksGame();
  game.restart('duel'); game.startRound();
  game.bullets = [{ x: 4, y: 50, vx: -470, vy: 0, owner: 1, bounces: 0, age: .2 }];
  game.update(.01);
  assert.equal(game.bullets[0].bounces, 1);
  assert.ok(game.bullets[0].vx > 0);
});

test('destructible cover is removed by a bullet', () => {
  const game = new MiniTanksGame();
  game.restart('duel'); game.startRound();
  const crate = game.obstacles.find(obstacle => obstacle.destructible)!;
  game.bullets = [{ x: crate.x + 10, y: crate.y + 10, vx: 0, vy: 0, owner: 1, bounces: 0, age: .2 }];
  const count = game.obstacles.length;
  game.update(.01);
  assert.equal(game.obstacles.length, count - 1);
});

test('a direct hit awards the shooter a round', () => {
  const game = new MiniTanksGame();
  game.restart('duel'); game.startRound();
  game.bullets = [{ x: game.tanks[2].x, y: game.tanks[2].y, vx: 0, vy: 0, owner: 1, bounces: 0, age: .2 }];
  game.update(.01);
  assert.equal(game.tanks[1].score, 1);
  assert.equal(game.phase, 'round-over');
});

test('the first tank to five rounds wins the match', () => {
  const game = new MiniTanksGame();
  game.restart('duel'); game.tanks[1].score = TANK_TARGET_SCORE - 1; game.startRound();
  game.bullets = [{ x: game.tanks[2].x, y: game.tanks[2].y, vx: 0, vy: 0, owner: 1, bounces: 0, age: .2 }];
  game.update(.01);
  assert.equal(game.phase, 'finished');
  assert.equal(game.matchWinner, 1);
});
