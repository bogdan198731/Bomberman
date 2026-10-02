import { ArcadeResultReporter } from './stats.js';
import { isArcadeSessionPaused, registerArcadeSession } from './session-control.js';
import { AccessibleBoard, type BoardSpot } from './board-access.js';
import { ARCADE_TOUCH_LAYOUT_CHANGE_EVENT, capturePointer, loadArcadeTouchLayout, normalizeArcadeTouchLayout, type ArcadeTouchLayout } from './touch-controls.js';

/** Suits in order spades, hearts, diamonds, clubs; hearts and diamonds are red. */
export type Suit = 0 | 1 | 2 | 3;
export const SUIT_SYMBOLS = ['♠', '♥', '♦', '♣'] as const;
export const RANK_LABELS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;

export interface Card {
  suit: Suit;
  rank: number;
  up: boolean;
}

export type Source =
  | { pile: 'waste' }
  | { pile: 'foundation'; index: number }
  | { pile: 'tableau'; index: number; card: number };
export type Target = { pile: 'foundation'; index: number } | { pile: 'tableau'; index: number };

export const SOLITAIRE_SESSION_STORAGE_KEY = 'blast-arcade-solitaire-session-v1';
const MAX_UNDO = 300;

export const isRed = (card: Card): boolean => card.suit === 1 || card.suit === 2;

interface SolitaireState {
  stock: Card[];
  waste: Card[];
  foundations: Card[][];
  tableau: Card[][];
  moves: number;
}

const cloneState = (state: SolitaireState): SolitaireState => JSON.parse(JSON.stringify(state));

/**
 * Positions the dead-end check may visit before assuming the deal is still
 * open. In random play every real dead end showed up within 1,000 positions;
 * the check averages about a millisecond per move and stays under a tenth of
 * a second when it hits the cap.
 */
const STUCK_SEARCH_LIMIT = 2_000;

/**
 * True when no sequence of moves can ever turn a face-down card over or put
 * one more card on the foundations - so the deal can no longer be won. It
 * walks every position reachable without such progress (stock cycles, runs
 * shuffled between columns, cards taken back off the foundations). If that
 * space is too big to finish, it answers false: better to let a player carry
 * on than to end a game that could still be won.
 */
export function isDealStuck(state: Pick<SolitaireState, 'stock' | 'waste' | 'foundations' | 'tableau'>, drawCount: 1 | 3, limit = STUCK_SEARCH_LIMIT): boolean {
  const code = (card: Card): number => card.suit * 13 + card.rank - 1;
  const suitOf = (card: number): number => Math.floor(card / 13);
  const rankOf = (card: number): number => (card % 13) + 1;
  const red = (card: number): boolean => suitOf(card) === 1 || suitOf(card) === 2;
  // Any flip ends the search as progress, so hidden cards only matter as a count.
  const hidden = state.tableau.map(pile => pile.filter(card => !card.up).length);
  const found = [0, 0, 0, 0];
  for (const pile of state.foundations) if (pile.length) found[pile[0].suit] = pile.length;
  const home = found.reduce((sum, count) => sum + count, 0);
  if (home === 52) return false;

  interface Position { stock: number[]; waste: number[]; found: number[]; cols: number[][] }
  const origin: Position = {
    stock: state.stock.map(code), waste: state.waste.map(code), found,
    cols: state.tableau.map(pile => pile.filter(card => card.up).map(code)),
  };
  const key = (p: Position): string => `${p.stock}/${p.waste}/${p.found}/${p.cols.join(';')}`;
  const seen = new Set<string>([key(origin)]);
  const todo: Position[] = [origin];
  const fitsColumn = (card: number, cols: number[][], column: number): boolean => {
    const top = cols[column][cols[column].length - 1];
    if (top === undefined) return hidden[column] === 0 && rankOf(card) === 13;
    return red(top) !== red(card) && rankOf(top) === rankOf(card) + 1;
  };

  while (todo.length) {
    const p = todo.pop()!;
    const next: Position[] = [];
    // Draw, or turn the waste back over.
    if (p.stock.length) {
      const n = Math.min(drawCount, p.stock.length);
      next.push({ ...p, stock: p.stock.slice(0, -n), waste: [...p.waste, ...p.stock.slice(-n).reverse()] });
    } else if (p.waste.length) {
      next.push({ ...p, stock: [...p.waste].reverse(), waste: [] });
    }
    const homeNow = p.found.reduce((sum, count) => sum + count, 0);
    const raise = (card: number): number[] => p.found.map((count, suit) => (suit === suitOf(card) ? count + 1 : count));
    // The waste top: up to the foundations, or onto a column.
    if (p.waste.length) {
      const card = p.waste[p.waste.length - 1];
      if (p.found[suitOf(card)] === rankOf(card) - 1) {
        if (homeNow + 1 > home) return false;
        next.push({ ...p, waste: p.waste.slice(0, -1), found: raise(card) });
      }
      for (let column = 0; column < 7; column++) {
        if (!fitsColumn(card, p.cols, column)) continue;
        const cols = p.cols.map((col, i) => (i === column ? [...col, card] : col));
        next.push({ ...p, waste: p.waste.slice(0, -1), cols });
      }
    }
    for (let from = 0; from < 7; from++) {
      const col = p.cols[from];
      if (!col.length) continue;
      // A column's top card up to the foundations.
      const top = col[col.length - 1];
      if (p.found[suitOf(top)] === rankOf(top) - 1) {
        if (homeNow + 1 > home || (col.length === 1 && hidden[from] > 0)) return false;
        next.push({ ...p, found: raise(top), cols: p.cols.map((other, i) => (i === from ? col.slice(0, -1) : other)) });
      }
      // Any face-up run onto another column.
      for (let start = 0; start < col.length; start++) {
        for (let to = 0; to < 7; to++) {
          if (to === from || !fitsColumn(col[start], p.cols, to)) continue;
          if (start === 0 && hidden[from] > 0) return false; // uncovers a hidden card
          if (start === 0 && !p.cols[to].length) continue; // a whole column into an empty one changes nothing
          const cols = p.cols.map((other, i) => (i === from ? col.slice(0, start) : i === to ? [...other, ...col.slice(start)] : other));
          next.push({ ...p, cols });
        }
      }
    }
    // A foundation card back down onto a column, to make room for something else.
    for (let suit = 0; suit < 4; suit++) {
      if (!p.found[suit]) continue;
      const card = suit * 13 + p.found[suit] - 1;
      for (let column = 0; column < 7; column++) {
        if (!fitsColumn(card, p.cols, column)) continue;
        const cols = p.cols.map((col, i) => (i === column ? [...col, card] : col));
        next.push({ ...p, found: p.found.map((count, i) => (i === suit ? count - 1 : count)), cols });
      }
    }
    for (const position of next) {
      const id = key(position);
      if (seen.has(id)) continue;
      if (seen.size >= limit) return false;
      seen.add(id);
      todo.push(position);
    }
  }
  return true;
}

export class SolitaireGame {
  stock: Card[] = [];
  waste: Card[] = [];
  foundations: Card[][] = [[], [], [], []];
  tableau: Card[][] = [[], [], [], [], [], [], []];
  drawCount: 1 | 3 = 1;
  moves = 0;
  /** 'stuck' means no sequence of moves can win this deal any more. */
  phase: 'playing' | 'won' | 'stuck' = 'playing';
  startedAt = 0;
  finishedAt = 0;
  private history: SolitaireState[] = [];

  constructor(random: () => number = Math.random, drawCount: 1 | 3 = 1) {
    this.deal(random, drawCount);
  }

  deal(random: () => number = Math.random, drawCount: 1 | 3 = this.drawCount): void {
    const deck: Card[] = [];
    for (let suit = 0; suit < 4; suit++) for (let rank = 1; rank <= 13; rank++) deck.push({ suit: suit as Suit, rank, up: false });
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    this.tableau = [[], [], [], [], [], [], []];
    for (let column = 0; column < 7; column++) {
      for (let row = 0; row <= column; row++) this.tableau[column].push(deck.pop()!);
      this.tableau[column][column].up = true;
    }
    this.stock = deck;
    this.waste = [];
    this.foundations = [[], [], [], []];
    this.drawCount = drawCount;
    this.moves = 0;
    this.phase = 'playing';
    this.startedAt = 0;
    this.finishedAt = 0;
    this.history = [];
  }

  /** Turns cards from the stock, or flips the waste back over once the stock runs out. */
  draw(now: number = Date.now()): boolean {
    if (this.phase !== 'playing' || (!this.stock.length && !this.waste.length)) return false;
    this.remember(now);
    if (this.stock.length) {
      for (let i = 0; i < this.drawCount && this.stock.length; i++) {
        const card = this.stock.pop()!;
        card.up = true;
        this.waste.push(card);
      }
    } else {
      this.stock = this.waste.reverse().map(card => ({ ...card, up: false }));
      this.waste = [];
    }
    this.moves += 1;
    this.checkStuck(now);
    return true;
  }

  canPlaceOnFoundation(card: Card, index: number): boolean {
    const pile = this.foundations[index];
    const top = pile[pile.length - 1];
    return top ? top.suit === card.suit && top.rank === card.rank - 1 : card.rank === 1;
  }

  canPlaceOnTableau(card: Card, index: number): boolean {
    const pile = this.tableau[index];
    const top = pile[pile.length - 1];
    if (!top) return card.rank === 13;
    return top.up && isRed(top) !== isRed(card) && top.rank === card.rank + 1;
  }

  /** The cards a source would lift, or none if it cannot be picked up. */
  lift(source: Source): Card[] {
    if (source.pile === 'waste') return this.waste.length ? [this.waste[this.waste.length - 1]] : [];
    if (source.pile === 'foundation') {
      const pile = this.foundations[source.index];
      return pile.length ? [pile[pile.length - 1]] : [];
    }
    const pile = this.tableau[source.index];
    const card = pile[source.card];
    return card?.up ? pile.slice(source.card) : [];
  }

  canMove(source: Source, target: Target): boolean {
    if (this.phase !== 'playing') return false;
    const cards = this.lift(source);
    if (!cards.length) return false;
    if (target.pile === 'foundation') {
      if (cards.length !== 1 || source.pile === 'foundation') return false;
      return this.canPlaceOnFoundation(cards[0], target.index);
    }
    if (source.pile === 'tableau' && source.index === target.index) return false;
    return this.canPlaceOnTableau(cards[0], target.index);
  }

  move(source: Source, target: Target, now: number = Date.now()): boolean {
    if (!this.canMove(source, target)) return false;
    this.remember(now);
    const count = this.lift(source).length;
    const from = source.pile === 'waste' ? this.waste
      : source.pile === 'foundation' ? this.foundations[source.index] : this.tableau[source.index];
    const cards = from.splice(from.length - count, count);
    const to = target.pile === 'foundation' ? this.foundations[target.index] : this.tableau[target.index];
    to.push(...cards);
    // Uncovering a face-down card turns it over as part of the same move.
    if (source.pile === 'tableau') {
      const newTop = from[from.length - 1];
      if (newTop && !newTop.up) newTop.up = true;
    }
    this.moves += 1;
    this.checkWin(now);
    this.checkStuck(now);
    return true;
  }

  /** The move a double-tap makes: foundation first, then the first tableau column that fits. */
  bestTarget(source: Source): Target | null {
    for (let index = 0; index < 4; index++) {
      if (this.canMove(source, { pile: 'foundation', index })) return { pile: 'foundation', index };
    }
    for (let index = 0; index < 7; index++) {
      if (this.canMove(source, { pile: 'tableau', index })) return { pile: 'tableau', index };
    }
    return null;
  }

  /** Sends every card that can go up to the foundations; returns how many moved. */
  autoFoundation(now: number = Date.now()): number {
    let moved = 0;
    let progress = true;
    while (progress && this.phase === 'playing') {
      progress = false;
      const sources: Source[] = [{ pile: 'waste' }, ...this.tableau.map((pile, index) => ({ pile: 'tableau' as const, index, card: pile.length - 1 }))];
      for (const source of sources) {
        for (let index = 0; index < 4; index++) {
          if (this.move(source, { pile: 'foundation', index }, now)) { moved++; progress = true; break; }
        }
      }
    }
    return moved;
  }

  /** Once nothing is hidden and the stock is spent, the rest is a formality. */
  canAutoComplete(): boolean {
    return this.phase === 'playing' && !this.stock.length && !this.waste.length && this.tableau.every(pile => pile.every(card => card.up));
  }

  /** Only during play: once a deal is won or dead it has ended and its result is recorded. */
  undo(): boolean {
    if (this.phase !== 'playing') return false;
    const previous = this.history.pop();
    if (!previous) return false;
    Object.assign(this, cloneState(previous));
    return true;
  }

  canUndo(): boolean {
    return this.history.length > 0 && this.phase === 'playing';
  }

  elapsed(now: number): number {
    if (!this.startedAt) return 0;
    return Math.floor(((this.finishedAt || now) - this.startedAt) / 1000);
  }

  score(now: number = Date.now()): number {
    if (this.phase !== 'won') return 0;
    const bonus = this.drawCount === 3 ? 1_500 : 0;
    return Math.max(500, 6_000 + bonus - this.moves * 8 - this.elapsed(now) * 2);
  }

  statusText(now: number = Date.now()): string {
    if (this.phase === 'won') return `Solved in ${this.moves} moves and ${this.elapsed(now)}s - ${this.score(now)} points!`;
    const home = this.foundations.reduce((sum, pile) => sum + pile.length, 0);
    if (this.phase === 'stuck') return 'No moves left - this deal can no longer be won. Deal again.';
    if (this.canAutoComplete()) return 'Everything is face up - finish it off.';
    return `${home} of 52 cards home · ${this.moves} moves.`;
  }

  /** Everything needed to resume an unfinished game. */
  session(now: number = Date.now()): Record<string, unknown> | null {
    if (this.phase !== 'playing' || this.moves === 0) return null;
    return {
      stock: this.stock, waste: this.waste, foundations: this.foundations, tableau: this.tableau,
      moves: this.moves, drawCount: this.drawCount, elapsedMs: this.startedAt ? now - this.startedAt : 0,
    };
  }

  restore(value: unknown, now: number = Date.now()): boolean {
    const state = normalizeSolitaireSession(value);
    if (!state) return false;
    this.stock = state.stock; this.waste = state.waste;
    this.foundations = state.foundations; this.tableau = state.tableau;
    this.moves = state.moves; this.drawCount = state.drawCount;
    this.phase = 'playing';
    this.startedAt = now - state.elapsedMs;
    this.finishedAt = 0;
    this.history = [];
    this.checkStuck(now);
    return true;
  }

  private remember(now: number): void {
    if (!this.startedAt) this.startedAt = now;
    this.history.push(cloneState({ stock: this.stock, waste: this.waste, foundations: this.foundations, tableau: this.tableau, moves: this.moves }));
    if (this.history.length > MAX_UNDO) this.history.shift();
  }

  private checkStuck(now: number): void {
    if (this.phase !== 'playing' || !isDealStuck(this, this.drawCount)) return;
    this.phase = 'stuck';
    this.finishedAt = now;
  }

  private checkWin(now: number): void {
    if (this.foundations.every(pile => pile.length === 13)) {
      this.phase = 'won';
      this.finishedAt = now;
    }
  }
}

function isCard(value: unknown): value is Card {
  const card = value as Card;
  return Boolean(card) && Number.isInteger(card.suit) && card.suit >= 0 && card.suit <= 3
    && Number.isInteger(card.rank) && card.rank >= 1 && card.rank <= 13 && typeof card.up === 'boolean';
}

/** Accepts a save only if it holds exactly one full deck laid out in legal piles. */
export function normalizeSolitaireSession(value: unknown): (SolitaireState & { drawCount: 1 | 3; elapsedMs: number }) | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const piles = (list: unknown, count: number): Card[][] | null =>
    Array.isArray(list) && list.length === count && list.every(pile => Array.isArray(pile) && pile.every(isCard)) ? list as Card[][] : null;
  const stock = Array.isArray(raw.stock) && raw.stock.every(isCard) ? raw.stock as Card[] : null;
  const waste = Array.isArray(raw.waste) && raw.waste.every(isCard) ? raw.waste as Card[] : null;
  const foundations = piles(raw.foundations, 4);
  const tableau = piles(raw.tableau, 7);
  if (!stock || !waste || !foundations || !tableau) return null;
  const all = [...stock, ...waste, ...foundations.flat(), ...tableau.flat()];
  if (all.length !== 52 || new Set(all.map(card => card.suit * 13 + card.rank)).size !== 52) return null;
  // Foundations must be built up in suit from the ace.
  if (!foundations.every(pile => pile.every((card, i) => card.rank === i + 1 && card.suit === pile[0].suit))) return null;
  const moves = Number(raw.moves);
  const elapsedMs = Number(raw.elapsedMs);
  return {
    stock: stock.map(card => ({ ...card, up: false })),
    waste: waste.map(card => ({ ...card, up: true })),
    foundations, tableau,
    moves: Number.isInteger(moves) && moves >= 0 ? moves : 0,
    drawCount: raw.drawCount === 3 ? 3 : 1,
    elapsedMs: Number.isFinite(elapsedMs) && elapsedMs >= 0 ? elapsedMs : 0,
  };
}

// ---------------------------------------------------------------- layout

export const TABLE_WIDTH = 724;
export const TABLE_HEIGHT = 760;
export const CARD_W = 92;
export const CARD_H = 128;
const GAP = 10;
const TOP = 12;
const TABLEAU_TOP = TOP + CARD_H + 22;
const DOWN_STEP = 14;
const UP_STEP = 30;

export const columnX = (column: number): number => GAP + column * (CARD_W + GAP);

/** Where the stock, waste and foundations sit across the top row. */
export interface TopRow { stockX: number; wasteX: number; foundationX: readonly number[]; deckSide: 'left' | 'right' }

/**
 * Desktop keeps the classic stock-left row. On a phone the stock follows the
 * joystick side from Settings, so the thumb that draws is the one the player chose.
 */
export function topRowLayout(mobile: boolean, layout: ArcadeTouchLayout): TopRow {
  if (mobile && layout === 'joystick-right') {
    return { stockX: columnX(6), wasteX: columnX(5), foundationX: [0, 1, 2, 3].map(columnX), deckSide: 'right' };
  }
  return { stockX: columnX(0), wasteX: columnX(1), foundationX: [3, 4, 5, 6].map(columnX), deckSide: 'left' };
}

/** Draw-three fans away from the stock, so the playable top card always sits on the waste spot or beyond it. */
export function wasteFanX(row: TopRow, index: number, count: number): number {
  return row.deckSide === 'left' ? row.wasteX + index * 18 : row.wasteX - (count - 1 - index) * 18;
}

export interface CardSpot { x: number; y: number; source: Source; card: Card }

/**
 * Where every visible tableau card sits. Long columns tighten their spacing
 * to stay on the table, and both drawing and tap-testing read this one layout.
 */
export function tableauSpots(tableau: readonly Card[][]): CardSpot[] {
  const spots: CardSpot[] = [];
  tableau.forEach((pile, column) => {
    if (!pile.length) return;
    const downs = pile.filter(card => !card.up).length;
    const ups = pile.length - downs;
    const room = TABLE_HEIGHT - TABLEAU_TOP - CARD_H - 8;
    const natural = downs * DOWN_STEP + Math.max(0, ups - 1) * UP_STEP;
    const squeeze = natural > room ? room / natural : 1;
    let y = TABLEAU_TOP;
    pile.forEach((card, index) => {
      spots.push({ x: columnX(column), y, source: { pile: 'tableau', index: column, card: index }, card });
      y += (card.up ? UP_STEP : DOWN_STEP) * squeeze;
    });
  });
  return spots;
}

/**
 * Where a dragged card lands: the foundation or tableau column under the
 * card's centre. Columns take a drop anywhere along their length, which is
 * kinder to thumbs than aiming at the last card.
 */
export function dropTargetAt(row: TopRow, x: number, y: number): Target | null {
  if (y >= TOP - CARD_H / 2 && y <= TOP + CARD_H + 11) {
    const index = row.foundationX.findIndex(fx => x >= fx - GAP / 2 && x <= fx + CARD_W + GAP / 2);
    return index >= 0 ? { pile: 'foundation', index } : null;
  }
  if (y < TABLEAU_TOP - 11) return null;
  for (let column = 0; column < 7; column++) {
    if (x >= columnX(column) - GAP / 2 && x <= columnX(column) + CARD_W + GAP / 2) return { pile: 'tableau', index: column };
  }
  return null;
}

/** A press only becomes a drag once it moves this far, so a slightly shaky tap is still a tap. */
export const DRAG_THRESHOLD = 12;

const RANK_NAMES = ['', 'Ace', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'Jack', 'Queen', 'King'] as const;
const SUIT_NAMES = ['spades', 'hearts', 'diamonds', 'clubs'] as const;

/** "Queen of hearts": a card as a screen reader says it. */
export const cardName = (card: Card): string => `${RANK_NAMES[card.rank]} of ${SUIT_NAMES[card.suit]}`;

/**
 * Every place a player can act on, laid over the table for screen readers
 * and the keyboard: the stock, the waste's top card, the four foundations,
 * each face-up tableau card (on the strip of it that shows) and each empty
 * column. Face-down cards are counted, never named.
 */
export function solitaireSpots(
  state: Pick<SolitaireGame, 'stock' | 'waste' | 'foundations' | 'tableau' | 'drawCount'>,
  row: TopRow,
  selected: Source | null,
): BoardSpot[] {
  const spots: BoardSpot[] = [];
  const stockLabel = state.stock.length ? `Stock: ${state.stock.length} ${state.stock.length === 1 ? 'card' : 'cards'}`
    : state.waste.length ? 'Stock: empty, turn the waste over' : 'Stock: empty';
  spots.push({ key: 'stock', x: row.stockX, y: TOP, width: CARD_W, height: CARD_H, label: stockLabel });
  const fan = state.waste.slice(-(state.drawCount === 3 ? 3 : 1));
  const wasteTop = state.waste[state.waste.length - 1];
  spots.push({
    key: 'waste',
    x: fan.length ? wasteFanX(row, fan.length - 1, fan.length) : row.wasteX,
    y: TOP, width: CARD_W, height: CARD_H,
    label: wasteTop ? `Waste: ${cardName(wasteTop)}` : 'Waste: empty',
    pressed: wasteTop ? selected?.pile === 'waste' : undefined,
  });
  state.foundations.forEach((pile, index) => {
    const top = pile[pile.length - 1];
    spots.push({
      key: `foundation-${index}`,
      x: row.foundationX[index], y: TOP, width: CARD_W, height: CARD_H,
      label: `Foundation ${index + 1}: ${top ? cardName(top) : 'empty'}`,
      pressed: top ? selected?.pile === 'foundation' && selected.index === index : undefined,
    });
  });
  // The top row reads left to right whichever side the stock is on.
  spots.sort((a, b) => a.x - b.x);
  const held = selected?.pile === 'tableau' ? selected : null;
  const laid = tableauSpots(state.tableau);
  for (let column = 0; column < 7; column++) {
    const pile = state.tableau[column];
    if (!pile.length) {
      spots.push({ key: `column-${column}`, x: columnX(column), y: TABLEAU_TOP, width: CARD_W, height: CARD_H, label: `Column ${column + 1}: empty` });
      continue;
    }
    const inColumn = laid.filter(spot => (spot.source as { index: number }).index === column);
    const facedown = pile.filter(card => !card.up).length;
    inColumn.forEach((spot, i) => {
      if (!spot.card.up) return;
      const index = (spot.source as { card: number }).card;
      // Only the strip that shows is this card's; the last card shows whole.
      const next = inColumn[i + 1];
      const height = next ? next.y - spot.y : CARD_H;
      const under = index === facedown && facedown ? `, covering ${facedown} face-down ${facedown === 1 ? 'card' : 'cards'}` : '';
      spots.push({
        key: `column-${column}-${index}`,
        x: spot.x, y: spot.y, width: CARD_W, height,
        label: `Column ${column + 1}: ${cardName(spot.card)}${under}`,
        pressed: Boolean(held && held.index === column && index >= held.card),
      });
    });
  }
  return spots;
}

export function initSolitaire(): void {
  if (typeof document === 'undefined') return;
  const canvas = document.getElementById('solitaireCanvas') as HTMLCanvasElement | null;
  const context = canvas?.getContext('2d');
  const view = document.getElementById('solitaireView');
  if (!canvas || !context || !view) return;
  const table = canvas;
  const ctx = context;
  const solitaireView = view;
  canvas.width = TABLE_WIDTH;
  canvas.height = TABLE_HEIGHT;

  const game = new SolitaireGame();
  const status = document.getElementById('solitaireStatus');
  const movesEl = document.getElementById('solitaireMoves');
  const timeEl = document.getElementById('solitaireTime');
  const undoButton = document.getElementById('solitaireUndoButton') as HTMLButtonElement | null;
  const autoButton = document.getElementById('solitaireAutoButton') as HTMLButtonElement | null;
  const drawSelect = document.getElementById('solitaireDraw') as HTMLSelectElement | null;
  const resultReporter = new ArcadeResultReporter('solitaire');
  let selected: Source | null = null;
  let resumed = false;
  // A press on a card that can be lifted; it turns into a drag once it moves far enough.
  let press: { id: number; source: Source; startX: number; startY: number; grabX: number; grabY: number; x: number; y: number; dragging: boolean } | null = null;
  const mobileQuery = window.matchMedia('(max-width: 760px), (pointer: coarse)');
  let touchLayout = loadArcadeTouchLayout();
  let row = topRowLayout(mobileQuery.matches, touchLayout);
  const relayout = (): void => { row = topRowLayout(mobileQuery.matches, touchLayout); syncAccess(); };
  mobileQuery.addEventListener?.('change', relayout);
  window.addEventListener(ARCADE_TOUCH_LAYOUT_CHANGE_EVENT, event => {
    touchLayout = normalizeArcadeTouchLayout((event as CustomEvent<{ layout: string }>).detail?.layout);
    relayout();
  });

  const access = new AccessibleBoard({
    canvas: table,
    label: 'Solitaire table',
    activate: key => activateSpot(key),
  });
  let spots: BoardSpot[] = [];

  function syncAccess(): void {
    spots = solitaireSpots(game, row, selected);
    access.update(spots);
  }

  /** Enter on a card or pile does what a tap there does, then says what happened. */
  function activateSpot(key: string): void {
    const spot = spots.find(item => item.key === key);
    if (!spot || isArcadeSessionPaused('solitaire')) return;
    const moves = game.moves;
    // Tap the middle of the part of the card that shows.
    tap(spot.x + spot.width / 2, spot.y + Math.min(spot.height, CARD_H) / 2);
    const top = game.waste[game.waste.length - 1];
    if (game.phase !== 'playing') access.announce(game.statusText());
    else if (key === 'stock') access.announce(top && game.moves !== moves ? `Drew ${cardName(top)}.` : 'Nothing to draw.');
    else if (selected) {
      const lifted = game.lift(selected);
      access.announce(`Picked up ${lifted.map(cardName).join(', ')}. Choose where it goes.`);
    } else if (game.moves !== moves) access.announce(`Moved. ${game.statusText()}`);
    else access.announce('No move there.');
  }

  function persist(): void {
    try {
      const session = game.session();
      if (session) localStorage.setItem(SOLITAIRE_SESSION_STORAGE_KEY, JSON.stringify(session));
      else localStorage.removeItem(SOLITAIRE_SESSION_STORAGE_KEY);
    } catch { /* play continues; it just cannot be resumed */ }
  }

  function newDeal(): void {
    game.deal(Math.random, drawSelect?.value === '3' ? 3 : 1);
    selected = null;
    resumed = false;
    persist();
    syncUi();
  }

  function syncUi(): void {
    const now = Date.now();
    if (status) status.textContent = resumed && game.phase === 'playing' ? 'Saved game restored - carry on.' : game.statusText(now);
    if (movesEl) movesEl.textContent = String(game.moves);
    if (timeEl) timeEl.textContent = String(game.elapsed(now));
    if (undoButton) undoButton.disabled = !game.canUndo();
    if (autoButton) autoButton.textContent = game.canAutoComplete() ? 'Finish' : 'Auto-play';
    resultReporter.report(game.phase !== 'playing', { outcome: game.phase === 'won' ? 'complete' : 'loss', score: game.score(now) });
    syncAccess();
  }

  function after(): void {
    resumed = false;
    if (game.canAutoComplete()) game.autoFoundation();
    persist();
    syncUi();
  }

  const sameSource = (a: Source | null, b: Source): boolean => JSON.stringify(a) === JSON.stringify(b);

  /** A tap either picks a card up, drops the held card, or sends a re-tapped card to its best spot. */
  function tap(x: number, y: number): void {
    if (isArcadeSessionPaused('solitaire') || game.phase !== 'playing') return;
    // Stock
    if (x >= row.stockX && x <= row.stockX + CARD_W && y >= TOP && y <= TOP + CARD_H) {
      selected = null;
      game.draw();
      after();
      return;
    }
    const hit = hitTest(x, y);
    if (!hit) { selected = null; syncUi(); return; }
    if (selected) {
      if (hit.source && sameSource(selected, hit.source)) {
        const target = game.bestTarget(selected);
        if (target) game.move(selected, target);
        selected = null;
        after();
        return;
      }
      if (hit.target && game.move(selected, hit.target)) { selected = null; after(); return; }
    }
    // Pick up something that can actually be lifted; otherwise let go.
    selected = hit.source && game.lift(hit.source).length ? hit.source : null;
    syncUi();
  }

  /** What a tap at (x, y) points at: a card to lift, a pile to drop on, or both. */
  function hitTest(x: number, y: number): { source: Source | null; target: Target | null } | null {
    // Waste
    const wasteLeft = row.deckSide === 'left' ? row.wasteX : row.wasteX - 36;
    if (x >= wasteLeft && x <= wasteLeft + CARD_W + 36 && y >= TOP && y <= TOP + CARD_H && game.waste.length) {
      return { source: { pile: 'waste' }, target: null };
    }
    // Foundations
    for (let index = 0; index < 4; index++) {
      const fx = row.foundationX[index];
      if (x >= fx && x <= fx + CARD_W && y >= TOP && y <= TOP + CARD_H) {
        return { source: { pile: 'foundation', index }, target: { pile: 'foundation', index } };
      }
    }
    // Tableau: the last card whose top edge is above the tap wins, since later cards overlap earlier ones.
    const spots = tableauSpots(game.tableau);
    for (let i = spots.length - 1; i >= 0; i--) {
      const spot = spots[i];
      if (x >= spot.x && x <= spot.x + CARD_W && y >= spot.y && y <= spot.y + CARD_H) {
        const column = (spot.source as { index: number }).index;
        return { source: spot.source, target: { pile: 'tableau', index: column } };
      }
    }
    // An empty column still takes a king.
    for (let column = 0; column < 7; column++) {
      if (!game.tableau[column].length && x >= columnX(column) && x <= columnX(column) + CARD_W && y >= TABLEAU_TOP && y <= TABLEAU_TOP + CARD_H) {
        // Nothing to pick up here - it is only somewhere to drop a king.
        return { source: null, target: { pile: 'tableau', index: column } };
      }
    }
    return null;
  }

  function drawCard(card: Card | null, x: number, y: number, highlight = false): void {
    ctx.beginPath();
    ctx.roundRect(x, y, CARD_W, CARD_H, 9);
    if (!card) {
      ctx.strokeStyle = 'rgba(255,255,255,.18)';
      ctx.lineWidth = 2;
      ctx.stroke();
      return;
    }
    if (!card.up) {
      ctx.fillStyle = '#1f7a52';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.35)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.14)';
      ctx.strokeRect(x + 8, y + 8, CARD_W - 16, CARD_H - 16);
      return;
    }
    ctx.fillStyle = '#f7f4ec';
    ctx.fill();
    ctx.strokeStyle = highlight ? '#ffc857' : 'rgba(0,0,0,.25)';
    ctx.lineWidth = highlight ? 4 : 1.5;
    ctx.stroke();
    ctx.fillStyle = isRed(card) ? '#d83c51' : '#18212b';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.font = '800 26px system-ui, sans-serif';
    ctx.fillText(RANK_LABELS[card.rank], x + 8, y + 7);
    ctx.font = '26px system-ui, sans-serif';
    ctx.fillText(SUIT_SYMBOLS[card.suit], x + 8, y + 35);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '48px system-ui, sans-serif';
    ctx.fillText(SUIT_SYMBOLS[card.suit], x + CARD_W / 2 + 8, y + CARD_H / 2 + 16);
  }

  function render(): void {
    ctx.fillStyle = '#0e3b2c';
    ctx.fillRect(0, 0, table.width, table.height);
    const isSelected = (source: Source): boolean => sameSource(selected, source);
    const dragged = press?.dragging ? press.source : null;
    const hidden = (source: Source): boolean => Boolean(dragged && (
      dragged.pile === 'tableau'
        ? source.pile === 'tableau' && source.index === dragged.index && source.card >= dragged.card
        : sameSource(dragged, source)));

    drawCard(game.stock.length ? { suit: 0, rank: 1, up: false } : null, row.stockX, TOP);
    if (!game.stock.length && game.waste.length) {
      ctx.fillStyle = 'rgba(255,255,255,.4)';
      ctx.font = '700 40px system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('↻', row.stockX + CARD_W / 2, TOP + CARD_H / 2);
    }
    // Draw-three shows the last three waste cards fanned, only the top one playable.
    const wasteHidden = hidden({ pile: 'waste' });
    const fan = game.waste.slice(-(game.drawCount === 3 ? 3 : 1) - (wasteHidden ? 1 : 0), wasteHidden ? -1 : undefined);
    if (!fan.length) drawCard(null, row.wasteX, TOP);
    fan.forEach((card, i) => drawCard(card, wasteFanX(row, i, fan.length), TOP, i === fan.length - 1 && isSelected({ pile: 'waste' })));
    game.foundations.forEach((pile, index) => {
      const top = pile[pile.length - (hidden({ pile: 'foundation', index }) ? 2 : 1)] ?? null;
      drawCard(top, row.foundationX[index], TOP, isSelected({ pile: 'foundation', index }));
      if (!top) {
        ctx.fillStyle = 'rgba(255,255,255,.18)';
        ctx.font = '40px system-ui, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(SUIT_SYMBOLS[index], row.foundationX[index] + CARD_W / 2, TOP + CARD_H / 2);
      }
    });
    for (let column = 0; column < 7; column++) if (!game.tableau[column].length) drawCard(null, columnX(column), TABLEAU_TOP);
    const held = selected?.pile === 'tableau' ? selected : null;
    for (const spot of tableauSpots(game.tableau)) {
      if (hidden(spot.source)) continue;
      const source = spot.source as { index: number; card: number };
      const lifted = Boolean(held && held.index === source.index && source.card >= held.card);
      drawCard(spot.card, spot.x, spot.y, lifted);
    }
    // The dragged cards ride on top of everything, under the finger where they were grabbed.
    if (dragged && press) {
      game.lift(dragged).forEach((card, i) => drawCard(card, press!.x - press!.grabX, press!.y - press!.grabY + i * UP_STEP, true));
    }
  }

  /** Where a dragged card is drawn, and which card spot it was grabbed from. */
  function cardOrigin(source: Source): { x: number; y: number } {
    if (source.pile === 'waste') {
      const count = Math.min(game.waste.length, game.drawCount === 3 ? 3 : 1);
      return { x: wasteFanX(row, count - 1, count), y: TOP };
    }
    if (source.pile === 'foundation') return { x: row.foundationX[source.index], y: TOP };
    const spot = tableauSpots(game.tableau).find(item => sameSource(item.source, source));
    return spot ? { x: spot.x, y: spot.y } : { x: columnX(source.index), y: TABLEAU_TOP };
  }

  const tablePoint = (event: PointerEvent): { x: number; y: number } => {
    const bounds = table.getBoundingClientRect();
    return { x: ((event.clientX - bounds.left) / bounds.width) * TABLE_WIDTH, y: ((event.clientY - bounds.top) / bounds.height) * TABLE_HEIGHT };
  };

  // Tap to pick up and tap to drop still works; dragging a card is the shortcut.
  table.addEventListener('pointerdown', event => {
    press = null;
    if (isArcadeSessionPaused('solitaire') || game.phase !== 'playing' || !event.isPrimary) return;
    const { x, y } = tablePoint(event);
    const source = hitTest(x, y)?.source;
    if (!source || !game.lift(source).length) return;
    const origin = cardOrigin(source);
    press = { id: event.pointerId, source, startX: x, startY: y, grabX: x - origin.x, grabY: y - origin.y, x, y, dragging: false };
  });
  table.addEventListener('pointermove', event => {
    if (!press || event.pointerId !== press.id) return;
    const { x, y } = tablePoint(event);
    press.x = x;
    press.y = y;
    const scale = TABLE_WIDTH / (table.getBoundingClientRect().width || TABLE_WIDTH);
    if (!press.dragging && Math.hypot(x - press.startX, y - press.startY) >= DRAG_THRESHOLD * scale) {
      press.dragging = true;
      selected = null;
      capturePointer(table, event.pointerId);
    }
  });
  // While a card is pressed the finger moves the card, not the page.
  table.addEventListener('touchmove', event => { if (press) event.preventDefault(); }, { passive: false });
  table.addEventListener('pointercancel', () => { press = null; });
  table.addEventListener('pointerup', event => {
    const held = press?.id === event.pointerId ? press : null;
    press = null;
    const { x, y } = tablePoint(event);
    if (!held?.dragging) { tap(x, y); return; }
    // Aim with the centre of the dragged card, not the fingertip, which sits wherever the card was grabbed.
    const target = dropTargetAt(row, x - held.grabX + CARD_W / 2, y - held.grabY + CARD_H / 2);
    selected = null;
    if (target && game.move(held.source, target)) after();
    else syncUi();
  });
  window.addEventListener('keydown', event => {
    if (solitaireView.classList.contains('view-hidden') || event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
    if (event.code === 'Space' && !event.repeat) { event.preventDefault(); selected = null; game.draw(); after(); }
    else if ((event.key === 'z' && (event.ctrlKey || event.metaKey)) || event.key === 'u') { event.preventDefault(); selected = null; game.undo(); persist(); syncUi(); }
    else if (event.key === 'a') { event.preventDefault(); selected = null; game.autoFoundation(); after(); }
  });
  undoButton?.addEventListener('click', () => { selected = null; game.undo(); persist(); syncUi(); });
  autoButton?.addEventListener('click', () => { selected = null; game.autoFoundation(); after(); });
  document.getElementById('solitaireNewButton')?.addEventListener('click', newDeal);
  drawSelect?.addEventListener('change', () => {
    try { localStorage.setItem('blast-arcade-solitaire-draw-v1', drawSelect.value); } catch { /* optional */ }
    newDeal();
  });

  try {
    const draw = localStorage.getItem('blast-arcade-solitaire-draw-v1');
    if (drawSelect && (draw === '1' || draw === '3')) drawSelect.value = draw;
    if (game.restore(JSON.parse(localStorage.getItem(SOLITAIRE_SESSION_STORAGE_KEY) ?? 'null'))) {
      resumed = true;
      if (drawSelect) drawSelect.value = String(game.drawCount);
    } else {
      game.deal(Math.random, drawSelect?.value === '3' ? 3 : 1);
    }
  } catch { /* a fresh deal is already on the table */ }
  window.addEventListener('pagehide', persist);

  registerArcadeSession({
    gameId: 'solitaire',
    view: solitaireView,
    mode: () => 'solo',
    isActive: () => game.phase === 'playing' && game.moves > 0,
    clearHeldInputs: () => { selected = null; press = null; },
    resumeCountdown: false,
  });

  let lastSecond = -1;
  let lastFrame = Date.now();
  function loop(): void {
    const now = Date.now();
    const away = solitaireView.classList.contains('view-hidden') || isArcadeSessionPaused('solitaire');
    // Time paused or spent elsewhere does not count against the clock.
    if (away && game.phase === 'playing' && game.startedAt) game.startedAt += now - lastFrame;
    lastFrame = now;
    if (!solitaireView.classList.contains('view-hidden')) {
      const second = game.elapsed(now);
      if (second !== lastSecond) { lastSecond = second; syncUi(); }
      render();
    }
    requestAnimationFrame(loop);
  }
  syncUi();
  requestAnimationFrame(loop);
}
