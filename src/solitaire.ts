import { ArcadeResultReporter } from './stats.js';
import { isArcadeSessionPaused, registerArcadeSession } from './session-control.js';

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

export class SolitaireGame {
  stock: Card[] = [];
  waste: Card[] = [];
  foundations: Card[][] = [[], [], [], []];
  tableau: Card[][] = [[], [], [], [], [], [], []];
  drawCount: 1 | 3 = 1;
  moves = 0;
  phase: 'playing' | 'won' = 'playing';
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

  undo(): boolean {
    const previous = this.history.pop();
    if (!previous || this.phase !== 'playing') return false;
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
    return true;
  }

  private remember(now: number): void {
    if (!this.startedAt) this.startedAt = now;
    this.history.push(cloneState({ stock: this.stock, waste: this.waste, foundations: this.foundations, tableau: this.tableau, moves: this.moves }));
    if (this.history.length > MAX_UNDO) this.history.shift();
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
    resultReporter.report(game.phase === 'won', { outcome: 'complete', score: game.score(now) });
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
    if (x >= columnX(0) && x <= columnX(0) + CARD_W && y >= TOP && y <= TOP + CARD_H) {
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
    const wasteX = columnX(1);
    if (x >= wasteX && x <= wasteX + CARD_W + 36 && y >= TOP && y <= TOP + CARD_H && game.waste.length) {
      return { source: { pile: 'waste' }, target: null };
    }
    // Foundations
    for (let index = 0; index < 4; index++) {
      const fx = columnX(3 + index);
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

    drawCard(game.stock.length ? { suit: 0, rank: 1, up: false } : null, columnX(0), TOP);
    if (!game.stock.length && game.waste.length) {
      ctx.fillStyle = 'rgba(255,255,255,.4)';
      ctx.font = '700 40px system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('↻', columnX(0) + CARD_W / 2, TOP + CARD_H / 2);
    }
    // Draw-three shows the last three waste cards fanned, only the top one playable.
    const fan = game.waste.slice(-(game.drawCount === 3 ? 3 : 1));
    if (!fan.length) drawCard(null, columnX(1), TOP);
    fan.forEach((card, i) => drawCard(card, columnX(1) + i * 18, TOP, i === fan.length - 1 && isSelected({ pile: 'waste' })));
    game.foundations.forEach((pile, index) => {
      const top = pile[pile.length - 1] ?? null;
      drawCard(top, columnX(3 + index), TOP, isSelected({ pile: 'foundation', index }));
      if (!top) {
        ctx.fillStyle = 'rgba(255,255,255,.18)';
        ctx.font = '40px system-ui, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(SUIT_SYMBOLS[index], columnX(3 + index) + CARD_W / 2, TOP + CARD_H / 2);
      }
    });
    for (let column = 0; column < 7; column++) if (!game.tableau[column].length) drawCard(null, columnX(column), TABLEAU_TOP);
    const held = selected?.pile === 'tableau' ? selected : null;
    for (const spot of tableauSpots(game.tableau)) {
      const source = spot.source as { index: number; card: number };
      const lifted = Boolean(held && held.index === source.index && source.card >= held.card);
      drawCard(spot.card, spot.x, spot.y, lifted);
    }
  }

  table.addEventListener('pointerup', event => {
    const bounds = table.getBoundingClientRect();
    tap(((event.clientX - bounds.left) / bounds.width) * TABLE_WIDTH, ((event.clientY - bounds.top) / bounds.height) * TABLE_HEIGHT);
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
    clearHeldInputs: () => { selected = null; },
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
