import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidSudokuSolution,
  parseSudokuGrid,
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

test('wrong entries count mistakes and can be corrected or erased', () => {
  const game = new SudokuGame('easy');
  const empty = game.puzzle.findIndex(value => value === 0);
  game.select(empty);
  const wrong = game.solution[empty] === 1 ? 2 : 1;
  assert.deepEqual(game.input(wrong), { changed: true, correct: false, completed: false });
  assert.equal(game.mistakes, 1);
  assert.equal(game.input(0).correct, true);
  assert.equal(game.input(game.solution[empty]).correct, true);
  assert.equal(game.mistakes, 1);
});

test('a hint fills the selected editable cell', () => {
  const game = new SudokuGame('hard');
  const empty = game.puzzle.findIndex(value => value === 0);
  game.select(empty);
  assert.equal(game.hint(), empty);
  assert.equal(game.board[empty], game.solution[empty]);
  assert.equal(game.hints, 1);
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

test('completion score rewards faster, cleaner runs without hints', () => {
  assert.equal(sudokuCompletionScore(0, 0, 0), 10_000);
  assert.equal(sudokuCompletionScore(120, 1, 1), 8_650);
  assert.equal(sudokuCompletionScore(10_000, 20, 20), 100);
});
