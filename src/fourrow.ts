import { GameRoomClient } from './game-room.js';
import { ArcadeResultReporter } from './stats.js';
import { isArcadeSessionPaused, registerArcadeSession } from './session-control.js';

export type FourPlayer = 1 | 2;
export type FourDisc = 0 | FourPlayer;
export type FourMode = 'bot' | 'duel';
export type FourBotLevel = 'easy' | 'normal' | 'hard';

export const FOUR_COLUMNS = 7;
export const FOUR_ROWS = 6;
const CELLS = FOUR_COLUMNS * FOUR_ROWS;
/** Centre-first ordering makes alpha-beta prune far more of the tree. */
const SEARCH_ORDER = [3, 2, 4, 1, 5, 0, 6];
const BOT_DEPTH: Record<FourBotLevel, number> = { easy: 2, normal: 4, hard: 6 };
const WIN = 100_000;

const other = (player: FourPlayer): FourPlayer => (player === 1 ? 2 : 1);

/** Row 0 is the top. Returns the cell a disc would land in, or -1 if full. */
export function landingCell(board: readonly FourDisc[], column: number): number {
  if (column < 0 || column >= FOUR_COLUMNS) return -1;
  for (let row = FOUR_ROWS - 1; row >= 0; row--) {
    const index = row * FOUR_COLUMNS + column;
    if (board[index] === 0) return index;
  }
  return -1;
}

/** The four-in-a-row through a cell, if its disc completes one. */
export function winningLine(board: readonly FourDisc[], index: number): number[] | null {
  const player = board[index];
  if (!player) return null;
  const row = Math.floor(index / FOUR_COLUMNS);
  const column = index % FOUR_COLUMNS;
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    const line = [index];
    for (const sign of [1, -1]) {
      let r = row + dr * sign;
      let c = column + dc * sign;
      while (r >= 0 && r < FOUR_ROWS && c >= 0 && c < FOUR_COLUMNS && board[r * FOUR_COLUMNS + c] === player) {
        line.push(r * FOUR_COLUMNS + c);
        r += dr * sign;
        c += dc * sign;
      }
    }
    if (line.length >= 4) return line.sort((a, b) => a - b);
  }
  return null;
}

function windowScore(a: FourDisc, b: FourDisc, c: FourDisc, d: FourDisc, me: FourPlayer): number {
  let mine = 0;
  let theirs = 0;
  for (const disc of [a, b, c, d]) {
    if (disc === me) mine++;
    else if (disc !== 0) theirs++;
  }
  if (mine && theirs) return 0;
  if (mine === 3) return 6;
  if (mine === 2) return 2;
  if (theirs === 3) return -5;
  if (theirs === 2) return -1;
  return 0;
}

/** Static evaluation from `me`'s point of view: open lines plus centre control. */
function evaluate(board: readonly FourDisc[], me: FourPlayer): number {
  let score = 0;
  for (let row = 0; row < FOUR_ROWS; row++) {
    const centre = board[row * FOUR_COLUMNS + 3];
    if (centre === me) score += 3;
    else if (centre !== 0) score -= 3;
  }
  const at = (r: number, c: number): FourDisc => board[r * FOUR_COLUMNS + c];
  for (let r = 0; r < FOUR_ROWS; r++) {
    for (let c = 0; c < FOUR_COLUMNS; c++) {
      if (c + 3 < FOUR_COLUMNS) score += windowScore(at(r, c), at(r, c + 1), at(r, c + 2), at(r, c + 3), me);
      if (r + 3 < FOUR_ROWS) score += windowScore(at(r, c), at(r + 1, c), at(r + 2, c), at(r + 3, c), me);
      if (r + 3 < FOUR_ROWS && c + 3 < FOUR_COLUMNS) score += windowScore(at(r, c), at(r + 1, c + 1), at(r + 2, c + 2), at(r + 3, c + 3), me);
      if (r + 3 < FOUR_ROWS && c - 3 >= 0) score += windowScore(at(r, c), at(r + 1, c - 1), at(r + 2, c - 2), at(r + 3, c - 3), me);
    }
  }
  return score;
}

function negamax(board: FourDisc[], depth: number, alpha: number, beta: number, player: FourPlayer, filled: number): number {
  if (filled === CELLS) return 0;
  if (depth === 0) return evaluate(board, player);
  let best = -Infinity;
  for (const column of SEARCH_ORDER) {
    const cell = landingCell(board, column);
    if (cell < 0) continue;
    board[cell] = player;
    // Winning sooner (more depth left) scores higher, so the bot takes the quick win.
    const value = winningLine(board, cell) ? WIN + depth : -negamax(board, depth - 1, -beta, -alpha, other(player), filled + 1);
    board[cell] = 0;
    if (value > best) best = value;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

/** Best column for `player`. Easy sometimes plays at random, but never ignores a win or a block. */
export function chooseFourMove(
  board: readonly FourDisc[],
  player: FourPlayer,
  level: FourBotLevel,
  random: () => number = Math.random,
): number {
  const legal = SEARCH_ORDER.filter(column => landingCell(board, column) >= 0);
  if (!legal.length) return -1;
  const scratch = [...board];
  const filled = scratch.filter(disc => disc !== 0).length;
  // Immediate win, then immediate block - even a sloppy bot sees these.
  for (const who of [player, other(player)]) {
    for (const column of legal) {
      const cell = landingCell(scratch, column);
      scratch[cell] = who;
      const wins = winningLine(scratch, cell) !== null;
      scratch[cell] = 0;
      if (wins) return column;
    }
  }
  if (level === 'easy' && random() < 0.35) return legal[Math.floor(random() * legal.length)];

  let bestColumn = legal[0];
  let bestValue = -Infinity;
  for (const column of legal) {
    const cell = landingCell(scratch, column);
    scratch[cell] = player;
    const value = -negamax(scratch, BOT_DEPTH[level] - 1, -Infinity, Infinity, other(player), filled + 1);
    scratch[cell] = 0;
    if (value > bestValue) { bestValue = value; bestColumn = column; }
  }
  return bestColumn;
}

export class FourInARowGame {
  board: FourDisc[] = Array(CELLS).fill(0);
  current: FourPlayer = 1;
  starter: FourPlayer = 1;
  mode: FourMode = 'bot';
  phase: 'playing' | 'finished' = 'playing';
  winner: FourPlayer | 0 | null = null;
  winningCells: number[] = [];
  lastCell = -1;
  scores: Record<FourPlayer, number> = { 1: 0, 2: 0 };
  botLevel: FourBotLevel = 'normal';

  /** Clears the series score too. */
  restart(mode: FourMode = this.mode): void {
    this.mode = mode;
    this.scores = { 1: 0, 2: 0 };
    this.starter = 1;
    this.clearBoard();
  }

  /** Next game in the series; the other player opens. */
  nextGame(): void {
    this.starter = other(this.starter);
    this.clearBoard();
  }

  canDrop(column: number): boolean {
    return this.phase === 'playing' && landingCell(this.board, column) >= 0;
  }

  drop(column: number): boolean {
    if (!this.canDrop(column)) return false;
    const cell = landingCell(this.board, column);
    this.board[cell] = this.current;
    this.lastCell = cell;
    const line = winningLine(this.board, cell);
    if (line) {
      this.phase = 'finished';
      this.winner = this.current;
      this.winningCells = line;
      this.scores[this.current] += 1;
    } else if (this.board.every(disc => disc !== 0)) {
      this.phase = 'finished';
      this.winner = 0;
    } else {
      this.current = other(this.current);
    }
    return true;
  }

  isBotTurn(): boolean {
    return this.mode === 'bot' && this.phase === 'playing' && this.current === 2;
  }

  /** Emptier board at the win means a faster, cleaner victory. */
  score(player: FourPlayer): number {
    return this.winner === player ? this.board.filter(disc => disc === 0).length + 1 : 0;
  }

  statusText(): string {
    const name = (player: FourPlayer): string => (player === 1 ? 'Mint' : 'Coral');
    if (this.phase === 'finished') return this.winner === 0 ? 'Board full - a draw.' : `${name(this.winner as FourPlayer)} connects four!`;
    if (this.isBotTurn()) return 'Coral bot is thinking…';
    return `${name(this.current)} to drop a disc.`;
  }

  private clearBoard(): void {
    this.board = Array(CELLS).fill(0);
    this.current = this.starter;
    this.phase = 'playing';
    this.winner = null;
    this.winningCells = [];
    this.lastCell = -1;
  }
}

export function initFourInARow(): void {
  if (typeof document === 'undefined') return;
  const canvas = document.getElementById('fourrowCanvas') as HTMLCanvasElement | null;
  const context = canvas?.getContext('2d');
  const view = document.getElementById('fourrowView');
  if (!canvas || !context || !view) return;
  const board = canvas;
  const ctx = context;
  const fourView = view;

  const cell = 100;
  canvas.width = FOUR_COLUMNS * cell;
  canvas.height = FOUR_ROWS * cell;
  const game = new FourInARowGame();
  const status = document.getElementById('fourrowStatus');
  const mintScore = document.getElementById('fourrowMintScore');
  const coralScore = document.getElementById('fourrowCoralScore');
  const nextButton = document.getElementById('fourrowNextButton') as HTMLButtonElement | null;
  const levelSelect = document.getElementById('fourrowBotLevel') as HTMLSelectElement | null;
  const roomMount = document.querySelector<HTMLElement>('[data-game-room="fourrow"]');
  let room: GameRoomClient | null = null;
  const resultReporter = new ArcadeResultReporter('fourrow');
  let hoverColumn = 3;
  let droppedAt = 0;
  let botTimer: number | undefined;

  function snapshot(): Record<string, unknown> {
    return {
      board: game.board.join(''), current: game.current, starter: game.starter, phase: game.phase,
      winner: game.winner, winningCells: game.winningCells, lastCell: game.lastCell, scores: game.scores,
    };
  }

  function restore(state: Record<string, unknown>): void {
    if (typeof state.board !== 'string' || state.board.length !== CELLS) return;
    const incoming = state.board.split('').map(Number) as FourDisc[];
    if (Number(state.lastCell) !== game.lastCell) droppedAt = performance.now();
    game.board = incoming;
    game.current = state.current === 2 ? 2 : 1;
    game.starter = state.starter === 2 ? 2 : 1;
    game.phase = state.phase === 'finished' ? 'finished' : 'playing';
    game.winner = state.winner as FourPlayer | 0 | null;
    game.winningCells = Array.isArray(state.winningCells) ? state.winningCells.map(Number) : [];
    game.lastCell = Number(state.lastCell);
    game.scores = state.scores as Record<FourPlayer, number>;
    game.mode = 'duel';
  }

  function myTurn(): boolean {
    const session = room?.session();
    if (session?.online) return session.ready && session.playerId === game.current;
    return !game.isBotTurn();
  }

  function play(column: number): void {
    if (isArcadeSessionPaused('fourrow') || !myTurn() || !game.canDrop(column)) return;
    if (room?.isGuest()) { room.sendAction({ type: 'drop', column }); return; }
    game.drop(column);
    droppedAt = performance.now();
    room?.broadcastState(snapshot(), true);
    afterMove();
  }

  function afterMove(): void {
    syncUi();
    if (game.isBotTurn()) {
      window.clearTimeout(botTimer);
      botTimer = window.setTimeout(() => {
        if (!game.isBotTurn() || isArcadeSessionPaused('fourrow')) return;
        game.drop(chooseFourMove(game.board, 2, game.botLevel));
        droppedAt = performance.now();
        syncUi();
      }, 450);
    }
  }

  function nextGame(): void {
    if (room?.isGuest()) { room.sendAction({ type: 'next' }); return; }
    window.clearTimeout(botTimer);
    if (game.phase === 'finished') game.nextGame();
    room?.broadcastState(snapshot(), true);
    afterMove();
  }

  function syncUi(): void {
    if (status) status.textContent = game.statusText();
    if (mintScore) mintScore.textContent = String(game.scores[1]);
    if (coralScore) coralScore.textContent = String(game.scores[2]);
    if (nextButton) nextButton.disabled = game.phase !== 'finished';
    const session = room?.session();
    if (levelSelect) levelSelect.hidden = game.mode !== 'bot' || Boolean(session?.online);
    const tracked = (session?.online ? session.playerId : 1) ?? 1;
    resultReporter.report(game.phase === 'finished', {
      outcome: game.winner === 0 ? 'draw' : game.winner === tracked ? 'win' : 'loss',
      score: game.score(tracked),
    });
  }

  function render(now: number): void {
    ctx.fillStyle = '#0c1a33';
    ctx.fillRect(0, 0, board.width, board.height);
    const colors: Record<FourPlayer, string> = { 1: '#54e38e', 2: '#ff6b78' };
    const dropProgress = Math.min(1, (now - droppedAt) / 260);
    for (let index = 0; index < CELLS; index++) {
      const row = Math.floor(index / FOUR_COLUMNS);
      const column = index % FOUR_COLUMNS;
      const cx = column * cell + cell / 2;
      let cy = row * cell + cell / 2;
      const disc = game.board[index];
      ctx.fillStyle = '#060d1a';
      ctx.beginPath(); ctx.arc(cx, cy, cell * .38, 0, Math.PI * 2); ctx.fill();
      if (!disc) continue;
      // The newest disc falls into place instead of appearing.
      if (index === game.lastCell && dropProgress < 1) cy = cell / 2 + (cy - cell / 2) * dropProgress * dropProgress;
      const winning = game.winningCells.includes(index);
      ctx.shadowBlur = winning ? 26 : 8;
      ctx.shadowColor = colors[disc];
      ctx.fillStyle = colors[disc];
      ctx.beginPath(); ctx.arc(cx, cy, cell * .36, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      if (winning) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(cx, cy, cell * .22, 0, Math.PI * 2); ctx.stroke();
      }
    }
    if (game.phase === 'playing' && myTurn() && game.canDrop(hoverColumn)) {
      ctx.globalAlpha = .28;
      ctx.fillStyle = colors[game.current];
      ctx.fillRect(hoverColumn * cell + 6, 0, cell - 12, board.height);
      ctx.globalAlpha = 1;
    }
  }

  function columnAt(event: PointerEvent): number {
    const bounds = board.getBoundingClientRect();
    return Math.max(0, Math.min(FOUR_COLUMNS - 1, Math.floor(((event.clientX - bounds.left) / bounds.width) * FOUR_COLUMNS)));
  }
  board.addEventListener('pointermove', event => { hoverColumn = columnAt(event); });
  board.addEventListener('pointerup', event => { hoverColumn = columnAt(event); play(hoverColumn); });
  window.addEventListener('keydown', event => {
    if (fourView.classList.contains('view-hidden') || event.target instanceof HTMLInputElement) return;
    const digit = Number(event.key);
    if (digit >= 1 && digit <= FOUR_COLUMNS) { event.preventDefault(); hoverColumn = digit - 1; play(hoverColumn); }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); hoverColumn = Math.max(0, hoverColumn - 1); }
    else if (event.key === 'ArrowRight') { event.preventDefault(); hoverColumn = Math.min(FOUR_COLUMNS - 1, hoverColumn + 1); }
    else if ((event.key === 'Enter' || event.key === ' ') && !event.repeat) {
      event.preventDefault();
      if (game.phase === 'finished') nextGame(); else play(hoverColumn);
    }
  });

  nextButton?.addEventListener('click', nextGame);
  document.getElementById('fourrowRestartButton')?.addEventListener('click', () => {
    if (room?.isGuest()) { room.sendAction({ type: 'restart' }); return; }
    window.clearTimeout(botTimer);
    game.restart(game.mode);
    room?.broadcastState(snapshot(), true);
    afterMove();
  });
  levelSelect?.addEventListener('change', () => {
    const level = levelSelect.value;
    if (level === 'easy' || level === 'normal' || level === 'hard') game.botLevel = level;
    try { localStorage.setItem('blast-arcade-fourrow-bot-v1', level); } catch { /* optional */ }
  });
  try {
    const saved = localStorage.getItem('blast-arcade-fourrow-bot-v1');
    if (saved === 'easy' || saved === 'normal' || saved === 'hard') {
      game.botLevel = saved;
      if (levelSelect) levelSelect.value = saved;
    }
  } catch { /* keep the default */ }

  if (roomMount) {
    room = new GameRoomClient({
      game: 'fourrow',
      mount: roomMount,
      offlineModes: [
        { id: 'bot', label: 'Solo · vs bot', description: 'Out-think the Coral bot.', onSelect: () => { window.clearTimeout(botTimer); game.restart('bot'); afterMove(); } },
        { id: 'local', label: 'Same device', description: 'Take turns on this device.', onSelect: () => { window.clearTimeout(botTimer); game.restart('duel'); afterMove(); } },
      ],
      initialOfflineMode: 'bot',
      onSessionChange: session => {
        window.clearTimeout(botTimer);
        if (!session.online) game.restart('bot');
        else if (session.ready && session.playerId === 1) {
          game.restart('duel');
          room?.broadcastState(snapshot(), true);
        }
        afterMove();
      },
      onRemoteAction: (action, from) => {
        if (!room?.isHost() || from !== 2) return;
        if (action.type === 'drop' && game.current === 2) {
          if (game.drop(Number(action.column))) droppedAt = performance.now();
        } else if (action.type === 'next' && game.phase === 'finished') {
          game.nextGame();
        } else if (action.type === 'restart') {
          game.restart('duel');
        }
        room.broadcastState(snapshot(), true);
        syncUi();
      },
      onState: state => { if (room?.isGuest()) { restore(state); syncUi(); } },
    });
  }

  registerArcadeSession({
    gameId: 'fourrow',
    view: fourView,
    mode: () => room?.session().online ? 'online' : game.mode === 'bot' ? 'solo' : 'local',
    isActive: () => game.phase === 'playing' && game.board.some(disc => disc !== 0),
    // Turn-based: nothing is ever held down, and the board needs no countdown.
    clearHeldInputs: () => undefined,
    resumeCountdown: false,
  });

  function loop(now: number): void {
    if (!fourView.classList.contains('view-hidden')) render(now);
    requestAnimationFrame(loop);
  }
  syncUi();
  requestAnimationFrame(loop);
}
