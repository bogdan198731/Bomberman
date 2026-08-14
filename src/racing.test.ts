import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyRacingSnapshot,
  createRacingSnapshot,
  isPointOnRacingTrack,
  MicroRacersGame,
  RACING_CHECKPOINTS,
  RACING_TARGET_LAPS,
} from './racing.js';

function beginRace(game: MicroRacersGame): void {
  assert.equal(game.startRace(), true);
  game.update(3);
  assert.equal(game.phase, 'racing');
}

function completeLap(game: MicroRacersGame, player: 1 | 2): void {
  for (const checkpoint of [1, 2, 3, 0]) {
    game.cars[player].x = RACING_CHECKPOINTS[checkpoint].x;
    game.cars[player].y = RACING_CHECKPOINTS[checkpoint].y;
    game.cars[player].speed = 0;
    game.update(.01);
  }
}

test('Micro Racers starts ready for a bot race', () => {
  const game = new MicroRacersGame();
  assert.equal(game.mode, 'bot');
  assert.equal(game.phase, 'ready');
  assert.equal(game.cars[1].laps, 0);
  assert.equal(game.pickups.length, 4);
});

test('the race begins after a three-second countdown', () => {
  const game = new MicroRacersGame();
  assert.equal(game.startRace(), true);
  game.update(2);
  assert.equal(game.phase, 'countdown');
  game.update(1);
  assert.equal(game.phase, 'racing');
});

test('accelerating moves a racer while keeping it on the circuit', () => {
  const game = new MicroRacersGame();
  game.restart('duel');
  beginRace(game);
  const startX = game.cars[1].x;
  game.setInput(1, 'accelerate', true);
  for (let index = 0; index < 20; index += 1) game.update(.04);
  assert.ok(game.cars[1].x < startX);
  assert.ok(game.cars[1].speed > 0);
  assert.equal(isPointOnRacingTrack(game.cars[1].x, game.cars[1].y), true);
});

test('cars cannot drive through the center island', () => {
  const game = new MicroRacersGame();
  game.restart('duel');
  beginRace(game);
  game.cars[1] = { ...game.cars[1], x: 450, y: 390, angle: -Math.PI / 2, speed: 220 };
  game.update(.05);
  assert.ok(game.cars[1].y >= 390);
  assert.equal(isPointOnRacingTrack(game.cars[1].x, game.cars[1].y), true);
});

test('collecting a turbo bolt grants boost and starts its respawn', () => {
  const game = new MicroRacersGame();
  game.restart('duel');
  beginRace(game);
  const pickup = game.pickups[0];
  game.cars[1].x = pickup.x;
  game.cars[1].y = pickup.y;
  game.update(.01);
  assert.ok(game.cars[1].boostTimer > 2);
  assert.ok(game.cars[1].speed >= 235);
  assert.equal(pickup.active, false);
  assert.ok(pickup.respawnTimer > 4);
});

test('contact separates two cars without pushing them off the track', () => {
  const game = new MicroRacersGame();
  game.restart('duel');
  beginRace(game);
  game.cars[1] = { ...game.cars[1], x: 445, y: 470, speed: 0 };
  game.cars[2] = { ...game.cars[2], x: 455, y: 470, speed: 0 };
  game.update(.01);
  assert.ok(Math.hypot(game.cars[1].x - game.cars[2].x, game.cars[1].y - game.cars[2].y) >= 35.9);
  assert.equal(isPointOnRacingTrack(game.cars[1].x, game.cars[1].y), true);
  assert.equal(isPointOnRacingTrack(game.cars[2].x, game.cars[2].y), true);
});

test('a full ordered checkpoint circuit awards one lap', () => {
  const game = new MicroRacersGame();
  game.restart('duel');
  beginRace(game);
  completeLap(game, 1);
  assert.equal(game.cars[1].laps, 1);
  assert.equal(game.cars[1].nextCheckpoint, 1);
});

test('the first racer through three laps wins', () => {
  const game = new MicroRacersGame();
  game.restart('duel');
  beginRace(game);
  for (let lap = 0; lap < RACING_TARGET_LAPS; lap += 1) completeLap(game, 2);
  assert.equal(game.phase, 'finished');
  assert.equal(game.winner, 2);
  assert.equal(game.cars[2].laps, RACING_TARGET_LAPS);
});

test('the Coral bot accelerates toward its next checkpoint', () => {
  const game = new MicroRacersGame();
  beginRace(game);
  game.update(.04);
  assert.equal(game.inputs[2].accelerate, true);
  assert.ok(game.cars[2].speed > 0);
});

test('the Coral bot can navigate the circuit and finish a race', () => {
  const game = new MicroRacersGame();
  beginRace(game);
  for (let tick = 0; tick < 15_000 && game.phase === 'racing'; tick += 1) game.update(.04);
  assert.equal(game.phase, 'finished');
  assert.equal(game.winner, 2);
});

test('online race snapshots restore the authoritative race', () => {
  const host = new MicroRacersGame();
  host.restart('duel');
  beginRace(host);
  host.cars[1].laps = 2;
  host.cars[1].boostTimer = 1.5;
  const encoded = JSON.stringify(createRacingSnapshot(host));

  const guest = new MicroRacersGame();
  applyRacingSnapshot(guest, JSON.parse(encoded));
  assert.equal(guest.mode, 'duel');
  assert.equal(guest.phase, 'racing');
  assert.equal(guest.cars[1].laps, 2);
  assert.equal(guest.cars[1].boostTimer, 1.5);
});
