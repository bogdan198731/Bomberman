import test from 'node:test';
import assert from 'node:assert/strict';
import { GAME_GUIDES } from './game-experience.js';
import { GAME_META } from './stats.js';

test('every arcade game has a complete English and Romanian quick guide', () => {
  assert.deepEqual(Object.keys(GAME_GUIDES).sort(), Object.keys(GAME_META).sort());
  for (const guide of Object.values(GAME_GUIDES)) {
    assert.ok(guide.objective.every(line => line.trim().length > 0));
    assert.ok(guide.controls.every(line => line.trim().length > 0));
    assert.ok(guide.tip.every(line => line.trim().length > 0));
    assert.ok(guide.rules.length >= 2);
    assert.ok(guide.rules.every(rule => rule.every(line => line.trim().length > 0)));
  }
});
