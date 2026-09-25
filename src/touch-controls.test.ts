import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import {
  capturePointer,
  ARCADE_TOUCH_LAYOUT_STORAGE_KEY,
  BOMBERMAN_TOUCH_LAYOUT_STORAGE_KEY,
  DEFAULT_ARCADE_TOUCH_LAYOUT,
  DEFAULT_BOMBERMAN_TOUCH_LAYOUT,
  broadcastTouchLayout,
  initArcadeTouchLayout,
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

test('games with a joystick and an action control mirror both', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  // Mini Tanks, Survival, Star Defender share the fire-button layout; Micro
  // Racers uses pedals. Both shapes have to swap sides, not just the joystick.
  assert.match(html, /\[data-touch-layout="joystick-left"\][\s\S]*?\.arcade-joystick \{\s*grid-column: 1;/);
  assert.match(html, /\[data-touch-layout="joystick-left"\][\s\S]*?\.tank-touch-button\.fire \{\s*grid-column: 3;/);
  assert.match(html, /\[data-touch-layout="joystick-left"\][\s\S]*?\.racing-pedals \{\s*grid-column: 3;/);
});

test('the Settings choice applies to every game at once', () => {
  const listeners = new Map<string, ((event: Event) => void)[]>();
  const store = new Map<string, string>();
  const containers = ['paddle', 'tanks', 'blocks'].map(name => ({
    name, dataset: { touchLayout: 'joystick-right' } as Record<string, string>,
  }));
  const select = {
    value: 'joystick-right',
    handlers: [] as (() => void)[],
    addEventListener(_t: string, fn: () => void) { this.handlers.push(fn); },
    removeEventListener() {},
  };
  const globals = {
    document: {
      getElementById: (id: string) => (id === 'settingsControlsSide' ? select : null),
      querySelectorAll: () => containers,
    },
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
    initArcadeTouchLayout();
    assert.equal(select.value, 'joystick-right', 'Settings shows the stored side');

    // The player picks the other side in Settings.
    select.value = 'joystick-left';
    select.handlers.forEach(fn => fn());

    assert.deepEqual(
      containers.map(c => c.dataset.touchLayout),
      ['joystick-left', 'joystick-left', 'joystick-left'],
      'every game follows the one setting, joystick-only ones included',
    );
    assert.equal(store.get(ARCADE_TOUCH_LAYOUT_STORAGE_KEY), 'joystick-left', 'and it is remembered');

    // A change broadcast from elsewhere keeps Settings honest.
    broadcastTouchLayout('joystick-right');
    assert.equal(select.value, 'joystick-right');
    assert.deepEqual(containers.map(c => c.dataset.touchLayout), ['joystick-right', 'joystick-right', 'joystick-right']);
  } finally {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});

test('the side control lives in Settings, not on the game screens', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /id="settingsControlsSide"/, 'Settings owns the choice');
  assert.match(html, /<option value="joystick-right">/);
  assert.match(html, /<option value="joystick-left">/);
  assert.doesNotMatch(html, /touch-swap-button/, 'the per-game swap buttons are gone');
  assert.doesNotMatch(html, /mobileControlLayoutButton/, 'including the one in Blast Buddies');

  // Every touch pad opts in, joystick-only and button-only games included.
  assert.equal((html.match(/<div[^>]*data-touch-layout="joystick-right"/g) ?? []).length, 8);
  for (const label of ['Touch paddle controls', 'Touch snake controls', 'Touch Block Drop controls']) {
    assert.match(
      html,
      new RegExp(`<div[^>]*aria-label="${label}"[^>]*data-touch-layout=`),
      `${label} must follow the setting too`,
    );
  }
  assert.match(html, /\.block-touch-controls\)\[data-touch-layout="joystick-left"\]/, 'single-cluster games shift side');
});

test('a failed pointer capture never swallows the press', () => {
  // Callers capture before they register the input, so a throw here used to
  // drop the tap entirely - the bug that made a bomb press do nothing.
  const throwing = {
    setPointerCapture() { throw new DOMException('No active pointer', 'NotFoundError'); },
  } as unknown as Element;
  assert.doesNotThrow(() => capturePointer(throwing, 7));

  const captured: number[] = [];
  const working = { setPointerCapture: (id: number) => captured.push(id) } as unknown as Element;
  capturePointer(working, 11);
  assert.deepEqual(captured, [11], 'a healthy pointer is still captured');

  // Older engines may not implement it at all.
  assert.doesNotThrow(() => capturePointer({} as Element, 3));
});

test('no touch handler calls setPointerCapture unguarded', () => {
  const dir = new URL('../src', import.meta.url);
  const offenders: string[] = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.ts') || name.endsWith('.test.ts') || name === 'touch-controls.ts') continue;
    const source = readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8');
    if (source.includes('setPointerCapture')) offenders.push(name);
  }
  assert.deepEqual(offenders, [], `these must use capturePointer instead: ${offenders.join(', ')}`);
});
