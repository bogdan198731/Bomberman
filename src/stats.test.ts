import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyArcadeResult,
  ArcadeResultReporter,
  createDefaultProfile,
  loadArcadeProfile,
  normalizeArcadeProfile,
  PROFILE_STORAGE_KEY,
  profileLevel,
  profileLevelProgress,
  sanitizeProfileName,
  saveArcadeProfile,
} from './stats.js';

test('a new arcade profile starts empty at level one', () => {
  const profile = createDefaultProfile();
  assert.equal(profile.name, 'Arcade Player');
  assert.equal(profile.totalPlays, 0);
  assert.equal(profileLevel(profile), 1);
  assert.equal(profileLevelProgress(profile), 0);
});

test('profile names are trimmed, collapsed, and length limited', () => {
  assert.equal(sanitizeProfileName('  Neon    Driver  '), 'Neon Driver');
  assert.equal(sanitizeProfileName(''), 'Arcade Player');
  assert.equal(sanitizeProfileName('x'.repeat(40)).length, 24);
});

test('recording a win updates totals, game stats, score, and experience', () => {
  const profile = applyArcadeResult(createDefaultProfile(), 'racing', { outcome: 'win', score: 830 }, 1234);
  assert.equal(profile.totalPlays, 1);
  assert.equal(profile.totalWins, 1);
  assert.equal(profile.totalScore, 830);
  assert.equal(profile.games.racing?.wins, 1);
  assert.equal(profile.games.racing?.bestScore, 830);
  assert.equal(profile.games.racing?.lastPlayed, 1234);
  assert.ok(profile.xp > 120);
});

test('best scores persist while later results still add to totals', () => {
  let profile = applyArcadeResult(createDefaultProfile(), 'snake', { outcome: 'complete', score: 12 }, 1);
  profile = applyArcadeResult(profile, 'snake', { outcome: 'complete', score: 7 }, 2);
  assert.equal(profile.games.snake?.plays, 2);
  assert.equal(profile.games.snake?.bestScore, 12);
  assert.equal(profile.games.snake?.totalScore, 19);
});

test('profile normalization repairs malformed stored values', () => {
  const profile = normalizeArcadeProfile({ name: '  Mint ', xp: -4, totalPlays: 'bad', games: { tanks: { plays: 3.8, wins: -2 } } });
  assert.equal(profile.name, 'Mint');
  assert.equal(profile.xp, 0);
  assert.equal(profile.totalPlays, 0);
  assert.equal(profile.games.tanks?.plays, 3);
  assert.equal(profile.games.tanks?.wins, 0);
});

test('profiles round-trip through browser-style storage', () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string): string | null => values.get(key) ?? null,
    setItem: (key: string, value: string): void => { values.set(key, value); },
  };
  const profile = createDefaultProfile();
  profile.name = 'Coral Ace';
  saveArcadeProfile(profile, storage);
  assert.ok(values.has(PROFILE_STORAGE_KEY));
  assert.equal(loadArcadeProfile(storage).name, 'Coral Ace');
});

test('result reporters record one result per finished-state transition', () => {
  const results: string[] = [];
  const reporter = new ArcadeResultReporter('paddle', (game, result) => results.push(`${game}:${result.outcome}`));
  assert.equal(reporter.report(false), false);
  assert.equal(reporter.report(true, { outcome: 'win' }), true);
  assert.equal(reporter.report(true, { outcome: 'win' }), false);
  reporter.report(false);
  assert.equal(reporter.report(true, { outcome: 'loss' }), true);
  assert.deepEqual(results, ['paddle:win', 'paddle:loss']);
});
