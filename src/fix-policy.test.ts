import test from 'node:test';
import assert from 'node:assert/strict';
import {
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
