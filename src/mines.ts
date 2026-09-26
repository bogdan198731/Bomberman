import { ArcadeResultReporter } from './stats.js';
import { isArcadeSessionPaused, registerArcadeSession } from './session-control.js';

export type MineDifficulty = 'easy' | 'medium' | 'hard';
export type MinePhase = 'ready' | 'playing' | 'won' | 'lost';

export interface MineSetup {
  columns: number;
  rows: number;
  mines: number;
  /** Points for a win, scaled down the longer it takes. */
  base: number;
}

/** Sized for phones: even Hard stays a square you can tap without zooming. */
export const MINE_SETUPS: Record<MineDifficulty, MineSetup> = {
  easy: { columns: 9, rows: 9, mines: 10, base: 1_000 },
  medium: { columns: 12, rows: 12, mines: 22, base: 3_000 },
  hard: { columns: 16, rows: 16, mines: 51, base: 6_000 },
};

export interface MineCell {
  mine: boolean;
  adjacent: number;
  revealed: boolean;
  flagged: boolean;
}

export const MINES_SESSION_STORAGE_KEY = 'blast-arcade-mines-session-v1';

/**
 * An unfinished board, saved so a phone that reclaims the tab does not cost
 * the game. Each cell is one digit: 1 = mine, 2 = revealed, 4 = flagged.
 */
export interface MineSession {
  difficulty: MineDifficulty;
  cells: string;
  elapsedMs: number;
}

interface MineStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function browserStorage(): MineStorage | undefined {
  try { return typeof localStorage === 'undefined' ? undefined : localStorage; }
  catch { return undefined; }
}

export function normalizeMineSession(value: unknown): MineSession | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<MineSession>;
  const difficulty = candidate.difficulty;
  if (difficulty !== 'easy' && difficulty !== 'medium' && difficulty !== 'hard') return null;
  const setup = MINE_SETUPS[difficulty];
  const cells = candidate.cells;
  if (typeof cells !== 'string' || cells.length !== setup.columns * setup.rows || !/^[0-7]+$/.test(cells)) return null;
  // A tampered or half-written save must not produce an impossible board.
  if ([...cells].filter(code => Number(code) & 1).length !== setup.mines) return null;
  if ([...cells].some(code => (Number(code) & 1) && (Number(code) & 2))) return null;
  const elapsedMs = Number(candidate.elapsedMs);
  return { difficulty, cells, elapsedMs: Number.isFinite(elapsedMs) && elapsedMs >= 0 ? Math.round(elapsedMs) : 0 };
}

export function loadMineSession(storage: MineStorage | undefined = browserStorage()): MineSession | null {
  try {
    const raw = storage?.getItem(MINES_SESSION_STORAGE_KEY);
    return raw ? normalizeMineSession(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/** Saves an unfinished board, or clears the save when there is nothing to resume. */
export function saveMineSession(session: MineSession | null, storage: MineStorage | undefined = browserStorage()): void {
  try {
    if (session) storage?.setItem(MINES_SESSION_STORAGE_KEY, JSON.stringify(session));
    else storage?.removeItem(MINES_SESSION_STORAGE_KEY);
  } catch { /* The game still plays; it just cannot be resumed. */ }
}

export class MinesweeperGame {
  difficulty: MineDifficulty = 'easy';
  columns = 9;
  rows = 9;
  mineCount = 10;
  cells: MineCell[] = [];
  phase: MinePhase = 'ready';
  exploded = -1;
  startedAt = 0;
  finishedAt = 0;
  private random: () => number;

  constructor(random: () => number = Math.random) {
    this.random = random;
    this.newGame('easy');
  }

  newGame(difficulty: MineDifficulty = this.difficulty): void {
    const setup = MINE_SETUPS[difficulty];
    this.difficulty = difficulty;
    this.columns = setup.columns;
    this.rows = setup.rows;
    this.mineCount = setup.mines;
    this.cells = Array.from({ length: setup.columns * setup.rows }, () => ({ mine: false, adjacent: 0, revealed: false, flagged: false }));
    this.phase = 'ready';
    this.exploded = -1;
    this.startedAt = 0;
    this.finishedAt = 0;
  }

  neighbours(index: number): number[] {
    const column = index % this.columns;
    const row = Math.floor(index / this.columns);
    const result: number[] = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const r = row + dr;
        const c = column + dc;
        if (r >= 0 && r < this.rows && c >= 0 && c < this.columns) result.push(r * this.columns + c);
      }
    }
    return result;
  }

  flagsPlaced(): number {
    return this.cells.filter(cell => cell.flagged).length;
  }

  /** Seconds on the clock: frozen once the game ends. */
  elapsed(now: number): number {
    if (!this.startedAt) return 0;
    return Math.floor(((this.finishedAt || now) - this.startedAt) / 1000);
  }

  /** Reveals a cell; the very first reveal is always safe and opens an area. */
  reveal(index: number, now: number = Date.now()): boolean {
    const cell = this.cells[index];
    if (!cell || cell.flagged || cell.revealed || this.phase === 'won' || this.phase === 'lost') return false;
    if (this.phase === 'ready') {
      this.layMines(index);
      this.phase = 'playing';
      this.startedAt = now;
    }
    if (cell.mine) {
      cell.revealed = true;
      this.exploded = index;
      this.phase = 'lost';
      this.finishedAt = now;
      this.cells.forEach(other => { if (other.mine) other.revealed = true; });
      return true;
    }
    // Flood out from empty cells so zeros open their whole region at once.
    const queue = [index];
    while (queue.length) {
      const current = queue.pop()!;
      const target = this.cells[current];
      if (target.revealed || target.flagged) continue;
      target.revealed = true;
      if (target.adjacent === 0) queue.push(...this.neighbours(current).filter(n => !this.cells[n].revealed));
    }
    if (this.cells.every(other => other.mine || other.revealed)) {
      this.phase = 'won';
      this.finishedAt = now;
      this.cells.forEach(other => { if (other.mine) other.flagged = true; });
    }
    return true;
  }

  toggleFlag(index: number): boolean {
    const cell = this.cells[index];
    if (!cell || cell.revealed || this.phase === 'won' || this.phase === 'lost') return false;
    cell.flagged = !cell.flagged;
    return true;
  }

  /**
   * On a revealed number whose flags are all placed, open every other
   * neighbour at once. A wrong flag means this can still hit a mine.
   */
  chord(index: number, now: number = Date.now()): boolean {
    const cell = this.cells[index];
    if (!cell?.revealed || cell.adjacent === 0 || this.phase !== 'playing') return false;
    const around = this.neighbours(index);
    if (around.filter(n => this.cells[n].flagged).length !== cell.adjacent) return false;
    let opened = false;
    for (const n of around) {
      if (!this.cells[n].flagged && !this.cells[n].revealed) opened = this.reveal(n, now) || opened;
      // reveal() can end the game mid-loop; TypeScript cannot see that through the call.
      if ((this.phase as MinePhase) === 'lost') break;
    }
    return opened;
  }

  /** Only an unfinished board is worth saving; anything else clears the save. */
  session(now: number = Date.now()): MineSession | null {
    if (this.phase !== 'playing') return null;
    const cells = this.cells.map(cell => (cell.mine ? 1 : 0) | (cell.revealed ? 2 : 0) | (cell.flagged ? 4 : 0)).join('');
    return { difficulty: this.difficulty, cells, elapsedMs: now - this.startedAt };
  }

  restore(value: unknown, now: number = Date.now()): boolean {
    const session = normalizeMineSession(value);
    if (!session) return false;
    this.newGame(session.difficulty);
    [...session.cells].forEach((code, index) => {
      const bits = Number(code);
      this.cells[index] = { mine: Boolean(bits & 1), revealed: Boolean(bits & 2), flagged: Boolean(bits & 4), adjacent: 0 };
    });
    this.cells.forEach((cell, index) => {
      cell.adjacent = this.neighbours(index).filter(n => this.cells[n].mine).length;
    });
    this.phase = 'playing';
    // Carry the clock over: only time actually spent playing counts.
    this.startedAt = now - session.elapsedMs;
    return true;
  }

  score(now: number = Date.now()): number {
    if (this.phase !== 'won') return 0;
    const base = MINE_SETUPS[this.difficulty].base;
    return Math.round((base * 120) / (120 + this.elapsed(now)));
  }

  statusText(now: number = Date.now()): string {
    if (this.phase === 'ready') return 'Tap any square - the first one is always safe.';
    if (this.phase === 'playing') return `${this.mineCount - this.flagsPlaced()} mines left to find.`;
    if (this.phase === 'won') return `Field cleared in ${this.elapsed(now)}s - ${this.score(now)} points!`;
    return 'Boom - that was a mine. Try again.';
  }

  private layMines(safe: number): void {
    const keepClear = new Set([safe, ...this.neighbours(safe)]);
    const spots = this.cells.map((_, index) => index).filter(index => !keepClear.has(index));
    for (let placed = 0; placed < this.mineCount && spots.length; placed++) {
      const pick = Math.floor(this.random() * spots.length);
      this.cells[spots[pick]].mine = true;
      spots.splice(pick, 1);
    }
    this.cells.forEach((cell, index) => {
      cell.adjacent = this.neighbours(index).filter(n => this.cells[n].mine).length;
    });
  }
}

export function initMinesweeper(): void {
  if (typeof document === 'undefined') return;
  const canvas = document.getElementById('minesCanvas') as HTMLCanvasElement | null;
  const context = canvas?.getContext('2d');
  const view = document.getElementById('minesView');
  if (!canvas || !context || !view) return;
  const board = canvas;
  const ctx = context;
  const minesView = view;

  const game = new MinesweeperGame();
  const status = document.getElementById('minesStatus');
  const leftEl = document.getElementById('minesLeft');
  const timeEl = document.getElementById('minesTime');
  const difficultySelect = document.getElementById('minesDifficulty') as HTMLSelectElement | null;
  const flagButton = document.getElementById('minesFlagButton') as HTMLButtonElement | null;
  const resultReporter = new ArcadeResultReporter('mines');
  let flagMode = false;
  let cursor = -1;
  // True from a restore until the player's first move, so the status can say so.
  let resumed = false;
  const CELL = 40;

  function sizeBoard(): void {
    board.width = game.columns * CELL;
    board.height = game.rows * CELL;
  }

  function persist(): void {
    saveMineSession(game.session());
  }

  function newGame(difficulty: MineDifficulty = game.difficulty): void {
    game.newGame(difficulty);
    saveMineSession(null);
    resumed = false;
    cursor = -1;
    sizeBoard();
    syncUi();
  }

  function syncUi(): void {
    const now = Date.now();
    if (status) status.textContent = resumed && game.phase === 'playing' ? 'Saved board restored - keep sweeping.' : game.statusText(now);
    if (leftEl) leftEl.textContent = String(game.mineCount - game.flagsPlaced());
    if (timeEl) timeEl.textContent = String(game.elapsed(now));
    flagButton?.setAttribute('aria-pressed', flagMode ? 'true' : 'false');
    resultReporter.report(game.phase === 'won' || game.phase === 'lost', {
      outcome: game.phase === 'won' ? 'complete' : 'loss',
      score: game.score(now),
    });
  }

  function act(index: number, flag: boolean): void {
    if (isArcadeSessionPaused('mines') || index < 0) return;
    const cell = game.cells[index];
    if (flag) game.toggleFlag(index);
    else if (cell.revealed) game.chord(index);
    else game.reveal(index);
    resumed = false;
    persist();
    syncUi();
  }

  const numberColors = ['', '#68dfff', '#54e38e', '#ff6b78', '#b28bff', '#ffc857', '#4dd4c4', '#f4f6f8', '#9aa8bd'];
  function render(): void {
    ctx.fillStyle = '#0a1120';
    ctx.fillRect(0, 0, board.width, board.height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 ${CELL * .5}px system-ui, sans-serif`;
    game.cells.forEach((cell, index) => {
      const x = (index % game.columns) * CELL;
      const y = Math.floor(index / game.columns) * CELL;
      ctx.fillStyle = !cell.revealed ? '#2a3a55' : cell.mine ? (index === game.exploded ? '#d83c51' : '#3a2230') : '#131d2e';
      ctx.beginPath();
      ctx.roundRect(x + 2, y + 2, CELL - 4, CELL - 4, 6);
      ctx.fill();
      if (!cell.revealed) {
        ctx.fillStyle = 'rgba(255,255,255,.08)';
        ctx.fillRect(x + 4, y + 4, CELL - 8, 4);
      }
      if (cell.flagged && !(cell.revealed && cell.mine)) {
        ctx.fillStyle = '#ffc857';
        ctx.beginPath();
        ctx.moveTo(x + CELL * .38, y + CELL * .24);
        ctx.lineTo(x + CELL * .72, y + CELL * .38);
        ctx.lineTo(x + CELL * .38, y + CELL * .52);
        ctx.fill();
        ctx.fillRect(x + CELL * .34, y + CELL * .22, 3, CELL * .56);
      } else if (cell.revealed && cell.mine) {
        ctx.fillStyle = '#f4f6f8';
        ctx.beginPath(); ctx.arc(x + CELL / 2, y + CELL / 2, CELL * .2, 0, Math.PI * 2); ctx.fill();
      } else if (cell.revealed && cell.adjacent) {
        ctx.fillStyle = numberColors[cell.adjacent];
        ctx.fillText(String(cell.adjacent), x + CELL / 2, y + CELL / 2 + 1);
      }
      if (index === cursor) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 3, y + 3, CELL - 6, CELL - 6);
      }
    });
  }

  function cellAt(clientX: number, clientY: number): number {
    const bounds = board.getBoundingClientRect();
    const column = Math.floor(((clientX - bounds.left) / bounds.width) * game.columns);
    const row = Math.floor(((clientY - bounds.top) / bounds.height) * game.rows);
    if (column < 0 || row < 0 || column >= game.columns || row >= game.rows) return -1;
    return row * game.columns + column;
  }

  // Long-press flags on touch; a short tap reveals (or flags, in flag mode).
  let press: { index: number; x: number; y: number; timer: number; flagged: boolean } | null = null;
  board.addEventListener('contextmenu', event => event.preventDefault());
  board.addEventListener('pointerdown', event => {
    const index = cellAt(event.clientX, event.clientY);
    if (event.pointerType === 'mouse') {
      if (event.button === 2) act(index, true);
      else if (event.button === 0) act(index, flagMode);
      return;
    }
    const pending = { index, x: event.clientX, y: event.clientY, flagged: false, timer: 0 };
    pending.timer = window.setTimeout(() => {
      pending.flagged = true;
      act(pending.index, true);
      if ('vibrate' in navigator) navigator.vibrate(20);
    }, 420);
    press = pending;
  });
  board.addEventListener('pointermove', event => {
    if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 12) { window.clearTimeout(press.timer); press = null; }
  });
  board.addEventListener('pointerup', () => {
    if (!press) return;
    window.clearTimeout(press.timer);
    if (!press.flagged) act(press.index, flagMode);
    press = null;
  });
  board.addEventListener('pointercancel', () => { if (press) window.clearTimeout(press.timer); press = null; });

  window.addEventListener('keydown', event => {
    if (minesView.classList.contains('view-hidden') || event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
    const moves: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      if (cursor < 0) cursor = Math.floor(game.rows / 2) * game.columns + Math.floor(game.columns / 2);
      const column = Math.max(0, Math.min(game.columns - 1, (cursor % game.columns) + move[0]));
      const row = Math.max(0, Math.min(game.rows - 1, Math.floor(cursor / game.columns) + move[1]));
      cursor = row * game.columns + column;
    } else if ((event.key === ' ' || event.key === 'Enter') && cursor >= 0 && !event.repeat) {
      event.preventDefault();
      act(cursor, false);
    } else if (event.key.toLowerCase() === 'f' && cursor >= 0) {
      event.preventDefault();
      act(cursor, true);
    }
  });

  flagButton?.addEventListener('click', () => { flagMode = !flagMode; syncUi(); });
  document.getElementById('minesNewButton')?.addEventListener('click', () => newGame());
  difficultySelect?.addEventListener('change', () => {
    const difficulty = difficultySelect.value;
    if (difficulty === 'easy' || difficulty === 'medium' || difficulty === 'hard') {
      try { localStorage.setItem('blast-arcade-mines-difficulty-v1', difficulty); } catch { /* optional */ }
      newGame(difficulty);
    }
  });
  try {
    const saved = localStorage.getItem('blast-arcade-mines-difficulty-v1');
    if (saved === 'easy' || saved === 'medium' || saved === 'hard') {
      if (difficultySelect) difficultySelect.value = saved;
      game.newGame(saved);
    }
  } catch { /* keep Easy */ }
  // An unfinished board beats a fresh one: pick up exactly where the player left off.
  if (game.restore(loadMineSession())) {
    resumed = true;
    if (difficultySelect) difficultySelect.value = game.difficulty;
  }
  window.addEventListener('pagehide', persist);

  registerArcadeSession({
    gameId: 'mines',
    view: minesView,
    mode: () => 'solo',
    isActive: () => game.phase === 'playing',
    clearHeldInputs: () => { if (press) window.clearTimeout(press.timer); press = null; },
    resumeCountdown: false,
  });

  let lastSecond = -1;
  let lastFrame = Date.now();
  function loop(): void {
    const now = Date.now();
    const away = minesView.classList.contains('view-hidden') || isArcadeSessionPaused('mines');
    // Time spent paused or on another screen does not count against the clock.
    if (away && game.phase === 'playing') game.startedAt += now - lastFrame;
    lastFrame = now;
    if (!minesView.classList.contains('view-hidden')) {
      const second = game.elapsed(now);
      if (second !== lastSecond) { lastSecond = second; syncUi(); }
      render();
    }
    requestAnimationFrame(loop);
  }
  sizeBoard();
  syncUi();
  requestAnimationFrame(loop);
}
