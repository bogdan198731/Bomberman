import test from 'node:test';
import assert from 'node:assert/strict';
import { InviteRoom, isOnlineGameId, isRelayPayload, roomSize } from './relay.js';

test('only multiplayer arcade games can create invite rooms', () => {
  assert.equal(isOnlineGameId('tintar'), true);
  assert.equal(isOnlineGameId('septica'), true);
  assert.equal(isOnlineGameId('survival'), true);
  assert.equal(isOnlineGameId('racing'), true);
  assert.equal(isOnlineGameId('blocks'), true);
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
  assert.deepEqual(room.snapshot(), { roomCode: 'TANK2', game: 'tanks', connectedPlayers: [1], capacity: 2 });
});

test('relay payload validation rejects invalid and oversized data', () => {
  assert.equal(isRelayPayload({ type: 'turn', direction: 'up' }), true);
  assert.equal(isRelayPayload(null), false);
  assert.equal(isRelayPayload('turn'), false);
  assert.equal(isRelayPayload({ value: 'x'.repeat(70_000) }), false);
});

test('only Șeptică rooms seat three or four; everything else stays two-player', () => {
  assert.equal(roomSize('septica', 4), 4);
  assert.equal(roomSize('septica', 3), 3);
  assert.equal(roomSize('septica', 9), 2);
  assert.equal(roomSize('septica', undefined), 2);
  assert.equal(roomSize('paddle', 4), 2);
  assert.equal(new InviteRoom('SNK22', 'snake', 4).capacity, 2);
});

test('a four-seat room fills in order, is full at four, and hands back a dropped seat', () => {
  const room = new InviteRoom('CARD4', 'septica', 4);
  assert.deepEqual([room.join(), room.join(), room.join()], [1, 2, 3]);
  assert.equal(room.isFull(), false);
  assert.equal(room.join(), 4);
  assert.equal(room.isFull(), true);
  assert.equal(room.join(), null);
  room.leave(3);
  assert.equal(room.join(), 3);
  assert.deepEqual(room.snapshot().connectedPlayers, [1, 2, 3, 4]);
});
