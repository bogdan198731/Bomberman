import { ArcadeResultReporter } from './stats.js';
import { translateArcadeText } from './i18n.js';
import { isArcadeSessionPaused, registerArcadeSession } from './session-control.js';

export const TWENTY48_SIZE = 4;
export const TWENTY48_BEST_STORAGE_KEY = 'blast-arcade-2048-best-v1';
export const TWENTY48_SESSION_STORAGE_KEY = 'blast-arcade-2048-session-v1';

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

function safeRandom(random: () => number): number {
  const value = random();
  return Number.isFinite(value) ? Math.min(0.999999, Math.max(0, value)) : 0;
}

export function addTwenty48Tile(board: readonly number[], random: () => number = Math.random): number[] {
  const next = [...board];
  const empty = next.flatMap((value, index) => value === 0 ? [index] : []);
  if (!empty.length) return next;
  const index = empty[Math.floor(safeRandom(random) * empty.length)];
  next[index] = safeRandom(random) < 0.9 ? 2 : 4;
  return next;
}

export function createTwenty48Board(random: () => number = Math.random): number[] {
  const empty = Array<number>(TWENTY48_SIZE * TWENTY48_SIZE).fill(0);
  return addTwenty48Tile(addTwenty48Tile(empty, random), random);
}

export function mergeTwenty48Line(line: readonly number[]): { line: number[]; gained: number } {
  const compact = line.filter(value => value > 0);
  const merged: number[] = [];
  let gained = 0;
  for (let index = 0; index < compact.length; index += 1) {
    if (compact[index] === compact[index + 1]) {
      const value = compact[index] * 2;
      merged.push(value);
      gained += value;
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

export function moveTwenty48(board: readonly number[], direction: Twenty48Direction): Twenty48Move {
  if (board.length !== TWENTY48_SIZE * TWENTY48_SIZE) throw new Error('2048 board must contain 16 cells.');
  let gained = 0;
  const mergedLines = linesForDirection(board, direction).map(line => {
    const merged = mergeTwenty48Line(line);
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

export function hasWonTwenty48(board: readonly number[]): boolean {
  return board.some(value => value >= 2048);
}

export interface Twenty48Session {
  version: 1;
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

function validTwenty48Cell(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    && (value === 0 || (value & (value - 1)) === 0);
}

export function normalizeTwenty48Session(value: unknown): Twenty48Session | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<Twenty48Session>;
  if (!Array.isArray(candidate.board) || candidate.board.length !== 16 || !candidate.board.every(validTwenty48Cell)) return null;
  if (candidate.phase !== 'playing' && candidate.phase !== 'won') return null;
  return {
    version: 1,
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
  private victoryAcknowledged = false;
  private undoState: Twenty48UndoState | null = null;
  private random: () => number;

  constructor(random: () => number = Math.random) {
    this.random = random;
    this.board = createTwenty48Board(random);
  }

  reset(random: () => number = this.random): void {
    this.random = random;
    this.board = createTwenty48Board(random);
    this.score = 0;
    this.phase = 'playing';
    this.movesMade = 0;
    this.elapsedMs = 0;
    this.victoryAcknowledged = false;
    this.undoState = null;
  }

  move(direction: Twenty48Direction): Twenty48Move {
    if (this.phase !== 'playing') return { board: [...this.board], moved: false, gained: 0 };
    const move = moveTwenty48(this.board, direction);
    if (move.moved) {
      this.undoState = {
        board: [...this.board],
        score: this.score,
        phase: this.phase,
        victoryAcknowledged: this.victoryAcknowledged,
      };
      this.board = addTwenty48Tile(move.board, this.random);
      this.score += move.gained;
      this.movesMade += 1;
    }
    if (!this.victoryAcknowledged && hasWonTwenty48(this.board)) this.phase = 'won';
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
    this.board = [...session.board];
    this.score = session.score;
    this.phase = session.phase;
    this.movesMade = session.movesMade;
    this.elapsedMs = session.elapsedMs;
    this.victoryAcknowledged = session.victoryAcknowledged;
    this.undoState = null;
  }
}

export function loadTwenty48Best(storage?: StorageLike): number {
  try {
    const value = storage?.getItem(TWENTY48_BEST_STORAGE_KEY);
    const score = value ? Number(value) : 0;
    return Number.isFinite(score) ? Math.max(0, Math.floor(score)) : 0;
  } catch {
    return 0;
  }
}

export function saveTwenty48Best(score: number, storage?: StorageLike): number {
  const best = Math.max(0, Math.floor(Number.isFinite(score) ? score : 0));
  try { storage?.setItem(TWENTY48_BEST_STORAGE_KEY, String(best)); }
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
  if (!view || !boardElement) return;
  const activeView = view;
  const activeBoard = boardElement;

  const storage = browserStorage();
  const restoredSession = loadTwenty48Session(storage);
  const game = new Twenty48Game();
  if (restoredSession) game.restore(restoredSession);
  const resultReporter = new ArcadeResultReporter('twenty48');
  let best = loadTwenty48Best(storage);
  let status = restoredSession ? 'Saved run restored. Continue when you are ready.' : 'Keep merging — your next move is ready.';
  let resultReported = false;
  let awaitingSavedResume = Boolean(restoredSession);
  let swipeStart: { pointerId: number; x: number; y: number } | null = null;

  function visible(): boolean { return !activeView.classList.contains('view-hidden'); }

  function syncUi(animate = false): void {
    if (game.score > best) best = saveTwenty48Best(game.score, storage);
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
      cell.className = `twenty48-tile ${value ? `tile-${Math.min(value, 4096)}` : 'empty'}`;
      cell.setAttribute('role', 'gridcell');
      cell.setAttribute('aria-label', value
        ? `Tile ${value} at row ${row}, column ${column}`
        : `Empty tile at row ${row}, column ${column}`);
      if (value) {
        const number = document.createElement('span');
        number.textContent = String(value);
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
      if (overlayTitle) overlayTitle.textContent = won ? 'You made 2048!' : 'No moves left';
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
    if (phase === 'won') status = 'You made 2048!';
    else if (phase === 'over') status = `No moves left. Final score: ${game.score.toLocaleString()}.`;
    else if (move.moved && move.gained) status = `Great move — +${move.gained.toLocaleString()} points.`;
    else if (move.moved) status = 'Keep merging — your next move is ready.';
    else status = 'That direction is blocked. Try another move.';
    if (move.moved) saveTwenty48Session(game.session(), storage);
    syncUi(move.moved);
  }

  function reset(): void {
    game.reset();
    resultReporter.report(false);
    resultReported = false;
    awaitingSavedResume = false;
    status = 'Keep merging — your next move is ready.';
    saveTwenty48Session(game.session(), storage);
    syncUi();
  }

  function requestReset(): void {
    if (shouldConfirmTwenty48Reset(game.phase, game.movesMade)
      && !window.confirm(translateArcadeText('Start a new 2048 game? Your current board and score will be lost.'))) return;
    reset();
  }

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
      : '2048 reached — keep building your high score!';
    saveTwenty48Session(game.session(), storage);
    syncUi();
  });

  activeBoard.addEventListener('pointerdown', event => {
    if (!visible() || game.phase !== 'playing') return;
    swipeStart = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    activeBoard.setPointerCapture?.(event.pointerId);
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
