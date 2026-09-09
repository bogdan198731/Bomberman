import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { connectivityPresentation, isIosDevice, pwaInstallMode, shouldOfferServiceWorkerUpdate } from './pwa.js';

const pwaSource = readFileSync(new URL('../src/pwa.ts', import.meta.url), 'utf8');
const workerSource = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');

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

test('an installed worker prompts refresh only when an older version controls the page', () => {
  assert.equal(shouldOfferServiceWorkerUpdate(true, 'installed'), true);
  assert.equal(shouldOfferServiceWorkerUpdate(false, 'installed'), false);
  assert.equal(shouldOfferServiceWorkerUpdate(true, 'installing'), false);
});

test('service-worker updates wait for the player and refresh through controller change', () => {
  assert.match(pwaSource, /updateViaCache: 'none'/);
  assert.match(pwaSource, /registration\.waiting/);
  assert.match(pwaSource, /registration\.addEventListener\('updatefound'/);
  assert.match(pwaSource, /serviceWorker\.addEventListener\('controllerchange'/);
  assert.match(workerSource, /event\.data\?\.type === 'SKIP_WAITING'/);
  assert.doesNotMatch(workerSource, /cache\.addAll\(APP_SHELL\)\)\.then\(\(\) => self\.skipWaiting/);
});
