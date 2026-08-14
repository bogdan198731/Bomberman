import assert from 'node:assert/strict';
import test from 'node:test';
import { MatchmakingQueue } from './matchmaking.js';

type TestGame = 'bomberman' | 'snake' | 'paddle';

test('matchmaking pairs players only within the requested game', () => {
  const queue = new MatchmakingQueue<TestGame>();
  queue.enqueue('snake', 'SNAK2');
  queue.enqueue('paddle', 'PADL2');
  assert.equal(queue.claim('bomberman', () => true), null);
  assert.equal(queue.claim('snake', () => true), 'SNAK2');
  assert.equal(queue.claim('paddle', () => true), 'PADL2');
});

test('claim skips stale rooms and returns the next available room', () => {
  const queue = new MatchmakingQueue<TestGame>();
  queue.enqueue('bomberman', 'OLD22');
  queue.enqueue('bomberman', 'OPEN2');
  assert.equal(queue.claim('bomberman', code => code === 'OPEN2'), 'OPEN2');
  assert.equal(queue.waitingCount('bomberman'), 0);
});

test('rooms cannot be queued twice and matching removes them immediately', () => {
  const queue = new MatchmakingQueue<TestGame>();
  assert.equal(queue.enqueue('snake', 'ROOM2'), true);
  assert.equal(queue.enqueue('snake', 'room2'), false);
  assert.equal(queue.has('ROOM2'), true);
  assert.equal(queue.claim('snake', () => true), 'ROOM2');
  assert.equal(queue.has('ROOM2'), false);
});

test('a waiting player can leave matchmaking cleanly', () => {
  const queue = new MatchmakingQueue<TestGame>();
  queue.enqueue('paddle', 'LEFT2');
  assert.equal(queue.remove('left2'), true);
  assert.equal(queue.remove('LEFT2'), false);
  assert.equal(queue.waitingCount('paddle'), 0);
  assert.equal(queue.claim('paddle', () => true), null);
});
