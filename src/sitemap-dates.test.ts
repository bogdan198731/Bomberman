import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { gameSourceFiles, pageDates, parseGitFileDates } from './sitemap-dates.js';
import { ARCADE_GAME_IDS } from './game-metadata.js';
import { existsSync } from 'node:fs';

// The shape `git log --format=%x00%cs --name-only` prints, newest first.
const LOG = [
  '', '2026-09-30\n\nsrc/mines.ts\nindex.html\n',
  '2026-09-28\n',
  '2026-09-20\n\nsrc/mines.ts\nsrc/reversi.ts\nsrc/seo.ts\n',
  '2026-09-01\n\nsrc/index.ts\nsrc/seo-content.ts\n',
].join('\0');

test('git history gives each file the date it last changed', () => {
  const dates = parseGitFileDates(LOG);
  assert.equal(dates.get('src/mines.ts'), '2026-09-30', 'the newest commit wins');
  assert.equal(dates.get('src/reversi.ts'), '2026-09-20');
  assert.equal(dates.get('src/index.ts'), '2026-09-01');
  assert.equal(dates.get('index.html'), '2026-09-30');
  assert.equal(parseGitFileDates('').size, 0);
});

test('each game page dates from its own code or the shared page text, the hub from the newest of all', () => {
  const dates = pageDates(parseGitFileDates(LOG), '2026-01-01');
  assert.equal(dates.mines, '2026-09-30');
  assert.equal(dates.reversi, '2026-09-20');
  assert.equal(dates.bomberman, '2026-09-20', 'src/index.ts is older than the shared SEO text');
  assert.equal(dates.snake, '2026-09-20', 'a game untouched since then still carries the shared text change');
  assert.equal(dates.hub, '2026-09-30');
  assert.deepEqual(new Set(Object.values(pageDates(new Map(), '2026-01-01'))), new Set(['2026-01-01']), 'no history: one fallback date');
});

test('every game names source files that exist', () => {
  for (const game of ARCADE_GAME_IDS) {
    for (const file of gameSourceFiles(game)) assert.ok(existsSync(new URL(`../${file}`, import.meta.url)), `${game}: ${file}`);
  }
});

test('the real repository history parses into dates for every page', (t) => {
  let log: string;
  try { log = execFileSync('git', ['log', '--format=%x00%cs', '--name-only', '--no-renames', '-n', '400'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString(); }
  catch { t.skip('no git here'); return; }
  const dates = pageDates(parseGitFileDates(log), '2000-01-01');
  for (const [view, date] of Object.entries(dates)) assert.match(date, /^\d{4}-\d{2}-\d{2}$/, view);
});
