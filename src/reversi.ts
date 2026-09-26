import { GameRoomClient } from './game-room.js';
import { ArcadeResultReporter } from './stats.js';
import { isArcadeSessionPaused, registerArcadeSession } from './session-control.js';

export type ReversiPlayer = 1 | 2;
export type ReversiDisc = 0 | ReversiPlayer;
export type ReversiMode = 'bot' | 'duel';
export type ReversiBotLevel = 'easy' | 'normal' | 'hard';

export const REVERSI_SIZE = 8;
const CELLS = REVERSI_SIZE * REVERSI_SIZE;
const DIRECTIONS: readonly [number, number][] = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const BOT_DEPTH: Record<ReversiBotLevel, number> = { easy: 1, normal: 3, hard: 5 };

/**
 * Classic positional weights: corners can never be flipped, and the squares
 * next to them hand corners to the opponent.
 */
const WEIGHTS = [
  120, -20, 20, 5, 5, 20, -20, 120,
  -20, -40, -5, -5, -5, -5, -40, -20,
  20, -5, 15, 3, 3, 15, -5, 20,
  5, -5, 3, 3, 3, 3, -5, 5,
  5, -5, 3, 3, 3, 3, -5, 5,
  20, -5, 15, 3, 3, 15, -5, 20,
  -20, -40, -5, -5, -5, -5, -40, -20,
  120, -20, 20, 5, 5, 20, -20, 120,
];

const other = (player: ReversiPlayer): ReversiPlayer => (player === 1 ? 2 : 1);

export function startingBoard(): ReversiDisc[] {
  const board: ReversiDisc[] = Array(CELLS).fill(0);
  board[3 * 8 + 3] = 2; board[4 * 8 + 4] = 2;
  board[3 * 8 + 4] = 1; board[4 * 8 + 3] = 1;
  return board;
}

/** Discs that a move at `index` would flip; empty means the move is illegal. */
export function flipsFor(board: readonly ReversiDisc[], index: number, player: ReversiPlayer): number[] {
  if (board[index] !== 0) return [];
  const row = Math.floor(index / 8);
  const column = index % 8;
  const flips: number[] = [];
  for (const [dr, dc] of DIRECTIONS) {
    const line: number[] = [];
    let r = row + dr;
    let c = column + dc;
    while (r >= 0 && r < 8 && c >= 0 && c < 8 && board[r * 8 + c] === other(player)) {
      line.push(r * 8 + c);
      r += dr;
      c += dc;
    }
    // A run of rival discs only flips if it is capped by one of ours.
    if (line.length && r >= 0 && r < 8 && c >= 0 && c < 8 && board[r * 8 + c] === player) flips.push(...line);
  }
  return flips;
}

export function legalMoves(board: readonly ReversiDisc[], player: ReversiPlayer): number[] {
  const moves: number[] = [];
  for (let index = 0; index < CELLS; index++) if (flipsFor(board, index, player).length) moves.push(index);
  return moves;
}

export function countDiscs(board: readonly ReversiDisc[]): Record<ReversiPlayer, number> {
  const counts: Record<ReversiPlayer, number> = { 1: 0, 2: 0 };
  for (const disc of board) if (disc) counts[disc] += 1;
  return counts;
}

function evaluate(board: readonly ReversiDisc[], player: ReversiPlayer): number {
  let score = 0;
  for (let index = 0; index < CELLS; index++) {
    if (board[index] === player) score += WEIGHTS[index];
    else if (board[index] === other(player)) score -= WEIGHTS[index];
  }
  // Having more moves than the opponent keeps options open late in the game.
  score += 4 * (legalMoves(board, player).length - legalMoves(board, other(player)).length);
  return score;
}

function negamax(board: ReversiDisc[], depth: number, alpha: number, beta: number, player: ReversiPlayer, passed: boolean): number {
  const moves = legalMoves(board, player);
  if (!moves.length) {
    if (passed) {
      // Neither side can move: the game is over, so count the real result.
      const counts = countDiscs(board);
      const margin = counts[player] - counts[other(player)];
      return margin > 0 ? 10_000 + margin : margin < 0 ? -10_000 + margin : 0;
    }
    return -negamax(board, depth, -beta, -alpha, other(player), true);
  }
  if (depth === 0) return evaluate(board, player);
  let best = -Infinity;
  for (const move of moves) {
    const flips = flipsFor(board, move, player);
    board[move] = player;
    flips.forEach(cell => { board[cell] = player; });
    const value = -negamax(board, depth - 1, -beta, -alpha, other(player), false);
    board[move] = 0;
    flips.forEach(cell => { board[cell] = other(player); });
    if (value > best) best = value;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

/** Best move for `player`, or -1 if it must pass. Easy sometimes plays loosely but always takes a free corner. */
export function chooseReversiMove(
  board: readonly ReversiDisc[],
  player: ReversiPlayer,
  level: ReversiBotLevel,
  random: () => number = Math.random,
): number {
  const moves = legalMoves(board, player);
  if (!moves.length) return -1;
  const corner = moves.find(move => [0, 7, 56, 63].includes(move));
  if (corner !== undefined) return corner;
  if (level === 'easy' && random() < 0.4) return moves[Math.floor(random() * moves.length)];
  const scratch = [...board];
  let bestMove = moves[0];
  let bestValue = -Infinity;
  for (const move of moves) {
    const flips = flipsFor(scratch, move, player);
    scratch[move] = player;
    flips.forEach(cell => { scratch[cell] = player; });
    const value = -negamax(scratch, BOT_DEPTH[level] - 1, -Infinity, Infinity, other(player), false);
    scratch[move] = 0;
    flips.forEach(cell => { scratch[cell] = other(player); });
    if (value > bestValue) { bestValue = value; bestMove = move; }
  }
  return bestMove;
}

export class ReversiGame {
  board: ReversiDisc[] = startingBoard();
  current: ReversiPlayer = 1;
  /** Who plays first this game; it alternates across a series. */
  starter: ReversiPlayer = 1;
  mode: ReversiMode = 'bot';
  phase: 'playing' | 'finished' = 'playing';
  winner: ReversiPlayer | 0 | null = null;
  lastMove = -1;
  lastFlips: number[] = [];
  /** Set when the side to move had to pass, so the screen can explain the skip. */
  passed: ReversiPlayer | null = null;
  wins: Record<ReversiPlayer, number> = { 1: 0, 2: 0 };
  botLevel: ReversiBotLevel = 'normal';

  restart(mode: ReversiMode = this.mode): void {
    this.mode = mode;
    this.wins = { 1: 0, 2: 0 };
    this.starter = 1;
    this.reset();
  }

  nextGame(): void {
    this.starter = other(this.starter);
    this.reset();
  }

  canPlay(index: number): boolean {
    return this.phase === 'playing' && flipsFor(this.board, index, this.current).length > 0;
  }

  play(index: number): boolean {
    const flips = this.phase === 'playing' ? flipsFor(this.board, index, this.current) : [];
    if (!flips.length) return false;
    this.board[index] = this.current;
    flips.forEach(cell => { this.board[cell] = this.current; });
    this.lastMove = index;
    this.lastFlips = flips;
    this.passed = null;
    this.advance();
    return true;
  }

  isBotTurn(): boolean {
    return this.mode === 'bot' && this.phase === 'playing' && this.current === 2;
  }

  counts(): Record<ReversiPlayer, number> {
    return countDiscs(this.board);
  }

  statusText(): string {
    const name = (player: ReversiPlayer): string => (player === 1 ? 'Mint' : 'Coral');
    if (this.phase === 'finished') {
      const counts = this.counts();
      return this.winner === 0 ? `A draw at ${counts[1]}-${counts[2]}.` : `${name(this.winner as ReversiPlayer)} wins ${Math.max(counts[1], counts[2])}-${Math.min(counts[1], counts[2])}!`;
    }
    if (this.passed) return `${name(this.passed)} has no move - ${name(this.current)} plays again.`;
    if (this.isBotTurn()) return 'Coral bot is thinking…';
    return `${name(this.current)} to play.`;
  }

  /** Hand the turn over, skipping a player with no legal move, and end the game when neither can move. */
  private advance(): void {
    const next = other(this.current);
    if (legalMoves(this.board, next).length) { this.current = next; return; }
    if (legalMoves(this.board, this.current).length) { this.passed = next; return; }
    this.phase = 'finished';
    const counts = this.counts();
    this.winner = counts[1] > counts[2] ? 1 : counts[2] > counts[1] ? 2 : 0;
    if (this.winner) this.wins[this.winner] += 1;
  }

  private reset(): void {
    this.board = startingBoard();
    this.current = this.starter;
    this.phase = 'playing';
    this.winner = null;
    this.lastMove = -1;
    this.lastFlips = [];
    this.passed = null;
  }
}

export function initReversi(): void {
  if (typeof document === 'undefined') return;
  const canvas = document.getElementById('reversiCanvas') as HTMLCanvasElement | null;
  const context = canvas?.getContext('2d');
  const view = document.getElementById('reversiView');
  if (!canvas || !context || !view) return;
  const board = canvas;
  const ctx = context;
  const reversiView = view;

  const CELL = 80;
  canvas.width = CELL * 8;
  canvas.height = CELL * 8;
  const game = new ReversiGame();
  const status = document.getElementById('reversiStatus');
  const mintCount = document.getElementById('reversiMintCount');
  const coralCount = document.getElementById('reversiCoralCount');
  const series = document.getElementById('reversiSeries');
  const nextButton = document.getElementById('reversiNextButton') as HTMLButtonElement | null;
  const levelSelect = document.getElementById('reversiBotLevel') as HTMLSelectElement | null;
  const roomMount = document.querySelector<HTMLElement>('[data-game-room="reversi"]');
  let room: GameRoomClient | null = null;
  const resultReporter = new ArcadeResultReporter('reversi');
  let cursor = 19;
  let playedAt = 0;
  let botTimer: number | undefined;

  function snapshot(): Record<string, unknown> {
    return {
      board: game.board.join(''), current: game.current, starter: game.starter, phase: game.phase,
      winner: game.winner, lastMove: game.lastMove, lastFlips: game.lastFlips, passed: game.passed, wins: game.wins,
    };
  }

  function restore(state: Record<string, unknown>): void {
    if (typeof state.board !== 'string' || state.board.length !== CELLS || !/^[012]+$/.test(state.board)) return;
    if (Number(state.lastMove) !== game.lastMove) playedAt = performance.now();
    game.board = state.board.split('').map(Number) as ReversiDisc[];
    game.current = state.current === 2 ? 2 : 1;
    game.starter = state.starter === 2 ? 2 : 1;
    game.phase = state.phase === 'finished' ? 'finished' : 'playing';
    game.winner = state.winner as ReversiPlayer | 0 | null;
    game.lastMove = Number(state.lastMove);
    game.lastFlips = Array.isArray(state.lastFlips) ? state.lastFlips.map(Number) : [];
    game.passed = state.passed === 1 || state.passed === 2 ? state.passed : null;
    game.wins = state.wins as Record<ReversiPlayer, number>;
    game.mode = 'duel';
  }

  function myTurn(): boolean {
    const session = room?.session();
    if (session?.online) return session.ready && session.playerId === game.current;
    return !game.isBotTurn();
  }

  function play(index: number): void {
    if (isArcadeSessionPaused('reversi') || !myTurn() || !game.canPlay(index)) return;
    if (room?.isGuest()) { room.sendAction({ type: 'play', index }); return; }
    game.play(index);
    playedAt = performance.now();
    room?.broadcastState(snapshot(), true);
    afterMove();
  }

  function afterMove(): void {
    syncUi();
    if (!game.isBotTurn()) return;
    window.clearTimeout(botTimer);
    botTimer = window.setTimeout(() => {
      if (!game.isBotTurn() || isArcadeSessionPaused('reversi')) return;
      game.play(chooseReversiMove(game.board, 2, game.botLevel));
      playedAt = performance.now();
      // The bot may move again if Mint has to pass.
      afterMove();
    }, 550);
  }

  function nextGame(): void {
    if (room?.isGuest()) { room.sendAction({ type: 'next' }); return; }
    window.clearTimeout(botTimer);
    if (game.phase === 'finished') game.nextGame();
    room?.broadcastState(snapshot(), true);
    afterMove();
  }

  function syncUi(): void {
    const counts = game.counts();
    if (status) status.textContent = game.statusText();
    if (mintCount) mintCount.textContent = String(counts[1]);
    if (coralCount) coralCount.textContent = String(counts[2]);
    if (series) series.textContent = `Series ${game.wins[1]}-${game.wins[2]}`;
    if (nextButton) nextButton.disabled = game.phase !== 'finished';
    const session = room?.session();
    if (levelSelect) levelSelect.hidden = game.mode !== 'bot' || Boolean(session?.online);
    const tracked = (session?.online ? session.playerId : 1) ?? 1;
    resultReporter.report(game.phase === 'finished', {
      outcome: game.winner === 0 ? 'draw' : game.winner === tracked ? 'win' : 'loss',
      score: counts[tracked],
    });
  }

  const colors: Record<ReversiPlayer, string> = { 1: '#54e38e', 2: '#ff6b78' };
  function render(now: number): void {
    ctx.fillStyle = '#0f2a22';
    ctx.fillRect(0, 0, board.width, board.height);
    ctx.strokeStyle = 'rgba(0,0,0,.45)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 8; i++) {
      ctx.beginPath(); ctx.moveTo(i * CELL, 0); ctx.lineTo(i * CELL, board.height); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * CELL); ctx.lineTo(board.width, i * CELL); ctx.stroke();
    }
    // Freshly flipped discs grow back in, so the player sees what changed.
    const flipProgress = Math.min(1, (now - playedAt) / 320);
    const hints = game.phase === 'playing' && myTurn() ? new Set(legalMoves(game.board, game.current)) : new Set<number>();
    for (let index = 0; index < CELLS; index++) {
      const cx = (index % 8) * CELL + CELL / 2;
      const cy = Math.floor(index / 8) * CELL + CELL / 2;
      const disc = game.board[index];
      if (disc) {
        const animating = index === game.lastMove || game.lastFlips.includes(index);
        const radius = CELL * .38 * (animating ? .55 + .45 * flipProgress : 1);
        ctx.shadowBlur = 10; ctx.shadowColor = colors[disc];
        ctx.fillStyle = colors[disc];
        ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        if (index === game.lastMove) {
          ctx.fillStyle = 'rgba(255,255,255,.75)';
          ctx.beginPath(); ctx.arc(cx, cy, CELL * .08, 0, Math.PI * 2); ctx.fill();
        }
      } else if (hints.has(index)) {
        ctx.fillStyle = colors[game.current];
        ctx.globalAlpha = .35;
        ctx.beginPath(); ctx.arc(cx, cy, CELL * .12, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
      if (index === cursor && document.activeElement === board) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.strokeRect((index % 8) * CELL + 4, Math.floor(index / 8) * CELL + 4, CELL - 8, CELL - 8);
      }
    }
  }

  function cellAt(event: PointerEvent): number {
    const bounds = board.getBoundingClientRect();
    const column = Math.floor(((event.clientX - bounds.left) / bounds.width) * 8);
    const row = Math.floor(((event.clientY - bounds.top) / bounds.height) * 8);
    return column < 0 || row < 0 || column > 7 || row > 7 ? -1 : row * 8 + column;
  }
  board.tabIndex = 0;
  board.addEventListener('pointerup', event => {
    const index = cellAt(event);
    if (index >= 0) { cursor = index; play(index); }
  });
  board.addEventListener('keydown', event => {
    const moves: Record<string, number> = { ArrowUp: -8, ArrowDown: 8, ArrowLeft: -1, ArrowRight: 1 };
    if (event.key in moves) {
      event.preventDefault();
      const next = cursor + moves[event.key];
      const sameRow = event.key === 'ArrowLeft' || event.key === 'ArrowRight' ? Math.floor(next / 8) === Math.floor(cursor / 8) : true;
      if (next >= 0 && next < CELLS && sameRow) cursor = next;
    } else if ((event.key === 'Enter' || event.key === ' ') && !event.repeat) {
      event.preventDefault();
      if (game.phase === 'finished') nextGame(); else play(cursor);
    }
  });

  nextButton?.addEventListener('click', nextGame);
  document.getElementById('reversiRestartButton')?.addEventListener('click', () => {
    if (room?.isGuest()) { room.sendAction({ type: 'restart' }); return; }
    window.clearTimeout(botTimer);
    game.restart(game.mode);
    room?.broadcastState(snapshot(), true);
    afterMove();
  });
  levelSelect?.addEventListener('change', () => {
    const level = levelSelect.value;
    if (level === 'easy' || level === 'normal' || level === 'hard') game.botLevel = level;
    try { localStorage.setItem('blast-arcade-reversi-bot-v1', level); } catch { /* optional */ }
  });
  try {
    const saved = localStorage.getItem('blast-arcade-reversi-bot-v1');
    if (saved === 'easy' || saved === 'normal' || saved === 'hard') {
      game.botLevel = saved;
      if (levelSelect) levelSelect.value = saved;
    }
  } catch { /* keep the default */ }

  if (roomMount) {
    room = new GameRoomClient({
      game: 'reversi',
      mount: roomMount,
      offlineModes: [
        { id: 'bot', label: 'Solo · vs bot', description: 'Outflank the Coral bot.', onSelect: () => { window.clearTimeout(botTimer); game.restart('bot'); afterMove(); } },
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
        if (action.type === 'play' && game.current === 2) {
          if (game.play(Number(action.index))) playedAt = performance.now();
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
    gameId: 'reversi',
    view: reversiView,
    mode: () => room?.session().online ? 'online' : game.mode === 'bot' ? 'solo' : 'local',
    isActive: () => game.phase === 'playing' && game.lastMove >= 0,
    clearHeldInputs: () => undefined,
    resumeCountdown: false,
  });

  function loop(now: number): void {
    if (!reversiView.classList.contains('view-hidden')) render(now);
    requestAnimationFrame(loop);
  }
  syncUi();
  requestAnimationFrame(loop);
}
