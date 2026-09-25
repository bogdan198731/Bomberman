import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  ARCADE_TOUCH_LAYOUT_STORAGE_KEY,
  BOMBERMAN_TOUCH_LAYOUT_STORAGE_KEY,
  DEFAULT_ARCADE_TOUCH_LAYOUT,
  DEFAULT_BOMBERMAN_TOUCH_LAYOUT,
  initTouchLayoutSwap,
  loadArcadeTouchLayout,
  saveArcadeTouchLayout,
  swapArcadeTouchLayout,
  touchLayoutSwapLabel,
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

test('the joystick swap preference is shared, persisted, and survives junk', () => {
  const store = new Map<string, string>();
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
  };

  assert.equal(loadArcadeTouchLayout(storage), 'joystick-right', 'right-handed default');
  assert.equal(saveArcadeTouchLayout('joystick-left', storage), 'joystick-left');
  assert.equal(loadArcadeTouchLayout(storage), 'joystick-left', 'the choice persists');
  assert.equal(swapArcadeTouchLayout('joystick-left'), 'joystick-right');
  assert.equal(swapArcadeTouchLayout('joystick-right'), 'joystick-left');

  store.set(ARCADE_TOUCH_LAYOUT_STORAGE_KEY, 'sideways');
  assert.equal(loadArcadeTouchLayout(storage), 'joystick-right', 'junk falls back to the default');

  const throwing = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
  };
  assert.equal(loadArcadeTouchLayout(throwing), 'joystick-right');
  assert.equal(saveArcadeTouchLayout('joystick-left', throwing), 'joystick-left');
});

test('Blast Buddies and the new games read the same stored preference', () => {
  // A shared key is what makes the setting arcade-wide; splitting it would
  // silently give each game its own handedness.
  assert.equal(BOMBERMAN_TOUCH_LAYOUT_STORAGE_KEY, ARCADE_TOUCH_LAYOUT_STORAGE_KEY);
  assert.equal(DEFAULT_BOMBERMAN_TOUCH_LAYOUT, DEFAULT_ARCADE_TOUCH_LAYOUT);
});

test('the swap label names the side and the action being moved', () => {
  assert.equal(
    touchLayoutSwapLabel('joystick-right', 'fire button'),
    'Joystick is on the right. Move joystick to the left and swap the fire button.',
  );
  assert.match(touchLayoutSwapLabel('joystick-left', 'pedals'), /^Joystick is on the left\..*swap the pedals\.$/);
});

test('every joystick-and-action game exposes a swap control that CSS can mirror', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const id of ['tanksTouchSwap', 'survivalTouchSwap', 'starTouchSwap', 'racingTouchSwap']) {
    assert.match(html, new RegExp(`id="${id}"[^>]*class="touch-swap-button"`), `${id} should exist`);
  }
  // Four containers opt in, and the CSS must mirror both control shapes.
  assert.equal((html.match(/data-touch-layout="joystick-right"/g) ?? []).length, 4);
  assert.match(html, /\[data-touch-layout="joystick-left"\][\s\S]*?\.arcade-joystick \{\s*grid-column: 1;/);
  assert.match(html, /\[data-touch-layout="joystick-left"\][\s\S]*?\.tank-touch-button\.fire \{\s*grid-column: 3;/);
  assert.match(html, /\[data-touch-layout="joystick-left"\][\s\S]*?\.racing-pedals \{\s*grid-column: 3;/);
});

test('swapping in one game applies to the others without a reload', () => {
  const listeners = new Map<string, ((event: Event) => void)[]>();
  const makeEl = () => {
    const el = {
      dataset: {} as Record<string, string>,
      attributes: {} as Record<string, string>,
      setAttribute(name: string, value: string) { this.attributes[name] = value; },
      handlers: [] as (() => void)[],
      addEventListener(_type: string, fn: () => void) { this.handlers.push(fn); },
      removeEventListener() {},
    };
    return el;
  };
  const store = new Map<string, string>();
  const globals = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
    },
    window: {
      addEventListener(type: string, fn: (event: Event) => void) {
        listeners.set(type, [...(listeners.get(type) ?? []), fn]);
      },
      removeEventListener() {},
      dispatchEvent(event: Event) {
        (listeners.get(event.type) ?? []).forEach(fn => fn(event));
        return true;
      },
    },
    CustomEvent: class { type: string; detail: unknown;
      constructor(type: string, init?: { detail?: unknown }) { this.type = type; this.detail = init?.detail; } },
  };
  const saved = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries(globals)) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, configurable: true });
  }
  try {
    const tanks = { container: makeEl(), button: makeEl() };
    const racing = { container: makeEl(), button: makeEl() };
    initTouchLayoutSwap({ container: tanks.container as never, button: tanks.button as never, actionLabel: 'fire button' });
    initTouchLayoutSwap({ container: racing.container as never, button: racing.button as never, actionLabel: 'pedals' });

    assert.equal(tanks.container.dataset.touchLayout, 'joystick-right');
    assert.equal(racing.container.dataset.touchLayout, 'joystick-right');

    tanks.button.handlers.forEach(fn => fn());

    assert.equal(tanks.container.dataset.touchLayout, 'joystick-left', 'the game you tapped updates');
    assert.equal(racing.container.dataset.touchLayout, 'joystick-left', 'and so does every other game');
    assert.equal(store.get(ARCADE_TOUCH_LAYOUT_STORAGE_KEY), 'joystick-left', 'and it is remembered');
    assert.match(racing.button.attributes['aria-label'], /swap the pedals/);
  } finally {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
