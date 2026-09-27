import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BUG_REPORT_LIMITS, RecentErrors, validateBugReport } from './bug-report.js';
import { ReportRateLimiter, createReportId, storeReport } from './report-intake.js';
import { translateArcadeText } from './i18n.js';

const valid = {
  kind: 'bug',
  description: '  The bomb did not explode near the wall.  ',
  path: '/play/bomberman',
  viewport: '390x844',
  language: 'en',
  userAgent: 'Test browser',
  errors: ['TypeError: x is undefined'],
};

test('a complete report is accepted and trimmed', () => {
  const result = validateBugReport(valid);
  assert.ok(result.ok);
  assert.equal(result.report.description, 'The bomb did not explode near the wall.');
  assert.equal(result.report.path, '/play/bomberman');
  assert.deepEqual(result.report.errors, ['TypeError: x is undefined']);
});

test('reports need a kind and a real description', () => {
  assert.equal(validateBugReport(null).ok, false);
  assert.equal(validateBugReport({ ...valid, kind: 'rant' }).ok, false);
  assert.equal(validateBugReport({ ...valid, description: '   0123456789   ' }).ok, true);
  assert.equal(validateBugReport({ ...valid, description: '    012345678    ' }).ok, false);
  assert.equal(validateBugReport({ ...valid, description: 'x'.repeat(BUG_REPORT_LIMITS.descriptionMax + 1) }).ok, false);
});

test('the hidden honeypot field rejects bot submissions', () => {
  assert.equal(validateBugReport({ ...valid, website: '' }).ok, true);
  assert.equal(validateBugReport({ ...valid, website: 'http://spam.example' }).ok, false);
});

test('malformed context is dropped instead of rejecting the report', () => {
  const result = validateBugReport({
    ...valid,
    path: 'javascript:alert(1)',
    viewport: '<b>',
    language: 'english please',
    userAgent: 'u'.repeat(1000),
    errors: [1, 'kept', ...Array.from({ length: 30 }, (_, i) => `e${i}`), 'y'.repeat(900)],
  });
  assert.ok(result.ok);
  assert.equal(result.report.path, '/');
  assert.equal(result.report.viewport, '');
  assert.equal(result.report.language, '');
  assert.equal(result.report.userAgent.length, BUG_REPORT_LIMITS.userAgent);
  assert.equal(result.report.errors.length, BUG_REPORT_LIMITS.errors);
  assert.equal(result.report.errors.at(-1)?.length, BUG_REPORT_LIMITS.errorLength);
});

test('recent errors keep only the newest entries', () => {
  const errors = new RecentErrors(3);
  ['a', 'b', 'c', 'd'].forEach(message => errors.push(message));
  assert.deepEqual(errors.list(), ['b', 'c', 'd']);
});

test('the rate limiter allows a burst, blocks the rest, and recovers after the window', () => {
  const limiter = new ReportRateLimiter(2, 1000);
  assert.equal(limiter.allow('ip', 0), true);
  assert.equal(limiter.allow('ip', 100), true);
  assert.equal(limiter.allow('ip', 200), false);
  assert.equal(limiter.allow('other', 200), true);
  assert.equal(limiter.allow('ip', 1100), true);
});

test('report ids sort by time and stored reports land in the queue folder', async () => {
  const early = createReportId(new Date('2026-09-27T10:00:00.000Z'));
  const late = createReportId(new Date('2026-09-27T10:00:01.000Z'));
  assert.match(early, /^20260927T100000Z-[0-9a-f]{6}$/);
  assert.ok(early < late);

  const dir = await mkdtemp(join(tmpdir(), 'reports-'));
  try {
    const checked = validateBugReport(valid);
    assert.ok(checked.ok);
    const stored = { id: early, receivedAt: '2026-09-27T10:00:00.000Z', game: 'bomberman', commit: 'abc123', trust: 'public' as const, report: checked.report };
    const file = await storeReport(dir, stored);
    assert.equal(file, join(dir, 'queue', `${early}.json`));
    assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), stored);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('the settings panel links to a bug report dialog with the fields the module reads', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const hook of ['data-open-bug-report', 'id="bugReportOverlay"', 'id="bugReportForm"', 'id="bugReportDescription"',
    'id="bugReportStatus"', 'id="bugReportSubmit"', 'name="kind" value="bug"', 'name="kind" value="idea"', 'name="website"']) {
    assert.ok(html.includes(hook), hook);
  }
});

test('bug report copy is translated to Romanian', () => {
  for (const text of ['Report a bug or idea', 'Send report', 'Thanks! Your report was sent.', 'Please describe it in at least 10 characters.']) {
    assert.notEqual(translateArcadeText(text, 'ro'), text, text);
  }
});
