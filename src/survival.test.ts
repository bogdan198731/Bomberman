import test from 'node:test';
import assert from 'node:assert/strict';
import { SURVIVAL_HEIGHT, SURVIVAL_WIDTH, SurvivalArenaGame } from './survival.js';

test('Survival Arena starts ready for a solo run', () => {
  const game = new SurvivalArenaGame(() => .5);
  assert.equal(game.phase, 'ready');
  assert.equal(game.players[1].alive, true);
  assert.equal(game.players[2].alive, false);
});

test('co-op activates both heroes and spawns a larger first wave', () => {
  const game = new SurvivalArenaGame(() => .5);
  game.restart('coop');
  assert.equal(game.players[2].alive, true);
  assert.equal(game.start(), true);
  assert.equal(game.wave, 1);
  assert.equal(game.enemies.length, 7);
});

test('movement stays inside the survival arena', () => {
  const game = new SurvivalArenaGame(() => .5);
  game.start();
  game.players[1].x = 18;
  game.players[1].y = SURVIVAL_HEIGHT - 18;
  game.setInput(1, 'left', true);
  game.setInput(1, 'down', true);
  for (let step = 0; step < 40; step += 1) game.update(.05);
  assert.ok(game.players[1].x >= 17);
  assert.ok(game.players[1].y <= SURVIVAL_HEIGHT - 17);
  assert.ok(game.players[1].x <= SURVIVAL_WIDTH);
});

test('shooting locks onto the nearest crawler', () => {
  const game = new SurvivalArenaGame(() => .5);
  game.start();
  game.players[1].x = 100;
  game.players[1].y = 100;
  game.enemies = [
    { id: 1, x: 500, y: 100, health: 1, speed: 0 },
    { id: 2, x: 150, y: 100, health: 1, speed: 0 },
  ];
  assert.equal(game.shoot(1), true);
  assert.ok(game.bullets[0].vx > 0);
  assert.equal(game.bullets[0].vy, 0);
});

test('a defeated crawler awards points to the shooter', () => {
  const game = new SurvivalArenaGame(() => .5);
  game.start();
  game.players[1].x = 100;
  game.players[1].y = 100;
  game.enemies = [{ id: 1, x: 145, y: 100, health: 1, speed: 0 }];
  game.shoot(1);
  game.update(.05);
  assert.equal(game.players[1].score, 10);
});

test('every third wave grants an overdrive upgrade', () => {
  const game = new SurvivalArenaGame(() => .5);
  game.start();
  const originalSpeed = game.players[1].speed;
  game.wave = 2;
  game.enemies = [];
  game.update(.01);
  assert.equal(game.wave, 3);
  assert.equal(game.upgradeLevel, 1);
  assert.ok(game.players[1].speed > originalSpeed);
});

test('the run ends when every active hero falls', () => {
  const game = new SurvivalArenaGame(() => .5);
  game.start();
  const hero = game.players[1];
  hero.health = 1;
  game.enemies = [{ id: 1, x: hero.x, y: hero.y, health: 1, speed: 0 }];
  game.update(.05);
  assert.equal(game.phase, 'finished');
  assert.equal(hero.alive, false);
});
