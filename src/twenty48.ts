import { ArcadeResultReporter } from './stats.js';
import { capturePointer } from './touch-controls.js';
import { translateArcadeText } from './i18n.js';
import { clearArcadePause, isArcadeSessionPaused, registerArcadeSession } from './session-control.js';

export const TWENTY48_SIZE = 4;
export const TWENTY48_BEST_STORAGE_KEY = 'blast-arcade-2048-best-v1';
export const TWENTY48_SESSION_STORAGE_KEY = 'blast-arcade-2048-session-v1';
export const TWENTY48_BASE_STORAGE_KEY = 'blast-arcade-2048-base-v1';
/** Tile values are powers of the chosen prime; two equal tiles merge into the next power. */
export const TWENTY48_BASES = [2, 3, 5, 7] as const;
/** The goal is the 11th power in every base (2^11 = 2048), so each mode is exactly as hard as the classic. */
export const TWENTY48_GOAL_LEVEL = 11;

export type Twenty48Base = typeof TWENTY48_BASES[number];
export type Twenty48Direction = 'left' | 'right' | 'up' | 'down';
export type Twenty48Phase = 'playing' | 'won' | 'over';

export interface Twenty48Move {
  board: number[];
  moved: boolean;
  gained: number;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function isTwenty48Base(value: unknown): value is Twenty48Base {
  return TWENTY48_BASES.includes(value as Twenty48Base);
}

export function twenty48Goal(base: Twenty48Base = 2): number {
  return base ** TWENTY48_GOAL_LEVEL;
}

/** Which power of the base a tile is (2 -> 1, 4 -> 2 in base 2; 3 -> 1, 9 -> 2 in base 3), or 0 when it is not one. */
export function twenty48TileLevel(value: number, base: Twenty48Base = 2): number {
  if (!Number.isSafeInteger(value) || value < base) return 0;
  let level = 0;
  let remaining = value;
  while (remaining % base === 0) { remaining /= base; level += 1; }
  return remaining === 1 ? level : 0;
}

/** Tile text: full digits up to five, then a short 177K / 1.5M / 48M style so it fits a phone tile. */
export function formatTwenty48Tile(value: number): string {
  if (value < 100_000) return String(value);
  const [divisor, suffix] = value >= 1e12 ? [1e12, 'T'] : value >= 1e9 ? [1e9, 'B'] : value >= 1e6 ? [1e6, 'M'] : [1e3, 'K'];
  const scaled = value / divisor;
  // Round down, so a tile never claims more than it holds (1.97B reads 1.9B, not 2B).
  return `${scaled < 10 ? Math.floor(scaled * 10) / 10 : Math.floor(scaled)}${suffix}`;
}

function safeRandom(random: () => number): number {
  const value = random();
  return Number.isFinite(value) ? Math.min(0.999999, Math.max(0, value)) : 0;
}

export function addTwenty48Tile(board: readonly number[], random: () => number = Math.random, base: Twenty48Base = 2): number[] {
  const next = [...board];
  const empty = next.flatMap((value, index) => value === 0 ? [index] : []);
  if (!empty.length) return next;
  const index = empty[Math.floor(safeRandom(random) * empty.length)];
  next[index] = safeRandom(random) < 0.9 ? base : base * base;
  return next;
}

export function createTwenty48Board(random: () => number = Math.random, base: Twenty48Base = 2): number[] {
  const empty = Array<number>(TWENTY48_SIZE * TWENTY48_SIZE).fill(0);
  return addTwenty48Tile(addTwenty48Tile(empty, random, base), random, base);
}

/** Points match classic 2048 in every base: making the level-n tile scores 2^n, so best scores stay comparable. */
export function mergeTwenty48Line(line: readonly number[], base: Twenty48Base = 2): { line: number[]; gained: number } {
  const compact = line.filter(value => value > 0);
  const merged: number[] = [];
  let gained = 0;
  for (let index = 0; index < compact.length; index += 1) {
    if (compact[index] === compact[index + 1]) {
      const value = compact[index] * base;
      merged.push(value);
      gained += 2 ** twenty48TileLevel(value, base);
      index += 1;
    } else {
      merged.push(compact[index]);
    }
  }
  while (merged.length < TWENTY48_SIZE) merged.push(0);
  return { line: merged, gained };
}

function linesForDirection(board: readonly number[], direction: Twenty48Direction): number[][] {
  const vertical = direction === 'up' || direction === 'down';
  const reverse = direction === 'right' || direction === 'down';
  return Array.from({ length: TWENTY48_SIZE }, (_, outer) => {
    const line = Array.from({ length: TWENTY48_SIZE }, (_, inner) => (
      vertical ? board[inner * TWENTY48_SIZE + outer] : board[outer * TWENTY48_SIZE + inner]
    ));
    return reverse ? line.reverse() : line;
  });
}

function boardFromLines(lines: readonly number[][], direction: Twenty48Direction): number[] {
  const vertical = direction === 'up' || direction === 'down';
  const reverse = direction === 'right' || direction === 'down';
  const board = Array<number>(TWENTY48_SIZE * TWENTY48_SIZE).fill(0);
  lines.forEach((source, outer) => {
    const line = reverse ? [...source].reverse() : source;
    line.forEach((value, inner) => {
      const index = vertical ? inner * TWENTY48_SIZE + outer : outer * TWENTY48_SIZE + inner;
      board[index] = value;
    });
  });
  return board;
}

export function moveTwenty48(board: readonly number[], direction: Twenty48Direction, base: Twenty48Base = 2): Twenty48Move {
  if (board.length !== TWENTY48_SIZE * TWENTY48_SIZE) throw new Error('2048 board must contain 16 cells.');
  let gained = 0;
  const mergedLines = linesForDirection(board, direction).map(line => {
    const merged = mergeTwenty48Line(line, base);
    gained += merged.gained;
    return merged.line;
  });
  const next = boardFromLines(mergedLines, direction);
  const moved = next.some((value, index) => value !== board[index]);
  return { board: next, moved, gained };
}

export function canMoveTwenty48(board: readonly number[]): boolean {
  if (board.some(value => value === 0)) return true;
  for (let row = 0; row < TWENTY48_SIZE; row += 1) {
    for (let column = 0; column < TWENTY48_SIZE; column += 1) {
      const index = row * TWENTY48_SIZE + column;
      if (column + 1 < TWENTY48_SIZE && board[index] === board[index + 1]) return true;
      if (row + 1 < TWENTY48_SIZE && board[index] === board[index + TWENTY48_SIZE]) return true;
    }
  }
  return false;
}

export function hasWonTwenty48(board: readonly number[], base: Twenty48Base = 2): boolean {
  const goal = twenty48Goal(base);
  return board.some(value => value >= goal);
}

export interface Twenty48Session {
  version: 1;
  /** Missing in saves from before the prime bases existed; those are base 2. */
  base?: Twenty48Base;
  board: number[];
  score: number;
  phase: Twenty48Phase;
  movesMade: number;
  elapsedMs: number;
  victoryAcknowledged: boolean;
}

interface Twenty48UndoState {
  board: number[];
  score: number;
  phase: Twenty48Phase;
  victoryAcknowledged: boolean;
}

function nonNegativeInteger(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function validTwenty48Cell(value: unknown, base: Twenty48Base): value is number {
  return value === 0 || (typeof value === 'number' && twenty48TileLevel(value, base) > 0);
}

export function normalizeTwenty48Session(value: unknown): Twenty48Session | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<Twenty48Session>;
  const base = candidate.base === undefined ? 2 : candidate.base;
  if (!isTwenty48Base(base)) return null;
  if (!Array.isArray(candidate.board) || candidate.board.length !== 16
    || !candidate.board.every(cell => validTwenty48Cell(cell, base))) return null;
  if (candidate.phase !== 'playing' && candidate.phase !== 'won') return null;
  return {
    version: 1,
    base,
    board: [...candidate.board],
    score: nonNegativeInteger(candidate.score),
    phase: candidate.phase,
    movesMade: nonNegativeInteger(candidate.movesMade),
    elapsedMs: nonNegativeInteger(candidate.elapsedMs),
    victoryAcknowledged: candidate.victoryAcknowledged === true,
  };
}

export function shouldConfirmTwenty48Reset(phase: Twenty48Phase, movesMade: number): boolean {
  return phase === 'playing' && movesMade > 0;
}

export class Twenty48Game {
  board: number[];
  score = 0;
  phase: Twenty48Phase = 'playing';
  movesMade = 0;
  elapsedMs = 0;
  base: Twenty48Base;
  private victoryAcknowledged = false;
  private undoState: Twenty48UndoState | null = null;
  private random: () => number;

  constructor(random: () => number = Math.random, base: Twenty48Base = 2) {
    this.random = random;
    this.base = base;
    this.board = createTwenty48Board(random, base);
  }

  get goal(): number { return twenty48Goal(this.base); }

  reset(random: () => number = this.random, base: Twenty48Base = this.base): void {
    this.random = random;
    this.base = base;
    this.board = createTwenty48Board(random, base);
    this.score = 0;
    this.phase = 'playing';
    this.movesMade = 0;
    this.elapsedMs = 0;
    this.victoryAcknowledged = false;
    this.undoState = null;
  }

  move(direction: Twenty48Direction): Twenty48Move {
    if (this.phase !== 'playing') return { board: [...this.board], moved: false, gained: 0 };
    const move = moveTwenty48(this.board, direction, this.base);
    if (move.moved) {
      this.undoState = {
        board: [...this.board],
        score: this.score,
        phase: this.phase,
        victoryAcknowledged: this.victoryAcknowledged,
      };
      this.board = addTwenty48Tile(move.board, this.random, this.base);
      this.score += move.gained;
      this.movesMade += 1;
    }
    if (!this.victoryAcknowledged && hasWonTwenty48(this.board, this.base)) this.phase = 'won';
    else if (!canMoveTwenty48(this.board)) this.phase = 'over';
    return { ...move, board: [...this.board] };
  }

  continueAfterWin(): void {
    if (this.phase !== 'won') return;
    this.victoryAcknowledged = true;
    this.phase = canMoveTwenty48(this.board) ? 'playing' : 'over';
  }

  canUndo(): boolean {
    return this.undoState !== null && this.phase !== 'over';
  }

  undo(): boolean {
    if (!this.undoState || this.phase === 'over') return false;
    this.board = [...this.undoState.board];
    this.score = this.undoState.score;
    this.phase = this.undoState.phase;
    this.victoryAcknowledged = this.undoState.victoryAcknowledged;
    this.movesMade = Math.max(0, this.movesMade - 1);
    this.undoState = null;
    return true;
  }

  session(): Twenty48Session {
    return {
      version: 1,
      base: this.base,
      board: [...this.board],
      score: this.score,
      phase: this.phase,
      movesMade: this.movesMade,
      elapsedMs: this.elapsedMs,
      victoryAcknowledged: this.victoryAcknowledged,
    };
  }

  restore(value: Twenty48Session): void {
    const session = normalizeTwenty48Session(value);
    if (!session) return;
    this.base = session.base ?? 2;
    this.board = [...session.board];
    this.score = session.score;
    this.phase = session.phase;
    this.movesMade = session.movesMade;
    this.elapsedMs = session.elapsedMs;
    this.victoryAcknowledged = session.victoryAcknowledged;
    this.undoState = null;
  }
}

/** Each base keeps its own best; base 2 keeps the original key so existing records survive. */
export function twenty48BestKey(base: Twenty48Base = 2): string {
  return base === 2 ? TWENTY48_BEST_STORAGE_KEY : `${TWENTY48_BEST_STORAGE_KEY}-base${base}`;
}

export function loadTwenty48Best(storage?: StorageLike, base: Twenty48Base = 2): number {
  try {
    const value = storage?.getItem(twenty48BestKey(base));
    const score = value ? Number(value) : 0;
    return Number.isFinite(score) ? Math.max(0, Math.floor(score)) : 0;
  } catch {
    return 0;
  }
}

export function saveTwenty48Best(score: number, storage?: StorageLike, base: Twenty48Base = 2): number {
  const best = Math.max(0, Math.floor(Number.isFinite(score) ? score : 0));
  try { storage?.setItem(twenty48BestKey(base), String(best)); }
  catch { /* Best score is optional when browser storage is unavailable. */ }
  return best;
}

export function loadTwenty48Session(storage?: StorageLike): Twenty48Session | null {
  try {
    const value = storage?.getItem(TWENTY48_SESSION_STORAGE_KEY);
    return value ? normalizeTwenty48Session(JSON.parse(value)) : null;
  } catch {
    return null;
  }
}

export function saveTwenty48Session(session: Twenty48Session, storage?: StorageLike): Twenty48Session | null {
  const normalized = normalizeTwenty48Session(session);
  try { storage?.setItem(TWENTY48_SESSION_STORAGE_KEY, normalized ? JSON.stringify(normalized) : ''); }
  catch { /* The current run remains playable when storage is unavailable. */ }
  return normalized;
}

export function loadTwenty48Base(storage?: StorageLike): Twenty48Base {
  try {
    const value = Number(storage?.getItem(TWENTY48_BASE_STORAGE_KEY));
    return isTwenty48Base(value) ? value : 2;
  } catch {
    return 2;
  }
}

export function saveTwenty48Base(base: Twenty48Base, storage?: StorageLike): void {
  try { storage?.setItem(TWENTY48_BASE_STORAGE_KEY, String(base)); }
  catch { /* The chosen base is a convenience; the game still starts in base 2. */ }
}

function browserStorage(): StorageLike | undefined {
  try { return typeof localStorage === 'undefined' ? undefined : localStorage; }
  catch { return undefined; }
}

export function initTwenty48(): void {
  if (typeof document === 'undefined') return;
  const view = document.getElementById('twenty48View');
  const boardElement = document.getElementById('twenty48Board');
  const scoreElement = document.getElementById('twenty48Score');
  const bestElement = document.getElementById('twenty48Best');
  const timeElement = document.getElementById('twenty48Time');
  const statusElement = document.getElementById('twenty48Status');
  const resumeBanner = document.getElementById('twenty48ResumeBanner');
  const resumeSessionButton = document.getElementById('twenty48ResumeSession') as HTMLButtonElement | null;
  const undoButton = document.getElementById('twenty48UndoButton') as HTMLButtonElement | null;
  const overlay = document.getElementById('twenty48Overlay');
  const overlayTitle = document.getElementById('twenty48OverlayTitle');
  const overlayMessage = document.getElementById('twenty48OverlayMessage');
  const continueButton = document.getElementById('twenty48ContinueButton') as HTMLButtonElement | null;
  const baseSelect = document.getElementById('twenty48Base') as HTMLSelectElement | null;
  const headline = document.getElementById('twenty48Headline');
  const tagline = document.getElementById('twenty48Tagline');
  if (!view || !boardElement) return;
  const activeView = view;
  const activeBoard = boardElement;

  const storage = browserStorage();
  const restoredSession = loadTwenty48Session(storage);
  const game = new Twenty48Game(Math.random, loadTwenty48Base(storage));
  if (restoredSession) game.restore(restoredSession);
  const resultReporter = new ArcadeResultReporter('twenty48');
  let best = loadTwenty48Best(storage, game.base);
  let status = restoredSession ? 'Saved run restored. Continue when you are ready.' : 'Keep merging — your next move is ready.';
  let resultReported = false;
  let awaitingSavedResume = Boolean(restoredSession);
  let swipeStart: { pointerId: number; x: number; y: number } | null = null;

  function visible(): boolean { return !activeView.classList.contains('view-hidden'); }

  // Base 2 keeps reading "2048"; the bigger goals get separators (177,147).
  function goalText(): string { return game.goal < 10_000 ? String(game.goal) : game.goal.toLocaleString(); }

  function syncUi(animate = false): void {
    if (game.score > best) best = saveTwenty48Best(game.score, storage, game.base);
    if (baseSelect) baseSelect.value = String(game.base);
    if (headline) headline.textContent = `Join equal numbers. Build ${goalText()}.`;
    if (tagline) tagline.textContent = `Slide, merge, and reach ${goalText()}`;
    if (scoreElement) scoreElement.textContent = game.score.toLocaleString();
    if (bestElement) bestElement.textContent = best.toLocaleString();
    if (timeElement) {
      const totalSeconds = Math.floor(game.elapsedMs / 1000);
      timeElement.textContent = `${String(Math.floor(totalSeconds / 60)).padStart(2, '0')}:${String(totalSeconds % 60).padStart(2, '0')}`;
    }
    if (statusElement) statusElement.textContent = status;
    if (resumeBanner) resumeBanner.hidden = !awaitingSavedResume;
    if (undoButton) undoButton.disabled = !game.canUndo() || awaitingSavedResume;

    const cells = game.board.map((value, index) => {
      const cell = document.createElement('div');
      const row = Math.floor(index / TWENTY48_SIZE) + 1;
      const column = index % TWENTY48_SIZE + 1;
      // Colours follow the tile's power, so 3, 9, 27 look like 2, 4, 8.
      const level = twenty48TileLevel(value, game.base);
      cell.className = `twenty48-tile ${value ? `tile-${Math.min(2 ** level, 4096)}` : 'empty'}`;
      cell.setAttribute('role', 'gridcell');
      cell.setAttribute('aria-label', value
        ? `Tile ${value} at row ${row}, column ${column}`
        : `Empty tile at row ${row}, column ${column}`);
      if (value) {
        const number = document.createElement('span');
        number.textContent = formatTwenty48Tile(value);
        cell.dataset.digits = String(number.textContent.length);
        cell.append(number);
      }
      return cell;
    });
    activeBoard.replaceChildren(...cells);
    if (animate) {
      activeBoard.classList.remove('moved');
      void activeBoard.offsetWidth;
      activeBoard.classList.add('moved');
    }

    const finished = game.phase === 'won' || game.phase === 'over';
    if (finished && !resultReported) {
      resultReporter.report(true, { outcome: 'complete', score: game.score });
      resultReported = true;
    }
    overlay?.toggleAttribute('hidden', !finished);
    if (finished) {
      const won = game.phase === 'won';
      if (overlayTitle) overlayTitle.textContent = won ? `You made ${goalText()}!` : 'No moves left';
      if (overlayMessage) overlayMessage.textContent = won
        ? `Brilliant run — ${game.score.toLocaleString()} points. Keep going or start fresh.`
        : `Final score: ${game.score.toLocaleString()} points.`;
      if (continueButton) continueButton.hidden = !won;
    }
  }

  function play(direction: Twenty48Direction): void {
    if (!visible() || game.phase !== 'playing' || awaitingSavedResume || isArcadeSessionPaused('twenty48')) return;
    const move = game.move(direction);
    const phase = game.phase as Twenty48Phase;
    if (phase === 'won') status = `You made ${goalText()}!`;
    else if (phase === 'over') status = `No moves left. Final score: ${game.score.toLocaleString()}.`;
    else if (move.moved && move.gained) status = `Great move — +${move.gained.toLocaleString()} points.`;
    else if (move.moved) status = 'Keep merging — your next move is ready.';
    else status = 'That direction is blocked. Try another move.';
    if (move.moved) saveTwenty48Session(game.session(), storage);
    syncUi(move.moved);
  }

  function reset(base: Twenty48Base = game.base): void {
    game.reset(Math.random, base);
    best = loadTwenty48Best(storage, base);
    resultReporter.report(false);
    resultReported = false;
    awaitingSavedResume = false;
    status = 'Keep merging — your next move is ready.';
    saveTwenty48Session(game.session(), storage);
    syncUi();
  }

  function confirmDiscard(): boolean {
    return !shouldConfirmTwenty48Reset(game.phase, game.movesMade)
      || window.confirm(translateArcadeText('Start a new 2048 game? Your current board and score will be lost.'));
  }

  function requestReset(): void {
    if (!confirmDiscard()) return;
    clearArcadePause();
    reset();
  }

  baseSelect?.addEventListener('change', () => {
    const base = Number(baseSelect.value);
    if (!isTwenty48Base(base) || base === game.base) return;
    if (!confirmDiscard()) {
      baseSelect.value = String(game.base);
      return;
    }
    saveTwenty48Base(base, storage);
    clearArcadePause();
    reset(base);
    status = `Powers of ${base} — merge your way to ${goalText()}.`;
    syncUi();
    // Hand the keyboard back to the board, or the arrow keys would keep changing the base.
    activeBoard.focus();
  });

  const keyDirections: Record<string, Twenty48Direction> = {
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  };
  window.addEventListener('keydown', event => {
    if (!visible() || event.repeat) return;
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement
      || event.target instanceof HTMLSelectElement || event.target instanceof HTMLButtonElement) return;
    const direction = keyDirections[event.code];
    if (!direction) return;
    event.preventDefault();
    play(direction);
  });

  document.querySelectorAll<HTMLButtonElement>('[data-twenty48-direction]').forEach(button => {
    button.addEventListener('click', () => {
      const direction = button.dataset.twenty48Direction as Twenty48Direction | undefined;
      if (direction) play(direction);
    });
  });
  document.querySelectorAll<HTMLElement>('[data-twenty48-reset]').forEach(button => button.addEventListener('click', requestReset));
  resumeSessionButton?.addEventListener('click', () => {
    awaitingSavedResume = false;
    status = 'Saved run continued — swipe or use the arrow controls.';
    syncUi();
    activeBoard.focus();
  });
  undoButton?.addEventListener('click', () => {
    if (!game.undo()) return;
    resultReporter.report(false);
    resultReported = false;
    status = 'Last move undone. Casual undo is available once after each move.';
    saveTwenty48Session(game.session(), storage);
    syncUi();
  });
  continueButton?.addEventListener('click', () => {
    game.continueAfterWin();
    status = game.phase === 'over'
      ? `No moves left. Final score: ${game.score.toLocaleString()}.`
      : `${goalText()} reached — keep building your high score!`;
    saveTwenty48Session(game.session(), storage);
    syncUi();
  });

  activeBoard.addEventListener('pointerdown', event => {
    if (!visible() || game.phase !== 'playing') return;
    swipeStart = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    capturePointer(activeBoard, event.pointerId);
  });
  activeBoard.addEventListener('pointerup', event => {
    if (!swipeStart || swipeStart.pointerId !== event.pointerId) return;
    const dx = event.clientX - swipeStart.x;
    const dy = event.clientY - swipeStart.y;
    swipeStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    play(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  });
  const cancelSwipe = (): void => { swipeStart = null; };
  activeBoard.addEventListener('pointercancel', cancelSwipe);
  activeBoard.addEventListener('lostpointercapture', cancelSwipe);

  registerArcadeSession({
    gameId: 'twenty48',
    view: activeView,
    mode: () => 'solo',
    isActive: () => game.phase === 'playing' && !awaitingSavedResume,
    clearHeldInputs: cancelSwipe,
    resumeCountdown: false,
  });

  let lastElapsedTick = performance.now();
  let persistenceTicks = 0;
  window.setInterval(() => {
    const now = performance.now();
    const elapsed = Math.min(1_500, Math.max(0, now - lastElapsedTick));
    lastElapsedTick = now;
    if (!visible() || game.phase !== 'playing' || awaitingSavedResume || isArcadeSessionPaused('twenty48')) return;
    game.elapsedMs += elapsed;
    persistenceTicks += 1;
    if (persistenceTicks % 5 === 0) saveTwenty48Session(game.session(), storage);
    syncUi();
  }, 1_000);

  syncUi();
}
