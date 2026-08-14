import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FAVORITES_STORAGE_KEY,
  loadFavorites,
  matchesCatalogGame,
  normalizeCatalogText,
  normalizeFavorites,
  saveFavorites,
  toggleFavorite,
  type CatalogGame,
} from './catalog.js';

const septica: CatalogGame = {
  id: 'septica',
  title: 'Șeptică',
  description: 'Romanian card game with sevens and aces.',
  modes: ['solo', 'local', 'online'],
};

test('catalog search ignores case, spacing, and Romanian diacritics', () => {
  assert.equal(normalizeCatalogText('  ȘEPTICĂ  '), 'septica');
  assert.equal(matchesCatalogGame(septica, 'septica', 'all', []), true);
  assert.equal(matchesCatalogGame(septica, 'romanian cards', 'all', []), false);
  assert.equal(matchesCatalogGame(septica, 'sevens', 'all', []), true);
});

test('catalog filters match modes and favorites independently of search', () => {
  assert.equal(matchesCatalogGame(septica, '', 'solo', []), true);
  assert.equal(matchesCatalogGame(septica, '', 'favorites', []), false);
  assert.equal(matchesCatalogGame(septica, 'card', 'favorites', ['septica']), true);
});

test('favorite lists keep only known game ids in catalog order', () => {
  assert.deepEqual(normalizeFavorites(['septica', 'fake', 'bomberman', 'septica']), ['bomberman', 'septica']);
});

test('toggling favorites adds and removes one game', () => {
  assert.deepEqual(toggleFavorite([], 'snake'), ['snake']);
  assert.deepEqual(toggleFavorite(['snake', 'star'], 'snake'), ['star']);
});

test('favorites round-trip through browser-style storage', () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string): string | null => values.get(key) ?? null,
    setItem: (key: string, value: string): void => { values.set(key, value); },
  };
  saveFavorites(['star', 'snake'], storage);
  assert.ok(values.has(FAVORITES_STORAGE_KEY));
  assert.deepEqual(loadFavorites(storage), ['snake', 'star']);
});
