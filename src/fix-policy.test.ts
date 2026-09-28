import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkFixPaths as checkPaths, isBrowserSpec, lintBrowserSpec, styleOnlyChange, unsafeCssAdditions,
  FIX_LIMITS, FIX_SCHEMA, REPRODUCE_SCHEMA, buildFixPrompt, buildReproducePrompt, checkFixPaths, checkReproducePaths,
  clip, filesWithTypeErrors, fixEligibility, isFixableModule, linesFromNumstat, typeErrorsOutsideTests,
} from './fix-policy.js';
import type { TriagedReport } from './triage.js';

const report: TriagedReport = {
  id: '20260927T100000Z-abc123',
  receivedAt: '2026-09-27T10:00:00.000Z',
  game: 'mines',
  commit: 'd1be15c',
  trust: 'public',
  report: {
    kind: 'bug', description: 'The mine counter goes up when I remove a flag twice.', path: '/play/mines',
    viewport: '390x844', language: 'en', userAgent: 'Test', errors: [],
  },
  triage: {
    verdict: 'bug', confidence: 'high', severity: 'low', title: 'Mine counter drifts after unflagging',
    reasoning: 'toggleFlag decrements without checking.', affectedFiles: ['src/mines.ts'],
    suggestedFix: 'Only change the count when the flag state changes.', autoFixCandidate: true,
    injectionSuspected: false, duplicateOf: null,
  },
  triagedAt: '2026-09-27T10:01:00.000Z',
  triageModel: 'claude-sonnet-5',
  triageCostUsd: 0.1,
};

test('game modules are fixable; the pipeline, server and shell are not', () => {
  assert.ok(isFixableModule('src/mines.ts'));
  for (const path of ['src/mines.test.ts', 'src/server.ts', 'src/index.ts', 'src/fix-agent.ts', 'src/triage.ts', 'index.html', 'package.json', 'src/sub/x.ts']) {
    assert.ok(!isFixableModule(path), path);
  }
});

test('the reproduce step may only add or change game tests', () => {
  assert.deepEqual(checkReproducePaths(['src/mines.test.ts', 'src/new-case.test.ts']), { ok: true });
  assert.equal(checkReproducePaths([]).ok, false);
  assert.equal(checkReproducePaths(['src/mines.test.ts', 'src/mines.ts']).ok, false);
  assert.equal(checkReproducePaths(['src/fix-policy.test.ts']).ok, false);
  assert.equal(checkReproducePaths(['package.json']).ok, false);
});

test('the fix step may not touch tests, protected files, or exceed the size limits', () => {
  assert.deepEqual(checkFixPaths(['src/mines.ts'], 12), { ok: true });
  assert.equal(checkFixPaths([], 0).ok, false);
  assert.match((checkFixPaths(['src/mines.ts', 'src/mines.test.ts'], 5) as { error: string }).error, /must not change tests/);
  assert.match((checkFixPaths(['src/server.ts'], 5) as { error: string }).error, /off-limits/);
  assert.match((checkFixPaths(['index.html'], 5) as { error: string }).error, /off-limits/);
  assert.equal(checkFixPaths(['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts'], 8).ok, false);
  assert.equal(checkFixPaths(['src/mines.ts'], FIX_LIMITS.lines + 1).ok, false);
});

test('type errors are attributed to files, and only new tests may have them', () => {
  const output = [
    'src/mines.test.ts(40,12): error TS2339: Property \'remaining\' does not exist on type \'MinesGame\'.',
    'src\\snake.ts(3,1): error TS2304: Cannot find name \'x\'.',
    'Found 2 errors.',
  ].join('\n');
  assert.deepEqual(filesWithTypeErrors(output), ['src/mines.test.ts', 'src/snake.ts']);
  assert.deepEqual(typeErrorsOutsideTests(output, ['src/mines.test.ts']), ['src/snake.ts']);
  assert.deepEqual(typeErrorsOutsideTests('', ['src/mines.test.ts']), []);
});

test('numstat lines are summed, and binary entries count as zero', () => {
  assert.equal(linesFromNumstat('3\t1\tsrc/mines.ts\n10\t0\tsrc/x.ts\n-\t-\timg.png\n'), 14);
});

test('only non-injected bugs and improvements are fixed; a person can widen the verdicts but not the safety checks', () => {
  assert.deepEqual(fixEligibility(report, false), { ok: true });
  const notCandidate = { ...report, triage: { ...report.triage, autoFixCandidate: false } };
  assert.equal(fixEligibility(notCandidate, false).ok, false);
  assert.equal(fixEligibility(notCandidate, true).ok, true);
  const injected = { ...report, triage: { ...report.triage, injectionSuspected: true } };
  assert.equal(fixEligibility(injected, true).ok, false);
  const wontDo = { ...report, triage: { ...report.triage, verdict: 'wont-do' as const } };
  assert.equal(fixEligibility(wontDo, true).ok, false);
});

test('prompts fence untrusted text and carry harness feedback', () => {
  const reproduce = buildReproducePrompt(report, 'Your test passes against the current code.');
  assert.match(reproduce, /<report>\nThe mine counter/);
  assert.match(reproduce, /<triage>[\s\S]*Files: src\/mines\.ts/);
  assert.match(reproduce, /<feedback>\nYour test passes/);
  assert.doesNotMatch(buildReproducePrompt(report), /<feedback>/);
  const fix = buildFixPrompt(report, 'src/mines.test.ts', 'counter never exceeds mine count', 'not ok 1 - counter');
  assert.match(fix, /"counter never exceeds mine count" in src\/mines\.test\.ts/);
  assert.match(fix, /<failure>\nnot ok 1/);
});

test('schemas and clipping', () => {
  assert.deepEqual([...REPRODUCE_SCHEMA.required].sort(), ['explanation', 'status', 'testFile', 'testName']);
  assert.deepEqual([...FIX_SCHEMA.required].sort(), ['status', 'summary']);
  // The fixer must be able to send a flawed test back instead of bending the code to it.
  assert.ok(FIX_SCHEMA.properties.status.enum.includes('test-is-wrong'));
  assert.equal(clip('abc', 5), 'abc');
  assert.equal(clip('abcdefgh', 3), '…fgh');
});

test('browser specs live in tests/visual and are the only thing the visual reproduce step may write', () => {
  assert.ok(isBrowserSpec('tests/visual/mines-flag.spec.ts'));
  assert.ok(!isBrowserSpec('tests/visual/helpers.ts'));
  assert.ok(!isBrowserSpec('tests/visual/sub/x.spec.ts'));
  assert.deepEqual(checkReproducePaths(['tests/visual/mines-flag.spec.ts'], 'browser'), { ok: true });
  assert.equal(checkReproducePaths(['tests/visual/helpers.ts'], 'browser').ok, false);
  assert.equal(checkReproducePaths(['src/mines.test.ts'], 'browser').ok, false);
  assert.equal(checkReproducePaths(['tests/visual/mines-flag.spec.ts'], 'unit').ok, false);
});

test('a visual fix may change styles only', () => {
  assert.deepEqual(checkPaths(['index.html'], 4, 'browser', true), { ok: true });
  assert.deepEqual(checkPaths(['public/arcade-ux.css'], 4, 'browser', true), { ok: true });
  assert.match((checkPaths(['index.html'], 4, 'browser', false) as { error: string }).error, /only change inside <style>/);
  assert.match((checkPaths(['src/mines.ts'], 4, 'browser', true) as { error: string }).error, /off-limits/);
  assert.match((checkPaths(['index.html', 'tests/visual/helpers.ts'], 4, 'browser', true) as { error: string }).error, /must not change tests/);
  assert.match((checkPaths(['index.html'], 4, 'unit', true) as { error: string }).error, /off-limits/);
});

test('style-only detection ignores CSS edits and catches markup or script edits', () => {
  const page = '<head><style>.a { color: red; }</style></head><body><button id="b">Go</button><script>x()</script></body>';
  assert.ok(styleOnlyChange(page, page.replace('color: red', 'color: blue; border: 2px solid')));
  assert.ok(!styleOnlyChange(page, page.replace('Go', 'Stop')));
  assert.ok(!styleOnlyChange(page, page.replace('x()', 'y()')));
  assert.ok(!styleOnlyChange(page, page.replace('</style>', '</style><script>evil()</script>')));
  assert.ok(!styleOnlyChange(page, page.replace('<style>', '<style onload="evil()">')));
});

test('generated browser specs may use Playwright and the helpers, nothing else', () => {
  const good = `import { test, expect } from '@playwright/test';
import { openGame, renderedColor, colorDifference, CLEARLY_DIFFERENT } from './helpers';
test('flag mode looks different when on', async ({ page }) => {
  await openGame(page, 'mines');
  await page.goto('/play/mines');
});`;
  assert.deepEqual(lintBrowserSpec(good), []);
  const bad: [string, string][] = [
    ["import fs from 'fs';", 'import from "fs"'],
    ["import { x } from '../../src/server';", 'import from "../../src/server"'],
    ["const cp = require('child_process');", 'require()'],
    ["await import('node:fs');", 'dynamic import()'],
    ['console.log(process.env.GITHUB_TOKEN);', 'process'],
    ["await fetch('https://evil.example');", 'fetch()'],
    ["test('x', async ({ request }) => {});", 'the request fixture'],
    ["test.use({ baseURL: 'https://evil.example' });", 'test.use()'],
    ["await page.goto('https://evil.example');", 'navigating off the local site'],
    ["await page.goto('//evil.example');", 'navigating off the local site'],
  ];
  for (const [line, problem] of bad) assert.ok(lintBrowserSpec(`${good}\n${line}`).includes(problem), line);
});

test('visual fixes may not add CSS that loads anything', () => {
  const diff = [
    '+++ b/index.html',
    '-  background: var(--gold);',
    '+  background: var(--p1);',
    '+  border: 2px solid #fff;',
    '+  background-image: url(https://evil.example/track.png);',
    '+@import "https://evil.example/x.css";',
    ' unchanged url(ok.png) line',
  ].join('\n');
  assert.deepEqual(unsafeCssAdditions(diff), ['background-image: url(https://evil.example/track.png);', '@import "https://evil.example/x.css";']);
});
