import { ArcadeResultReporter } from './stats.js';
import { isArcadeSessionPaused, registerArcadeSession } from './session-control.js';

export type MathCrossDifficulty = 'easy' | 'normal' | 'hard';
export type MathCrossPhase = 'playing' | 'won';
export type MathOp = '+' | '-' | '×' | '÷';

/**
 * A puzzle is a square grid of circles ("nodes"). Each equation reads
 * a op b = c across or down three neighbouring nodes, and equations cross
 * where they share a node.
 */
export interface MathEquation { nodes: [number, number, number]; op: MathOp; across: boolean }

export interface MathCrossPuzzle {
  size: number;
  equations: MathEquation[];
  /** The answer at each node, or null where the grid has no circle. */
  values: (number | null)[];
  /** Nodes shown from the start; the rest are for the player to fill. */
  given: boolean[];
}

interface DifficultySettings {
  size: number;
  equations: number;
  /** Largest number anywhere in the grid. */
  max: number;
  /** Most blanks to aim for, and the fewest a puzzle may have. */
  blanks: number;
  minBlanks: number;
  /** Repeats weight the draw: Easy leans on + and −. */
  ops: MathOp[];
  pointsPerBlank: number;
  /** Seconds under which a solve earns a speed bonus. */
  par: number;
}

export const MATHCROSS_SETTINGS: Record<MathCrossDifficulty, DifficultySettings> = {
  easy: { size: 5, equations: 6, max: 20, blanks: 6, minBlanks: 4, ops: ['+', '-', '+', '-', '×', '÷'], pointsPerBlank: 20, par: 180 },
  normal: { size: 6, equations: 9, max: 50, blanks: 9, minBlanks: 7, ops: ['+', '-', '×', '÷'], pointsPerBlank: 40, par: 300 },
  hard: { size: 6, equations: 12, max: 99, blanks: 16, minBlanks: 10, ops: ['+', '-', '×', '÷', '×', '÷'], pointsPerBlank: 60, par: 480 },
};

const MULTIPLIER: Record<MathCrossDifficulty, number> = { easy: 1, normal: 2, hard: 3 };

/** a op b, or NaN when it does not give a whole number. */
export function applyOp(op: MathOp, a: number, b: number): number {
  if (op === '+') return a + b;
  if (op === '-') return a - b;
  if (op === '×') return a * b;
  return a % b === 0 ? a / b : NaN;
}

/** Whether a op b = c is a fair puzzle equation: whole numbers 1..max, and no ×1 or ÷1. */
export function validEquation(op: MathOp, a: number, b: number, c: number, max: number): boolean {
  if (![a, b, c].every(value => Number.isInteger(value) && value >= 1 && value <= max)) return false;
  if ((op === '×' || op === '÷') && (b < 2 || (op === '×' ? a : c) < 2)) return false;
  return applyOp(op, a, b) === c;
}

/** The one missing value of a op b = c, given the other two. */
function solveMissing(op: MathOp, position: number, a: number, b: number, c: number): number {
  if (position === 2) return applyOp(op, a, b);
  if (position === 0) return op === '+' ? c - b : op === '-' ? c + b : op === '×' ? (c % b === 0 ? c / b : NaN) : c * b;
  return op === '+' ? c - a : op === '-' ? a - c : op === '×' ? (c % a === 0 ? c / a : NaN) : (a % c === 0 ? a / c : NaN);
}

/** Every fair (a, b, c) for this operator that agrees with the values already fixed. */
export function equationOptions(op: MathOp, fixed: (number | undefined)[], max: number): [number, number, number][] {
  const [fa, fb, fc] = fixed;
  const range = (value: number | undefined): number[] => value !== undefined ? [value] : Array.from({ length: max }, (_, i) => i + 1);
  const found: [number, number, number][] = [];
  if (fc !== undefined && fa === undefined && fb === undefined) {
    for (let a = 1; a <= max; a++) {
      const b = solveMissing(op, 1, a, 0, fc);
      if (validEquation(op, a, b, fc, max)) found.push([a, b, fc]);
    }
    return found;
  }
  for (const a of range(fa)) {
    for (const b of range(fb)) {
      const c = applyOp(op, a, b);
      if ((fc === undefined || fc === c) && validEquation(op, a, b, c, max)) found.push([a, b, c]);
    }
  }
  return found;
}

function shuffle<T>(items: T[], random: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

interface Slot { across: boolean; row: number; col: number }

function slotNodes(size: number, slot: Slot): [number, number, number] {
  const step = slot.across ? 1 : size;
  const first = slot.row * size + slot.col;
  return [first, first + step, first + 2 * step];
}

/**
 * Lays equations out crossword-style: each new one crosses a circle already
 * placed. Two equations on the same line keep at least one empty circle
 * between them, so they never read as one long sum.
 */
function buildLayout(size: number, target: number, random: () => number): Slot[] {
  const all: Slot[] = [];
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (col <= size - 3) all.push({ across: true, row, col });
      if (row <= size - 3) all.push({ across: false, row, col });
    }
  }
  const placed: Slot[] = [all[Math.floor(random() * all.length)]];
  const used = new Set(slotNodes(size, placed[0]));
  while (placed.length < target) {
    const options = all.filter(slot => {
      const nodes = slotNodes(size, slot);
      if (!nodes.some(node => used.has(node))) return false;
      return placed.every(other => {
        if (other.across !== slot.across) return true;
        const line = slot.across ? 'row' : 'col';
        const along = slot.across ? 'col' : 'row';
        if (other[line] !== slot[line]) return true;
        return slot[along] > other[along] + 3 || slot[along] + 3 < other[along];
      });
    });
    if (!options.length) break;
    const pick = options[Math.floor(random() * options.length)];
    placed.push(pick);
    slotNodes(size, pick).forEach(node => used.add(node));
  }
  return placed;
}

/** Whether the equations reach every row and column, so the board has no empty edge. */
function fillsGrid(size: number, slots: Slot[]): boolean {
  const rows = new Set<number>(), cols = new Set<number>();
  for (const slot of slots) {
    for (const node of slotNodes(size, slot)) { rows.add(Math.floor(node / size)); cols.add(node % size); }
  }
  return rows.size === size && cols.size === size;
}

/** Fills the layout with numbers and operators so every equation holds. */
function fillLayout(size: number, slots: Slot[], settings: DifficultySettings, random: () => number): MathCrossPuzzle | null {
  const values: (number | undefined)[] = Array(size * size).fill(undefined);
  const equations: MathEquation[] = [];
  let budget = 4000;
  const place = (index: number): boolean => {
    if (index === slots.length) return true;
    if (--budget < 0) return false;
    const nodes = slotNodes(size, slots[index]);
    const before = nodes.map(node => values[node]);
    for (const op of [...new Set(shuffle([...settings.ops], random))]) {
      const options = shuffle(equationOptions(op, before, settings.max), random).slice(0, 6);
      for (const option of options) {
        nodes.forEach((node, i) => { values[node] = option[i]; });
        equations[index] = { nodes, op, across: slots[index].across };
        if (place(index + 1)) return true;
      }
      nodes.forEach((node, i) => { values[node] = before[i]; });
    }
    return false;
  };
  if (!place(0)) return null;
  return {
    size,
    equations,
    values: values.map(value => value ?? null),
    given: values.map(value => value !== undefined),
  };
}

/**
 * Fills blanks the way a player can: find an equation with one unknown and
 * work it out. Returns the values it reached; a puzzle is fair when this
 * fills every circle, which also makes its answer unique.
 */
export function solveByDeduction(puzzle: Pick<MathCrossPuzzle, 'equations' | 'values' | 'given'>): (number | null)[] {
  const known: (number | null)[] = puzzle.values.map((value, node) => (puzzle.given[node] ? value : null));
  let progress = true;
  while (progress) {
    progress = false;
    for (const { nodes, op } of puzzle.equations) {
      const missing = nodes.filter(node => known[node] === null);
      if (missing.length !== 1) continue;
      const position = nodes.indexOf(missing[0]);
      const [a, b, c] = nodes.map(node => known[node] ?? 0);
      const value = solveMissing(op, position, a, b, c);
      if (!Number.isInteger(value)) continue;
      known[missing[0]] = value;
      progress = true;
    }
  }
  return known;
}

function solvable(puzzle: MathCrossPuzzle): boolean {
  const reached = solveByDeduction(puzzle);
  return puzzle.values.every((value, node) => value === null || reached[node] === value);
}

/** Hides as many circles as the difficulty asks while the puzzle stays solvable step by step. */
function hideNumbers(puzzle: MathCrossPuzzle, target: number, random: () => number): number {
  let hidden = 0;
  const nodes = shuffle(puzzle.values.flatMap((value, node) => (value === null ? [] : [node])), random);
  for (const node of nodes) {
    if (hidden >= target) break;
    puzzle.given[node] = false;
    if (solvable(puzzle)) hidden++;
    else puzzle.given[node] = true;
  }
  return hidden;
}

export function blankCount(puzzle: MathCrossPuzzle): number {
  return puzzle.values.filter((value, node) => value !== null && !puzzle.given[node]).length;
}

/** A new random puzzle with a single answer a player can reach without guessing. */
export function generateMathCross(difficulty: MathCrossDifficulty, random: () => number = Math.random): MathCrossPuzzle {
  const settings = MATHCROSS_SETTINGS[difficulty];
  let best: MathCrossPuzzle | null = null;
  for (let attempt = 0; attempt < 400; attempt++) {
    const slots = buildLayout(settings.size, settings.equations, random);
    if (slots.length < settings.equations - 1 || !fillsGrid(settings.size, slots)) continue;
    const puzzle = fillLayout(settings.size, slots, settings, random);
    if (!puzzle) continue;
    const hidden = hideNumbers(puzzle, settings.blanks, random);
    if (!best || hidden > blankCount(best)) best = puzzle;
    if (hidden >= settings.minBlanks) return puzzle;
  }
  if (best) return best;
  // Practically unreachable, but a fixed fallback keeps the game playable.
  return {
    size: 5,
    equations: [{ nodes: [0, 1, 2], op: '+', across: true }],
    values: [3, 4, 7, ...Array(22).fill(null)],
    given: [true, false, true, ...Array(22).fill(false)],
  };
}

/** Seeded random numbers, so tests and saved games can repeat a puzzle. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function formatMathCrossTime(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

export const MATHCROSS_SESSION_STORAGE_KEY = 'blast-arcade-mathcross-session-v1';
export const MATHCROSS_DIFFICULTY_STORAGE_KEY = 'blast-arcade-mathcross-difficulty-v1';

/** An unfinished puzzle, so a phone that reclaims the tab does not cost it. */
export interface MathCrossSession {
  difficulty: MathCrossDifficulty;
  puzzle: MathCrossPuzzle;
  entries: (number | null)[];
  elapsedSeconds: number;
}

interface MathCrossStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function browserStorage(): MathCrossStorage | undefined {
  try { return typeof localStorage === 'undefined' ? undefined : localStorage; }
  catch { return undefined; }
}

const OPS: readonly MathOp[] = ['+', '-', '×', '÷'];

/** Accepts only a well-formed puzzle whose own numbers add up: a tampered save is dropped. */
export function normalizeMathCrossSession(value: unknown): MathCrossSession | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<MathCrossSession>;
  const { difficulty, puzzle, entries } = candidate;
  if (difficulty !== 'easy' && difficulty !== 'normal' && difficulty !== 'hard') return null;
  if (!puzzle || typeof puzzle !== 'object') return null;
  const { size, equations, values, given } = puzzle;
  const max = MATHCROSS_SETTINGS[difficulty].max;
  if (!Number.isInteger(size) || size < 3 || size > 8) return null;
  const cells = size * size;
  if (!Array.isArray(values) || values.length !== cells || !values.every(v => v === null || (Number.isInteger(v) && v >= 1 && v <= max))) return null;
  if (!Array.isArray(given) || given.length !== cells || !given.every(g => typeof g === 'boolean')) return null;
  if (!Array.isArray(entries) || entries.length !== cells || !entries.every(e => e === null || (Number.isInteger(e) && e >= 0 && e <= 999))) return null;
  if (!Array.isArray(equations) || !equations.length || equations.length > 30) return null;
  const clean: MathEquation[] = [];
  for (const equation of equations) {
    if (!equation || !OPS.includes(equation.op) || !Array.isArray(equation.nodes) || equation.nodes.length !== 3) return null;
    const [first] = equation.nodes;
    const across = Boolean(equation.across);
    if (!Number.isInteger(first) || first < 0) return null;
    const row = Math.floor(first / size), col = first % size;
    if (across ? col > size - 3 : row > size - 3) return null;
    const nodes = slotNodes(size, { across, row, col });
    if (nodes.some((node, i) => node !== equation.nodes[i])) return null;
    const [a, b, c] = nodes.map(node => values[node]);
    if (a === null || b === null || c === null || !validEquation(equation.op, a, b, c, max)) return null;
    clean.push({ nodes, op: equation.op, across });
  }
  const cleanPuzzle: MathCrossPuzzle = { size, equations: clean, values: [...values], given: [...given] };
  if (!solvable(cleanPuzzle)) return null;
  const elapsed = Number(candidate.elapsedSeconds);
  return {
    difficulty,
    puzzle: cleanPuzzle,
    entries: entries.map((entry, node) => (values[node] !== null && !given[node] ? entry : null)),
    elapsedSeconds: Number.isInteger(elapsed) && elapsed >= 0 ? elapsed : 0,
  };
}

export function loadMathCrossSession(storage: MathCrossStorage | undefined = browserStorage()): MathCrossSession | null {
  try {
    const raw = storage?.getItem(MATHCROSS_SESSION_STORAGE_KEY);
    return raw ? normalizeMathCrossSession(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function saveMathCrossSession(session: MathCrossSession | null, storage: MathCrossStorage | undefined = browserStorage()): void {
  try {
    if (session) storage?.setItem(MATHCROSS_SESSION_STORAGE_KEY, JSON.stringify(session));
    else storage?.removeItem(MATHCROSS_SESSION_STORAGE_KEY);
  } catch { /* The game still plays; it just cannot be resumed. */ }
}

export class MathCrossGame {
  difficulty: MathCrossDifficulty = 'normal';
  puzzle: MathCrossPuzzle;
  entries: (number | null)[] = [];
  selected = -1;
  phase: MathCrossPhase = 'playing';
  elapsedSeconds = 0;
  /** The next digit starts a fresh number rather than extending this one. */
  private freshEntry = true;
  private random: () => number;

  constructor(random: () => number = Math.random) {
    this.random = random;
    this.puzzle = generateMathCross(this.difficulty, random);
    this.reset();
  }

  newGame(difficulty: MathCrossDifficulty = this.difficulty): void {
    this.difficulty = difficulty;
    this.puzzle = generateMathCross(difficulty, this.random);
    this.reset();
  }

  private reset(): void {
    this.entries = this.puzzle.values.map(() => null);
    this.phase = 'playing';
    this.elapsedSeconds = 0;
    this.selected = this.blanks()[0] ?? -1;
    this.freshEntry = true;
  }

  get maxDigits(): number { return String(MATHCROSS_SETTINGS[this.difficulty].max).length; }

  isBlank(node: number): boolean { return this.puzzle.values[node] !== null && !this.puzzle.given[node]; }

  blanks(): number[] { return this.puzzle.values.flatMap((_, node) => (this.isBlank(node) ? [node] : [])); }

  /** What a circle shows: its given number, the player's entry, or null. */
  shown(node: number): number | null {
    return this.puzzle.given[node] ? this.puzzle.values[node] : this.entries[node];
  }

  remaining(): number { return this.blanks().filter(node => this.entries[node] === null).length; }

  select(node: number): void {
    if (this.phase !== 'playing' || !this.isBlank(node)) return;
    this.selected = node;
    this.freshEntry = true;
  }

  /** Typing digits builds a number up to the grid's largest; one more starts over. */
  type(digit: number): boolean {
    if (this.phase !== 'playing' || !this.isBlank(this.selected) || !Number.isInteger(digit) || digit < 0 || digit > 9) return false;
    const current = this.entries[this.selected];
    const extend = !this.freshEntry && current !== null && String(current).length < this.maxDigits;
    this.entries[this.selected] = extend ? Number(`${current}${digit}`) : digit;
    this.freshEntry = false;
    this.check();
    return true;
  }

  erase(): boolean {
    if (this.phase !== 'playing' || !this.isBlank(this.selected) || this.entries[this.selected] === null) return false;
    this.entries[this.selected] = null;
    this.freshEntry = true;
    return true;
  }

  /** Moves the selection to the nearest blank circle in that direction. */
  move(dx: number, dy: number): boolean {
    const { size } = this.puzzle;
    if (this.selected < 0) return false;
    let row = Math.floor(this.selected / size), col = this.selected % size;
    for (;;) {
      row += dy; col += dx;
      if (row < 0 || col < 0 || row >= size || col >= size) return false;
      if (this.isBlank(row * size + col)) {
        this.select(row * size + col);
        return true;
      }
    }
  }

  equationHolds(equation: MathEquation): boolean {
    const [a, b, c] = equation.nodes.map(node => this.shown(node));
    return a !== null && b !== null && c !== null && applyOp(equation.op, a, b) === c;
  }

  /** Once every circle is filled: the player's numbers in equations that do not add up. */
  wrongNodes(): Set<number> {
    const wrong = new Set<number>();
    if (this.remaining() > 0) return wrong;
    for (const equation of this.puzzle.equations) {
      if (!this.equationHolds(equation)) equation.nodes.filter(node => this.isBlank(node)).forEach(node => wrong.add(node));
    }
    return wrong;
  }

  // A wrong full grid costs nothing but time: the last circle is often mid-way through a two-digit number.
  private check(): void {
    if (this.remaining() === 0 && this.puzzle.equations.every(equation => this.equationHolds(equation))) {
      this.phase = 'won';
      this.selected = -1;
    }
  }

  /** More blanks and harder settings pay more, and a quick solve adds a bonus. */
  score(): number {
    if (this.phase !== 'won') return 0;
    const settings = MATHCROSS_SETTINGS[this.difficulty];
    const blanks = this.blanks().length;
    const multiplier = MULTIPLIER[this.difficulty];
    const base = blanks * settings.pointsPerBlank;
    const speed = Math.max(0, settings.par - this.elapsedSeconds) * multiplier;
    return base + speed;
  }

  statusText(): string {
    if (this.phase === 'won') return `Solved in ${formatMathCrossTime(this.elapsedSeconds)}! ${this.score()} points.`;
    const left = this.remaining();
    if (!left) return 'Not quite - the red circles break an equation.';
    if (left === this.blanks().length) return 'Tap an empty circle, then pick its number.';
    return left === 1 ? '1 circle left to fill.' : `${left} circles left to fill.`;
  }

  session(): MathCrossSession | null {
    if (this.phase !== 'playing' || this.remaining() === this.blanks().length) return null;
    return { difficulty: this.difficulty, puzzle: this.puzzle, entries: [...this.entries], elapsedSeconds: this.elapsedSeconds };
  }

  restore(value: unknown): boolean {
    const session = normalizeMathCrossSession(value);
    if (!session) return false;
    this.difficulty = session.difficulty;
    this.puzzle = session.puzzle;
    this.reset();
    this.entries = session.entries;
    this.elapsedSeconds = session.elapsedSeconds;
    this.selected = this.blanks().find(node => this.entries[node] === null) ?? this.blanks()[0] ?? -1;
    return true;
  }
}

const OP_LABEL: Record<MathOp, string> = { '+': '+', '-': '−', '×': '×', '÷': '÷' };

export function initMathCross(): void {
  if (typeof document === 'undefined') return;
  const view = document.getElementById('mathcrossView');
  const boardEl = document.getElementById('mathcrossBoard');
  const padEl = document.getElementById('mathcrossPad');
  if (!view || !boardEl || !padEl) return;
  const mathView = view;
  const board = boardEl;

  const game = new MathCrossGame();
  const status = document.getElementById('mathcrossStatus');
  const timeEl = document.getElementById('mathcrossTime');
  const leftEl = document.getElementById('mathcrossLeft');
  const levelEl = document.getElementById('mathcrossLevel');
  const difficultySelect = document.getElementById('mathcrossDifficulty') as HTMLSelectElement | null;
  const resultReporter = new ArcadeResultReporter('mathcross');
  const nodeEls = new Map<number, HTMLElement>();
  let resumed = false;

  for (const key of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '⌫']) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mathcross-key';
    button.textContent = key;
    if (key === '⌫') {
      button.classList.add('erase');
      button.setAttribute('aria-label', 'Erase');
      button.addEventListener('click', () => act(() => game.erase()));
    } else {
      button.dataset.digit = key;
      button.addEventListener('click', () => act(() => game.type(Number(key))));
    }
    padEl.append(button);
  }

  /** Lays the grid out once per puzzle; syncUi only updates numbers and states. */
  function buildBoard(): void {
    const { size, equations, values } = game.puzzle;
    const span = size * 2 - 1;
    // Circles get full columns, the operator gaps between them a little under half.
    const track = Array.from({ length: span }, (_, i) => (i % 2 ? '.45fr' : '1fr')).join(' ');
    board.style.gridTemplateColumns = track;
    board.style.gridTemplateRows = track;
    // Numbers take about 40% of a circle, whatever the grid size; cqi follows the board's width.
    board.style.setProperty('--mathcross-font', `${(40 / (size + (size - 1) * 0.45)).toFixed(2)}cqi`);
    const links = new Map<string, { label: string; across: boolean }>();
    for (const { nodes, op, across } of equations) {
      links.set(`${nodes[0]}-${nodes[1]}`, { label: OP_LABEL[op], across });
      links.set(`${nodes[1]}-${nodes[2]}`, { label: '=', across });
    }
    nodeEls.clear();
    const cells: HTMLElement[] = [];
    for (let r = 0; r < span; r++) {
      for (let c = 0; c < span; c++) {
        let cell: HTMLElement;
        if (r % 2 === 0 && c % 2 === 0) {
          const node = (r / 2) * size + c / 2;
          if (values[node] === null) cell = document.createElement('span');
          else if (game.isBlank(node)) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'mathcross-node blank';
            button.dataset.node = String(node);
            button.addEventListener('click', () => act(() => { game.select(node); return true; }));
            cell = button;
            nodeEls.set(node, cell);
          } else {
            cell = document.createElement('span');
            cell.className = 'mathcross-node given';
            cell.textContent = String(values[node]);
            nodeEls.set(node, cell);
          }
        } else {
          cell = document.createElement('span');
          const row = Math.floor(r / 2), col = Math.floor(c / 2);
          const from = row * size + col;
          const link = r % 2 === 0 ? links.get(`${from}-${from + 1}`) : c % 2 === 0 ? links.get(`${from}-${from + size}`) : undefined;
          if (link && link.across === (r % 2 === 0)) {
            cell.className = `mathcross-link ${link.across ? 'across' : 'down'}`;
            const label = document.createElement('b');
            label.textContent = link.label;
            cell.append(label);
          }
        }
        cells.push(cell);
      }
    }
    board.replaceChildren(...cells);
  }

  function syncUi(): void {
    if (status) status.textContent = resumed && game.phase === 'playing' ? 'Saved puzzle restored - keep going.' : game.statusText();
    if (timeEl) timeEl.textContent = formatMathCrossTime(game.elapsedSeconds);
    if (leftEl) leftEl.textContent = String(game.remaining());
    if (levelEl) levelEl.textContent = { easy: 'Easy', normal: 'Normal', hard: 'Hard' }[game.difficulty];
    const wrong = game.wrongNodes();
    const { size } = game.puzzle;
    for (const [node, element] of nodeEls) {
      if (!game.isBlank(node)) continue;
      const value = game.entries[node];
      element.textContent = value === null ? '' : String(value);
      element.classList.toggle('selected', node === game.selected);
      element.classList.toggle('wrong', wrong.has(node));
      element.classList.toggle('solved', game.phase === 'won');
      element.toggleAttribute('disabled', game.phase !== 'playing');
      element.setAttribute('aria-label', `Row ${Math.floor(node / size) + 1}, column ${(node % size) + 1}: ${value === null ? 'empty' : value}`);
    }
    padEl!.querySelectorAll<HTMLButtonElement>('button').forEach(key => { key.disabled = game.phase !== 'playing'; });
    resultReporter.report(game.phase === 'won', { outcome: 'win', score: game.score() });
    saveMathCrossSession(game.session());
  }

  function act(change: () => boolean): void {
    if (isArcadeSessionPaused('mathcross')) return;
    if (!change()) return;
    resumed = false;
    syncUi();
  }

  function newGame(difficulty: MathCrossDifficulty = game.difficulty): void {
    game.newGame(difficulty);
    resumed = false;
    buildBoard();
    syncUi();
  }

  window.addEventListener('keydown', event => {
    if (mathView.classList.contains('view-hidden') || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement) return;
    const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (/^[0-9]$/.test(event.key)) {
      event.preventDefault();
      act(() => game.type(Number(event.key)));
    } else if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      act(() => game.erase());
    } else if (arrows[event.key]) {
      event.preventDefault();
      act(() => game.move(...arrows[event.key]));
    }
  });

  window.setInterval(() => {
    if (mathView.classList.contains('view-hidden') || game.phase !== 'playing' || isArcadeSessionPaused('mathcross') || document.hidden) return;
    game.elapsedSeconds++;
    if (timeEl) timeEl.textContent = formatMathCrossTime(game.elapsedSeconds);
    if (game.elapsedSeconds % 5 === 0) saveMathCrossSession(game.session());
  }, 1_000);

  document.getElementById('mathcrossNewButton')?.addEventListener('click', () => newGame());
  difficultySelect?.addEventListener('change', () => {
    const difficulty = difficultySelect.value;
    if (difficulty === 'easy' || difficulty === 'normal' || difficulty === 'hard') {
      try { localStorage.setItem(MATHCROSS_DIFFICULTY_STORAGE_KEY, difficulty); } catch { /* optional */ }
      newGame(difficulty);
    }
  });

  let difficulty: MathCrossDifficulty = 'normal';
  try {
    const saved = localStorage.getItem(MATHCROSS_DIFFICULTY_STORAGE_KEY);
    if (saved === 'easy' || saved === 'normal' || saved === 'hard') difficulty = saved;
  } catch { /* keep Normal */ }
  // An unfinished puzzle beats a fresh one: pick up exactly where the player left off.
  if (game.restore(loadMathCrossSession())) resumed = true;
  else if (difficulty !== game.difficulty) game.newGame(difficulty);
  if (difficultySelect) difficultySelect.value = game.difficulty;

  registerArcadeSession({
    gameId: 'mathcross',
    view: mathView,
    mode: () => 'solo',
    isActive: () => game.phase === 'playing' && game.remaining() < game.blanks().length,
    clearHeldInputs: () => undefined,
    resumeCountdown: false,
  });

  buildBoard();
  syncUi();
}
