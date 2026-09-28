import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BUG_REPORT_LIMITS, RecentErrors, describePicked, validateBugReport, validatePickedElement, validateScreenshot,
} from './bug-report.js';
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

const flagButton = {
  selector: '#minesFlagButton', tag: 'BUTTON', text: '⚑ Flag mode',
  box: { x: 833.4, y: 547, width: 112, height: 40 },
  styles: { color: 'rgb(26, 18, 4)', 'background-image': 'linear-gradient(135deg, #ffd978, #ffc857)', cursor: 'pointer' },
  state: { 'aria-pressed': 'true', onclick: 'evil()' },
};

test('a picked element keeps only known fields, cleaned', () => {
  const picked = validatePickedElement(flagButton);
  assert.deepEqual(picked, {
    selector: '#minesFlagButton', tag: 'button', text: '⚑ Flag mode',
    box: { x: 833, y: 547, width: 112, height: 40 },
    styles: { color: 'rgb(26, 18, 4)', 'background-image': 'linear-gradient(135deg, #ffd978, #ffc857)' },
    state: { 'aria-pressed': 'true' },
  });
  assert.equal(validatePickedElement({ ...flagButton, text: 'line\nbreak\u0000' })?.text, 'line break');
  assert.equal(validatePickedElement({ ...flagButton, tag: '<script>' }), undefined);
  assert.equal(validatePickedElement({ ...flagButton, box: { x: 'a', y: 0, width: 1, height: 1 } }), undefined);
  assert.equal(validatePickedElement({ ...flagButton, selector: '' }), undefined);
  assert.equal(validatePickedElement('nope'), undefined);
});

test('only a real JPEG within the limit is accepted as a screenshot', () => {
  const jpeg = `data:image/jpeg;base64,/9j/${'A'.repeat(100)}`;
  assert.equal(validateScreenshot(jpeg), `/9j/${'A'.repeat(100)}`);
  assert.equal(validateScreenshot('data:image/png;base64,iVBORw0KGgo='), undefined);
  assert.equal(validateScreenshot('data:image/jpeg;base64,iVBORw0KGgo='), undefined, 'PNG bytes under a JPEG label');
  assert.equal(validateScreenshot('data:image/jpeg;base64,/9j/<script>'), undefined);
  assert.equal(validateScreenshot(`data:image/jpeg;base64,/9j/${'A'.repeat(BUG_REPORT_LIMITS.screenshotChars)}`), undefined);
});

test('a report carries the picked element in the report and the screenshot beside it', () => {
  const result = validateBugReport({ ...valid, element: flagButton, screenshot: `data:image/jpeg;base64,/9j/${'B'.repeat(8)}` });
  assert.ok(result.ok);
  assert.equal(result.report.element?.selector, '#minesFlagButton');
  assert.equal(result.screenshot, `/9j/${'B'.repeat(8)}`);
  assert.ok(!JSON.stringify(result.report).includes('/9j/'), 'the image is not stored inside the report JSON');
  // A broken extra never costs the player their report.
  const lenient = validateBugReport({ ...valid, element: 'garbage', screenshot: 'data:text/html,<b>' });
  assert.ok(lenient.ok);
  assert.equal(lenient.report.element, undefined);
  assert.equal(lenient.screenshot, undefined);
});

test('agents get a picked element as plain labelled lines', () => {
  const text = describePicked(validatePickedElement(flagButton)!);
  assert.match(text, /^Selector: #minesFlagButton \(button\)$/m);
  assert.match(text, /^State: aria-pressed=true$/m);
  assert.match(text, /^On the player's screen: 112x40 px at 833,547$/m);
});

test('the report dialog offers pointing and a screenshot, and hides dialogs while pointing', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const hook of ['id="bugReportPick"', 'id="bugReportPicked"', 'id="bugReportShotRow"', 'id="bugReportShotToggle"', 'id="bugReportShot"', 'body.bug-picking > :not(main):not(.bug-picker)']) {
    assert.ok(html.includes(hook), hook);
  }
});
