import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReportEmail, type ReportExport } from './report-email.js';
import { parseReportExport } from './import-report.js';
import type { StoredReport } from './report-intake.js';

const stored: StoredReport = {
  id: '20260928T150000Z-abc123',
  receivedAt: '2026-09-28T15:00:00.000Z',
  game: 'snake',
  commit: '679145c',
  trust: 'tester',
  tester: 'ana',
  report: {
    kind: 'bug',
    description: 'The pause button at the top\nis almost invisible, I can barely read it.',
    path: '/play/snake', viewport: '390x844', language: 'en', userAgent: 'Test browser',
    errors: ['TypeError: x is undefined'],
    element: { selector: '#pause', tag: 'button', text: 'Pause', box: { x: 1, y: 2, width: 3, height: 4 }, styles: { opacity: '0.4' }, state: { disabled: 'true' } },
  },
};
const jpeg = `/9j/${'C'.repeat(40)}`;

test('the email carries the report readably and the import file with the screenshot', () => {
  const email = buildReportEmail(stored, 'me@example.com', 'Blast Arcade <onboarding@resend.dev>', jpeg);
  assert.equal(email.to, 'me@example.com');
  assert.equal(email.subject, '[Blast Arcade] bug in snake (tester ana): The pause button at the top is almost invisible, I can bare…');
  assert.match(email.text, /from trusted tester ana/);
  assert.match(email.text, /They pointed at:\nSelector: #pause \(button\)/);
  assert.match(email.text, /- TypeError: x is undefined/);
  assert.match(email.text, /npm\.cmd run import-report path\\to\\report-20260928T150000Z-abc123\.json/);
  assert.deepEqual(email.attachments.map(item => [item.filename, item.content_type]), [
    ['report-20260928T150000Z-abc123.json', 'application/json'],
    ['screenshot-20260928T150000Z-abc123.jpg', 'image/jpeg'],
  ]);
  const exported = JSON.parse(Buffer.from(email.attachments[0].content, 'base64').toString('utf8')) as ReportExport;
  assert.equal(exported.screenshotData, jpeg);
  assert.equal(email.attachments[1].content, jpeg);
});

test('a public report without extras still makes a complete email', () => {
  const plain: StoredReport = { ...stored, trust: 'public', tester: undefined, report: { ...stored.report, element: undefined, errors: [] } };
  const email = buildReportEmail(plain, 'me@example.com', 'x <x@y.z>');
  assert.match(email.subject, /^\[Blast Arcade\] bug in snake: /);
  assert.match(email.text, /from public\./);
  assert.match(email.text, /No screenshot was sent\./);
  assert.doesNotMatch(email.text, /pointed at|Recent errors/);
  assert.equal(email.attachments.length, 1);
});

test('an emailed report file imports back to the same report, re-validated', () => {
  const email = buildReportEmail(stored, 'me@example.com', 'x <x@y.z>', jpeg);
  const { stored: imported, screenshot } = parseReportExport(Buffer.from(email.attachments[0].content, 'base64').toString('utf8'));
  assert.deepEqual(imported, stored);
  assert.equal(screenshot, jpeg);
});

test('a tampered or foreign file is refused or cleaned on import', () => {
  assert.throws(() => parseReportExport('not json'), /not JSON/);
  assert.throws(() => parseReportExport(JSON.stringify({ ...stored, id: '../../evil' })), /report id/);
  assert.throws(() => parseReportExport(JSON.stringify({ ...stored, report: { ...stored.report, description: 'hi' } })), /invalid/);
  const odd = parseReportExport(JSON.stringify({ ...stored, game: '<script>', commit: 'rm -rf', tester: '../x', screenshotData: 'iVBOR' }));
  assert.equal(odd.stored.game, 'hub');
  assert.equal(odd.stored.commit, 'unknown');
  assert.equal(odd.stored.trust, 'public', 'an invalid tester name loses the tester trust');
  assert.equal(odd.screenshot, undefined);
});
