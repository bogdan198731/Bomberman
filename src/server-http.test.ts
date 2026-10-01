import test from 'node:test';
import assert from 'node:assert/strict';
import { contentValidators, fileValidators, isNotModified, legacyHostRedirect } from './server-http.js';

test('the old Render address moves page and file reads to blastarcade.ro, keeping the path and query', () => {
  assert.equal(legacyHostRedirect('bomberman-mixj.onrender.com', 'GET', '/play/mines?room=AB'), 'https://blastarcade.ro/play/mines?room=AB');
  assert.equal(legacyHostRedirect('bomberman-mixj.onrender.com:443', 'HEAD', '/'), 'https://blastarcade.ro/');
  assert.equal(legacyHostRedirect('BOMBERMAN-MIXJ.ONRENDER.COM', 'GET', '/ro/'), 'https://blastarcade.ro/ro/');
  assert.equal(legacyHostRedirect('bomberman-mixj.onrender.com', 'GET', undefined), 'https://blastarcade.ro/');
});

test('everything else is served where it was asked for', () => {
  // A score or a bug report posted from a tab still open on the old address must not be lost.
  assert.equal(legacyHostRedirect('bomberman-mixj.onrender.com', 'POST', '/api/scores'), undefined);
  for (const host of ['blastarcade.ro', 'www.blastarcade.ro', 'localhost:4173', '127.0.0.1:4310', 'onrender.com.evil.example', undefined]) {
    assert.equal(legacyHostRedirect(host, 'GET', '/'), undefined, String(host));
  }
});

test('a file the browser already has is answered with 304, by ETag or by date', () => {
  const validators = fileValidators(1234, Date.UTC(2026, 9, 1, 12));
  assert.equal(isNotModified({ 'if-none-match': validators.etag }, validators), true);
  assert.equal(isNotModified({ 'if-none-match': validators.etag.replace(/^W\//, '') }, validators), true, 'a strong copy of the tag still matches');
  assert.equal(isNotModified({ 'if-none-match': `W/"other", ${validators.etag}` }, validators), true);
  assert.equal(isNotModified({ 'if-none-match': 'W/"other"' }, validators), false);
  assert.equal(isNotModified({ 'if-modified-since': validators.lastModified }, validators), true);
  assert.equal(isNotModified({ 'if-modified-since': new Date(Date.UTC(2026, 8, 1)).toUTCString() }, validators), false, 'an older copy is stale');
  assert.equal(isNotModified({ 'if-none-match': 'W/"other"', 'if-modified-since': validators.lastModified }, validators), false, 'the ETag wins over the date');
  assert.equal(isNotModified({}, validators), false);
  assert.notEqual(fileValidators(1234, 1).etag, fileValidators(1235, 1).etag, 'a changed file gets a new tag');
});

test('rendered pages are tagged by their content', () => {
  assert.equal(contentValidators('<p>a</p>').etag, contentValidators('<p>a</p>').etag);
  assert.notEqual(contentValidators('<p>a</p>').etag, contentValidators('<p>b</p>').etag);
  assert.equal(isNotModified({ 'if-none-match': contentValidators('x').etag }, contentValidators('x')), true);
});
