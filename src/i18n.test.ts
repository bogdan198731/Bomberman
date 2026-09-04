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

test('Romanian translations cover the 2048 interface and dynamic scores', () => {
  assert.equal(translateArcadeText('Slide, merge, and reach 2048', 'ro'), 'Glisează, combină și ajungi la 2048');
  assert.equal(translateArcadeText('Great move — +128 points.', 'ro'), 'Mutare excelentă — +128 puncte.');
  assert.equal(translateArcadeText('Tile 2048 at row 2, column 3', 'ro'), 'Piesa 2048 pe rândul 2, coloana 3');
  assert.equal(translateArcadeText('No moves left. Final score: 8,192.', 'ro'), 'Nu mai sunt mutări. Scor final: 8,192.');
});

test('Romanian translations cover the Sudoku interface and dynamic progress', () => {
  assert.equal(translateArcadeText('Sudoku difficulty', 'ro'), 'Dificultate Sudoku');
  assert.equal(translateArcadeText('Hint placed — keep going.', 'ro'), 'Indiciu plasat — continuă.');
  assert.equal(
    translateArcadeText('That number conflicts with this row, column, or box.', 'ro'),
    'Acest număr intră în conflict cu rândul, coloana sau careul.',
  );
  assert.equal(
    translateArcadeText('Completed in 04:18 · 2 mistakes · 1 hint · 7,210 points.', 'ro'),
    'Finalizat în 04:18 · 2 greșeli · 1 indiciu · 7,210 puncte.',
  );
  assert.equal(translateArcadeText('Hint, 1 remaining', 'ro'), 'Indiciu, 1 rămas');
  assert.equal(translateArcadeText('Hint, 2 remaining', 'ro'), 'Indiciu, 2 rămase');
  assert.equal(
    translateArcadeText('Entered 7, row 4, column 9', 'ro'),
    'Număr introdus 7, rândul 4, coloana 9',
  );
  assert.equal(
    translateArcadeText('Empty cell, row 2, column 6', 'ro'),
    'Celulă goală, rândul 2, coloana 6',
  );
});
