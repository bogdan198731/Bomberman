import { ArcadeResultReporter } from './stats.js';

export const TWENTY48_SIZE = 4;
export const TWENTY48_BEST_STORAGE_KEY = 'blast-arcade-2048-best-v1';

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

export class Twenty48Game {
  board: number[];
  score = 0;
  phase: Twenty48Phase = 'playing';
  private victoryAcknowledged = false;
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
    this.victoryAcknowledged = false;
  }

  move(direction: Twenty48Direction): Twenty48Move {
    if (this.phase !== 'playing') return { board: [...this.board], moved: false, gained: 0 };
    const move = moveTwenty48(this.board, direction);
    if (move.moved) {
      this.board = addTwenty48Tile(move.board, this.random);
      this.score += move.gained;
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
  const statusElement = document.getElementById('twenty48Status');
  const overlay = document.getElementById('twenty48Overlay');
  const overlayTitle = document.getElementById('twenty48OverlayTitle');
  const overlayMessage = document.getElementById('twenty48OverlayMessage');
  const continueButton = document.getElementById('twenty48ContinueButton') as HTMLButtonElement | null;
  if (!view || !boardElement) return;
  const activeView = view;
  const activeBoard = boardElement;

  const game = new Twenty48Game();
  const storage = browserStorage();
  const resultReporter = new ArcadeResultReporter('twenty48');
  let best = loadTwenty48Best(storage);
  let status = 'Keep merging — your next move is ready.';
  let resultReported = false;
  let swipeStart: { pointerId: number; x: number; y: number } | null = null;

  function visible(): boolean { return !activeView.classList.contains('view-hidden'); }

  function syncUi(animate = false): void {
    if (game.score > best) best = saveTwenty48Best(game.score, storage);
    if (scoreElement) scoreElement.textContent = game.score.toLocaleString();
    if (bestElement) bestElement.textContent = best.toLocaleString();
    if (statusElement) statusElement.textContent = status;

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
    if (!visible() || game.phase !== 'playing') return;
    const move = game.move(direction);
    const phase = game.phase as Twenty48Phase;
    if (phase === 'won') status = 'You made 2048!';
    else if (phase === 'over') status = `No moves left. Final score: ${game.score.toLocaleString()}.`;
    else if (move.moved && move.gained) status = `Great move — +${move.gained.toLocaleString()} points.`;
    else if (move.moved) status = 'Keep merging — your next move is ready.';
    else status = 'That direction is blocked. Try another move.';
    syncUi(move.moved);
  }

  function reset(): void {
    game.reset();
    resultReporter.report(false);
    resultReported = false;
    status = 'Keep merging — your next move is ready.';
    syncUi();
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
  document.querySelectorAll<HTMLElement>('[data-twenty48-reset]').forEach(button => button.addEventListener('click', reset));
  continueButton?.addEventListener('click', () => {
    game.continueAfterWin();
    status = game.phase === 'over'
      ? `No moves left. Final score: ${game.score.toLocaleString()}.`
      : '2048 reached — keep building your high score!';
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

  syncUi();
}
