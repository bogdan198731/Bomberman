import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyArcadeResult,
  applyProgressionResult,
  ArcadeResultReporter,
  createDefaultProfile,
  dailyGameForDate,
  ensureDailyChallenge,
  loadArcadeProfile,
  normalizeArcadeProfile,
  PROFILE_STORAGE_KEY,
  profileLevel,
  profileLevelProgress,
  sanitizeProfileName,
  saveArcadeProfile,
  unlockEligibleAchievements,
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

test('version one profiles migrate without losing their arcade record', () => {
  const profile = normalizeArcadeProfile({ version: 1, name: 'Veteran', totalPlays: 12, totalWins: 4, totalScore: 900 });
  assert.equal(profile.version, 2);
  assert.equal(profile.name, 'Veteran');
  assert.equal(profile.totalPlays, 12);
  assert.equal(profile.totalWins, 4);
  assert.deepEqual(profile.unlockedAchievements, []);
  assert.equal(profile.dailyChallenge, null);
});

test('the daily challenge is stable for one date and rotates cleanly on another', () => {
  let profile = ensureDailyChallenge(createDefaultProfile(), '2026-08-14');
  assert.equal(profile.dailyChallenge?.gameId, dailyGameForDate('2026-08-14'));
  profile.dailyChallenge!.progress = 1;
  profile = ensureDailyChallenge(profile, '2026-08-14');
  assert.equal(profile.dailyChallenge?.progress, 1);
  profile = ensureDailyChallenge(profile, '2026-08-15');
  assert.equal(profile.dailyChallenge?.date, '2026-08-15');
  assert.equal(profile.dailyChallenge?.progress, 0);
});

test('two daily matches award the completion bonus exactly once', () => {
  const date = '2026-08-14';
  const game = dailyGameForDate(date);
  const first = applyProgressionResult(createDefaultProfile(), game, { outcome: 'complete', score: 10 }, date, 1);
  assert.equal(first.profile.dailyChallenge?.progress, 1);
  assert.equal(first.dailyCompleted, false);
  const second = applyProgressionResult(first.profile, game, { outcome: 'complete', score: 20 }, date, 2);
  assert.equal(second.profile.dailyChallenge?.completed, true);
  assert.equal(second.dailyCompleted, true);
  const xpAfterCompletion = second.profile.xp;
  const third = applyProgressionResult(second.profile, game, { outcome: 'complete', score: 30 }, date, 3);
  assert.equal(third.dailyCompleted, false);
  assert.equal(third.profile.xp - xpAfterCompletion, 55);
});

test('eligible achievements unlock once and award milestone experience', () => {
  const profile = createDefaultProfile();
  profile.totalPlays = 1;
  profile.totalWins = 1;
  const first = unlockEligibleAchievements(profile);
  assert.deepEqual(first.unlocked, ['first-round', 'first-win']);
  assert.equal(first.profile.xp, 150);
  const second = unlockEligibleAchievements(first.profile);
  assert.deepEqual(second.unlocked, []);
  assert.equal(second.profile.xp, 150);
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
