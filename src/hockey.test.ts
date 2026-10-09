import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AirHockeyGame,
  GOAL_BOTTOM,
  GOAL_TOP,
  HOCKEY_TARGET,
  MALLET_R,
  PUCK_R,
  RINK_HEIGHT,
  RINK_WIDTH,
} from './hockey.js';

function run(game: AirHockeyGame, seconds: number, each?: () => void): void {
  for (let t = 0; t < seconds; t += 1 / 60) { each?.(); game.update(1 / 60); }
}

function live(mode: 'bot' | 'duel' = 'duel'): AirHockeyGame {
  const game = new AirHockeyGame();
  game.restart(mode);
  game.start();
  return game;
}

/** Parks both mallets far from the action so a test controls the puck alone. */
function clearMallets(game: AirHockeyGame): void {
  game.mallets[1] = { x: MALLET_R, y: MALLET_R, vx: 0, vy: 0 };
  game.mallets[2] = { x: RINK_WIDTH - MALLET_R, y: MALLET_R, vx: 0, vy: 0 };
  game.aim(1, MALLET_R, MALLET_R);
  game.aim(2, RINK_WIDTH - MALLET_R, MALLET_R);
}

test('each mallet is kept on its own half of the table', () => {
  const game = live();
  game.aim(1, RINK_WIDTH, -100);
  assert.equal(game.targets[1].x, RINK_WIDTH / 2 - MALLET_R);
  assert.equal(game.targets[1].y, MALLET_R);
  game.aim(2, 0, RINK_HEIGHT * 2);
  assert.equal(game.targets[2].x, RINK_WIDTH / 2 + MALLET_R);
  assert.equal(game.targets[2].y, RINK_HEIGHT - MALLET_R);
});

test('the puck bounces off the side walls and slows down over time', () => {
  const game = live();
  clearMallets(game);
  game.puck = { x: 450, y: 60, vx: 0, vy: -500 };
  run(game, 0.3);
  assert.ok(game.puck.vy > 0, 'it came back off the top wall');
  const before = Math.hypot(game.puck.vx, game.puck.vy);
  run(game, 0.5);
  assert.ok(Math.hypot(game.puck.vx, game.puck.vy) < before, 'friction slowed it');
});

test('the end walls bounce the puck unless it goes into the goal mouth', () => {
  const game = live();
  clearMallets(game);
  game.puck = { x: 200, y: 100, vx: -600, vy: 0 }; // above the goal mouth
  run(game, 0.6);
  assert.ok(game.puck.vx > 0, 'bounced off the end wall');
  assert.deepEqual(game.scores, { 1: 0, 2: 0 });
});

test('a puck through the goal mouth scores for the other side', () => {
  const game = live();
  clearMallets(game);
  game.puck = { x: 200, y: (GOAL_TOP + GOAL_BOTTOM) / 2, vx: -700, vy: 0 };
  run(game, 0.6);
  assert.equal(game.scores[2], 1, 'Coral scores in Mint’s goal');
  assert.equal(game.lastScorer, 2);
  assert.equal(game.phase, 'scored');
  assert.ok(game.puck.x < RINK_WIDTH / 2, 'Mint, who conceded, gets the puck');
  assert.equal(game.puck.vx, 0);
  run(game, 1.5);
  assert.equal(game.phase, 'playing', 'play resumes after the pause');
});

test('first to seven wins the table', () => {
  const game = live();
  for (let goal = 0; goal < HOCKEY_TARGET; goal++) {
    clearMallets(game);
    game.puck = { x: 700, y: RINK_HEIGHT / 2, vx: 900, vy: 0 };
    run(game, 2);
  }
  assert.equal(game.scores[1], HOCKEY_TARGET);
  assert.equal(game.winner, 1);
  assert.equal(game.phase, 'finished');
  assert.equal(game.start(), true, 'starting again begins a fresh match');
  assert.deepEqual(game.scores, { 1: 0, 2: 0 });
});

test('a moving mallet drives the puck the way it was swung', () => {
  const game = live();
  game.mallets[2] = { x: RINK_WIDTH - MALLET_R, y: MALLET_R, vx: 0, vy: 0 };
  game.aim(2, RINK_WIDTH - MALLET_R, MALLET_R);
  game.puck = { x: 300, y: 270, vx: 0, vy: 0 };
  game.mallets[1] = { x: 150, y: 270, vx: 0, vy: 0 };
  game.aim(1, 400, 270); // swing straight through the puck
  run(game, 0.25);
  assert.ok(game.puck.vx > 600, `a solid hit, got ${Math.round(game.puck.vx)}px/s`);
  assert.ok(Math.abs(game.puck.vy) < 60, 'and it went straight');
});

test('a fast puck cannot pass through a mallet', () => {
  const game = live();
  game.mallets[1] = { x: 300, y: 270, vx: 0, vy: 0 };
  game.aim(1, 300, 270);
  game.mallets[2] = { x: RINK_WIDTH - MALLET_R, y: MALLET_R, vx: 0, vy: 0 };
  game.aim(2, RINK_WIDTH - MALLET_R, MALLET_R);
  game.puck = { x: 420, y: 270, vx: -1150, vy: 0 };
  game.update(0.05); // a long frame: 57px of travel
  game.update(0.05);
  assert.ok(game.puck.x > 300, 'the puck stayed on the far side of the mallet');
  assert.ok(game.puck.vx > 0, 'and bounced back');
});

test('the bot blocks a slow shot at its goal', () => {
  for (const level of ['normal', 'hard'] as const) {
    const game = live('bot');
    game.botLevel = level;
    game.mallets[1] = { x: MALLET_R, y: MALLET_R, vx: 0, vy: 0 };
    game.aim(1, MALLET_R, MALLET_R);
    game.puck = { x: 480, y: RINK_HEIGHT / 2, vx: 380, vy: 20 };
    run(game, 3);
    assert.equal(game.scores[1], 0, `${level} bot let in a slow shot`);
  }
});

test('the bot puts the puck away against an idle player', () => {
  for (const level of ['easy', 'normal', 'hard'] as const) {
    const game = live('bot');
    game.botLevel = level;
    game.random = seeded(3);
    game.puck = { x: RINK_WIDTH / 2 + 120, y: RINK_HEIGHT / 2 + 40, vx: 0, vy: 0 };
    let seconds = 0;
    while (seconds < 40 && game.scores[2] === 0) {
      // Mint stands still in the corner, away from the goal mouth.
      game.aim(1, MALLET_R, MALLET_R);
      game.update(1 / 60);
      seconds += 1 / 60;
    }
    assert.equal(game.scores[2] > 0, true, `${level} bot never scored in 40s`);
  }
});

test('the puck never leaves the table outside a goal', () => {
  const game = live('bot');
  let escaped = false;
  run(game, 30, () => {
    game.aim(1, 200 + Math.sin(game.puck.x) * 150, game.puck.y);
    const { x, y } = game.puck;
    const inMouth = y > GOAL_TOP && y < GOAL_BOTTOM;
    if (y < PUCK_R - 1 || y > RINK_HEIGHT - PUCK_R + 1 || (!inMouth && (x < PUCK_R - 1 || x > RINK_WIDTH - PUCK_R + 1))) escaped = true;
  });
  assert.equal(escaped, false);
});

/** A repeatable stand-in for Math.random, so the bot's choices replay exactly. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    // mulberry32
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('tapping right at the face-off and then standing still does not start an endless rally', () => {
  for (const level of ['easy', 'normal', 'hard'] as const) {
    for (const [seed, hold] of [[1, 0.2], [2, 0.3], [3, 0.4], [4, 0.5], [5, 0.8]]) {
      const game = live('bot');
      game.botLevel = level;
      game.random = seeded(seed);
      let seconds = 0;
      // The bug: the bot fired straight back at the parked mallet and the puck went to and fro on one line forever.
      const lines = new Set<number>();
      while (seconds < 40 && game.scores[2] === 0) {
        if (seconds < hold) game.nudge(1, 1, 0, 1 / 60);
        game.update(1 / 60);
        seconds += 1 / 60;
        lines.add(Math.round(game.puck.y));
      }
      assert.ok(lines.size > 20, `${level} (seed ${seed}): the puck never left the y=270 line`);
      const atRest = Math.hypot(game.puck.vx, game.puck.vy) < 20 && game.puck.x < RINK_WIDTH / 2;
      assert.ok(game.scores[2] > 0 || atRest, `${level} (seed ${seed}): still rallying after 40s without a goal`);
    }
  }
});

test('the bot shoots around a mallet parked in front of the goal', () => {
  for (const level of ['normal', 'hard'] as const) {
    let goals = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const game = live('bot');
      game.botLevel = level;
      game.random = seeded(seed);
      game.puck = { x: 650, y: 150 + seed * 12, vx: 0, vy: 0 };
      let seconds = 0;
      while (seconds < 4 && game.scores[2] === 0) {
        game.aim(1, 120, RINK_HEIGHT / 2);
        game.update(1 / 60);
        seconds += 1 / 60;
      }
      if (game.scores[2] > 0) goals += 1;
    }
    assert.ok(goals >= 12, `${level} bot scored only ${goals}/20 past a parked mallet`);
  }
});

test('the bot varies its shots from the same spot', () => {
  const angles = new Set<number>();
  for (let seed = 1; seed <= 12; seed++) {
    const game = live('bot');
    game.botLevel = 'normal';
    game.random = seeded(seed);
    game.puck = { x: 650, y: RINK_HEIGHT / 2, vx: 0, vy: 0 };
    game.mallets[1] = { x: MALLET_R, y: MALLET_R, vx: 0, vy: 0 };
    let seconds = 0;
    while (seconds < 2 && game.puck.vx > -300) {
      game.aim(1, MALLET_R, MALLET_R);
      game.update(1 / 60);
      seconds += 1 / 60;
    }
    // Bucket the launch direction to 5 degrees.
    angles.add(Math.round((Math.atan2(game.puck.vy, -game.puck.vx) * 180) / Math.PI / 5));
  }
  assert.ok(angles.size >= 4, `only ${angles.size} distinct shot directions`);
});

test('the bot digs a dead puck out of its corner', () => {
  for (const level of ['easy', 'normal', 'hard'] as const) {
    for (const corner of [{ x: RINK_WIDTH - PUCK_R, y: PUCK_R }, { x: RINK_WIDTH - PUCK_R, y: RINK_HEIGHT - PUCK_R }]) {
      const game = live('bot');
      game.botLevel = level;
      game.random = seeded(7);
      game.puck = { ...corner, vx: 0, vy: 0 };
      let seconds = 0;
      while (seconds < 6 && game.puck.x > RINK_WIDTH - 150 && game.scores[1] === 0) {
        game.aim(1, MALLET_R, MALLET_R);
        game.update(1 / 60);
        seconds += 1 / 60;
      }
      assert.ok(game.puck.x <= RINK_WIDTH - 150, `${level} bot left the puck in its corner`);
      assert.equal(game.scores[1], 0, `${level} bot knocked it into its own goal`);
    }
  }
});

test('a mallet shoving the puck into the boards cannot push it off the table', () => {
  const game = live();
  clearMallets(game);
  game.puck = { x: 200, y: PUCK_R + 2, vx: 0, vy: 0 };
  game.mallets[1] = { x: 200, y: 120, vx: 0, vy: 0 };
  game.aim(1, 200, -200); // drive straight up through the puck into the top wall
  run(game, 0.3);
  assert.ok(game.puck.y >= PUCK_R, `the puck ended at y=${game.puck.y.toFixed(1)}`);
});
