import test from 'node:test';
import assert from 'node:assert/strict';
import {
  arcadeInviteShareData,
  clearArcadeInviteUrl,
  createArcadeInviteUrl,
  normalizeInviteCode,
  parseArcadeInvite,
  shareOrCopyInvite,
} from './invite.js';

test('invite codes normalize valid room codes and reject malformed values', () => {
  assert.equal(normalizeInviteCode(' ab2z9 '), 'AB2Z9');
  assert.equal(normalizeInviteCode('ROOM1'), null);
  assert.equal(normalizeInviteCode('TOO-LONG'), null);
});

test('invite links identify every game while old links still open Bomberman', () => {
  assert.deepEqual(parseArcadeInvite('?game=septica&room=abc29'), { game: 'septica', roomCode: 'ABC29' });
  assert.deepEqual(parseArcadeInvite('?room=ABC29'), { game: 'bomberman', roomCode: 'ABC29' });
  assert.equal(parseArcadeInvite('?game=star&room=ABC29'), null);
  assert.equal(parseArcadeInvite('?game=snake&room=bad'), null);
});

test('invite URLs preserve the deployment path and unrelated query values', () => {
  const url = createArcadeInviteUrl('https://arcade.example/play?theme=dark#games', 'tanks', 'tank2');
  assert.equal(url, 'https://arcade.example/play?theme=dark&game=tanks&room=TANK2');
  assert.equal(clearArcadeInviteUrl(url), 'https://arcade.example/play?theme=dark');
});

test('share data includes the friendly game name and room code', () => {
  const data = arcadeInviteShareData('https://arcade.example/', 'tintar', 'MINT2');
  assert.match(data.title, /Țintar/);
  assert.match(data.text, /MINT2/);
  assert.equal(data.url, 'https://arcade.example/?game=tintar&room=MINT2');
});

test('native sharing falls back to copying unless the user cancels', async () => {
  const data = arcadeInviteShareData('https://arcade.example/', 'paddle', 'BALL2');
  let copied = '';
  const fallback = await shareOrCopyInvite(data, {
    share: async () => { throw new Error('Unavailable'); },
    copy: async value => { copied = value; },
  });
  assert.equal(fallback, 'copied');
  assert.equal(copied, data.url);
  const abort = new Error('Cancelled');
  abort.name = 'AbortError';
  assert.equal(await shareOrCopyInvite(data, { share: async () => { throw abort; }, copy: async () => {} }), 'cancelled');
});
