import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidSudokuSolution,
  parseSudokuGrid,
  SUDOKU_DIFFICULTY_RULES,
  SUDOKU_PUZZLE_COLLECTION,
  SUDOKU_PUZZLES,
  deleteSudokuTable,
  emptySudokuSaves,
  freeSudokuSlot,
  loadSudokuSaves,
  loadSudokuSession,
  normalizeSudokuSaves,
  normalizeSudokuSession,
  saveSudokuSession,
  saveSudokuTable,
  SUDOKU_SAVE_SLOTS,
  type SudokuSession,
  sudokuCompletionScore,
  shouldConfirmSudokuReset,
  SudokuGame,
  transformSudokuPuzzle,
} from './sudoku.js';

test('all Sudoku definitions contain valid solutions and matching clues', () => {
  Object.values(SUDOKU_PUZZLE_COLLECTION).flat().forEach(definition => {
    const puzzle = parseSudokuGrid(definition.puzzle);
    const solution = parseSudokuGrid(definition.solution);
    assert.equal(isValidSudokuSolution(solution), true);
    puzzle.forEach((value, index) => {
      if (value) assert.equal(value, solution[index]);
    });
  });
});

test('Sudoku collection contains distinct validated boards at every difficulty', () => {
  (['easy', 'medium', 'hard'] as const).forEach(difficulty => {
    const definitions = SUDOKU_PUZZLE_COLLECTION[difficulty];
    assert.ok(definitions.length >= 3);
    assert.equal(new Set(definitions.map(definition => definition.puzzle)).size, definitions.length);
  });
});

test('unfinished Sudoku sessions persist entries, notes, difficulty, and elapsed time', () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string): string | null => values.get(key) ?? null, setItem: (key: string, value: string): void => { values.set(key, value); } };
  const game = new SudokuGame('medium', 2);
  const editable = game.puzzle.findIndex(value => value === 0);
  game.select(editable);
  game.input(game.solution[editable]);
  const another = game.puzzle.findIndex((value, index) => value === 0 && index !== editable);
  const session = {
    version: 1 as const,
    difficulty: game.difficulty,
    variant: game.variant,
    board: [...game.board],
    selected: another,
    mistakes: game.mistakes,
    hints: game.hints,
    elapsedSeconds: 93,
    notes: [[another, [2, 7]]] as Array<readonly [number, number[]]>,
    relaxed: true,
  };
  saveSudokuSession(session, storage);
  assert.deepEqual(loadSudokuSession(storage), session);
});

test('Sudoku protects entered values, notes, mistakes, and used hints from accidental reset', () => {
  const game = new SudokuGame('easy');
  assert.equal(shouldConfirmSudokuReset(game), false);
  assert.equal(shouldConfirmSudokuReset(game, 1), true);
  const editable = game.puzzle.findIndex(value => value === 0);
  game.select(editable);
  game.input(game.solution[editable]);
  assert.equal(shouldConfirmSudokuReset(game), true);
  game.phase = 'complete';
  assert.equal(shouldConfirmSudokuReset(game), false);
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

test('Sudoku save slots keep 3 easy, 2 medium, and 1 hard table', () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string): string | null => values.get(key) ?? null, setItem: (key: string, value: string): void => { values.set(key, value); } };
  const table = (difficulty: 'easy' | 'medium' | 'hard', variant: number): SudokuSession => {
    const game = new SudokuGame(difficulty, variant);
    const editable = game.puzzle.findIndex(value => value === 0);
    game.select(editable);
    game.input(game.solution[editable]);
    return { version: 1, difficulty, variant, board: game.board, selected: editable, mistakes: 1, hints: 0, elapsedSeconds: 42, notes: [], relaxed: false };
  };
  assert.deepEqual(SUDOKU_SAVE_SLOTS, { easy: 3, medium: 2, hard: 1 });

  let saves = loadSudokuSaves(storage);
  for (let slot = 0; slot < 3; slot += 1) {
    assert.equal(freeSudokuSlot(saves, 'easy'), slot);
    saves = saveSudokuTable(saves, table('easy', slot), slot, 1_000 + slot, storage)!;
  }
  assert.equal(freeSudokuSlot(saves, 'easy'), null, 'a full difficulty asks the player to pick a slot');
  assert.equal(saveSudokuTable(saves, table('easy', 9), 3, 0, storage), null, 'there is no fourth easy slot');
  assert.equal(saveSudokuTable(saves, table('hard', 0), 1, 0, storage), null, 'there is no second hard slot');

  saves = saveSudokuTable(saves, table('easy', 7), 1, 5_000, storage)!;
  saves = saveSudokuTable(saves, table('hard', 4), 0, 6_000, storage)!;
  const reloaded = loadSudokuSaves(storage);
  assert.deepEqual(reloaded.easy.map(saved => saved?.variant), [0, 7, 2]);
  assert.equal(reloaded.easy[1]?.savedAt, 5_000);
  assert.equal(reloaded.easy[1]?.elapsedSeconds, 42);
  assert.equal(reloaded.easy[1]?.mistakes, 1);
  assert.deepEqual(reloaded.easy[1]?.board, table('easy', 7).board);
  assert.deepEqual(reloaded.medium, [null, null]);
  assert.equal(reloaded.hard[0]?.variant, 4);

  const afterDelete = deleteSudokuTable(reloaded, 'easy', 0, storage);
  assert.equal(freeSudokuSlot(afterDelete, 'easy'), 0);
  assert.equal(loadSudokuSaves(storage).easy[0], null);
});

test('Sudoku saves ignore damaged or misfiled tables and survive blocked storage', () => {
  const medium = new SudokuGame('medium', 0);
  const misfiled = { version: 1, difficulty: 'medium', variant: 0, board: medium.board, selected: 0, mistakes: 0, hints: 0, elapsedSeconds: 0, notes: [], relaxed: false };
  const saves = normalizeSudokuSaves({ easy: [misfiled, { board: 'broken' }, null, misfiled], hard: 'nope' });
  assert.deepEqual(saves, emptySudokuSaves());
  assert.deepEqual(loadSudokuSaves({ getItem: () => '{not json', setItem: () => undefined }), emptySudokuSaves());
  const blocked = { getItem: (): string | null => null, setItem: (): void => { throw new Error('quota'); } };
  assert.equal(saveSudokuTable(emptySudokuSaves(), misfiled as SudokuSession, 0, 0, blocked), null);
});

test('the current Sudoku session remembers which save slot it came from', () => {
  const game = new SudokuGame('medium', 0);
  const base = { version: 1 as const, difficulty: 'medium' as const, variant: 0, board: game.board, selected: 0, mistakes: 0, hints: 0, elapsedSeconds: 0, notes: [], relaxed: false };
  assert.equal(normalizeSudokuSession({ ...base, savedSlot: 1 })?.savedSlot, 1);
  assert.equal(normalizeSudokuSession({ ...base, savedSlot: 2 })?.savedSlot, undefined, 'medium only has two slots');
  assert.equal(normalizeSudokuSession(base)?.savedSlot, undefined);
});
