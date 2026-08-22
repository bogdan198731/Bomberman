import assert from 'node:assert/strict';
import test from 'node:test';
import { translateArcadeText } from './i18n.js';

test('Romanian translations cover shared arcade and revenge actions', () => {
  assert.equal(translateArcadeText('Arcade settings', 'ro'), 'Setările arcadei');
  assert.equal(translateArcadeText('Play revenge match', 'ro'), 'Joacă revanșa');
  assert.equal(translateArcadeText('Quick Match', 'ro'), 'Meci rapid');
  assert.equal(translateArcadeText('Play revenge match', 'en'), 'Play revenge match');
});

test('Romanian translations preserve whitespace and localize dynamic Țintar messages', () => {
  assert.equal(translateArcadeText('  Mint: place a piece (4 left).  ', 'ro'), '  Mint: așază o piesă (4 rămase).  ');
  assert.equal(translateArcadeText('Coral wins the match!', 'ro'), 'Coral câștigă meciul!');
  assert.equal(translateArcadeText('Empty point, position 7', 'ro'), 'Punct liber, poziția 7');
});
