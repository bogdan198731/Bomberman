import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MATHCROSS_SETTINGS, MathCrossGame, applyOp, blankCount, equationOptions, generateMathCross,
  loadMathCrossSession, normalizeMathCrossSession, saveMathCrossSession, seededRandom, solveByDeduction,
  validEquation, type MathCrossDifficulty, type MathCrossPuzzle,
} from './mathcross.js';
import { translateArcadeText } from './i18n.js';

const LEVELS: MathCrossDifficulty[] = ['easy', 'normal', 'hard'];

/** Puts the answer into every blank circle. */
function solve(game: MathCrossGame): void {
  for (const node of game.blanks()) {
    game.select(node);
    for (const digit of String(game.puzzle.values[node])) game.type(Number(digit));
  }
}

test('every generated puzzle holds together with whole numbers in range', () => {
  for (const difficulty of LEVELS) {
    const { max, size } = MATHCROSS_SETTINGS[difficulty];
    for (let seed = 1; seed <= 40; seed++) {
      const puzzle = generateMathCross(difficulty, seededRandom(seed));
      assert.equal(puzzle.size, size);
      for (const { nodes, op } of puzzle.equations) {
        const [a, b, c] = nodes.map(node => puzzle.values[node]);
        assert.ok(a !== null && b !== null && c !== null, `${difficulty} #${seed}: every equation circle has a number`);
        assert.ok(validEquation(op, a, b, c, max), `${difficulty} #${seed}: ${a} ${op} ${b} = ${c}`);
      }
    }
  }
});

test('every puzzle can be solved step by step, so its answer is the only one', () => {
  for (const difficulty of LEVELS) {
    for (let seed = 1; seed <= 40; seed++) {
      const puzzle = generateMathCross(difficulty, seededRandom(seed));
      assert.deepEqual(solveByDeduction(puzzle), puzzle.values, `${difficulty} #${seed}`);
      assert.ok(blankCount(puzzle) >= MATHCROSS_SETTINGS[difficulty].minBlanks, `${difficulty} #${seed} has enough blanks`);
    }
  }
});

test('harder levels have bigger grids, bigger numbers and more blanks', () => {
  const average = (difficulty: MathCrossDifficulty, read: (puzzle: MathCrossPuzzle) => number): number => {
    let total = 0;
    for (let seed = 1; seed <= 30; seed++) total += read(generateMathCross(difficulty, seededRandom(seed)));
    return total / 30;
  };
  const biggest = (puzzle: MathCrossPuzzle): number => Math.max(...puzzle.values.map(value => value ?? 0));
  assert.ok(average('easy', blankCount) < average('normal', blankCount));
  assert.ok(average('normal', blankCount) < average('hard', blankCount));
  assert.ok(average('easy', biggest) <= 20);
  assert.ok(average('normal', biggest) > average('easy', biggest));
  assert.ok(average('hard', biggest) > average('normal', biggest));
});

test('equations stay whole and skip trivial ×1 and ÷1', () => {
  assert.ok(Number.isNaN(applyOp('÷', 7, 2)));
  assert.equal(validEquation('×', 1, 9, 9, 20), false);
  assert.equal(validEquation('÷', 9, 1, 9, 20), false);
  assert.equal(validEquation('-', 5, 5, 0, 20), false, 'no zero answers');
  assert.equal(validEquation('+', 12, 24, 36, 50), true);
  assert.deepEqual(equationOptions('×', [undefined, undefined, 12], 20).map(option => option.join(' ')).sort(), ['2 6 12', '3 4 12', '4 3 12', '6 2 12']);
  assert.deepEqual(equationOptions('-', [20, undefined, 11], 50), [[20, 9, 11]]);
});

test('typing fills the selected circle and solving every equation wins', () => {
  const game = new MathCrossGame(seededRandom(5));
  game.newGame('easy');
  assert.equal(game.statusText(), 'Tap an empty circle, then pick its number.');
  const first = game.blanks()[0];
  game.select(first);
  game.type(1);
  game.type(2);
  assert.equal(game.entries[first], 12, 'two digits build one number');
  game.type(3);
  assert.equal(game.entries[first], 3, 'a third digit starts over on a two-digit grid');
  assert.ok(game.erase());
  assert.equal(game.entries[first], null);
  solve(game);
  assert.equal(game.phase, 'won');
  assert.ok(game.score() > blankCount(game.puzzle) * MATHCROSS_SETTINGS.easy.pointsPerBlank, 'a quick solve earns a bonus');
  assert.match(game.statusText(), /^Solved in 0:00! \d+ points\.$/);
  assert.equal(game.type(4), false, 'a solved puzzle is locked');
});

test('a full grid that does not add up marks the wrong circles until it is fixed', () => {
  const other = new MathCrossGame(seededRandom(9));
  other.newGame('normal');
  const [wrongNode, ...rest] = other.blanks();
  other.select(wrongNode);
  other.type(other.puzzle.values[wrongNode] === 1 ? 2 : 1);
  for (const node of rest) {
    other.select(node);
    for (const digit of String(other.puzzle.values[node])) other.type(Number(digit));
  }
  assert.equal(other.phase, 'playing');
  assert.ok(other.wrongNodes().has(wrongNode));
  assert.equal(other.statusText(), 'Not quite - the red circles break an equation.');
  other.select(wrongNode);
  for (const digit of String(other.puzzle.values[wrongNode])) other.type(Number(digit));
  assert.equal(other.phase, 'won');
  assert.equal(other.wrongNodes().size, 0);
});

test('arrow keys move between blank circles only', () => {
  const game = new MathCrossGame(seededRandom(3));
  game.newGame('hard');
  const { size } = game.puzzle;
  const start = game.selected;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    game.select(start);
    if (game.move(dx, dy)) {
      assert.ok(game.isBlank(game.selected));
      const moved = [game.selected % size - start % size, Math.floor(game.selected / size) - Math.floor(start / size)];
      assert.ok(dx ? moved[1] === 0 && Math.sign(moved[0]) === dx : moved[0] === 0 && Math.sign(moved[1]) === dy);
    } else {
      assert.equal(game.selected, start);
    }
  }
});

test('an unfinished puzzle survives a reload, and a tampered one is refused', () => {
  const storage = new Map<string, string>();
  const store = { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => { storage.set(key, value); }, removeItem: (key: string) => { storage.delete(key); } };
  const game = new MathCrossGame(seededRandom(11));
  game.newGame('hard');
  assert.equal(game.session(), null, 'nothing to save before the first number');
  const node = game.blanks()[1];
  game.select(node);
  game.type(7);
  game.elapsedSeconds = 42;
  saveMathCrossSession(game.session(), store);

  const restored = new MathCrossGame(seededRandom(99));
  assert.ok(restored.restore(loadMathCrossSession(store)));
  assert.equal(restored.difficulty, 'hard');
  assert.deepEqual(restored.puzzle, game.puzzle);
  assert.equal(restored.entries[node], 7);
  assert.equal(restored.elapsedSeconds, 42);

  const tampered = JSON.parse(storage.get('blast-arcade-mathcross-session-v1')!);
  const equation = tampered.puzzle.equations[0];
  tampered.puzzle.values[equation.nodes[2]] += 1;
  assert.equal(normalizeMathCrossSession(tampered), null, 'numbers that do not add up');
  assert.equal(normalizeMathCrossSession({ ...JSON.parse(storage.get('blast-arcade-mathcross-session-v1')!), difficulty: 'expert' }), null);
  saveMathCrossSession(null, store);
  assert.equal(loadMathCrossSession(store), null);
});

test('Math Crossword reads in Romanian', () => {
  assert.equal(translateArcadeText('Tap an empty circle, then pick its number.', 'ro'), 'Apasă un cerc gol, apoi alege numărul lui.');
  assert.equal(translateArcadeText('7 circles left to fill.', 'ro'), '7 cercuri rămase de completat.');
  assert.equal(translateArcadeText('Solved in 2:05! 540 points.', 'ro'), 'Rezolvat în 2:05! 540 puncte.');
  assert.equal(translateArcadeText('Row 2, column 3: empty', 'ro'), 'Rândul 2, coloana 3: gol');
  assert.equal(translateArcadeText('Hard · up to 99', 'ro'), 'Greu · până la 99');
});
