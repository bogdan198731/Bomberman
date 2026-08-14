import test from 'node:test';
import assert from 'node:assert/strict';
import { STAR_HEIGHT, STAR_WIDTH, StarDefenderGame } from './star.js';

test('Star Defender launches with a scout formation', () => {
  const game = new StarDefenderGame(() => .5);
  assert.equal(game.phase, 'ready');
  assert.equal(game.start(), true);
  assert.equal(game.wave, 1);
  assert.equal(game.enemies.length, 6);
  assert.ok(game.enemies.every(enemy => enemy.kind === 'scout'));
});

test('the fighter stays inside the lower flight zone', () => {
  const game = new StarDefenderGame(() => .5);
  game.start();
  game.player.x = 20;
  game.player.y = STAR_HEIGHT * .48;
  game.setInput('left', true);
  game.setInput('up', true);
  for (let step = 0; step < 40; step += 1) game.update(.05);
  assert.ok(game.player.x >= 19);
  assert.ok(game.player.y >= STAR_HEIGHT * .48);
  assert.ok(game.player.x <= STAR_WIDTH);
});

test('the standard blaster fires one shot and observes cooldown', () => {
  const game = new StarDefenderGame(() => .5);
  game.start();
  assert.equal(game.shoot(), true);
  assert.equal(game.bullets.length, 1);
  assert.equal(game.shoot(), false);
});

test('spread power fires three angled shots', () => {
  const game = new StarDefenderGame(() => .5);
  game.start();
  game.grantPowerUp('spread');
  game.shoot();
  assert.equal(game.bullets.length, 3);
  assert.ok(game.bullets[0].vx < 0);
  assert.ok(game.bullets[2].vx > 0);
});

test('destroying an invader awards points', () => {
  const game = new StarDefenderGame(() => .5);
  game.start();
  game.enemies = [{ id: 1, x: 450, y: 500, width: 34, height: 26, health: 1, kind: 'scout', vx: 0, shootCooldown: 10 }];
  game.player.x = 450;
  game.player.y = 550;
  game.shoot();
  game.update(.05);
  assert.equal(game.player.score, 20);
  assert.equal(game.kills, 1);
});

test('every fourth kill drops a rotating weapon upgrade', () => {
  const game = new StarDefenderGame(() => .5);
  game.start();
  game.kills = 3;
  game.enemies = [{ id: 1, x: 450, y: 500, width: 34, height: 26, health: 1, kind: 'scout', vx: 0, shootCooldown: 10 }];
  game.player.x = 450;
  game.player.y = 550;
  game.shoot();
  game.update(.05);
  assert.equal(game.powerUps.length, 1);
  assert.equal(game.powerUps[0].kind, 'spread');
});

test('every fifth wave is a command-ship boss fight', () => {
  const game = new StarDefenderGame(() => .5);
  game.start();
  game.wave = 4;
  game.enemies = [];
  game.update(.01);
  assert.equal(game.wave, 5);
  assert.equal(game.enemies.length, 1);
  assert.equal(game.enemies[0].kind, 'boss');
});

test('a shield absorbs damage before the hull', () => {
  const game = new StarDefenderGame(() => .5);
  game.start();
  game.grantPowerUp('shield');
  game.damagePlayer();
  assert.equal(game.player.shield, 0);
  assert.equal(game.player.health, 3);
  game.damagePlayer();
  assert.equal(game.player.health, 2);
});

test('three unshielded hits end the mission', () => {
  const game = new StarDefenderGame(() => .5);
  game.start();
  game.damagePlayer(); game.damagePlayer(); game.damagePlayer();
  assert.equal(game.phase, 'finished');
  assert.equal(game.player.health, 0);
});

test('local co-op launches two independently controlled fighters', () => {
  const game = new StarDefenderGame(() => .5);
  game.restart('coop');
  assert.equal(game.start(), true);
  const mintStart = game.players[1].x;
  const coralStart = game.players[2].x;
  game.setInput('left', true, 1);
  game.setInput('right', true, 2);
  game.update(.05);
  assert.ok(game.players[1].x < mintStart);
  assert.ok(game.players[2].x > coralStart);
  assert.equal(game.shoot(1), true);
  assert.equal(game.shoot(2), true);
  assert.deepEqual(game.bullets.slice(-2).map(bullet => bullet.owner), [1, 2]);
});

test('a co-op mission continues until both fighters are destroyed', () => {
  const game = new StarDefenderGame(() => .5);
  game.restart('coop');
  game.start();
  game.damagePlayer(1); game.damagePlayer(1); game.damagePlayer(1);
  assert.equal(game.phase, 'playing');
  assert.equal(game.players[1].health, 0);
  game.damagePlayer(2); game.damagePlayer(2); game.damagePlayer(2);
  assert.equal(game.phase, 'finished');
});
