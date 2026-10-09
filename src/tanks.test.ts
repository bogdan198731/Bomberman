import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MiniTanksGame,
  TANK_BONUSES,
  TANK_BONUS_KINDS,
  TANK_DROP_CHANCE,
  TANK_TARGET_SCORE,
  TANK_LEVELS,
  pickTankBonus,
} from './tanks.js';
import { translateArcadeText } from './i18n.js';

test('Mini Tanks starts ready in bot mode', () => {
  const game = new MiniTanksGame();
  assert.equal(game.mode, 'bot');
  assert.equal(game.phase, 'ready');
  assert.equal(game.botPace, 'rookie');
});

test('tank bot offers a faster ace reaction profile', () => {
  const game = new MiniTanksGame();
  game.setBotPace('ace');
  game.startRound();
  game.update(.01);
  const firstDirection = game.tanks[2].direction;
  game.tanks[1].x = game.tanks[2].x;
  game.tanks[1].y = game.tanks[2].y - 200;
  for (let tick = 0; tick < 6; tick += 1) game.update(.04);
  assert.notEqual(game.tanks[2].direction, firstDirection);
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

/** A duel in progress with the tanks parked apart and no crate drops unless asked. */
function inPlay(random: () => number = () => 1): MiniTanksGame {
  const game = new MiniTanksGame(random);
  game.restart('duel');
  game.startRound();
  return game;
}

test('bonuses are picked by weight and crates drop them only sometimes', () => {
  const counts = Object.fromEntries(TANK_BONUS_KINDS.map(kind => [kind, 0])) as Record<string, number>;
  for (let i = 0; i < 1000; i++) counts[pickTankBonus(i / 1000)]++;
  TANK_BONUS_KINDS.forEach(kind => assert.ok(counts[kind] > 0, `${kind} can drop`));
  assert.ok(TANK_DROP_CHANCE > 0.15 && TANK_DROP_CHANCE < 0.6);
  assert.equal(TANK_BONUSES.shield.seconds, 0, 'a shield lasts until it is hit');
});

test('a smashed crate can leave a bonus that a tank collects by driving over it', () => {
  const rolls = [0, 0]; // drop, then the first kind: a shield
  const game = inPlay(() => rolls.shift() ?? 1);
  const crate = game.obstacles.find(obstacle => obstacle.destructible)!;
  game.bullets = [{ x: crate.x + 10, y: crate.y + 10, vx: 0, vy: 0, owner: 1, bounces: 0, age: .2 }];
  game.update(.01);
  assert.deepEqual(game.pickups, [{ x: crate.x + crate.width / 2, y: crate.y + crate.height / 2, kind: 'shield' }]);
  game.tanks[1].x = game.pickups[0].x;
  game.tanks[1].y = game.pickups[0].y;
  game.update(.01);
  assert.equal(game.pickups.length, 0);
  assert.equal(game.tanks[1].shield, true);
  assert.equal(game.statusText(), 'Mint: Shield - blocks one hit!');
  assert.equal(translateArcadeText(game.statusText(), 'ro'), 'Mint: Scut - oprește o lovitură!');
});

test('a crate that rolls no drop leaves nothing behind', () => {
  const game = inPlay();
  const crate = game.obstacles.find(obstacle => obstacle.destructible)!;
  game.bullets = [{ x: crate.x + 10, y: crate.y + 10, vx: 0, vy: 0, owner: 1, bounces: 0, age: .2 }];
  game.update(.01);
  assert.equal(game.pickups.length, 0);
});

test('a shield soaks up one hit, then the next one counts', () => {
  const game = inPlay();
  game.collect(2, 'shield');
  game.bullets = [{ x: game.tanks[2].x, y: game.tanks[2].y, vx: 0, vy: 0, owner: 1, bounces: 0, age: .2 }];
  game.update(.01);
  assert.equal(game.tanks[1].score, 0);
  assert.equal(game.tanks[2].shield, false);
  assert.equal(game.bullets.length, 0, 'the shell is swallowed');
  game.bullets = [{ x: game.tanks[2].x, y: game.tanks[2].y, vx: 0, vy: 0, owner: 1, bounces: 0, age: .2 }];
  game.update(.01);
  assert.equal(game.tanks[1].score, 1);
});

test('rapid fire shortens the reload until it runs out', () => {
  const game = inPlay();
  game.fire(1);
  const normal = game.tanks[1].cooldown;
  game.tanks[1].cooldown = 0;
  game.collect(1, 'rapid');
  game.fire(1);
  assert.ok(game.tanks[1].cooldown < normal / 2 + .01);
  assert.deepEqual(game.activeEffects(1).map(effect => effect.kind), ['rapid']);
  for (let t = 0; t < TANK_BONUSES.rapid.seconds / .04 + 2; t++) game.update(.04);
  assert.deepEqual(game.activeEffects(1), []);
});

test('a triple shot fires three shells that fan out', () => {
  const game = inPlay();
  game.collect(1, 'triple');
  game.fire(1);
  assert.equal(game.bullets.length, 3);
  const ys = game.bullets.map(bullet => Math.sign(Math.round(bullet.vy)));
  assert.deepEqual([...ys].sort(), [-1, 0, 1]);
  game.bullets.forEach(bullet => assert.ok(bullet.vx > 0, 'all head the way the turret faces'));
});

test('a speed boost makes the tank cover more ground', () => {
  const plain = inPlay();
  const boosted = inPlay();
  boosted.collect(1, 'boost');
  for (const game of [plain, boosted]) {
    game.tanks[1].y = 560; // a clear lane along the bottom
    game.setInput(1, 'right', true);
    game.update(.04);
  }
  assert.ok(boosted.tanks[1].x - 80 > (plain.tanks[1].x - 80) * 1.3);
});

test('a new round clears every bonus and pickup', () => {
  const game = inPlay();
  game.collect(1, 'shield');
  game.collect(1, 'triple');
  game.pickups = [{ x: 300, y: 300, kind: 'boost' }];
  game.bullets = [{ x: game.tanks[2].x, y: game.tanks[2].y, vx: 0, vy: 0, owner: 1, bounces: 0, age: .2 }];
  game.update(.01);
  game.startRound();
  assert.equal(game.tanks[1].shield, false);
  assert.equal(game.tanks[1].triple, 0);
  assert.equal(game.pickups.length, 0);
});

test('every bonus label and notice has a Romanian translation', () => {
  TANK_BONUS_KINDS.forEach(kind => {
    assert.notEqual(translateArcadeText(TANK_BONUSES[kind].label, 'ro'), TANK_BONUSES[kind].label);
    assert.notEqual(translateArcadeText(TANK_BONUSES[kind].notice, 'ro'), TANK_BONUSES[kind].notice);
  });
});

/** Mint parks on its spawn and fires every `interval` seconds, the first shot after `offset`. */
function campingRound(level: number, pace: 'rookie' | 'normal' | 'ace', offset: number, interval = 2): 1 | 2 | null {
  const game = new MiniTanksGame(() => 1);
  game.setLevel(level);
  game.setBotPace(pace);
  game.startRound();
  let time = 0;
  let nextShot = offset;
  while (game.phase === 'playing' && time < 40) {
    if (time >= nextShot) { game.setInput(1, 'fire', true); nextShot += interval; }
    game.update(1 / 60);
    time += 1 / 60;
  }
  return game.roundWinner;
}

const shotOffsets = Array.from({ length: 10 }, (_, index) => index * .2);

test('camping on spawn and firing every two seconds no longer beats the Classic bot', () => {
  for (const pace of ['normal', 'ace'] as const) {
    const winners = shotOffsets.map(offset => campingRound(1, pace, offset));
    assert.equal(winners.filter(winner => winner === 1).length, 0, `${pace} bot lost to a camper`);
    assert.equal(winners.filter(winner => winner === 2).length, shotOffsets.length, `${pace} bot stalled instead of winning`);
  }
});

test('the ace bot beats a camper in every arena', () => {
  for (let level = 1; level <= TANK_LEVELS.length; level += 1) {
    for (const offset of [0, .7, 1.4]) assert.equal(campingRound(level, 'ace', offset), 2, `arena ${level}, first shot at ${offset}s`);
  }
});

test('the ace bot sidesteps a shell flying at it', () => {
  const game = new MiniTanksGame(() => 1);
  game.setBotPace('ace');
  game.startRound();
  game.tanks[1].direction = 'up';
  game.obstacles = [];
  game.bullets = [{ x: game.tanks[2].x - 300, y: game.tanks[2].y, vx: 470, vy: 0, owner: 1, bounces: 0, age: .1 }];
  for (let tick = 0; tick < 50 && game.phase === 'playing'; tick += 1) game.update(1 / 60);
  assert.equal(game.tanks[1].score, 0, 'the shell missed');
  assert.equal(game.phase, 'playing');
});

test('a smarter bot lines up from the side the player is not facing', () => {
  const game = new MiniTanksGame(() => 1);
  game.setLevel(1);
  game.setBotPace('normal');
  game.startRound();
  for (let tick = 0; tick < 60; tick += 1) game.update(1 / 60);
  // Mint faces right along the middle row; the bot climbs out of that row instead of charging down it.
  assert.ok(Math.abs(game.tanks[2].y - game.tanks[1].y) > 60);
});
