import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  IMMERSIVE_BODY_CLASS,
  IMMERSIVE_FALLBACK_CLASS,
  IMMERSIVE_STORAGE_KEY,
  initMobileImmersiveMode,
  isPlayableView,
  loadImmersivePreference,
  normalizeImmersivePreference,
  saveImmersivePreference,
  shouldGoImmersive,
} from './mobile-fullscreen.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function memoryStorage(seed: Record<string, string> = {}) {
  const store = new Map(Object.entries(seed));
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    store,
  };
}

test('immersive play is on unless the player explicitly turns it off', () => {
  assert.equal(loadImmersivePreference(memoryStorage()), true, 'default is immersive');
  assert.equal(normalizeImmersivePreference('on'), true);
  assert.equal(normalizeImmersivePreference(null), true);
  assert.equal(normalizeImmersivePreference('anything'), true);
  assert.equal(normalizeImmersivePreference('off'), false, 'only an explicit off disables it');
  assert.equal(normalizeImmersivePreference(false), false);
});

test('the immersive preference round-trips and tolerates a blocked store', () => {
  const storage = memoryStorage();
  assert.equal(saveImmersivePreference(false, storage), false);
  assert.equal(storage.store.get(IMMERSIVE_STORAGE_KEY), 'off');
  assert.equal(loadImmersivePreference(storage), false, 'opting out sticks');
  saveImmersivePreference(true, storage);
  assert.equal(loadImmersivePreference(storage), true);

  const throwing = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
  };
  assert.equal(loadImmersivePreference(throwing), true);
  assert.equal(saveImmersivePreference(false, throwing), false);
});

test('only touch or small screens go immersive', () => {
  assert.equal(shouldGoImmersive(q => q === '(pointer: coarse)'), true, 'phones and tablets');
  assert.equal(shouldGoImmersive(q => q === '(max-width: 760px)'), true, 'narrow windows');
  assert.equal(shouldGoImmersive(() => false), false, 'a desktop must keep its chrome');
});

test('the hub is never immersive, every game is', () => {
  assert.equal(isPlayableView('hub'), false);
  assert.equal(isPlayableView(''), false);
  assert.equal(isPlayableView(undefined), false);
  for (const view of ['bomberman', 'snake', 'sudoku', 'racing']) {
    assert.equal(isPlayableView(view), true, `${view} should go immersive`);
  }
});

/** Minimal DOM/window doubles so the controller can be exercised headlessly. */
function immersiveHarness(options: { coarse?: boolean; fullscreenApi?: boolean; reject?: boolean } = {}) {
  const { coarse = true, fullscreenApi = true, reject = false } = options;
  const classes = new Set<string>();
  const listeners = new Map<string, ((event: Event) => void)[]>();
  const store = new Map<string, string>();
  let fullscreenElement: unknown = null;
  const exitCalls: number[] = [];

  const root: Record<string, unknown> = {};
  if (fullscreenApi) {
    root.requestFullscreen = async () => {
      if (reject) throw new Error('refused');
      fullscreenElement = root;
    };
  }

  const doc = {
    documentElement: root,
    body: {
      classList: {
        toggle(name: string, on: boolean) { if (on) classes.add(name); else classes.delete(name); },
        contains: (name: string) => classes.has(name),
      },
    },
    get fullscreenElement() { return fullscreenElement; },
    exitFullscreen: async () => { exitCalls.push(1); fullscreenElement = null; },
    getElementById: () => null,
    addEventListener() {},
    removeEventListener() {},
  };
  const win = {
    matchMedia: (query: string) => ({ matches: coarse && query === '(pointer: coarse)' }),
    addEventListener(type: string, fn: (event: Event) => void) {
      listeners.set(type, [...(listeners.get(type) ?? []), fn]);
    },
    removeEventListener() {},
  };
  const globals = {
    document: doc,
    window: win,
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
    },
  };
  const saved = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries(globals)) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, configurable: true });
  }
  return {
    classes,
    exitCalls,
    isFullscreen: () => fullscreenElement !== null,
    restore() {
      for (const [key, descriptor] of saved) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
      }
    },
  };
}

test('opening a game on a phone takes the screen, returning to the hub gives it back', async () => {
  const harness = immersiveHarness();
  try {
    const controller = initMobileImmersiveMode();
    assert.ok(controller);
    controller.update('snake');
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(harness.classes.has(IMMERSIVE_BODY_CLASS), true, 'the game takes over');
    assert.equal(harness.isFullscreen(), true, 'and asks the browser for real fullscreen');
    assert.equal(harness.classes.has(IMMERSIVE_FALLBACK_CLASS), false, 'so no fallback is needed');

    controller.update('hub');
    assert.equal(harness.classes.has(IMMERSIVE_BODY_CLASS), false, 'the hub is normal again');
    assert.equal(harness.exitCalls.length, 1, 'and fullscreen is released');
  } finally {
    harness.restore();
  }
});

test('a desktop is left alone', () => {
  const harness = immersiveHarness({ coarse: false });
  try {
    initMobileImmersiveMode()?.update('tanks');
    assert.equal(harness.classes.has(IMMERSIVE_BODY_CLASS), false, 'desktop keeps its browser chrome');
    assert.equal(harness.isFullscreen(), false);
  } finally {
    harness.restore();
  }
});

test('iPhone Safari still gets an immersive layout when fullscreen is refused', async () => {
  for (const options of [{ reject: true }, { fullscreenApi: false }]) {
    const harness = immersiveHarness(options);
    try {
      initMobileImmersiveMode()?.update('bomberman');
      await Promise.resolve();
      await Promise.resolve();
      assert.equal(harness.classes.has(IMMERSIVE_BODY_CLASS), true);
      assert.equal(
        harness.classes.has(IMMERSIVE_FALLBACK_CLASS),
        true,
        'the CSS fallback must carry it when the API will not',
      );
    } finally {
      harness.restore();
    }
  }
});

test('turning immersive play off releases the screen immediately', async () => {
  const harness = immersiveHarness();
  try {
    const controller = initMobileImmersiveMode();
    assert.ok(controller);
    controller.update('racing');
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(harness.classes.has(IMMERSIVE_BODY_CLASS), true);

    controller.setEnabled(false);
    assert.equal(controller.enabled(), false);
    assert.equal(harness.classes.has(IMMERSIVE_BODY_CLASS), false, 'opting out takes effect at once');
  } finally {
    harness.restore();
  }
});

test('the page carries the immersive styles and the opt-out control', () => {
  assert.match(html, /body\.immersive-play \{[^}]*overflow: hidden;/);
  assert.match(html, /body\.immersive-play \.hub-topbar[\s\S]*?display: none !important;/);
  assert.match(html, /body\.immersive-fallback main:not\(\.view-hidden\) \{[\s\S]*?position: fixed;/);
  // Notches must not eat the game board.
  assert.match(html, /padding-top: env\(safe-area-inset-top, 0px\);/);
  assert.match(html, /id="settingsImmersive"/);
  // The viewport has to opt into the safe-area insets for env() to resolve.
  assert.match(html, /viewport-fit=cover/);
});
