import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyLeaderboardResult,
  createEmptyLeaderboards,
  LEADERBOARD_STORAGE_KEY,
  loadArcadeLeaderboards,
  MAX_LEADERBOARD_ENTRIES,
  normalizeArcadeLeaderboards,
  saveArcadeLeaderboards,
} from './leaderboard.js';

test('leaderboards start empty and discard malformed entries', () => {
  assert.deepEqual(createEmptyLeaderboards(), { version: 1, games: {} });
  const normalized = normalizeArcadeLeaderboards({
    games: {
      snake: [
        { name: '  Mint  ', score: 42.8, outcome: 'complete', playedAt: 99.9 },
        { name: 'Coral', score: 70, outcome: 'unknown', playedAt: 100 },
      ],
      unknown: [{ name: 'Ghost', score: 999, outcome: 'win', playedAt: 1 }],
    },
  });
  assert.deepEqual(normalized.games.snake, [{ name: 'Mint', score: 42, outcome: 'complete', playedAt: 99 }]);
  assert.equal('unknown' in normalized.games, false);
});

test('a player keeps only their best result for each game', () => {
  let leaderboards = applyLeaderboardResult(createEmptyLeaderboards(), 'blocks', 'Mint', { outcome: 'win', score: 250 }, 1);
  leaderboards = applyLeaderboardResult(leaderboards, 'blocks', 'mint', { outcome: 'loss', score: 100 }, 2);
  leaderboards = applyLeaderboardResult(leaderboards, 'blocks', 'MINT', { outcome: 'win', score: 400 }, 3);
  assert.deepEqual(leaderboards.games.blocks, [{ name: 'MINT', score: 400, outcome: 'win', playedAt: 3 }]);
});

test('score, outcome, and first achievement determine leaderboard order', () => {
  let leaderboards = createEmptyLeaderboards();
  leaderboards = applyLeaderboardResult(leaderboards, 'paddle', 'Late loss', { outcome: 'loss', score: 7 }, 4);
  leaderboards = applyLeaderboardResult(leaderboards, 'paddle', 'Draw player', { outcome: 'draw', score: 7 }, 3);
  leaderboards = applyLeaderboardResult(leaderboards, 'paddle', 'Early winner', { outcome: 'win', score: 7 }, 2);
  leaderboards = applyLeaderboardResult(leaderboards, 'paddle', 'High scorer', { outcome: 'loss', score: 8 }, 5);
  assert.deepEqual(leaderboards.games.paddle?.map(entry => entry.name), [
    'High scorer', 'Early winner', 'Draw player', 'Late loss',
  ]);
});

test('each game leaderboard is limited to its top five players', () => {
  let leaderboards = createEmptyLeaderboards();
  for (let index = 1; index <= MAX_LEADERBOARD_ENTRIES + 2; index += 1) {
    leaderboards = applyLeaderboardResult(leaderboards, 'star', `Pilot ${index}`, { outcome: 'complete', score: index * 10 }, index);
  }
  assert.equal(leaderboards.games.star?.length, MAX_LEADERBOARD_ENTRIES);
  assert.deepEqual(leaderboards.games.star?.map(entry => entry.score), [70, 60, 50, 40, 30]);
});

test('leaderboards round-trip through browser-style storage', () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
  const leaderboards = applyLeaderboardResult(createEmptyLeaderboards(), 'survival', 'Coral Ace', { outcome: 'complete', score: 880 }, 12);
  saveArcadeLeaderboards(leaderboards, storage);
  assert.ok(values.has(LEADERBOARD_STORAGE_KEY));
  assert.deepEqual(loadArcadeLeaderboards(storage), leaderboards);
});
