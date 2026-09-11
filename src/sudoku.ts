import { ArcadeResultReporter } from './stats.js';
import { translateArcadeText } from './i18n.js';
import { isArcadeSessionPaused, registerArcadeSession } from './session-control.js';

export type SudokuDifficulty = 'easy' | 'medium' | 'hard';
export type SudokuPhase = 'playing' | 'complete';
export const SUDOKU_SESSION_STORAGE_KEY = 'blast-arcade-sudoku-session-v1';

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

interface SudokuDifficultyRules {
  hintLimit: number;
  baseScore: number;
  timePenalty: number;
  mistakePenalty: number;
  hintPenalty: number;
}

export const SUDOKU_DIFFICULTY_RULES: Record<SudokuDifficulty, SudokuDifficultyRules> = {
  easy: { hintLimit: 2, baseScore: 10_000, timePenalty: 3, mistakePenalty: 500, hintPenalty: 1_500 },
  medium: { hintLimit: 1, baseScore: 15_000, timePenalty: 4, mistakePenalty: 750, hintPenalty: 3_000 },
  hard: { hintLimit: 1, baseScore: 20_000, timePenalty: 5, mistakePenalty: 1_000, hintPenalty: 5_000 },
};

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

export const SUDOKU_PUZZLE_COLLECTION: Record<SudokuDifficulty, readonly SudokuPuzzleDefinition[]> = {
  easy: [
    SUDOKU_PUZZLES.easy,
    {
      difficulty: 'easy',
      puzzle: '003020600900305001001806400008102900700000008006708200002609500800203009005010300',
      solution: '483921657967345821251876493548132976729564138136798245372689514814253769695417382',
    },
    {
      difficulty: 'easy',
      puzzle: '200080300060070084030500209000105408000000000402706000301007040720040060004010003',
      solution: '245981376169273584837564219976125438513498627482736951391657842728349165654812793',
    },
  ],
  medium: [
    SUDOKU_PUZZLES.medium,
    {
      difficulty: 'medium',
      puzzle: '030050040008010500460000012070502080000603000040109030250000098001020600080060020',
      solution: '137256849928314567465897312673542981819673254542189736256731498391428675784965123',
    },
    {
      difficulty: 'medium',
      puzzle: '020810740700003100090002805009040087400208003160030200302700060005600008076051090',
      solution: '523816749784593126691472835239145687457268913168937254342789561915624378876351492',
    },
  ],
  hard: [
    SUDOKU_PUZZLES.hard,
    {
      difficulty: 'hard',
      puzzle: '100920000524010000000000070050008102000000000402700090060000000000030945000071006',
      solution: '176923584524817639893654271957348162638192457412765398265489713781236945349571826',
    },
    {
      difficulty: 'hard',
      puzzle: '043080250600000000000001094900004070000608000010200003820500000000000005034090710',
      solution: '143986257679425381285731694962354178357618942418279563821567439796143825534892716',
    },
  ],
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

export function sudokuCompletionScore(
  difficulty: SudokuDifficulty,
  elapsedSeconds: number,
  mistakes: number,
  hints: number,
): number {
  const rules = SUDOKU_DIFFICULTY_RULES[difficulty];
  const timePenalty = Math.max(0, Math.floor(elapsedSeconds)) * rules.timePenalty;
  const mistakePenalty = Math.max(0, Math.floor(mistakes)) * rules.mistakePenalty;
  const hintPenalty = Math.max(0, Math.floor(hints)) * rules.hintPenalty;
  return Math.max(100, rules.baseScore - timePenalty - mistakePenalty - hintPenalty);
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
    const collection = SUDOKU_PUZZLE_COLLECTION[difficulty];
    const safeVariant = Math.max(0, Math.floor(Number.isFinite(variant) ? variant : 0));
    const definition = collection[safeVariant % collection.length];
    const transformed = transformSudokuPuzzle(definition, Math.floor(safeVariant / collection.length));
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

  get hintLimit(): number {
    return SUDOKU_DIFFICULTY_RULES[this.difficulty].hintLimit;
  }

  get hintsRemaining(): number {
    return Math.max(0, this.hintLimit - this.hints);
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
    if (this.phase === 'complete' || this.hintsRemaining === 0) return null;
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

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface SudokuSession {
  version: 1;
  difficulty: SudokuDifficulty;
  variant: number;
  board: number[];
  selected: number;
  mistakes: number;
  hints: number;
  elapsedSeconds: number;
  notes: Array<readonly [number, number[]]>;
  relaxed: boolean;
}

export function shouldConfirmSudokuReset(game: Pick<SudokuGame, 'board' | 'puzzle' | 'phase' | 'mistakes' | 'hints'>, noteCount = 0): boolean {
  if (game.phase !== 'playing') return false;
  return game.mistakes > 0 || game.hints > 0 || noteCount > 0
    || game.board.some((value, index) => game.puzzle[index] === 0 && value !== 0);
}

function nonNegativeInteger(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export function normalizeSudokuSession(value: unknown): SudokuSession | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<SudokuSession>;
  if (candidate.difficulty !== 'easy' && candidate.difficulty !== 'medium' && candidate.difficulty !== 'hard') return null;
  const variant = nonNegativeInteger(candidate.variant);
  const reference = new SudokuGame(candidate.difficulty, variant);
  if (!Array.isArray(candidate.board) || candidate.board.length !== 81
    || !candidate.board.every(cell => Number.isInteger(cell) && cell >= 0 && cell <= 9)) return null;
  if (candidate.board.some((cell, index) => reference.isGiven(index) && cell !== reference.puzzle[index])) return null;
  const notes = Array.isArray(candidate.notes) ? candidate.notes.flatMap(entry => {
    if (!Array.isArray(entry) || entry.length !== 2) return [];
    const index = Number(entry[0]);
    const values = Array.isArray(entry[1])
      ? [...new Set(entry[1].filter(note => Number.isInteger(note) && note >= 1 && note <= 9).map(Number))]
      : [];
    return Number.isInteger(index) && index >= 0 && index < 81 && !reference.isGiven(index) && candidate.board![index] === 0 && values.length
      ? [[index, values] as const]
      : [];
  }) : [];
  return {
    version: 1,
    difficulty: candidate.difficulty,
    variant,
    board: [...candidate.board],
    selected: Math.min(80, nonNegativeInteger(candidate.selected)),
    mistakes: nonNegativeInteger(candidate.mistakes),
    hints: Math.min(reference.hintLimit, nonNegativeInteger(candidate.hints)),
    elapsedSeconds: nonNegativeInteger(candidate.elapsedSeconds),
    notes,
    relaxed: candidate.relaxed === true,
  };
}

export function loadSudokuSession(storage?: StorageLike): SudokuSession | null {
  try {
    const value = storage?.getItem(SUDOKU_SESSION_STORAGE_KEY);
    return value ? normalizeSudokuSession(JSON.parse(value)) : null;
  } catch {
    return null;
  }
}

export function saveSudokuSession(session: SudokuSession | null, storage?: StorageLike): SudokuSession | null {
  const normalized = session ? normalizeSudokuSession(session) : null;
  try { storage?.setItem(SUDOKU_SESSION_STORAGE_KEY, normalized ? JSON.stringify(normalized) : ''); }
  catch { /* The current puzzle remains playable when storage is unavailable. */ }
  return normalized;
}

function browserStorage(): StorageLike | undefined {
  try { return typeof localStorage === 'undefined' ? undefined : localStorage; }
  catch { return undefined; }
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
  const scoreElement = document.getElementById('sudokuScore');
  const statusElement = document.getElementById('sudokuStatus');
  const resumeBanner = document.getElementById('sudokuResumeBanner');
  const resumeSessionButton = document.getElementById('sudokuResumeSession') as HTMLButtonElement | null;
  const relaxedButton = document.getElementById('sudokuRelaxedButton') as HTMLButtonElement | null;
  const overlay = document.getElementById('sudokuOverlay');
  const overlayMessage = document.getElementById('sudokuOverlayMessage');
  const hintButton = document.getElementById('sudokuHintButton') as HTMLButtonElement | null;
  const notesButton = document.getElementById('sudokuNotesButton') as HTMLButtonElement | null;
  if (!view || !boardElement) return;
  const activeView = view;
  const activeBoard = boardElement;
  const storage = browserStorage();
  const restoredSession = loadSudokuSession(storage);
  const game = new SudokuGame(restoredSession?.difficulty ?? 'easy', restoredSession?.variant ?? 0);
  if (restoredSession) {
    game.board = [...restoredSession.board];
    game.selected = restoredSession.selected;
    game.mistakes = restoredSession.mistakes;
    game.hints = restoredSession.hints;
  }
  const reporter = new ArcadeResultReporter('sudoku');
  let variant = restoredSession?.variant ?? 0;
  let elapsedSeconds = restoredSession?.elapsedSeconds ?? 0;
  let notesMode = false;
  const notes = new Map<number, Set<number>>(restoredSession?.notes.map(([index, values]) => [index, new Set(values)]) ?? []);
  let relaxed = restoredSession?.relaxed ?? false;
  let awaitingSavedResume = Boolean(restoredSession);
  let status = restoredSession ? 'Saved puzzle restored. Continue when you are ready.' : 'Select a cell and place a number from 1 to 9.';

  function visible(): boolean { return !activeView.classList.contains('view-hidden'); }

  function currentScore(): number {
    return sudokuCompletionScore(game.difficulty, elapsedSeconds, game.mistakes, game.hints);
  }

  function currentSession(): SudokuSession {
    return {
      version: 1,
      difficulty: game.difficulty,
      variant,
      board: [...game.board],
      selected: game.selected,
      mistakes: game.mistakes,
      hints: game.hints,
      elapsedSeconds,
      notes: [...notes].map(([index, values]) => [index, [...values].sort()] as const),
      relaxed,
    };
  }

  function saveProgress(): void {
    saveSudokuSession(game.phase === 'playing' ? currentSession() : null, storage);
  }

  function syncProgress(): void {
    if (timerElement) timerElement.textContent = formatSudokuTime(elapsedSeconds);
    if (mistakesElement) mistakesElement.textContent = String(game.mistakes);
    if (hintsElement) hintsElement.textContent = String(game.hintsRemaining);
    if (scoreElement) scoreElement.textContent = currentScore().toLocaleString();
  }

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
      const cellNotes = notes.get(index);
      if (!value && cellNotes?.size) {
        cell.classList.add('has-notes');
        const noteGrid = document.createElement('span');
        noteGrid.className = 'sudoku-notes';
        noteGrid.setAttribute('aria-hidden', 'true');
        for (let note = 1; note <= 9; note += 1) {
          const noteCell = document.createElement('span');
          noteCell.textContent = cellNotes.has(note) ? String(note) : '';
          noteGrid.append(noteCell);
        }
        cell.append(noteGrid);
      } else {
        cell.textContent = value ? String(value) : '';
      }
      cell.dataset.sudokuCell = String(index);
      cell.setAttribute('role', 'gridcell');
      cell.setAttribute('aria-rowindex', String(row));
      cell.setAttribute('aria-colindex', String(column));
      cell.setAttribute('aria-selected', String(index === game.selected));
      cell.setAttribute('aria-invalid', String(conflict));
      cell.tabIndex = index === game.selected ? 0 : -1;
      const notesLabel = cellNotes?.size ? `, notes ${[...cellNotes].sort().join(', ')}` : '';
      cell.setAttribute('aria-label', value
        ? `${game.isGiven(index) ? 'Given' : 'Entered'} ${value}, row ${row}, column ${column}`
        : `Empty cell, row ${row}, column ${column}${notesLabel}`);
      return cell;
    });
    activeBoard.replaceChildren(...cells);
    if (restoreBoardFocus) activeBoard.querySelector<HTMLElement>('[tabindex="0"]')?.focus();
    syncProgress();
    if (statusElement) statusElement.textContent = status;
    activeView.classList.toggle('sudoku-relaxed', relaxed);
    if (resumeBanner) resumeBanner.hidden = !awaitingSavedResume;
    if (relaxedButton) {
      relaxedButton.classList.toggle('active', relaxed);
      relaxedButton.setAttribute('aria-pressed', String(relaxed));
      relaxedButton.textContent = relaxed ? 'Focused view' : 'Relaxed view';
    }
    document.querySelectorAll<HTMLButtonElement>('[data-sudoku-difficulty]').forEach(button => {
      const active = button.dataset.sudokuDifficulty === game.difficulty;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    const complete = game.phase === 'complete';
    overlay?.toggleAttribute('hidden', !complete);
    if (hintButton) {
      hintButton.disabled = complete || game.hintsRemaining === 0;
      hintButton.setAttribute('aria-label', game.hintsRemaining > 0
        ? `Hint, ${game.hintsRemaining} remaining`
        : 'No hints remaining');
    }
    if (notesButton) {
      notesButton.classList.toggle('active', notesMode);
      notesButton.setAttribute('aria-pressed', String(notesMode));
      notesButton.setAttribute('aria-label', notesMode ? 'Notes mode on' : 'Notes mode off');
    }
    if (complete) {
      const score = currentScore();
      const mistakeLabel = game.mistakes === 1 ? 'mistake' : 'mistakes';
      const hintLabel = game.hints === 1 ? 'hint' : 'hints';
      if (overlayMessage) overlayMessage.textContent = `Completed in ${formatSudokuTime(elapsedSeconds)} · ${game.mistakes} ${mistakeLabel} · ${game.hints} ${hintLabel} · ${score.toLocaleString()} points.`;
      reporter.report(true, { outcome: 'complete', score });
    }
  }

  function enter(value: number): void {
    if (!visible() || awaitingSavedResume || isArcadeSessionPaused('sudoku')) return;
    if (notesMode && value > 0) {
      if (game.phase === 'complete' || game.isGiven(game.selected)) {
        status = game.isGiven(game.selected) ? 'That number is part of the puzzle.' : status;
      } else if (game.board[game.selected]) {
        status = 'Clear the cell before adding notes.';
      } else {
        const cellNotes = notes.get(game.selected) ?? new Set<number>();
        if (cellNotes.has(value)) cellNotes.delete(value); else cellNotes.add(value);
        if (cellNotes.size) notes.set(game.selected, cellNotes); else notes.delete(game.selected);
        status = cellNotes.has(value) ? `Note ${value} added.` : `Note ${value} removed.`;
      }
      syncUi();
      saveProgress();
      return;
    }
    const result = game.input(value);
    if (result.changed) {
      notes.delete(game.selected);
      if (value > 0) {
        notes.forEach((cellNotes, index) => {
          if (!game.isRelated(game.selected, index)) return;
          cellNotes.delete(value);
          if (cellNotes.size === 0) notes.delete(index);
        });
      }
    }
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
    notesMode = false;
    notes.clear();
    awaitingSavedResume = false;
    status = 'Select a cell and place a number from 1 to 9.';
    reporter.report(false);
    saveProgress();
    syncUi();
    saveProgress();
  }

  function requestReset(difficulty: SudokuDifficulty = game.difficulty): void {
    if (shouldConfirmSudokuReset(game, notes.size)
      && !window.confirm(translateArcadeText('Start a new Sudoku puzzle? Your current entries, notes, and score will be lost.'))) return;
    reset(difficulty);
  }

  activeBoard.addEventListener('click', event => {
    if (awaitingSavedResume || isArcadeSessionPaused('sudoku')) return;
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
  notesButton?.addEventListener('click', () => {
    if (awaitingSavedResume || isArcadeSessionPaused('sudoku')) return;
    notesMode = !notesMode;
    status = notesMode ? 'Notes mode on — add possible numbers.' : 'Notes mode off — enter final numbers.';
    syncUi();
    saveProgress();
  });
  hintButton?.addEventListener('click', () => {
    if (awaitingSavedResume || isArcadeSessionPaused('sudoku')) return;
    const target = game.hint();
    if (target !== null) {
      notes.delete(target);
      status = game.phase === 'complete' ? 'Puzzle complete!' : 'Hint placed — keep going.';
    }
    else if (game.phase !== 'complete') status = 'No hints remaining for this puzzle.';
    syncUi();
    saveProgress();
  });
  resumeSessionButton?.addEventListener('click', () => {
    awaitingSavedResume = false;
    status = 'Saved puzzle continued. Only visible row, column, and box conflicts are flagged.';
    syncUi();
    activeBoard.querySelector<HTMLElement>('[tabindex="0"]')?.focus();
  });
  relaxedButton?.addEventListener('click', () => {
    relaxed = !relaxed;
    status = relaxed ? 'Relaxed view hides time and score pressure.' : 'Score view restored.';
    saveProgress();
    syncUi();
  });
  document.querySelectorAll<HTMLElement>('[data-sudoku-new]').forEach(button => button.addEventListener('click', () => requestReset()));
  document.querySelectorAll<HTMLButtonElement>('[data-sudoku-difficulty]').forEach(button => {
    button.addEventListener('click', () => {
      const difficulty = button.dataset.sudokuDifficulty;
      if (difficulty === 'easy' || difficulty === 'medium' || difficulty === 'hard') requestReset(difficulty);
    });
  });

  window.addEventListener('keydown', event => {
    if (!visible() || awaitingSavedResume || isArcadeSessionPaused('sudoku') || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement
      || event.target instanceof HTMLSelectElement) return;
    if (/^[1-9]$/.test(event.key)) { event.preventDefault(); enter(Number(event.key)); return; }
    if (event.key.toLowerCase() === 'n') {
      event.preventDefault();
      notesMode = !notesMode;
      status = notesMode ? 'Notes mode on — add possible numbers.' : 'Notes mode off — enter final numbers.';
      syncUi();
      return;
    }
    if (event.key === 'Backspace' || event.key === 'Delete' || event.key === '0') { event.preventDefault(); enter(0); return; }
    const moves: Record<string, readonly [number, number]> = {
      ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1],
    };
    const move = moves[event.key];
    if (move) { event.preventDefault(); game.moveSelection(move[0], move[1]); syncUi(); }
  });

  window.setInterval(() => {
    if (!visible() || game.phase !== 'playing' || awaitingSavedResume || isArcadeSessionPaused('sudoku')) return;
    elapsedSeconds += 1;
    if (elapsedSeconds % 5 === 0) saveProgress();
    syncProgress();
  }, 1_000);
  registerArcadeSession({
    gameId: 'sudoku',
    view: activeView,
    mode: () => 'solo',
    isActive: () => game.phase === 'playing' && !awaitingSavedResume,
    clearHeldInputs: () => undefined,
    resumeCountdown: false,
  });
  syncUi();
}
