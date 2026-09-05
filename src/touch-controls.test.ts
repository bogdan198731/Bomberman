import assert from 'node:assert/strict';
import test from 'node:test';
import { clampJoystickOffset, joystickDirection } from './touch-controls.js';

test('joystick ignores movement inside its dead zone', () => {
  assert.equal(joystickDirection(0, 0, 50), null);
  assert.equal(joystickDirection(8, 4, 50), null);
});

test('joystick turns a drag into the dominant cardinal direction', () => {
  assert.deepEqual(joystickDirection(40, 8, 50), { dx: 1, dy: 0 });
  assert.deepEqual(joystickDirection(-35, 12, 50), { dx: -1, dy: 0 });
  assert.deepEqual(joystickDirection(10, -38, 50), { dx: 0, dy: -1 });
  assert.deepEqual(joystickDirection(-8, 34, 50), { dx: 0, dy: 1 });
});

test('joystick knob offset stays inside its circular track', () => {
  assert.deepEqual(clampJoystickOffset(12, -5, 50), { x: 12, y: -5 });
  const offset = clampJoystickOffset(60, 80, 50);
  assert.equal(Math.round(offset.x), 30);
  assert.equal(Math.round(offset.y), 40);
  assert.equal(Math.round(Math.hypot(offset.x, offset.y)), 50);
});
