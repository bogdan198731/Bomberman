import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  MAX_SCORE, SCOREBOARD_SIZE, UNKNOWN_ALIAS, addScore, normalizeScoreEntries, placeForScore, sanitizeAlias, validateScoreSubmission,
  type ScoreEntry,
} from './scoreboard.js';
import { FileScoreStore, Scoreboard, UpstashScoreStore, createScoreStore, type ScoreStore } from './score-store.js';

const entry = (alias: string, score: number, playedAt = 1): ScoreEntry => ({ alias, score, outcome: 'win', playedAt });

test('an alias is optional: blank, missing or "unknown" all show as Unknown', () => {
  for (const value of ['', '   ', undefined, 42, 'unknown', 'UNKNOWN']) assert.equal(sanitizeAlias(value), UNKNOWN_ALIAS);
  assert.equal(sanitizeAlias('  Ana   Maria  '), 'Ana Maria');
  assert.equal(sanitizeAlias('<b>Bogdan</b>'), 'bBogdan/b', 'no markup characters survive');
  assert.equal(sanitizeAlias('x'.repeat(40)).length, 20);
});

test('only real results from real games are accepted', () => {
  assert.deepEqual(validateScoreSubmission({ game: 'snake', score: 120, outcome: 'win', alias: ' Mia ' }),
    { ok: true, game: 'snake', alias: 'Mia', score: 120, outcome: 'win' });
  assert.equal(validateScoreSubmission({ game: 'snake', score: 120, outcome: 'win' }).ok, true, 'no alias is fine');
  for (const bad of [
    null, { game: 'chess', score: 1, outcome: 'win' }, { game: 'snake', score: 0, outcome: 'win' },
    { game: 'snake', score: 1.5, outcome: 'win' }, { game: 'snake', score: MAX_SCORE + 1, outcome: 'win' },
    { game: 'snake', score: 10, outcome: 'cheated' }, { game: 'snake', score: '10', outcome: 'win' },
  ]) assert.equal(validateScoreSubmission(bad).ok, false, JSON.stringify(bad));
});

test('the board keeps the top ten, best first, earlier result ahead on a tie', () => {
  let board: ScoreEntry[] = [];
  for (let i = 1; i <= 12; i++) board = addScore(board, entry(`P${i}`, i * 10, i)).entries;
  assert.equal(board.length, SCOREBOARD_SIZE);
  assert.deepEqual(board.map(row => row.score), [120, 110, 100, 90, 80, 70, 60, 50, 40, 30]);
  assert.equal(addScore(board, entry('Late', 5)).rank, null, 'too low to make the board');
  const tie = addScore(board, entry('Tie', 100, 99));
  assert.equal(tie.rank, 4, 'a tie goes behind whoever scored it first');
});

test('every result stands on its own, so one player can hold several places in the top ten', () => {
  let board = addScore([], entry('Mia', 50)).entries;
  const lower = addScore(board, entry('mia', 40));
  assert.equal(lower.rank, 2, 'a lower score for the same name still makes the board');
  board = addScore(lower.entries, entry('MIA', 70)).entries;
  assert.deepEqual(board.map(row => [row.alias, row.score]), [['MIA', 70], ['Mia', 50], ['mia', 40]]);
  for (let i = 0; i < 12; i++) board = addScore(board, entry('Bogdan', 100 - i, i)).entries;
  assert.equal(board.length, SCOREBOARD_SIZE, 'the board fills up to ten and no further');
  assert.deepEqual(board.map(row => row.score), [100, 99, 98, 97, 96, 95, 94, 93, 92, 91]);
});

test('the place a score would take is known before it is sent, so the player can be asked for a name', () => {
  assert.equal(placeForScore([], 1), 1, 'an empty board takes any score');
  let board: ScoreEntry[] = [];
  for (let i = 1; i <= 10; i++) board = addScore(board, entry(`P${i}`, i * 10, i)).entries;
  assert.equal(placeForScore(board, 55), 6);
  assert.equal(placeForScore(board, 100), 2, 'a tie goes behind the earlier score');
  assert.equal(placeForScore(board, 10), null, 'tying the last place does not push it off');
  assert.equal(placeForScore(board, 0), null);
  assert.equal(placeForScore(board, MAX_SCORE + 1), null);
});


test('stored boards are read defensively', () => {
  assert.deepEqual(normalizeScoreEntries('nope'), []);
  const rows = normalizeScoreEntries([entry('A', 5), { alias: '<x>', score: 9, outcome: 'win', playedAt: 2 }, { score: -1 }, null]);
  assert.deepEqual(rows.map(row => [row.alias, row.score]), [['x', 9], ['A', 5]]);
});

test('file storage survives a restart', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'scores-'));
  try {
    const first = new Scoreboard(new FileScoreStore(dir));
    await first.submit('snake', entry('Mia', 40));
    const again = new Scoreboard(new FileScoreStore(dir));
    assert.deepEqual((await again.top('snake')).map(row => row.alias), ['Mia']);
    assert.deepEqual(await again.top('tanks'), []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('Upstash storage talks to its REST API with the token', async () => {
  const calls: { url: string; auth: string; body: unknown }[] = [];
  const stored = new Map<string, string>();
  const fakeFetch = (async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as string[];
    calls.push({ url, auth: (init.headers as Record<string, string>).Authorization, body });
    if (body[0] === 'SET') stored.set(body[1], body[2]);
    return new Response(JSON.stringify({ result: body[0] === 'GET' ? stored.get(body[1]) ?? null : 'OK' }));
  }) as unknown as typeof fetch;
  const store = new UpstashScoreStore('https://example.upstash.io/', 'secret', fakeFetch);
  assert.deepEqual(await store.read('snake'), []);
  await store.write('snake', [entry('Mia', 40)]);
  assert.deepEqual((await store.read('snake')).map(row => row.alias), ['Mia']);
  assert.equal(calls[0].url, 'https://example.upstash.io');
  assert.equal(calls[0].auth, 'Bearer secret');
  assert.deepEqual(calls[0].body, ['GET', 'blast-arcade:scores:snake']);
});

test('the Upstash settings pick Redis; without them the board uses files', () => {
  assert.equal(createScoreStore({ UPSTASH_REDIS_REST_URL: 'https://x', UPSTASH_REDIS_REST_TOKEN: 't' }, '/tmp/s').kind, 'upstash');
  assert.equal(createScoreStore({}, '/tmp/s').kind, 'file');
});

test('scores arriving together are all kept, and storage is only touched when needed', async () => {
  let reads = 0;
  let writes = 0;
  const saved: ScoreEntry[][] = [];
  const store: ScoreStore = {
    kind: 'file',
    read: async () => { reads++; return []; },
    write: async (_game, entries) => { writes++; saved.push(entries); },
  };
  const board = new Scoreboard(store);
  await Promise.all([1, 2, 3].map(i => board.submit('reversi', entry(`P${i}`, i * 10))));
  assert.deepEqual((await board.top('reversi')).map(row => row.score), [30, 20, 10]);
  assert.equal(reads, 1, 'the board is read once, then served from memory');
  for (let i = 4; i <= SCOREBOARD_SIZE; i++) await board.submit('reversi', entry(`P${i}`, i * 10));
  await board.submit('reversi', entry('P3', 5));
  assert.equal(writes, SCOREBOARD_SIZE, 'a result below a full board changes nothing and is not written');
});

test('a failed save leaves the board as it was', async () => {
  let fail = true;
  const store: ScoreStore = {
    kind: 'upstash',
    read: async () => [entry('Old', 10)],
    write: async () => { if (fail) throw new Error('down'); },
  };
  const board = new Scoreboard(store);
  await assert.rejects(board.submit('bricks', entry('New', 50)));
  assert.deepEqual((await board.top('bricks')).map(row => row.alias), ['Old']);
  fail = false;
  assert.equal((await board.submit('bricks', entry('New', 50))).rank, 1);
});
