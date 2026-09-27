import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { readFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  TesterRegistry, addTester, checkTesterToken, hashTesterToken, isTesterName, revokeTester, writeTesterFile, type TesterFile,
} from './testers.js';
import { ReportRateLimiter } from './report-intake.js';
import { translateArcadeText } from './i18n.js';

const now = new Date('2026-09-27T10:00:00.000Z');
const empty: TesterFile = { testers: [] };

test('a new tester code is random, prefixed, and stored only as a hash', () => {
  const first = addTester(empty, 'ana', { now });
  const second = addTester(empty, 'ana', { now });
  assert.match(first.token, /^tst_[A-Za-z0-9_-]{32}$/);
  assert.notEqual(first.token, second.token);
  const entry = first.file.testers[0];
  assert.equal(entry.hash, hashTesterToken(first.token));
  assert.ok(!JSON.stringify(first.file).includes(first.token));
  assert.equal(entry.expiresAt, '2026-12-26T10:00:00.000Z');
  assert.equal(entry.dailyLimit, 5);
});

test('a valid code identifies its tester; anything else is refused with a reason', () => {
  const { file, token } = addTester(empty, 'ana', { now, days: 30, dailyLimit: 10 });
  const ok = checkTesterToken(file, token, now);
  assert.ok(ok.ok);
  assert.equal(ok.tester.name, 'ana');
  assert.equal(ok.tester.dailyLimit, 10);
  assert.deepEqual(checkTesterToken(file, 'hunter2', now), { ok: false, reason: 'malformed' });
  assert.deepEqual(checkTesterToken(file, `tst_${'x'.repeat(200)}`, now), { ok: false, reason: 'malformed' });
  assert.deepEqual(checkTesterToken(file, `${token}x`, now), { ok: false, reason: 'unknown' });
  assert.deepEqual(checkTesterToken(file, token, new Date('2026-10-27T10:00:00.000Z')), { ok: false, reason: 'expired' });
});

test('revoking disables the code, and the tester can then get a fresh one', () => {
  const added = addTester(empty, 'ana', { now });
  assert.throws(() => addTester(added.file, 'ana', { now }), /already has an active code/);
  const revoked = revokeTester(added.file, 'ana', now);
  assert.deepEqual(checkTesterToken(revoked, added.token, now), { ok: false, reason: 'revoked' });
  assert.throws(() => revokeTester(revoked, 'ana', now), /No active code/);
  const again = addTester(revoked, 'ana', { now });
  assert.ok(checkTesterToken(again.file, again.token, now).ok);
  assert.deepEqual(checkTesterToken(again.file, added.token, now), { ok: false, reason: 'revoked' });
});

test('tester names are short, plain identifiers', () => {
  assert.ok(isTesterName('ana_b-2'));
  assert.ok(!isTesterName(''));
  assert.ok(!isTesterName('../etc'));
  assert.ok(!isTesterName('a'.repeat(33)));
  assert.throws(() => addTester(empty, 'bad name'), /tester name/);
});

test('the registry picks up a revoke from disk and trusts nobody when the file is broken', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'testers-'));
  const path = join(dir, 'testers.json');
  try {
    const registry = new TesterRegistry(path);
    assert.deepEqual(registry.check('tst_anything', now), { ok: false, reason: 'unknown' });

    const added = addTester(empty, 'ana', { now });
    writeTesterFile(path, added.file);
    assert.ok(registry.check(added.token, now).ok);

    writeTesterFile(path, revokeTester(added.file, 'ana', now));
    // Force a distinct mtime; two writes can land in the same filesystem tick.
    utimesSync(path, new Date(), new Date(Date.now() + 5000));
    assert.deepEqual(registry.check(added.token, now), { ok: false, reason: 'revoked' });

    await writeFile(path, '{ broken', 'utf8');
    utimesSync(path, new Date(), new Date(Date.now() + 10_000));
    const originalError = console.error;
    console.error = () => {};
    try { assert.deepEqual(registry.check(added.token, now), { ok: false, reason: 'unknown' }); }
    finally { console.error = originalError; }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('each tester has their own daily allowance', () => {
  const limiter = new ReportRateLimiter(5, 86_400_000);
  assert.equal(limiter.allow('ana', 0, 2), true);
  assert.equal(limiter.allow('ana', 1, 2), true);
  assert.equal(limiter.allow('ana', 2, 2), false);
  assert.equal(limiter.allow('bo', 2, 2), true);
  assert.equal(limiter.allow('ana', 86_400_000, 2), true);
});

test('the report dialog offers an optional tester code field', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(html.includes('id="bugReportTester"'));
  assert.ok(html.includes('id="bugReportTesterCode"'));
  for (const text of ['I have a tester code', 'Tester code not recognized.', 'Thanks! Your tester report was sent.']) {
    assert.notEqual(translateArcadeText(text, 'ro'), text, text);
  }
});
