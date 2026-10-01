import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NeonSnakeGame,
  SNAKE_BONUSES,
  SNAKE_BONUS_CHANCE,
  SNAKE_BONUS_KINDS,
  SNAKE_BONUS_LIFETIME,
  SNAKE_MIN_LENGTH,
  SNAKE_SHRINK_CELLS,
  SNAKE_SLOW_FACTOR,
  SNAKE_STAR_POINTS,
  pickSnakeBonus,
  type SnakeBonusKind,
} from './snake.js';
import { translateArcadeText } from './i18n.js';

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
  assert.match(game.statusText(), /wall/i);
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

/** Plays rolls in order, then a value that spawns nothing. */
function rolls(...values: number[]): () => number {
  return () => values.shift() ?? 0.99;
}

test('bonuses are picked by weight and are occasional', () => {
  const counts = Object.fromEntries(SNAKE_BONUS_KINDS.map(kind => [kind, 0])) as Record<string, number>;
  for (let i = 0; i < 1000; i++) counts[pickSnakeBonus(i / 1000)]++;
  SNAKE_BONUS_KINDS.forEach(kind => assert.ok(counts[kind] > 0, `${kind} can appear`));
  assert.ok(SNAKE_BONUS_CHANCE > 0.1 && SNAKE_BONUS_CHANCE < 0.5);
  SNAKE_BONUS_KINDS.forEach(kind => assert.equal(SNAKE_BONUSES[kind].ticks > 0, kind === 'slow' || kind === 'ghost', `${kind} timing`));
});

test('eating fruit can bring out a bonus away from the fruit, which fades if ignored', () => {
  // Opening fruit, next fruit, bonus chance, bonus spot, bonus kind (0 is the first: a star).
  const game = new NeonSnakeGame(rolls(0.5, 0.5, 0.1, 0.5, 0));
  game.food = { x: 6, y: 8 };
  game.start();
  game.tick();
  assert.ok(game.bonus, 'a bonus appeared');
  assert.equal(game.bonus.kind, 'star');
  assert.notDeepEqual({ x: game.bonus.x, y: game.bonus.y }, game.food);
  assert.equal(game.bonus.ticksLeft, SNAKE_BONUS_LIFETIME);
  game.bonus.x = 0; game.bonus.y = 0; // out of the snake's path
  game.bonus.ticksLeft = 1;
  game.tick();
  assert.equal(game.bonus, null, 'an ignored bonus fades');
});

/** A solo game with a bonus right in front of Mint's head. */
function withBonus(kind: SnakeBonusKind): NeonSnakeGame {
  const game = new NeonSnakeGame(() => 0.99);
  game.food = { x: 0, y: 0 };
  game.bonus = { x: 6, y: 8, kind, ticksLeft: SNAKE_BONUS_LIFETIME };
  game.start();
  return game;
}

test('a star fruit is worth five points without growing the snake', () => {
  const game = withBonus('star');
  game.tick();
  assert.equal(game.riders[1].score, SNAKE_STAR_POINTS);
  assert.equal(game.riders[1].body.length, 3);
  assert.equal(game.bonus, null);
  assert.equal(game.statusText(), 'Star fruit - 5 points!');
});

test('shrink trims the tail but never below three cells', () => {
  const game = withBonus('shrink');
  game.riders[1].body = [{ x: 5, y: 8 }, ...Array.from({ length: 7 }, (_, i) => ({ x: 4 - Math.min(i, 4), y: 8 + Math.max(0, i - 4) }))];
  game.tick();
  assert.equal(game.riders[1].body.length, 8 - SNAKE_SHRINK_CELLS);
  const short = withBonus('shrink');
  short.tick();
  assert.equal(short.riders[1].body.length, SNAKE_MIN_LENGTH);
});

test('slow time stretches ticks until it runs out', () => {
  const game = withBonus('slow');
  assert.equal(game.tickScale(), 1);
  game.tick();
  assert.equal(game.tickScale(), SNAKE_SLOW_FACTOR);
  assert.deepEqual(game.activeEffects().map(effect => effect.kind), ['slow']);
  game.slowTicks = 1;
  game.tick();
  assert.equal(game.tickScale(), 1);
  assert.deepEqual(game.activeEffects(), []);
});

test('a ghost slips through its own body and the rival, but not walls', () => {
  const game = new NeonSnakeGame(() => 0.99);
  game.restart('duel');
  game.food = { x: 0, y: 0 };
  game.riders[1].ghostTicks = SNAKE_BONUSES.ghost.ticks;
  game.riders[1].body = [{ x: 10, y: 8 }, { x: 9, y: 8 }, { x: 8, y: 8 }];
  game.riders[2].body = [{ x: 11, y: 7 }, { x: 11, y: 8 }, { x: 11, y: 9 }];
  game.riders[2].direction = game.riders[2].queuedDirection = 'up';
  game.start();
  game.tick();
  assert.equal(game.riders[1].alive, true, 'passed through Coral');
  assert.equal(game.riders[2].alive, true, 'a ghost is no obstacle either');
  game.riders[1].body = [{ x: 23, y: 8 }, { x: 22, y: 8 }, { x: 21, y: 8 }];
  game.tick();
  assert.equal(game.riders[1].alive, false, 'the arena edge still stops a ghost');
});

test('a bonus caught in a duel names the catcher, and Romanian follows', () => {
  const game = new NeonSnakeGame(() => 0.99);
  game.restart('duel');
  game.food = { x: 0, y: 0 };
  game.bonus = { x: 17, y: 8, kind: 'ghost', ticksLeft: SNAKE_BONUS_LIFETIME };
  game.start();
  game.tick();
  assert.equal(game.statusText(), 'Coral: Ghost - slip through snakes!');
  assert.equal(game.riders[2].ghostTicks, SNAKE_BONUSES.ghost.ticks);
  assert.equal(translateArcadeText(game.statusText(), 'ro'), 'Coral: Fantomă - treci prin șerpi!');
  SNAKE_BONUS_KINDS.forEach(kind => {
    assert.notEqual(translateArcadeText(SNAKE_BONUSES[kind].label, 'ro'), SNAKE_BONUSES[kind].label);
    assert.notEqual(translateArcadeText(SNAKE_BONUSES[kind].notice, 'ro'), SNAKE_BONUSES[kind].notice);
  });
});

test('restarting clears bonuses and effects', () => {
  const game = withBonus('slow');
  game.tick();
  game.restart('solo');
  assert.equal(game.bonus, null);
  assert.equal(game.tickScale(), 1);
  assert.equal(game.riders[1].ghostTicks, 0);
});
