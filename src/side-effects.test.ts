import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encodePng } from './png.js';
import { compareScreens, findUnstable, screenOf, sideEffectFeedback, sideEffectSummary } from './side-effects.js';

function write(dir: string, name: string, colour: [number, number, number]): void {
  mkdirSync(dir, { recursive: true });
  const data = new Uint8Array(4 * 4 * 4);
  for (let i = 0; i < data.length; i += 4) data.set([...colour, 255], i);
  writeFileSync(join(dir, name), encodePng({ width: 4, height: 4, data }));
}

test('screen names map to the game they show', () => {
  assert.equal(screenOf('phone-mines.png'), 'mines');
  assert.equal(screenOf('desktop-hub.png'), 'hub');
  assert.equal(screenOf('phone-twenty48.png'), 'twenty48');
});

test('changes on the reported game are expected; anywhere else they are side effects', () => {
  const root = mkdtempSync(join(tmpdir(), 'screens-'));
  try {
    const [a, b, after] = ['a', 'b', 'after'].map(name => join(root, name));
    const grey: [number, number, number] = [30, 30, 40];
    for (const dir of [a, b, after]) for (const name of ['phone-hub.png', 'phone-mines.png', 'phone-snake.png', 'phone-racing.png']) write(dir, name, grey);
    // Racing animates: its two baselines differ, so it cannot be judged.
    write(b, 'phone-racing.png', [200, 30, 40]);
    // The fix changes mines (its own game) and, by accident, snake.
    write(after, 'phone-mines.png', [84, 227, 142]);
    write(after, 'phone-snake.png', [84, 227, 142]);
    // A screen that failed to render after the fix is a change, not a pass.
    rmSync(join(after, 'phone-hub.png'));

    const unstable = findUnstable(a, b);
    assert.deepEqual(unstable, ['phone-racing.png']);
    const effects = compareScreens(a, after, unstable, 'mines');
    assert.equal(effects.checked, 3);
    assert.deepEqual(effects.own.map(change => change.name), ['phone-mines.png']);
    assert.deepEqual(effects.others.map(change => [change.name, change.where]), [
      ['phone-hub.png', 'missing after the fix'],
      ['phone-snake.png', '4x4 px at 0,0'],
    ]);
    assert.match(sideEffectFeedback(effects, 'mines'), /outside mines[\s\S]*- phone-snake\.png: 16 pixels changed/);
    assert.equal(sideEffectSummary(effects), '3 screens compared, 1 changed on the reported game, 2 changed elsewhere, 1 skipped as unstable (phone-racing.png)');
    assert.equal(sideEffectSummary(undefined), 'not checked');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
