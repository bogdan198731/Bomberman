import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidSudokuSolution,
  parseSudokuGrid,
  SUDOKU_DIFFICULTY_RULES,
  SUDOKU_PUZZLES,
  sudokuCompletionScore,
  SudokuGame,
  transformSudokuPuzzle,
} from './sudoku.js';

test('all Sudoku definitions contain valid solutions and matching clues', () => {
  Object.values(SUDOKU_PUZZLES).forEach(definition => {
    const puzzle = parseSudokuGrid(definition.puzzle);
    const solution = parseSudokuGrid(definition.solution);
    assert.equal(isValidSudokuSolution(solution), true);
    puzzle.forEach((value, index) => {
      if (value) assert.equal(value, solution[index]);
    });
  });
});

test('Sudoku variants preserve valid solutions and clue positions', () => {
  for (let variant = 0; variant < 12; variant += 1) {
    const transformed = transformSudokuPuzzle(SUDOKU_PUZZLES.medium, variant);
    assert.equal(isValidSudokuSolution(transformed.solution), true);
    transformed.puzzle.forEach((value, index) => {
      if (value) assert.equal(value, transformed.solution[index]);
    });
  }
});

test('given cells cannot be changed', () => {
  const game = new SudokuGame('easy');
  const given = game.puzzle.findIndex(Boolean);
  game.select(given);
  assert.equal(game.input(9).changed, false);
  assert.equal(game.board[given], game.puzzle[given]);
});

test('a hidden-solution mismatch stays neutral when it creates no visible conflict', () => {
  const game = new SudokuGame('easy');
  let empty = -1;
  let candidate = 0;
  for (let index = 0; index < game.board.length && empty < 0; index += 1) {
    if (game.puzzle[index]) continue;
    candidate = Array.from({ length: 9 }, (_, offset) => offset + 1)
      .find(value => value !== game.solution[index] && !game.hasConflict(index, value)) ?? 0;
    if (candidate) empty = index;
  }
  assert.notEqual(empty, -1);
  game.select(empty);
  assert.deepEqual(game.input(candidate), { changed: true, conflict: false, completed: false });
  assert.equal(game.board[empty], candidate);
  assert.equal(game.hasConflict(empty), false);
  assert.equal(game.mistakes, 0);
});

test('only visible row, column, or box conflicts count as mistakes', () => {
  const game = new SudokuGame('easy');
  const empty = game.puzzle.findIndex((value, index) => (
    value === 0 && game.puzzle.some((other, otherIndex) => other > 0 && game.isRelated(index, otherIndex))
  ));
  const relatedGiven = game.puzzle.findIndex((value, index) => value > 0 && game.isRelated(empty, index));
  game.select(empty);
  assert.deepEqual(game.input(game.puzzle[relatedGiven]), { changed: true, conflict: true, completed: false });
  assert.equal(game.hasConflict(empty), true);
  assert.equal(game.hasConflict(relatedGiven), true);
  assert.equal(game.mistakes, 1);
  assert.equal(game.input(0).conflict, false);
  assert.equal(game.hasConflict(empty), false);
  assert.equal(game.hasConflict(relatedGiven), false);
});

test('a hint fills the selected editable cell', () => {
  const game = new SudokuGame('hard');
  const empty = game.puzzle.findIndex(value => value === 0);
  game.select(empty);
  assert.equal(game.hint(), empty);
  assert.equal(game.board[empty], game.solution[empty]);
  assert.equal(game.hints, 1);
});

test('hint limits allow two assists on easy and one on medium or hard', () => {
  const easy = new SudokuGame('easy');
  assert.equal(easy.hintLimit, 2);
  assert.notEqual(easy.hint(), null);
  assert.notEqual(easy.hint(), null);
  assert.equal(easy.hintsRemaining, 0);
  assert.equal(easy.hint(), null);
  assert.equal(easy.hints, 2);

  (['medium', 'hard'] as const).forEach(difficulty => {
    const game = new SudokuGame(difficulty);
    assert.equal(game.hintLimit, 1);
    assert.notEqual(game.hint(), null);
    assert.equal(game.hint(), null);
    assert.equal(game.hints, 1);
  });
});

test('entering the final correct number completes a puzzle', () => {
  const game = new SudokuGame('easy');
  game.board = [...game.solution];
  const editable = game.puzzle.findIndex(value => value === 0);
  game.board[editable] = 0;
  game.select(editable);
  assert.equal(game.input(game.solution[editable]).completed, true);
  assert.equal(game.phase, 'complete');
});

test('selection wraps around the Sudoku board', () => {
  const game = new SudokuGame('easy');
  game.select(0);
  assert.equal(game.moveSelection(-1, 0), 72);
  assert.equal(game.moveSelection(0, -1), 80);
});

test('completion score uses difficulty, time, mistakes, and hints', () => {
  assert.deepEqual(
    Object.fromEntries(Object.entries(SUDOKU_DIFFICULTY_RULES).map(([difficulty, rules]) => [difficulty, rules.hintLimit])),
    { easy: 2, medium: 1, hard: 1 },
  );
  assert.equal(sudokuCompletionScore('easy', 0, 0, 0), 10_000);
  assert.equal(sudokuCompletionScore('medium', 0, 0, 0), 15_000);
  assert.equal(sudokuCompletionScore('hard', 0, 0, 0), 20_000);
  assert.equal(sudokuCompletionScore('easy', 120, 1, 1), 7_640);
  assert.ok(sudokuCompletionScore('medium', 120, 1, 0) > sudokuCompletionScore('medium', 120, 2, 0));
  assert.ok(sudokuCompletionScore('hard', 120, 0, 0) > sudokuCompletionScore('hard', 120, 0, 1));
  assert.equal(sudokuCompletionScore('hard', 10_000, 20, 20), 100);
});
