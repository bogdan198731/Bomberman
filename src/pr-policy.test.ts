import test from 'node:test';
import assert from 'node:assert/strict';
import {
  autoMergeChecks, fence, pairScreenshots, parseGitHubRemote, prBody, prTitle, screenshotSection, withinDailyCap, type AutoMergeInput,
} from './pr-policy.js';
import { isTesterActive, type TesterFile } from './testers.js';
import type { FixRecord } from './fix-policy.js';
import type { TriagedReport } from './triage.js';

const triaged: TriagedReport = {
  id: '20260927T110000Z-mines1', receivedAt: '2026-09-27T11:00:00.000Z', game: 'mines', commit: 'e919627',
  trust: 'tester', tester: 'ana',
  report: {
    kind: 'bug', description: 'Flagging an opened square @everyone ![x](http://evil.example/p.png) ``` breaks the counter',
    path: '/play/mines', viewport: '390x844', language: 'en', userAgent: 'Test', errors: [],
  },
  triage: {
    verdict: 'bug', confidence: 'high', severity: 'low', title: 'Revealed Minesweeper squares can be flagged',
    reasoning: 'toggleFlag ignores cell.revealed.', affectedFiles: ['src/mines.ts'], suggestedFix: 'Guard revealed cells.',
    autoFixCandidate: true, injectionSuspected: false, duplicateOf: null,
  },
  triagedAt: '2026-09-27T11:01:00.000Z', triageModel: 'claude-sonnet-5', triageCostUsd: 0.1,
};
const fix: FixRecord = {
  id: triaged.id, title: triaged.triage.title, outcome: 'fixed', forced: false, base: 'e919627aaaaaaa',
  branch: `fix/${triaged.id}`, commits: ['9c1e2ae', 'a2b62a9'], testFile: 'src/mines.test.ts',
  testName: 'a long-press cannot flag a square that is already revealed', summary: 'Added a revealed guard.',
  diffLines: 2, costUsd: 0.18, finishedAt: '2026-09-27T11:05:00.000Z',
};
const input: AutoMergeInput = { triaged, fix, changedFiles: ['src/mines.test.ts', 'src/mines.ts'], diffLines: 2, testerActive: true, htmlStyleOnly: true };

test('a verified tester\'s small, test-first fix is eligible', () => {
  const result = autoMergeChecks(input);
  assert.equal(result.eligible, true);
  assert.ok(result.checks.every(check => check.ok));
});

test('any single failing gate blocks auto-merge and is named', () => {
  const cases: [string, Partial<AutoMergeInput>][] = [
    ['reported with a verified tester code', { triaged: { ...triaged, trust: 'public', tester: undefined } }],
    ['that tester\'s code is still active', { testerActive: false }],
    ['triage confidence is high', { triaged: { ...triaged, triage: { ...triaged.triage, confidence: 'medium' } } }],
    ['triaged as a bug or improvement', { triaged: { ...triaged, triage: { ...triaged.triage, verdict: 'wont-do' } } }],
    ['triage marked it as an auto-fix candidate', { triaged: { ...triaged, triage: { ...triaged.triage, autoFixCandidate: false } } }],
    ['no prompt injection suspected', { triaged: { ...triaged, triage: { ...triaged.triage, injectionSuspected: true } } }],
    ['picked by triage, not forced by hand', { fix: { ...fix, forced: true } }],
    ['a failing test came first, then the fix', { fix: { ...fix, commits: ['a2b62a9'] } }],
    ['the branch changes both a test and code', { changedFiles: ['src/mines.ts'] }],
    ['only unprotected game modules changed', { changedFiles: ['src/mines.test.ts', 'src/server.ts'] }],
    ['only unprotected game modules changed', { changedFiles: ['src/mines.test.ts', '.github/workflows/ci.yml'] }],
    ['within 3 files and 200 lines', { diffLines: 201 }],
  ];
  for (const [label, change] of cases) {
    const result = autoMergeChecks({ ...input, ...change });
    assert.equal(result.eligible, false, label);
    assert.deepEqual(result.checks.filter(check => !check.ok).map(check => check.label), [label], label);
  }
});

test('the tester must still be active when the PR opens, not just when reporting', () => {
  const file: TesterFile = { testers: [
    { name: 'ana', hash: 'x', createdAt: '2026-09-01T00:00:00Z', expiresAt: '2026-12-01T00:00:00Z', dailyLimit: 5 },
    { name: 'bo', hash: 'y', createdAt: '2026-09-01T00:00:00Z', expiresAt: '2026-12-01T00:00:00Z', dailyLimit: 5, revokedAt: '2026-09-20T00:00:00Z' },
  ] };
  const now = new Date('2026-09-27T00:00:00Z');
  assert.equal(isTesterActive(file, 'ana', now), true);
  assert.equal(isTesterActive(file, 'bo', now), false);
  assert.equal(isTesterActive(file, 'ana', new Date('2026-12-02T00:00:00Z')), false);
  assert.equal(isTesterActive(file, 'nobody', now), false);
});

test('the daily cap counts only the last 24 hours', () => {
  const now = new Date('2026-09-27T12:00:00Z');
  assert.equal(withinDailyCap(['2026-09-27T01:00:00Z', '2026-09-27T02:00:00Z'], now, 3), true);
  assert.equal(withinDailyCap(['2026-09-27T01:00:00Z', '2026-09-27T02:00:00Z', '2026-09-27T03:00:00Z'], now, 3), false);
  assert.equal(withinDailyCap(['2026-09-25T01:00:00Z', '2026-09-25T02:00:00Z', '2026-09-26T03:00:00Z'], now, 3), true);
});

test('titles lose mentions, links and markdown', () => {
  assert.equal(prTitle('Flags @everyone see [this](https://x.y) `now`'), 'fix: Flags everyone see this now');
  assert.equal(prTitle('@@@'), 'fix: player-reported issue');
  assert.ok(prTitle('x'.repeat(300)).length <= 95);
});

test('untrusted text is fenced with a fence longer than any backticks inside it', () => {
  assert.equal(fence('plain'), '```text\nplain\n```');
  assert.equal(fence('has ``` inside'), '````text\nhas ``` inside\n````');
});

test('the PR body fences the report and lists every gate', () => {
  const body = prBody(input, true);
  assert.match(body, /````text\nFlagging an opened square @everyone/);
  assert.match(body, /\*\*Auto-merge: enabled - merges once CI passes\*\*/);
  assert.match(body, /- \[x\] that tester's code is still active/);
  assert.match(prBody({ ...input, testerActive: false }, false), /- \[ \] that tester's code is still active/);
  assert.match(body, /failed on `e919627`/);
});

test('GitHub remotes parse from SSH and HTTPS', () => {
  assert.deepEqual(parseGitHubRemote('git@github.com:bogdan198731/Bomberman.git\n'), { owner: 'bogdan198731', repo: 'Bomberman' });
  assert.deepEqual(parseGitHubRemote('https://github.com/bogdan198731/Bomberman'), { owner: 'bogdan198731', repo: 'Bomberman' });
  assert.equal(parseGitHubRemote('https://gitlab.com/a/b.git'), null);
});

test('a visual fix is eligible only when a browser spec and styles alone changed', () => {
  const approved = { approved: true, fixed: true, readable: true, fitsDesign: true, regressions: [], summary: 'Clearly green now.' };
  const visualFix: FixRecord = { ...fix, kind: 'browser', testFile: 'tests/visual/mines-flag.spec.ts', review: approved };
  const visual: AutoMergeInput = {
    ...input, fix: visualFix, changedFiles: ['tests/visual/mines-flag.spec.ts', 'index.html'],
    triaged: { ...triaged, triage: { ...triaged.triage, testKind: 'browser' } },
  };
  assert.equal(autoMergeChecks(visual).eligible, true);
  const failing = (change: Partial<AutoMergeInput>) => autoMergeChecks({ ...visual, ...change }).checks.filter(check => !check.ok).map(check => check.label);
  assert.deepEqual(failing({ htmlStyleOnly: false }), ['only styles changed (CSS in <style> blocks or public/*.css)']);
  assert.deepEqual(failing({ changedFiles: ['tests/visual/mines-flag.spec.ts', 'index.html', 'src/mines.ts'] }), ['only styles changed (CSS in <style> blocks or public/*.css)']);
  assert.deepEqual(failing({ changedFiles: ['index.html'] }), ['the branch changes both a test and code']);
  assert.equal(autoMergeChecks({ ...visual, changedFiles: ['tests/visual/mines-flag.spec.ts', 'public/arcade-ux.css'] }).eligible, true);
  assert.deepEqual(failing({ unsafeCss: ['background: url(https://evil.example/a.png)'] }), ['only styles changed (CSS in <style> blocks or public/*.css)']);
  const review = 'a vision review approved the before/after screenshots';
  assert.deepEqual(failing({ fix: { ...visualFix, review: undefined } }), [review]);
  assert.deepEqual(failing({ fix: { ...visualFix, review: { ...approved, approved: false, readable: false } } }), [review]);
  // Unit fixes have no screenshots, so the review check does not apply to them.
  assert.ok(!autoMergeChecks(input).checks.some(check => check.label === review));
  assert.match(prBody(visual, false), /\*\*Vision review: approved\*\* - ✅ problem gone · ✅ text readable · ✅ fits the design/);
  assert.match(prBody({ ...visual, fix: { ...visualFix, review: undefined } }, false), /none ran, so a person must check/);
  assert.doesNotMatch(prBody(input, false), /Vision review/);
});

test('screenshots pair by name, phone first, and a missing side stays visible', () => {
  const pairs = pairScreenshots(
    ['desktop-flag-mode-2.png', 'phone-flag-mode-1.png', 'phone-flag-mode-2.png', 'desktop-flag-mode-1.png', 'notes.txt'],
    ['phone-flag-mode-1.png', 'phone-flag-mode-2.png', 'desktop-flag-mode-1.png'],
  );
  assert.deepEqual(pairs.map(pair => pair.label), ['phone, state 1', 'phone, state 2', 'desktop, state 1', 'desktop, state 2']);
  assert.equal(pairs[3].after, undefined);
  const section = screenshotSection(pairs, (stage, file) => `https://example.test/${stage}/${file}`);
  assert.match(section, /\| phone, state 1 \| <img src="https:\/\/example.test\/before\/phone-flag-mode-1.png" width="360"> \| <img src="https:\/\/example.test\/after\/phone-flag-mode-1.png"/);
  assert.match(section, /\| desktop, state 2 \| <img [^|]+ \| _none_ \|/);
  assert.equal(screenshotSection([], () => ''), '');
  assert.match(prBody(input, false, section), /\*\*Screenshots\*\*[\s\S]*\*\*Auto-merge: off/);
});
