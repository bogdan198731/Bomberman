import test from 'node:test';
import assert from 'node:assert/strict';
import { GAME_GUIDES } from './game-experience.js';
import { GAME_META } from './stats.js';
import type { ArcadeGameId } from './game-metadata.js';

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

test('series games offer the next game on their result card, in the words of their own button', async () => {
  const { readFileSync } = await import('node:fs');
  const { REPLAY_LABELS, replayLabel } = await import('./game-experience.js');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const buttons: Record<string, string> = { hexclash: 'hexclashNextButton', reversi: 'reversiNextButton', fourrow: 'fourrowNextButton' };
  for (const [game, id] of Object.entries(buttons)) {
    const label = html.match(new RegExp(`id="${id}"[^>]*>([^<]+)<`))?.[1];
    assert.equal(replayLabel(game as ArcadeGameId, false), label, `${game} card matches its own button`);
    assert.ok(REPLAY_LABELS[game as ArcadeGameId]);
  }
  assert.equal(replayLabel('hexclash', true), 'Bătălia următoare');
  assert.equal(replayLabel('snake', false), 'Play again', 'games that start over still say so');
  assert.equal(replayLabel('snake', true), 'Joacă din nou');
});
