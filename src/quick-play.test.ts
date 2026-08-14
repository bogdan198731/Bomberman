import test from 'node:test';
import assert from 'node:assert/strict';
import {
  gamesForQuickPlay,
  QUICK_PLAY_GAMES,
  quickPlayReason,
  recommendQuickPlay,
} from './quick-play.js';
import { applyArcadeResult, createDefaultProfile, type ArcadeMatchRecord } from './stats.js';

const match = (gameId: ArcadeMatchRecord['gameId'], playedAt: number): ArcadeMatchRecord => ({
  gameId, outcome: 'win', score: 0, playedAt,
});

test('Quick Play exposes the expected games for each mode', () => {
  assert.equal(gamesForQuickPlay('all').length, QUICK_PLAY_GAMES.length);
  assert.equal(gamesForQuickPlay('online').some(game => game.id === 'star'), false);
  assert.equal(gamesForQuickPlay('solo').some(game => game.id === 'tintar'), false);
  assert.equal(gamesForQuickPlay('local').length, QUICK_PLAY_GAMES.length);
});

test('recommendations prefer games missing from recent history', () => {
  const recommendation = recommendQuickPlay(
    ['bomberman', 'snake', 'tanks'],
    [match('bomberman', 3), match('snake', 2)],
    null,
    0,
  );
  assert.equal(recommendation, 'tanks');
});

test('recommendations rotate toward the least recently played choices', () => {
  const recommendation = recommendQuickPlay(
    ['bomberman', 'snake', 'tanks', 'paddle'],
    [match('bomberman', 4), match('snake', 3), match('tanks', 2), match('paddle', 1)],
    null,
    0,
  );
  assert.equal(recommendation, 'paddle');
});

test('shuffle avoids the current game when another choice is available', () => {
  const recommendation = recommendQuickPlay(['snake', 'tanks'], [], 'snake', 0);
  assert.equal(recommendation, 'tanks');
  assert.equal(recommendQuickPlay([], [], null, 0), null);
});

test('recommendation copy reflects the player record', () => {
  const game = QUICK_PLAY_GAMES.find(item => item.id === 'paddle')!;
  assert.match(quickPlayReason(game, createDefaultProfile()), /fresh cabinet pick/i);
  const profile = applyArcadeResult(createDefaultProfile(), 'paddle', { outcome: 'loss' }, 1);
  assert.match(quickPlayReason(game, profile), /comeback/i);
});
