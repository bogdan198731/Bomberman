import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BAT_HEIGHT,
  BIG_BAT_HEIGHT,
  PADDLE_BONUSES,
  PADDLE_BONUS_KINDS,
  PADDLE_HEIGHT,
  PADDLE_ORB_CHANCE,
  PADDLE_TARGET_SCORE,
  PADDLE_WIDTH,
  PaddleClashGame,
  TINY_BAT_HEIGHT,
  pickPaddleBonus,
} from './paddle.js';
import { translateArcadeText } from './i18n.js';

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

test('direct touch dragging positions a paddle without overshooting the court', () => {
  const game = new PaddleClashGame();
  game.moveBatTo(1, PADDLE_HEIGHT * .75);
  assert.ok(game.players[1].y > PADDLE_HEIGHT / 2);
  game.moveBatTo(1, -100);
  assert.equal(game.players[1].y, 0);
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

/** A rally in progress with no orbs unless asked. */
function inPlay(random: () => number = () => 1): PaddleClashGame {
  const game = new PaddleClashGame(random);
  game.serve();
  return game;
}

test('orbs are picked by weight and appear only sometimes', () => {
  const counts = Object.fromEntries(PADDLE_BONUS_KINDS.map(kind => [kind, 0])) as Record<string, number>;
  for (let i = 0; i < 1000; i++) counts[pickPaddleBonus(i / 1000)]++;
  PADDLE_BONUS_KINDS.forEach(kind => assert.ok(counts[kind] > 0, `${kind} can appear`));
  assert.ok(PADDLE_ORB_CHANCE > 0.1 && PADDLE_ORB_CHANCE < 0.5);
});

test('a bat hit can bring out an orb in mid-court, which goes to whoever last hit the ball', () => {
  const rolls = [0, 0.5, 0.5, 0]; // spawn, x, y, the first kind: a big paddle
  const game = inPlay(() => rolls.shift() ?? 1);
  game.ball = { x: 66, y: game.players[1].y + 54, vx: -360, vy: 0 };
  game.update(0.01);
  assert.ok(game.orb, 'an orb appeared');
  assert.equal(game.orb.kind, 'big');
  assert.ok(game.orb.x > PADDLE_WIDTH * .3 && game.orb.x < PADDLE_WIDTH * .7, 'away from both bats');
  game.ball = { x: game.orb.x - 40, y: game.orb.y, vx: 400, vy: 0 };
  game.update(0.02);
  assert.equal(game.orb, null);
  assert.equal(game.batHeight(1), BIG_BAT_HEIGHT);
  assert.equal(game.statusText(), 'Mint: Big paddle!');
  assert.equal(translateArcadeText(game.statusText(), 'ro'), 'Mint: Paletă mare!');
});

test('a bigger bat keeps its centre and stays on the court', () => {
  const game = inPlay();
  game.moveBatTo(1, PADDLE_HEIGHT); // flat against the floor
  game.collect(1, 'big');
  assert.equal(game.players[1].y, PADDLE_HEIGHT - BIG_BAT_HEIGHT);
  game.moveBatTo(2, PADDLE_HEIGHT / 2);
  game.collect(1, 'tiny');
  assert.equal(game.batHeight(2), TINY_BAT_HEIGHT);
  assert.equal(game.players[2].y + TINY_BAT_HEIGHT / 2, PADDLE_HEIGHT / 2);
  assert.deepEqual(game.activeEffects(1).map(effect => effect.kind).sort(), ['big', 'tiny']);
  assert.deepEqual(game.activeEffects(2), []);
});

test('timed bat changes wear off', () => {
  const game = inPlay();
  game.collect(2, 'big');
  game.ball = { x: PADDLE_WIDTH / 2, y: PADDLE_HEIGHT / 2, vx: 0, vy: 0 }; // parked mid-court
  for (let t = 0; t < PADDLE_BONUSES.big.seconds / 0.04 + 2; t++) game.update(0.04);
  assert.equal(game.batHeight(2), BAT_HEIGHT);
});

test('a goal shield saves one point, then the next miss counts', () => {
  const game = inPlay();
  game.collect(1, 'shield');
  game.ball = { x: 12, y: 20, vx: -400, vy: 0 };
  game.players[1].y = PADDLE_HEIGHT - BAT_HEIGHT; // the bat is nowhere near
  game.update(0.01);
  assert.equal(game.players[2].score, 0);
  assert.ok(game.ball.vx > 0, 'the ball bounced back');
  assert.equal(game.effects[1].shield, false);
  game.ball = { x: 12, y: 20, vx: -400, vy: 0 };
  for (let t = 0; t < 5; t++) game.update(0.02);
  assert.equal(game.players[2].score, 1);
});

test('every point starts level: orbs and bonuses are cleared', () => {
  const game = inPlay();
  game.collect(1, 'big');
  game.collect(2, 'shield');
  game.orb = { x: 450, y: 270, kind: 'tiny', secondsLeft: 5 };
  game.ball = { x: 930, y: 20, vx: 400, vy: 0 };
  game.effects[2].shield = false;
  game.update(0.01);
  assert.equal(game.players[1].score, 1);
  assert.equal(game.orb, null);
  assert.equal(game.batHeight(1), BAT_HEIGHT);
});

test('every bonus label and notice has a Romanian translation', () => {
  PADDLE_BONUS_KINDS.forEach(kind => {
    assert.notEqual(translateArcadeText(PADDLE_BONUSES[kind].label, 'ro'), PADDLE_BONUSES[kind].label);
    assert.notEqual(translateArcadeText(PADDLE_BONUSES[kind].notice, 'ro'), PADDLE_BONUSES[kind].notice);
  });
});
