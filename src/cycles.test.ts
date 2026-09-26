import test from 'node:test';
import assert from 'node:assert/strict';
import { CYCLE_COLUMNS, CYCLE_ROWS, CYCLE_TARGET, LightCyclesGame } from './cycles.js';

function seeded(seed = 11): () => number {
  let state = seed;
  return () => { state = (state * 16807) % 2147483647; return state / 2147483647; };
}

function playing(mode: 'bot' | 'duel' = 'duel'): LightCyclesGame {
  const game = new LightCyclesGame(seeded());
  game.restart(mode);
  game.startRound();
  return game;
}

test('riders start mirrored with their first cell already lit', () => {
  const game = new LightCyclesGame();
  assert.equal(game.phase, 'ready');
  assert.equal(game.riders[1].x + game.riders[2].x, CYCLE_COLUMNS - 1, 'spawns mirror each other');
  assert.equal(game.occupant(game.riders[1].x, game.riders[1].y), 1);
  assert.equal(game.occupant(game.riders[2].x, game.riders[2].y), 2);
  assert.equal(game.trails.length, CYCLE_COLUMNS * CYCLE_ROWS);
});

test('every move leaves a permanent trail', () => {
  const game = playing();
  const start = { x: game.riders[1].x, y: game.riders[1].y };
  for (let i = 0; i < 4; i++) game.tick();
  for (let x = start.x; x <= start.x + 4; x++) assert.equal(game.occupant(x, start.y), 1, `trail at ${x}`);
});

test('a rider cannot turn straight back into its own trail', () => {
  const game = playing();
  assert.equal(game.turn(1, 'left'), false, 'Mint is heading right');
  assert.equal(game.turn(1, 'up'), true);
});

test('riding into the arena edge loses the round', () => {
  const game = playing();
  game.turn(1, 'up');
  for (let i = 0; i < CYCLE_ROWS; i++) {
    game.tick();
    if (game.phase !== 'playing') break;
  }
  assert.equal(game.riders[1].alive, false);
  assert.equal(game.roundWinner, 2);
  assert.equal(game.riders[2].score, 1);
  assert.equal(game.phase, 'round-over');
});

test('riding into any trail - yours or theirs - loses the round', () => {
  const game = playing();
  // Mint loops up, left and down into its own trail.
  game.turn(1, 'up'); game.tick();
  game.turn(1, 'left'); game.tick();
  game.turn(1, 'down'); game.tick();
  game.turn(1, 'right'); game.tick();
  assert.equal(game.riders[1].alive, false, 'own trail is lethal');
  assert.equal(game.roundWinner, 2);
});

test('a head-on crash is a draw and nobody scores', () => {
  const game = playing();
  game.riders[1].x = 10; game.riders[1].y = 5;
  game.riders[2].x = 12; game.riders[2].y = 5;
  game.tick();
  assert.equal(game.riders[1].alive, false);
  assert.equal(game.riders[2].alive, false);
  assert.equal(game.roundWinner, 0);
  assert.deepEqual([game.riders[1].score, game.riders[2].score], [0, 0]);
});

test('first to three rounds takes the match, and a restart clears the score', () => {
  const game = playing();
  for (let round = 0; round < CYCLE_TARGET; round++) {
    if (round > 0) game.startRound();
    game.turn(2, 'up');
    while (game.phase === 'playing') game.tick();
  }
  assert.equal(game.phase, 'finished');
  assert.equal(game.matchWinner, 1);
  assert.equal(game.riders[1].score, CYCLE_TARGET);
  game.restart('duel');
  assert.deepEqual([game.riders[1].score, game.riders[2].score, game.matchWinner], [0, 0, null]);
});

test('the bot never takes a lethal turn when a safe one exists', () => {
  const random = seeded(3);
  for (let trial = 0; trial < 60; trial++) {
    const game = new LightCyclesGame(random);
    game.restart('bot');
    game.botLevel = (['easy', 'normal', 'hard'] as const)[trial % 3];
    game.startRound();
    // Scatter trail cells to build awkward boards.
    for (let i = 0; i < 180; i++) {
      const x = Math.floor(random() * CYCLE_COLUMNS);
      const y = Math.floor(random() * CYCLE_ROWS);
      const index = y * CYCLE_COLUMNS + x;
      if (game.trails[index] === '0') game.trails = game.trails.slice(0, index) + '1' + game.trails.slice(index + 1);
    }
    const bot = game.riders[2];
    const safe = (['up', 'down', 'left', 'right'] as const).filter(direction => {
      if (direction === { up: 'down', down: 'up', left: 'right', right: 'left' }[bot.direction]) return false;
      const [dx, dy] = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[direction];
      return game.occupant(bot.x + dx, bot.y + dy) === 0;
    });
    if (!safe.length) continue;
    const choice = game.chooseBotDirection();
    assert.ok(safe.includes(choice as typeof safe[number]), `trial ${trial}: bot chose ${choice} with ${safe.join('/')} open`);
  }
});

test('the normal bot heads for the larger open region', () => {
  const game = playing('bot');
  const bot = game.riders[2];
  bot.x = 15; bot.y = 10; bot.direction = 'up';
  // Straight is blocked. Left opens into a sealed 5x3 pocket, right into the
  // rest of the grid - so a bot that just prefers "left" walks into a trap.
  const trails = '0'.repeat(CYCLE_COLUMNS * CYCLE_ROWS).split('');
  const wall = (x: number, y: number): void => { trails[y * CYCLE_COLUMNS + x] = '1'; };
  for (let x = 9; x <= 15; x++) { wall(x, 9); wall(x, 13); }
  for (let y = 9; y <= 13; y++) wall(9, y);
  wall(15, 11); wall(15, 12);
  trails[10 * CYCLE_COLUMNS + 15] = '2';
  game.trails = trails.join('');
  assert.equal(game.openArea(14, 10), 15, 'the left pocket is small and sealed');
  assert.ok(game.openArea(16, 10) > 400, 'the right side is wide open');
  assert.equal(game.chooseBotDirection(), 'right');
});

test('a bot outlasts a rider that just drives straight', () => {
  const game = playing('bot');
  game.botLevel = 'normal';
  while (game.phase === 'playing') game.tick();
  assert.equal(game.roundWinner, 2, 'Mint rides straight into the far wall; the bot must not crash first');
});
