import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { OnlineRoom, isPlayerAction } from './multiplayer.js';

function createPlayingRoom(): OnlineRoom {
  const room = new OnlineRoom('TEST1');
  room.connectPlayer(1, 1_000);
  room.connectPlayer(2, 1_000);
  room.update(2_750);
  return room;
}

test('online room waits for two players before starting', () => {
  const room = new OnlineRoom('TEST1');
  room.connectPlayer(1, 1_000);
  assert.strictEqual(room.phase, 'waiting');

  room.connectPlayer(2, 1_000);
  assert.strictEqual(room.phase, 'countdown');
  assert.strictEqual(room.snapshot(1_700).overlayText, 'READY');

  room.update(2_750);
  assert.strictEqual(room.phase, 'playing');
});

test('each online client can move only its assigned player', () => {
  const room = createPlayingRoom();

  room.handleAction(1, { type: 'move', dx: 1, dy: 0 }, 3_000);

  assert.deepStrictEqual(
    { x: room.players[0].x, y: room.players[0].y },
    { x: 2, y: 1 }
  );
  assert.deepStrictEqual(
    { x: room.players[1].x, y: room.players[1].y },
    { x: 11, y: 11 }
  );
});

test('online bomb actions retain owner and player blast radius', () => {
  const room = createPlayingRoom();
  room.players[1].blastRadius = 4;

  room.handleAction(2, { type: 'bomb' }, 3_000);

  assert.strictEqual(room.gameState.bombs.length, 1);
  assert.strictEqual(room.gameState.bombs[0].ownerId, 2);
  assert.strictEqual(room.gameState.bombs[0].radius, 4);
});

test('room snapshots are JSON serializable and include both players', () => {
  const room = createPlayingRoom();
  const snapshot = room.snapshot(3_000);

  assert.strictEqual(snapshot.connectedPlayers.length, 2);
  assert.strictEqual(snapshot.players.length, 2);
  assert.doesNotThrow(() => JSON.stringify(snapshot));
});

test('either online player can start the next round', () => {
  const room = createPlayingRoom();

  room.handleAction(2, { type: 'restart' }, 4_000);

  assert.strictEqual(room.round, 2);
  assert.strictEqual(room.phase, 'countdown');
});

test('disconnecting a player pauses the room', () => {
  const room = createPlayingRoom();

  room.disconnectPlayer(2);

  assert.strictEqual(room.phase, 'waiting');
  assert.deepStrictEqual(room.snapshot().connectedPlayers, [1]);
});

test('network action validation rejects diagonal and malformed movement', () => {
  assert.strictEqual(isPlayerAction({ type: 'move', dx: 1, dy: 0 }), true);
  assert.strictEqual(isPlayerAction({ type: 'move', dx: 1, dy: 1 }), false);
  assert.strictEqual(isPlayerAction({ type: 'move', dx: 4, dy: 0 }), false);
  assert.strictEqual(isPlayerAction({ type: 'bomb' }), true);
  assert.strictEqual(isPlayerAction({ type: 'unknown' }), false);
});
