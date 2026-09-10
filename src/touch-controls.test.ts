import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BOMBERMAN_TOUCH_LAYOUT_STORAGE_KEY,
  digitalJoystickState,
  clampJoystickOffset,
  joystickDirection,
  joystickVector,
  normalizeBombermanTouchLayout,
  swapBombermanTouchLayout,
} from './touch-controls.js';

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

test('Bomberman touch controls default to joystick right and can swap sides', () => {
  assert.match(BOMBERMAN_TOUCH_LAYOUT_STORAGE_KEY, /bomberman-touch-layout/);
  assert.equal(normalizeBombermanTouchLayout(undefined), 'joystick-right');
  assert.equal(normalizeBombermanTouchLayout('invalid'), 'joystick-right');
  assert.equal(normalizeBombermanTouchLayout('joystick-left'), 'joystick-left');
  assert.equal(swapBombermanTouchLayout('joystick-right'), 'joystick-left');
  assert.equal(swapBombermanTouchLayout('joystick-left'), 'joystick-right');
});

test('joystick vectors are normalized and preserve diagonals', () => {
  const vector = joystickVector(40, -40, 50);
  assert.equal(Math.round(vector.x * 100), 71);
  assert.equal(Math.round(vector.y * 100), -71);
  assert.deepEqual(joystickVector(4, 5, 50), { x: 0, y: 0 });
});

test('digital joystick modes support free, cardinal, horizontal, and vertical controls', () => {
  assert.deepEqual(digitalJoystickState({ x: .8, y: -.7 }), {
    up: true, down: false, left: false, right: true,
  });
  assert.deepEqual(digitalJoystickState({ x: .8, y: -.7 }, 'cardinal'), {
    up: false, down: false, left: false, right: true,
  });
  assert.deepEqual(digitalJoystickState({ x: .8, y: -.7 }, 'vertical'), {
    up: true, down: false, left: false, right: false,
  });
  assert.deepEqual(digitalJoystickState({ x: .8, y: -.7 }, 'horizontal'), {
    up: false, down: false, left: false, right: true,
  });
});
