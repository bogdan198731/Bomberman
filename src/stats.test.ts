import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyArcadeResult,
  applyProgressionResult,
  ArcadeResultReporter,
  createDefaultProfile,
  dailyGameForDate,
  ensureDailyChallenge,
  ensureWeeklyQuests,
  loadArcadeProfile,
  localWeekKey,
  MAX_MATCH_HISTORY,
  normalizeArcadeProfile,
  PROFILE_STORAGE_KEY,
  profileLevel,
  profileLevelProgress,
  profileInsights,
  sanitizeProfileName,
  saveArcadeProfile,
  unlockEligibleAchievements,
  WEEKLY_QUEST_IDS,
  WEEKLY_QUESTS,
  weeklyQuestProgress,
} from './stats.js';

test('a new arcade profile starts empty at level one', () => {
  const profile = createDefaultProfile();
  assert.equal(profile.name, 'Arcade Player');
  assert.equal(profile.totalPlays, 0);
  assert.equal(profileLevel(profile), 1);
  assert.equal(profileLevelProgress(profile), 0);
  assert.equal(profile.weeklyQuests, null);
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
  assert.deepEqual(profile.recentMatches[0], { gameId: 'racing', outcome: 'win', score: 830, playedAt: 1234 });
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
  assert.deepEqual(profile.recentMatches, []);
});

test('version one profiles migrate without losing their arcade record', () => {
  const profile = normalizeArcadeProfile({ version: 1, name: 'Veteran', totalPlays: 12, totalWins: 4, totalScore: 900 });
  assert.equal(profile.version, 4);
  assert.equal(profile.name, 'Veteran');
  assert.equal(profile.totalPlays, 12);
  assert.equal(profile.totalWins, 4);
  assert.deepEqual(profile.unlockedAchievements, []);
  assert.equal(profile.dailyChallenge, null);
  assert.equal(profile.weeklyQuests, null);
  assert.deepEqual(profile.recentMatches, []);
});

test('weekly quests use the local Monday and reset for a new week', () => {
  const monday = new Date(2026, 7, 10, 12).getTime();
  const sunday = new Date(2026, 7, 16, 12).getTime();
  const nextMonday = new Date(2026, 7, 17, 12).getTime();
  assert.equal(localWeekKey(monday), '2026-08-10');
  assert.equal(localWeekKey(sunday), '2026-08-10');
  let profile = ensureWeeklyQuests(createDefaultProfile(), '2026-08-10');
  profile.weeklyQuests!.plays = 5;
  profile = ensureWeeklyQuests(profile, '2026-08-10');
  assert.equal(profile.weeklyQuests?.plays, 5);
  profile = ensureWeeklyQuests(profile, localWeekKey(nextMonday));
  assert.deepEqual(profile.weeklyQuests, { week: '2026-08-17', plays: 0, wins: 0, games: [], completed: [] });
});

test('weekly quest progress tracks matches, wins, and different games', () => {
  let profile = createDefaultProfile();
  const completed = new Set<string>();
  const games = ['bomberman', 'paddle', 'snake', 'tanks'] as const;
  for (let index = 0; index < 8; index += 1) {
    const result = applyProgressionResult(
      profile,
      games[index % games.length],
      { outcome: index < 3 ? 'win' : 'loss' },
      '2026-08-12',
      new Date(2026, 7, 12, 12, index).getTime(),
    );
    profile = result.profile;
    result.weeklyCompleted.forEach(id => completed.add(id));
  }
  assert.deepEqual([...completed].sort(), [...WEEKLY_QUEST_IDS].sort());
  assert.equal(profile.weeklyQuests?.plays, 8);
  assert.equal(profile.weeklyQuests?.wins, 3);
  assert.deepEqual(profile.weeklyQuests?.games, ['bomberman', 'paddle', 'snake', 'tanks']);
  assert.deepEqual(profile.weeklyQuests?.completed, [...WEEKLY_QUEST_IDS]);
  const extra = applyProgressionResult(profile, 'star', { outcome: 'win' }, '2026-08-12', new Date(2026, 7, 12, 13).getTime());
  assert.deepEqual(extra.weeklyCompleted, []);
});

test('weekly quest progress reads each quest metric', () => {
  const state = { week: '2026-08-10', plays: 6, wins: 2, games: ['snake', 'star'] as const, completed: [] };
  assert.deepEqual(WEEKLY_QUESTS.map(quest => weeklyQuestProgress({ ...state, games: [...state.games] }, quest)), [6, 2, 2]);
});

test('weekly quest normalization repairs stored progress safely', () => {
  const profile = normalizeArcadeProfile({
    weeklyQuests: {
      week: '2026-08-10',
      plays: 5.9,
      wins: -2,
      games: ['star', 'fake', 'star', 'snake'],
      completed: ['weekly-explorer', 'fake'],
    },
  });
  assert.deepEqual(profile.weeklyQuests, {
    week: '2026-08-10',
    plays: 5,
    wins: 0,
    games: ['snake', 'star'],
    completed: ['weekly-explorer'],
  });
});

test('profile normalization keeps only valid, repaired recent matches', () => {
  const profile = normalizeArcadeProfile({
    recentMatches: [
      { gameId: 'paddle', outcome: 'win', score: 82.9, playedAt: 99.7 },
      { gameId: 'unknown', outcome: 'loss', score: 10, playedAt: 100 },
      { gameId: 'snake', outcome: 'invalid', score: 4, playedAt: 101 },
      null,
    ],
  });
  assert.deepEqual(profile.recentMatches, [
    { gameId: 'paddle', outcome: 'win', score: 82, playedAt: 99 },
  ]);
});

test('match history keeps the newest results and stays bounded', () => {
  let profile = createDefaultProfile();
  for (let index = 1; index <= MAX_MATCH_HISTORY + 5; index += 1) {
    profile = applyArcadeResult(profile, 'blocks', { outcome: 'loss', score: index }, index);
  }
  assert.equal(profile.recentMatches.length, MAX_MATCH_HISTORY);
  assert.equal(profile.recentMatches[0].playedAt, MAX_MATCH_HISTORY + 5);
  assert.equal(profile.recentMatches.at(-1)?.playedAt, 6);
});

test('profile insights summarize recent form and all-time favorite games', () => {
  let profile = createDefaultProfile();
  profile = applyArcadeResult(profile, 'paddle', { outcome: 'loss', score: 15 }, 1);
  profile = applyArcadeResult(profile, 'snake', { outcome: 'complete', score: 240 }, 2);
  profile = applyArcadeResult(profile, 'paddle', { outcome: 'win', score: 40 }, 3);
  profile = applyArcadeResult(profile, 'paddle', { outcome: 'win', score: 55 }, 4);
  const insights = profileInsights(profile);
  assert.equal(insights.winRate, 67);
  assert.equal(insights.mostPlayedGame, 'paddle');
  assert.equal(insights.bestGame, 'snake');
  assert.equal(insights.bestScore, 240);
  assert.equal(insights.winStreak, 2);
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
