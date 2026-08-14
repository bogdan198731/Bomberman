import test from 'node:test';
import assert from 'node:assert/strict';
import { connectivityPresentation, isIosDevice, pwaInstallMode } from './pwa.js';

test('iOS detection covers iPhone and touch-capable iPadOS devices', () => {
  assert.equal(isIosDevice('Mozilla/5.0 (iPhone)', 'iPhone', 5), true);
  assert.equal(isIosDevice('Mozilla/5.0 (Macintosh)', 'MacIntel', 5), true);
  assert.equal(isIosDevice('Mozilla/5.0 (Windows NT 10.0)', 'Win32', 0), false);
});

test('install controls choose native prompts before manual iOS help', () => {
  assert.equal(pwaInstallMode(true, true, true), 'hidden');
  assert.equal(pwaInstallMode(false, true, true), 'prompt');
  assert.equal(pwaInstallMode(false, false, true), 'manual');
  assert.equal(pwaInstallMode(false, false, false), 'hidden');
});

test('connectivity presentation explains which play modes remain available', () => {
  assert.deepEqual(connectivityPresentation(true), {
    label: 'Online',
    message: 'Connection restored. Online rooms are available.',
  });
  assert.match(connectivityPresentation(false).message, /solo and local games/i);
});
