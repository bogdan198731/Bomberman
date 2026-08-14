import test from 'node:test';
import assert from 'node:assert/strict';
import { InviteRoom, isOnlineGameId, isRelayPayload } from './relay.js';

test('only multiplayer arcade games can create invite rooms', () => {
  assert.equal(isOnlineGameId('tintar'), true);
  assert.equal(isOnlineGameId('survival'), true);
  assert.equal(isOnlineGameId('star'), false);
  assert.equal(isOnlineGameId('bomberman'), false);
});

test('an invite room assigns Mint and Coral seats', () => {
  const room = new InviteRoom('abc23', 'paddle');
  assert.equal(room.code, 'ABC23');
  assert.equal(room.join(), 1);
  assert.equal(room.join(), 2);
  assert.equal(room.join(), null);
  assert.deepEqual(room.snapshot().connectedPlayers, [1, 2]);
});

test('a disconnected invite seat can be reclaimed', () => {
  const room = new InviteRoom('ROOM1', 'snake');
  room.join(); room.join(); room.leave(2);
  assert.equal(room.join(), 2);
});

test('invite snapshots retain the game and room identity', () => {
  const room = new InviteRoom('tank2', 'tanks');
  room.join();
  assert.deepEqual(room.snapshot(), { roomCode: 'TANK2', game: 'tanks', connectedPlayers: [1] });
});

test('relay payload validation rejects invalid and oversized data', () => {
  assert.equal(isRelayPayload({ type: 'turn', direction: 'up' }), true);
  assert.equal(isRelayPayload(null), false);
  assert.equal(isRelayPayload('turn'), false);
  assert.equal(isRelayPayload({ value: 'x'.repeat(70_000) }), false);
});
