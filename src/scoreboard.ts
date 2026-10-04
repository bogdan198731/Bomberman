import { isArcadeGameId, type ArcadeGameId } from './game-metadata.js';

/**
 * The shared "Everyone" scoreboard: best scores per game from every player,
 * shown under an alias of their choosing or as "Unknown". This module holds
 * the rules both the browser and the server apply; storage lives in
 * score-store.ts, which only the server loads.
 */
export const SCOREBOARD_ENDPOINT = '/api/scores';
export const SCOREBOARD_SIZE = 10;
export const UNKNOWN_ALIAS = 'Unknown';
export const MAX_ALIAS_LENGTH = 20;
/** Far above any real score in the arcade; anything bigger is not a result. */
export const MAX_SCORE = 10_000_000;

export type ScoreOutcome = 'win' | 'loss' | 'draw' | 'complete';

export interface ScoreEntry {
  alias: string;
  score: number;
  outcome: ScoreOutcome;
  playedAt: number;
}

const isOutcome = (value: unknown): value is ScoreOutcome =>
  value === 'win' || value === 'loss' || value === 'draw' || value === 'complete';

/** Trims and shortens an alias, drops characters that could be markup or control codes; blank means Unknown. */
export function sanitizeAlias(value: unknown): string {
  if (typeof value !== 'string') return UNKNOWN_ALIAS;
  const cleaned = value
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, MAX_ALIAS_LENGTH)
    .trim();
  return !cleaned || cleaned.toLowerCase() === UNKNOWN_ALIAS.toLowerCase() ? UNKNOWN_ALIAS : cleaned;
}

export type ScoreSubmission = { ok: true; game: ArcadeGameId; alias: string; score: number; outcome: ScoreOutcome } | { ok: false; error: string };

export function validateScoreSubmission(body: unknown): ScoreSubmission {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Send a score.' };
  const { game, score, outcome, alias } = body as Record<string, unknown>;
  if (!isArcadeGameId(game)) return { ok: false, error: 'Unknown game.' };
  if (typeof score !== 'number' || !Number.isInteger(score) || score <= 0 || score > MAX_SCORE) return { ok: false, error: 'Invalid score.' };
  if (!isOutcome(outcome)) return { ok: false, error: 'Invalid outcome.' };
  return { ok: true, game, alias: sanitizeAlias(alias), score, outcome };
}

function compareEntries(left: ScoreEntry, right: ScoreEntry): number {
  // Equal scores: whoever got there first stays ahead.
  return right.score - left.score || left.playedAt - right.playedAt;
}

/** Reads stored entries defensively: bad rows are dropped, the rest sorted and cut to size. */
export function normalizeScoreEntries(value: unknown): ScoreEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(row => {
    if (!row || typeof row !== 'object') return [];
    const { alias, score, outcome, playedAt } = row as Record<string, unknown>;
    if (typeof score !== 'number' || !Number.isInteger(score) || score <= 0 || score > MAX_SCORE || !isOutcome(outcome)) return [];
    return [{ alias: sanitizeAlias(alias), score, outcome, playedAt: typeof playedAt === 'number' && Number.isFinite(playedAt) ? playedAt : 0 }];
  }).sort(compareEntries).slice(0, SCOREBOARD_SIZE);
}

/**
 * Adds a result to a game's board. Every result stands on its own, so the
 * board is the ten best games, even if one player played several of them.
 * Returns the 1-based place, or null when the score did not make the board.
 */
export function addScore(entries: readonly ScoreEntry[], entry: ScoreEntry): { entries: ScoreEntry[]; rank: number | null } {
  const sorted = [...entries, entry].sort(compareEntries).slice(0, SCOREBOARD_SIZE);
  const index = sorted.indexOf(entry);
  return { entries: sorted, rank: index >= 0 ? index + 1 : null };
}

/**
 * The place a new result would take, worked out before it is sent so the
 * player can be asked for a name first. Counted after any equal score already
 * there. Null when it would not make the board.
 */
export function placeForScore(entries: readonly ScoreEntry[], score: number): number | null {
  if (!Number.isInteger(score) || score <= 0 || score > MAX_SCORE) return null;
  return addScore(entries, { alias: UNKNOWN_ALIAS, score, outcome: 'complete', playedAt: Number.MAX_SAFE_INTEGER }).rank;
}
