import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ARCADE_THEMES,
  createDefaultSettings,
  normalizeTheme,
  loadSettings,
  normalizeSettings,
  saveSettings,
  SETTINGS_STORAGE_KEY,
} from './settings.js';

test('arcade settings start with balanced accessible defaults', () => {
  assert.deepEqual(createDefaultSettings(), {
    soundEnabled: true,
    volume: 60,
    reducedMotion: false,
    highContrast: false,
    theme: 'midnight',
    language: 'en',
    touchControls: 'auto',
  });
});

test('settings normalization repairs invalid values and clamps volume', () => {
  assert.deepEqual(normalizeSettings({ soundEnabled: false, volume: 140, reducedMotion: true, highContrast: 'yes', theme: 'ocean', language: 'ro', touchControls: 'on' }), {
    soundEnabled: false,
    volume: 100,
    reducedMotion: true,
    highContrast: false,
    theme: 'ocean',
    language: 'ro',
    touchControls: 'on',
  });
  assert.equal(normalizeSettings({ volume: -12 }).volume, 0);
  assert.equal(normalizeSettings({ language: 'de' }).language, 'en');
  assert.equal(normalizeSettings({ touchControls: 'sometimes' }).touchControls, 'auto');
  assert.equal(normalizeSettings({ theme: 'toString' }).theme, 'midnight');
  assert.equal(normalizeSettings({ theme: 42 }).theme, 'midnight');
});

test('settings round-trip through browser-style storage', () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string): string | null => values.get(key) ?? null,
    setItem: (key: string, value: string): void => { values.set(key, value); },
  };
  saveSettings({ soundEnabled: false, volume: 35, reducedMotion: true, highContrast: true, theme: 'galaxy', language: 'ro', touchControls: 'off' }, storage);
  assert.ok(values.has(SETTINGS_STORAGE_KEY));
  assert.deepEqual(loadSettings(storage), { soundEnabled: false, volume: 35, reducedMotion: true, highContrast: true, theme: 'galaxy', language: 'ro', touchControls: 'off' });
});

test('malformed stored settings safely fall back to defaults', () => {
  const storage = { getItem: (): string => '{broken', setItem: (): void => undefined };
  assert.deepEqual(loadSettings(storage), createDefaultSettings());
});

test('every colour theme has its own browser bar colour', () => {
  const colours = Object.values(ARCADE_THEMES).map(theme => theme.browserColor);
  assert.ok(colours.length >= 5);
  assert.equal(new Set(colours).size, colours.length);
  for (const theme of Object.keys(ARCADE_THEMES)) assert.equal(normalizeTheme(theme), theme);
});
