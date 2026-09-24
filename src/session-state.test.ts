import test from 'node:test';
import assert from 'node:assert/strict';
import { ActiveClock, SessionState } from './session-state.js';

test('closing help preserves a paused session until an explicit resume', () => {
  const state = new SessionState();
  state.interrupt('racing', 'solo', true);
  state.block('help', true); state.block('settings', true);
  assert.equal(state.resume('racing'), false);
  state.block('settings', false); state.block('help', false);
  assert.equal(state.pausedGame, 'racing');
  assert.equal(state.resume('blocks'), false);
  assert.equal(state.resume('racing'), true);
});
test('online interruptions never stop the simulation, and idle games do not gain a pause', () => {
  const state = new SessionState();
  state.interrupt('racing', 'online', true);
  assert.equal(state.pausedGame, null);
  state.interrupt('racing', 'local', false);
  assert.equal(state.pausedGame, null);
  state.interrupt('racing', 'local', true);
  state.reset(); assert.equal(state.pausedGame, null);
});
test('wall-clock fuses exclude a long pause and hidden view time', () => {
  const clock = new ActiveClock(1000);
  assert.equal(clock.tick(1200, true), 1200);
  assert.equal(clock.tick(31200, false), 1200);
  assert.equal(clock.tick(31300, true), 1300);
});
