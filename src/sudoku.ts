import { ArcadeResultReporter } from './stats.js';

export type SudokuDifficulty = 'easy' | 'medium' | 'hard';
export type SudokuPhase = 'playing' | 'complete';

export interface SudokuPuzzleDefinition {
  difficulty: SudokuDifficulty;
  puzzle: string;
  solution: string;
}

export interface SudokuInputResult {
  changed: boolean;
  conflict: boolean;
  completed: boolean;
}

export const SUDOKU_PUZZLES: Record<SudokuDifficulty, SudokuPuzzleDefinition> = {
  easy: {
    difficulty: 'easy',
    puzzle: '530070000600195000098000060800060003400803001700020006060000280000419005000080079',
    solution: '534678912672195348198342567859761423426853791713924856961537284287419635345286179',
  },
  medium: {
    difficulty: 'medium',
    puzzle: '000260701680070090190004500820100040004602900050003028009300074040050036703018000',
    solution: '435269781682571493197834562826195347374682915951743628519326874248957136763418259',
  },
  hard: {
    difficulty: 'hard',
    puzzle: '000000907000420180000705026100904000050000040000507009920108000034059000507000000',
    solution: '462831957795426183381795426173984265659312748248567319926178534834259671517643892',
  },
};

export function parseSudokuGrid(value: string): number[] {
  if (!/^[0-9]{81}$/.test(value)) throw new Error('Sudoku grids must contain exactly 81 digits.');
  return [...value].map(Number);
}

export function isValidSudokuSolution(grid: readonly number[]): boolean {
  if (grid.length !== 81) return false;
  const validGroup = (values: readonly number[]): boolean => (
    values.length === 9 && new Set(values).size === 9 && values.every(value => value >= 1 && value <= 9)
  );
  for (let index = 0; index < 9; index += 1) {
    if (!validGroup(grid.slice(index * 9, index * 9 + 9))) return false;
    if (!validGroup(Array.from({ length: 9 }, (_, row) => grid[row * 9 + index]))) return false;
    const boxRow = Math.floor(index / 3) * 3;
    const boxColumn = index % 3 * 3;
    if (!validGroup(Array.from({ length: 9 }, (_, offset) => (
      grid[(boxRow + Math.floor(offset / 3)) * 9 + boxColumn + offset % 3]
    )))) return false;
  }
  return true;
}

export function transformSudokuPuzzle(
  definition: SudokuPuzzleDefinition,
  variant: number,
): { puzzle: number[]; solution: number[] } {
  const puzzle = parseSudokuGrid(definition.puzzle);
  const solution = parseSudokuGrid(definition.solution);
  const safeVariant = Math.max(0, Math.floor(Number.isFinite(variant) ? variant : 0));
  const mode = safeVariant % 4;
  const digitOffset = safeVariant % 9;
  const mapDigit = (value: number): number => value === 0 ? 0 : (value - 1 + digitOffset) % 9 + 1;
  const sourceIndex = (row: number, column: number): number => {
    if (mode === 1) return column * 9 + row;
    if (mode === 2) return (8 - row) * 9 + 8 - column;
    if (mode === 3) return row * 9 + 8 - column;
    return row * 9 + column;
  };
  return {
    puzzle: Array.from({ length: 81 }, (_, index) => {
      const row = Math.floor(index / 9);
      const column = index % 9;
      return mapDigit(puzzle[sourceIndex(row, column)]);
    }),
    solution: Array.from({ length: 81 }, (_, index) => {
      const row = Math.floor(index / 9);
      const column = index % 9;
      return mapDigit(solution[sourceIndex(row, column)]);
    }),
  };
}

export function sudokuCompletionScore(elapsedSeconds: number, mistakes: number, hints: number): number {
  const timePenalty = Math.max(0, Math.floor(elapsedSeconds)) * 5;
  const mistakePenalty = Math.max(0, Math.floor(mistakes)) * 250;
  const hintPenalty = Math.max(0, Math.floor(hints)) * 500;
  return Math.max(100, 10_000 - timePenalty - mistakePenalty - hintPenalty);
}

export class SudokuGame {
  difficulty: SudokuDifficulty;
  variant: number;
  puzzle: number[] = [];
  solution: number[] = [];
  board: number[] = [];
  selected = 0;
  mistakes = 0;
  hints = 0;
  phase: SudokuPhase = 'playing';

  constructor(difficulty: SudokuDifficulty = 'easy', variant = 0) {
    this.difficulty = difficulty;
    this.variant = variant;
    this.reset(difficulty, variant);
  }

  reset(difficulty: SudokuDifficulty = this.difficulty, variant: number = this.variant): void {
    const transformed = transformSudokuPuzzle(SUDOKU_PUZZLES[difficulty], variant);
    this.difficulty = difficulty;
    this.variant = variant;
    this.puzzle = transformed.puzzle;
    this.solution = transformed.solution;
    this.board = [...this.puzzle];
    this.selected = Math.max(0, this.board.findIndex(value => value === 0));
    this.mistakes = 0;
    this.hints = 0;
    this.phase = 'playing';
  }

  isGiven(index: number): boolean {
    return index >= 0 && index < 81 && this.puzzle[index] !== 0;
  }

  select(index: number): boolean {
    if (!Number.isInteger(index) || index < 0 || index >= 81) return false;
    this.selected = index;
    return true;
  }

  moveSelection(rowDelta: number, columnDelta: number): number {
    const row = Math.floor(this.selected / 9);
    const column = this.selected % 9;
    const nextRow = (row + rowDelta + 9) % 9;
    const nextColumn = (column + columnDelta + 9) % 9;
    this.selected = nextRow * 9 + nextColumn;
    return this.selected;
  }

  hasConflict(index: number, value: number = this.board[index]): boolean {
    if (!Number.isInteger(index) || index < 0 || index >= 81 || !value) return false;
    return this.board.some((cell, otherIndex) => (
      otherIndex !== index && cell === value && this.isRelated(index, otherIndex)
    ));
  }

  input(value: number): SudokuInputResult {
    if (this.phase === 'complete' || this.isGiven(this.selected)
      || !Number.isInteger(value) || value < 0 || value > 9) {
      return { changed: false, conflict: false, completed: this.phase === 'complete' };
    }
    const previous = this.board[this.selected];
    if (previous === value) return { changed: false, conflict: this.hasConflict(this.selected), completed: false };
    this.board[this.selected] = value;
    const conflict = this.hasConflict(this.selected);
    if (conflict) this.mistakes += 1;
    const completed = this.board.every((cell, index) => cell === this.solution[index]);
    if (completed) this.phase = 'complete';
    return { changed: true, conflict, completed };
  }

  hint(): number | null {
    if (this.phase === 'complete') return null;
    let target = this.isGiven(this.selected) || this.board[this.selected] === this.solution[this.selected]
      ? this.board.findIndex((value, index) => value !== this.solution[index])
      : this.selected;
    if (target < 0) return null;
    this.selected = target;
    this.board[target] = this.solution[target];
    this.hints += 1;
    if (this.board.every((cell, index) => cell === this.solution[index])) this.phase = 'complete';
    return target;
  }

  isRelated(first: number, second: number): boolean {
    const firstRow = Math.floor(first / 9);
    const firstColumn = first % 9;
    const secondRow = Math.floor(second / 9);
    const secondColumn = second % 9;
    return firstRow === secondRow || firstColumn === secondColumn
      || Math.floor(firstRow / 3) === Math.floor(secondRow / 3)
        && Math.floor(firstColumn / 3) === Math.floor(secondColumn / 3);
  }
}

function formatSudokuTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export function initSudoku(): void {
  if (typeof document === 'undefined') return;
  const view = document.getElementById('sudokuView');
  const boardElement = document.getElementById('sudokuBoard');
  const timerElement = document.getElementById('sudokuTimer');
  const mistakesElement = document.getElementById('sudokuMistakes');
  const hintsElement = document.getElementById('sudokuHints');
  const statusElement = document.getElementById('sudokuStatus');
  const overlay = document.getElementById('sudokuOverlay');
  const overlayMessage = document.getElementById('sudokuOverlayMessage');
  if (!view || !boardElement) return;
  const activeView = view;
  const activeBoard = boardElement;
  const game = new SudokuGame();
  const reporter = new ArcadeResultReporter('sudoku');
  let variant = 0;
  let elapsedSeconds = 0;
  let status = 'Select a cell and place a number from 1 to 9.';

  function visible(): boolean { return !activeView.classList.contains('view-hidden'); }

  function syncUi(): void {
    const restoreBoardFocus = activeBoard.contains(document.activeElement);
    const selectedValue = game.board[game.selected];
    const cells = game.board.map((value, index) => {
      const cell = document.createElement('button');
      const row = Math.floor(index / 9) + 1;
      const column = index % 9 + 1;
      const classes = ['sudoku-cell'];
      const conflict = game.hasConflict(index);
      if (game.isGiven(index)) classes.push('given');
      else if (value) classes.push('entered');
      if (conflict) classes.push('conflict');
      if (index === game.selected) classes.push('selected');
      else if (game.isRelated(index, game.selected)) classes.push('related');
      if (selectedValue && value === selectedValue) classes.push('same-number');
      if (column % 3 === 0 && column !== 9) classes.push('box-right');
      if (row % 3 === 0 && row !== 9) classes.push('box-bottom');
      cell.type = 'button';
      cell.className = classes.join(' ');
      cell.textContent = value ? String(value) : '';
      cell.dataset.sudokuCell = String(index);
      cell.setAttribute('role', 'gridcell');
      cell.setAttribute('aria-rowindex', String(row));
      cell.setAttribute('aria-colindex', String(column));
      cell.setAttribute('aria-selected', String(index === game.selected));
      cell.setAttribute('aria-invalid', String(conflict));
      cell.tabIndex = index === game.selected ? 0 : -1;
      cell.setAttribute('aria-label', value
        ? `${game.isGiven(index) ? 'Given' : 'Entered'} ${value}, row ${row}, column ${column}`
        : `Empty cell, row ${row}, column ${column}`);
      return cell;
    });
    activeBoard.replaceChildren(...cells);
    if (restoreBoardFocus) activeBoard.querySelector<HTMLElement>('[tabindex="0"]')?.focus();
    if (timerElement) timerElement.textContent = formatSudokuTime(elapsedSeconds);
    if (mistakesElement) mistakesElement.textContent = String(game.mistakes);
    if (hintsElement) hintsElement.textContent = String(game.hints);
    if (statusElement) statusElement.textContent = status;
    document.querySelectorAll<HTMLButtonElement>('[data-sudoku-difficulty]').forEach(button => {
      const active = button.dataset.sudokuDifficulty === game.difficulty;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    const complete = game.phase === 'complete';
    overlay?.toggleAttribute('hidden', !complete);
    if (complete) {
      const score = sudokuCompletionScore(elapsedSeconds, game.mistakes, game.hints);
      if (overlayMessage) overlayMessage.textContent = `Completed in ${formatSudokuTime(elapsedSeconds)} · ${game.mistakes} mistakes · ${score.toLocaleString()} points.`;
      reporter.report(true, { outcome: 'complete', score });
    }
  }

  function enter(value: number): void {
    if (!visible()) return;
    const result = game.input(value);
    if (!result.changed) {
      status = game.isGiven(game.selected) ? 'That number is part of the puzzle.' : status;
    } else if (result.completed) {
      status = 'Puzzle complete!';
    } else if (result.conflict) {
      status = 'That number conflicts with this row, column, or box.';
    } else if (value === 0) {
      status = 'Cell cleared. Choose another number.';
    } else {
      status = 'Great — keep going.';
    }
    syncUi();
  }

  function reset(difficulty: SudokuDifficulty = game.difficulty): void {
    variant += 1;
    game.reset(difficulty, variant);
    elapsedSeconds = 0;
    status = 'Select a cell and place a number from 1 to 9.';
    reporter.report(false);
    syncUi();
  }

  activeBoard.addEventListener('click', event => {
    const cell = event.target instanceof Element
      ? event.target.closest<HTMLElement>('[data-sudoku-cell]')
      : null;
    if (!cell) return;
    game.select(Number(cell.dataset.sudokuCell));
    status = game.isGiven(game.selected) ? 'Given number selected.' : 'Choose a number for this cell.';
    syncUi();
  });
  document.querySelectorAll<HTMLButtonElement>('[data-sudoku-number]').forEach(button => {
    button.addEventListener('click', () => enter(Number(button.dataset.sudokuNumber)));
  });
  document.getElementById('sudokuEraseButton')?.addEventListener('click', () => enter(0));
  document.getElementById('sudokuHintButton')?.addEventListener('click', () => {
    if (game.hint() !== null) status = game.phase === 'complete' ? 'Puzzle complete!' : 'Hint placed — keep going.';
    syncUi();
  });
  document.querySelectorAll<HTMLElement>('[data-sudoku-new]').forEach(button => button.addEventListener('click', () => reset()));
  document.querySelectorAll<HTMLButtonElement>('[data-sudoku-difficulty]').forEach(button => {
    button.addEventListener('click', () => {
      const difficulty = button.dataset.sudokuDifficulty;
      if (difficulty === 'easy' || difficulty === 'medium' || difficulty === 'hard') reset(difficulty);
    });
  });

  window.addEventListener('keydown', event => {
    if (!visible() || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement
      || event.target instanceof HTMLSelectElement) return;
    if (/^[1-9]$/.test(event.key)) { event.preventDefault(); enter(Number(event.key)); return; }
    if (event.key === 'Backspace' || event.key === 'Delete' || event.key === '0') { event.preventDefault(); enter(0); return; }
    const moves: Record<string, readonly [number, number]> = {
      ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1],
    };
    const move = moves[event.key];
    if (move) { event.preventDefault(); game.moveSelection(move[0], move[1]); syncUi(); }
  });

  window.setInterval(() => {
    if (!visible() || game.phase !== 'playing') return;
    elapsedSeconds += 1;
    if (timerElement) timerElement.textContent = formatSudokuTime(elapsedSeconds);
  }, 1_000);
  syncUi();
}
