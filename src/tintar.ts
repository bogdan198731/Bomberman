import { GameRoomClient } from './game-room.js';
import { ArcadeResultReporter } from './stats.js';

export type TintarPlayer = 1 | 2;
export type TintarPhase = 'placing' | 'moving' | 'removing' | 'finished';
export type TintarBotDifficulty = 'easy' | 'normal' | 'hard';

export type TintarBotAction =
  | { type: 'place'; point: number }
  | { type: 'move'; from: number; to: number }
  | { type: 'remove'; point: number };

export const TINTAR_POINTS: ReadonlyArray<readonly [number, number]> = [
  [7, 7], [50, 7], [93, 7],
  [24, 24], [50, 24], [76, 24],
  [41, 41], [50, 41], [59, 41],
  [7, 50], [24, 50], [41, 50], [59, 50], [76, 50], [93, 50],
  [41, 59], [50, 59], [59, 59],
  [24, 76], [50, 76], [76, 76],
  [7, 93], [50, 93], [93, 93],
];

export const TINTAR_ADJACENCY: ReadonlyArray<ReadonlyArray<number>> = [
  [1, 9], [0, 2, 4], [1, 14],
  [4, 10], [1, 3, 5, 7], [4, 13],
  [7, 11], [4, 6, 8], [7, 12],
  [0, 10, 21], [3, 9, 11, 18], [6, 10, 15],
  [8, 13, 17], [5, 12, 14, 20], [2, 13, 23],
  [11, 16], [15, 17, 19], [12, 16],
  [10, 19], [16, 18, 20, 22], [13, 19],
  [9, 22], [19, 21, 23], [14, 22],
];

export const TINTAR_MILLS: ReadonlyArray<ReadonlyArray<number>> = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [9, 10, 11], [12, 13, 14], [15, 16, 17],
  [18, 19, 20], [21, 22, 23],
  [0, 9, 21], [3, 10, 18], [6, 11, 15],
  [1, 4, 7], [16, 19, 22], [8, 12, 17],
  [5, 13, 20], [2, 14, 23],
];

const PLAYER_NAMES: Record<TintarPlayer, string> = { 1: 'Mint', 2: 'Coral' };

function otherPlayer(player: TintarPlayer): TintarPlayer {
  return player === 1 ? 2 : 1;
}

export class TintarGame {
  board: Array<0 | TintarPlayer> = Array(24).fill(0);
  currentPlayer: TintarPlayer = 1;
  phase: TintarPhase = 'placing';
  piecesToPlace: Record<TintarPlayer, number> = { 1: 9, 2: 9 };
  selectedPoint: number | null = null;
  winner: TintarPlayer | 0 | null = null;
  noCaptureTurns = 0;

  reset(): void {
    this.board = Array(24).fill(0);
    this.currentPlayer = 1;
    this.phase = 'placing';
    this.piecesToPlace = { 1: 9, 2: 9 };
    this.selectedPoint = null;
    this.winner = null;
    this.noCaptureTurns = 0;
  }

  pieceCount(player: TintarPlayer): number {
    return this.board.filter(piece => piece === player).length;
  }

  isMovementStage(): boolean {
    return this.piecesToPlace[1] === 0 && this.piecesToPlace[2] === 0;
  }

  isMillAt(point: number, player: TintarPlayer): boolean {
    return TINTAR_MILLS.some(mill => mill.includes(point) && mill.every(index => this.board[index] === player));
  }

  canRemove(point: number): boolean {
    const opponent = otherPlayer(this.currentPlayer);
    if (this.board[point] !== opponent) return false;
    const opponentPoints = this.board
      .map((piece, index) => piece === opponent ? index : -1)
      .filter(index => index >= 0);
    const allInMills = opponentPoints.every(index => this.isMillAt(index, opponent));
    return allInMills || !this.isMillAt(point, opponent);
  }

  legalDestinations(point: number): number[] {
    if (this.phase !== 'moving' || this.board[point] !== this.currentPlayer) return [];
    const openPoints = this.board
      .map((piece, index) => piece === 0 ? index : -1)
      .filter(index => index >= 0);
    if (this.pieceCount(this.currentPlayer) === 3) return openPoints;
    return TINTAR_ADJACENCY[point].filter(index => this.board[index] === 0);
  }

  hasAnyLegalMove(player: TintarPlayer): boolean {
    if (this.pieceCount(player) === 3) return this.board.some(piece => piece === 0);
    return this.board.some((piece, index) => (
      piece === player && TINTAR_ADJACENCY[index].some(neighbor => this.board[neighbor] === 0)
    ));
  }

  click(point: number): boolean {
    if (!Number.isInteger(point) || point < 0 || point >= this.board.length || this.phase === 'finished') {
      return false;
    }
    if (this.phase === 'placing') return this.place(point);
    if (this.phase === 'removing') return this.remove(point);
    return this.move(point);
  }

  statusText(): string {
    const playerName = PLAYER_NAMES[this.currentPlayer];
    if (this.phase === 'finished') {
      return this.winner === 0 ? 'Draw — 50 turns without a capture.' : `${PLAYER_NAMES[this.winner as TintarPlayer]} wins the match!`;
    }
    if (this.phase === 'removing') return `${playerName} formed a mill — remove one rival piece.`;
    if (this.phase === 'placing') {
      return `${playerName}: place a piece (${this.piecesToPlace[this.currentPlayer]} left).`;
    }
    if (this.selectedPoint !== null) {
      return this.pieceCount(this.currentPlayer) === 3
        ? `${playerName}: fly to any empty point.`
        : `${playerName}: choose a connected empty point.`;
    }
    return `${playerName}: select a piece to move.`;
  }

  private place(point: number): boolean {
    if (this.board[point] !== 0 || this.piecesToPlace[this.currentPlayer] <= 0) return false;
    this.board[point] = this.currentPlayer;
    this.piecesToPlace[this.currentPlayer] -= 1;
    if (this.isMillAt(point, this.currentPlayer)) {
      this.phase = 'removing';
      return true;
    }
    this.advanceTurn(false);
    return true;
  }

  private move(point: number): boolean {
    if (this.board[point] === this.currentPlayer) {
      this.selectedPoint = point;
      return true;
    }
    if (this.selectedPoint === null || this.board[point] !== 0) return false;
    if (!this.legalDestinations(this.selectedPoint).includes(point)) return false;

    this.board[this.selectedPoint] = 0;
    this.board[point] = this.currentPlayer;
    this.selectedPoint = null;
    if (this.isMillAt(point, this.currentPlayer)) {
      this.phase = 'removing';
      return true;
    }
    this.noCaptureTurns += 1;
    if (this.noCaptureTurns >= 50) {
      this.phase = 'finished';
      this.winner = 0;
      return true;
    }
    this.advanceTurn(false);
    return true;
  }

  private remove(point: number): boolean {
    if (!this.canRemove(point)) return false;
    const opponent = otherPlayer(this.currentPlayer);
    this.board[point] = 0;
    this.noCaptureTurns = 0;

    if (this.piecesToPlace[opponent] === 0 && this.pieceCount(opponent) < 3) {
      this.phase = 'finished';
      this.winner = this.currentPlayer;
      return true;
    }
    this.advanceTurn(true);
    return true;
  }

  private advanceTurn(_captured: boolean): void {
    const previousPlayer = this.currentPlayer;
    this.currentPlayer = otherPlayer(this.currentPlayer);
    this.selectedPoint = null;
    this.phase = this.isMovementStage() ? 'moving' : 'placing';

    if (this.phase === 'moving') {
      const opponentHasLost = this.pieceCount(this.currentPlayer) < 3 || !this.hasAnyLegalMove(this.currentPlayer);
      if (opponentHasLost) {
        this.phase = 'finished';
        this.winner = previousPlayer;
      }
    }
  }
}

function cloneTintarGame(source: TintarGame): TintarGame {
  const clone = new TintarGame();
  clone.board = [...source.board];
  clone.currentPlayer = source.currentPlayer;
  clone.phase = source.phase;
  clone.piecesToPlace = { ...source.piecesToPlace };
  clone.selectedPoint = source.selectedPoint;
  clone.winner = source.winner;
  clone.noCaptureTurns = source.noCaptureTurns;
  return clone;
}

export function legalTintarBotActions(game: TintarGame): TintarBotAction[] {
  if (game.phase === 'finished') return [];
  if (game.phase === 'placing') {
    return game.board.flatMap((piece, point) => piece === 0 ? [{ type: 'place' as const, point }] : []);
  }
  if (game.phase === 'removing') {
    return game.board.flatMap((_piece, point) => game.canRemove(point) ? [{ type: 'remove' as const, point }] : []);
  }
  return game.board.flatMap((piece, from) => (
    piece === game.currentPlayer
      ? game.legalDestinations(from).map(to => ({ type: 'move' as const, from, to }))
      : []
  ));
}

export function applyTintarBotAction(game: TintarGame, action: TintarBotAction): boolean {
  if (action.type === 'place') return game.phase === 'placing' && game.click(action.point);
  if (action.type === 'remove') return game.phase === 'removing' && game.click(action.point);
  if (game.phase !== 'moving') return false;
  game.selectedPoint = null;
  return game.click(action.from) && game.click(action.to);
}

function actionDestination(action: TintarBotAction): number | null {
  return action.type === 'move' ? action.to : action.type === 'place' ? action.point : null;
}

function millCount(game: TintarGame, player: TintarPlayer): number {
  return TINTAR_MILLS.filter(mill => mill.every(point => game.board[point] === player)).length;
}

function millCompletionPoints(game: TintarGame, player: TintarPlayer): number[] {
  return TINTAR_MILLS.flatMap(mill => {
    const own = mill.filter(point => game.board[point] === player);
    const empty = mill.filter(point => game.board[point] === 0);
    return own.length === 2 && empty.length === 1 ? empty : [];
  });
}

function playerMobility(game: TintarGame, player: TintarPlayer): number {
  const emptyCount = game.board.filter(piece => piece === 0).length;
  if (game.pieceCount(player) === 3) return emptyCount;
  return game.board.reduce<number>((total, piece, point) => (
    piece === player
      ? total + TINTAR_ADJACENCY[point].filter(neighbor => game.board[neighbor] === 0).length
      : total
  ), 0);
}

function evaluateTintarPosition(game: TintarGame, bot: TintarPlayer): number {
  if (game.phase === 'finished') {
    if (game.winner === bot) return 100_000;
    if (game.winner === 0) return 0;
    return -100_000;
  }
  const opponent = otherPlayer(bot);
  const pieceScore = (game.pieceCount(bot) - game.pieceCount(opponent)) * 420;
  const millScore = (millCount(game, bot) - millCount(game, opponent)) * 190;
  const threatScore = (millCompletionPoints(game, bot).length - millCompletionPoints(game, opponent).length) * 85;
  const mobilityScore = (playerMobility(game, bot) - playerMobility(game, opponent)) * 12;
  const removalScore = game.phase === 'removing' ? (game.currentPlayer === bot ? 1_800 : -1_800) : 0;
  return pieceScore + millScore + threatScore + mobilityScore + removalScore;
}

function scoreTintarAction(game: TintarGame, action: TintarBotAction, bot: TintarPlayer): number {
  const opponentThreats = new Set(millCompletionPoints(game, otherPlayer(bot)));
  const next = cloneTintarGame(game);
  if (!applyTintarBotAction(next, action)) return -Infinity;
  const destination = actionDestination(action);
  const blocksMill = destination !== null && opponentThreats.has(destination) ? 1_000 : 0;
  const formsMill = next.phase === 'removing' && next.currentPlayer === bot ? 4_000 : 0;
  const intersection = destination === null ? 0 : TINTAR_ADJACENCY[destination].length * 4;
  return evaluateTintarPosition(next, bot) + blocksMill + formsMill + intersection;
}

function minimaxTintar(
  game: TintarGame,
  bot: TintarPlayer,
  depth: number,
  alpha: number,
  beta: number,
): number {
  if (depth === 0 || game.phase === 'finished') return evaluateTintarPosition(game, bot);
  const actions = legalTintarBotActions(game);
  if (actions.length === 0) return evaluateTintarPosition(game, bot);
  const maximizing = game.currentPlayer === bot;
  let best = maximizing ? -Infinity : Infinity;
  for (const action of actions) {
    const next = cloneTintarGame(game);
    if (!applyTintarBotAction(next, action)) continue;
    const score = minimaxTintar(next, bot, depth - 1, alpha, beta);
    if (maximizing) {
      best = Math.max(best, score);
      alpha = Math.max(alpha, best);
    } else {
      best = Math.min(best, score);
      beta = Math.min(beta, best);
    }
    if (beta <= alpha) break;
  }
  return best;
}

function chooseAmongBest(
  scored: ReadonlyArray<{ action: TintarBotAction; score: number }>,
  random: () => number,
): TintarBotAction | null {
  if (scored.length === 0) return null;
  const bestScore = Math.max(...scored.map(candidate => candidate.score));
  const best = scored.filter(candidate => candidate.score === bestScore);
  return best[Math.min(best.length - 1, Math.floor(random() * best.length))]?.action ?? null;
}

export function chooseTintarBotAction(
  game: TintarGame,
  difficulty: TintarBotDifficulty,
  random: () => number = Math.random,
): TintarBotAction | null {
  const actions = legalTintarBotActions(game);
  if (actions.length === 0) return null;
  if (difficulty === 'easy') {
    return actions[Math.min(actions.length - 1, Math.floor(random() * actions.length))] ?? null;
  }
  const bot = game.currentPlayer;
  if (difficulty === 'normal') {
    return chooseAmongBest(actions.map(action => ({ action, score: scoreTintarAction(game, action, bot) })), random);
  }
  let bestAction: TintarBotAction | null = null;
  let bestScore = -Infinity;
  let alpha = -Infinity;
  for (const action of actions) {
    const next = cloneTintarGame(game);
    if (!applyTintarBotAction(next, action)) continue;
    const score = minimaxTintar(next, bot, 3, alpha, Infinity);
    if (score > bestScore) {
      bestScore = score;
      bestAction = action;
    }
    alpha = Math.max(alpha, bestScore);
  }
  return bestAction;
}

export function initTintar(): void {
  if (typeof document === 'undefined') return;
  const boardElement = document.getElementById('tintarBoard');
  if (!boardElement) return;

  const game = new TintarGame();
  const statusElement = document.getElementById('tintarStatus');
  const phaseElement = document.getElementById('tintarPhase');
  const mintHandElement = document.getElementById('tintarMintHand');
  const mintBoardElement = document.getElementById('tintarMintBoard');
  const coralHandElement = document.getElementById('tintarCoralHand');
  const coralBoardElement = document.getElementById('tintarCoralBoard');
  const coralNameElement = document.getElementById('tintarCoralName');
  const turnMarker = document.getElementById('tintarTurnMarker');
  const boardFrame = document.getElementById('tintarBoardFrame') as HTMLElement | null;
  const boardActions = document.getElementById('tintarBoardActions');
  const fullscreenButton = document.getElementById('tintarFullscreenButton') as HTMLButtonElement | null;
  const fullscreenLabel = document.getElementById('tintarFullscreenLabel');
  const victoryOverlay = document.getElementById('tintarVictoryOverlay');
  const victoryTitle = document.getElementById('tintarVictoryTitle');
  const revengeButton = document.getElementById('tintarRevengeButton') as HTMLButtonElement | null;
  const botButtons = document.querySelectorAll<HTMLButtonElement>('[data-tintar-bot-difficulty]');
  const pointButtons: HTMLButtonElement[] = [];
  const roomMount = document.querySelector<HTMLElement>('[data-game-room="tintar"]');
  let room: GameRoomClient | null = null;
  let matchStarted = false;
  let botDifficulty: TintarBotDifficulty | null = null;
  let botTimer: number | null = null;
  let fallbackFullscreen = false;
  let fullscreenPending = false;
  let lastRenderedPhase: TintarPhase | null = null;
  const resultReporter = new ArcadeResultReporter('tintar');
  const botLabels: Record<TintarBotDifficulty, string> = { easy: 'Easy', normal: 'Normal', hard: 'Hard' };
  const botDelays: Record<TintarBotDifficulty, number> = { easy: 700, normal: 480, hard: 300 };

  function cancelBotTurn(): void {
    if (botTimer !== null) window.clearTimeout(botTimer);
    botTimer = null;
  }

  function setBotDifficulty(difficulty: TintarBotDifficulty | null): void {
    cancelBotTurn();
    botDifficulty = difficulty;
    botButtons.forEach(button => {
      const active = button.dataset.tintarBotDifficulty === difficulty;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function hideVictoryEffect(): void {
    victoryOverlay?.classList.remove('is-celebrating');
    boardFrame?.classList.remove('is-celebrating', 'winner-mint', 'winner-coral');
    if (revengeButton) {
      revengeButton.disabled = false;
      revengeButton.textContent = 'Play revenge match';
    }
    if (victoryOverlay) victoryOverlay.hidden = true;
  }

  function showVictoryEffect(winner: TintarPlayer): void {
    if (!victoryOverlay) return;
    hideVictoryEffect();
    const winnerName = PLAYER_NAMES[winner];
    if (victoryTitle) victoryTitle.textContent = `${winnerName} wins!`;
    boardFrame?.classList.add('is-celebrating', winner === 1 ? 'winner-mint' : 'winner-coral');
    victoryOverlay.hidden = false;
    void victoryOverlay.offsetWidth;
    victoryOverlay.classList.add('is-celebrating');
    revengeButton?.focus({ preventScroll: true });
  }

  function boardIsFullscreen(): boolean {
    return fallbackFullscreen || document.fullscreenElement === boardFrame;
  }

  function updateFullscreenUi(): void {
    const active = boardIsFullscreen();
    boardFrame?.classList.toggle('is-fullscreen-layout', active);
    fullscreenButton?.setAttribute('aria-pressed', active ? 'true' : 'false');
    fullscreenButton?.setAttribute('aria-label', active ? 'Exit full screen board' : 'Full screen board');
    if (fullscreenLabel) fullscreenLabel.textContent = active ? 'Exit full screen' : 'Full screen board';
  }

  function setFallbackFullscreen(active: boolean): void {
    fallbackFullscreen = active;
    boardFrame?.classList.toggle('is-fullscreen-fallback', active);
    document.body.classList.toggle('tintar-board-fullscreen-open', active);
    updateFullscreenUi();
  }

  async function closeBoardFullscreen(): Promise<void> {
    if (document.fullscreenElement === boardFrame && typeof document.exitFullscreen === 'function') {
      try { await document.exitFullscreen(); }
      catch { /* The browser may already be leaving fullscreen. */ }
    }
    setFallbackFullscreen(false);
    updateFullscreenUi();
  }

  async function toggleBoardFullscreen(): Promise<void> {
    if (!boardFrame || fullscreenPending) return;
    fullscreenPending = true;
    if (fullscreenButton) fullscreenButton.disabled = true;
    try {
      if (boardIsFullscreen()) {
        await closeBoardFullscreen();
        return;
      }
      if (typeof boardFrame.requestFullscreen === 'function') {
        try {
          await boardFrame.requestFullscreen();
          updateFullscreenUi();
          return;
        } catch {
          // iPhone and embedded browsers can expose the API but reject non-video elements.
        }
      }
      setFallbackFullscreen(true);
    } finally {
      fullscreenPending = false;
      if (fullscreenButton) fullscreenButton.disabled = false;
    }
  }

  function snapshot(): Record<string, unknown> {
    return {
      board: game.board, currentPlayer: game.currentPlayer, phase: game.phase,
      piecesToPlace: game.piecesToPlace, selectedPoint: game.selectedPoint,
      winner: game.winner, noCaptureTurns: game.noCaptureTurns,
    };
  }

  function restore(state: Record<string, unknown>): void {
    if (!Array.isArray(state.board) || !state.piecesToPlace) return;
    game.board = state.board as Array<0 | TintarPlayer>;
    game.currentPlayer = state.currentPlayer as TintarPlayer;
    game.phase = state.phase as TintarPhase;
    game.piecesToPlace = state.piecesToPlace as Record<TintarPlayer, number>;
    game.selectedPoint = state.selectedPoint as number | null;
    game.winner = state.winner as TintarPlayer | 0 | null;
    game.noCaptureTurns = Number(state.noCaptureTurns) || 0;
  }

  function playPoint(point: number): void {
    const session = room?.session();
    if (!session?.online) {
      if (botDifficulty && game.currentPlayer === 2) return;
      if (game.click(point)) {
        matchStarted = true;
        render();
      }
      return;
    }
    if (!session.ready || !room?.canControl(game.currentPlayer)) return;
    if (room.isGuest()) room.sendAction({ type: 'point', point });
    else if (game.click(point)) { render(); room.broadcastState(snapshot(), true); }
  }

  TINTAR_POINTS.forEach(([left, top], point) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tintar-point';
    button.style.left = `${left}%`;
    button.style.top = `${top}%`;
    button.dataset.point = String(point);
    button.setAttribute('role', 'gridcell');
    button.addEventListener('click', () => playPoint(point));
    boardElement.append(button);
    pointButtons.push(button);
  });

  function render(): void {
    const legalTargets = game.selectedPoint === null ? [] : game.legalDestinations(game.selectedPoint);
    pointButtons.forEach((button, point) => {
      const piece = game.board[point];
      button.classList.toggle('mint', piece === 1);
      button.classList.toggle('coral', piece === 2);
      button.classList.toggle('selected', game.selectedPoint === point);
      button.classList.toggle('legal-target', legalTargets.includes(point));
      button.classList.toggle('removable', game.phase === 'removing' && game.canRemove(point));
      const occupant = piece === 1 ? 'Mint piece' : piece === 2 ? 'Coral piece' : 'Empty point';
      button.setAttribute('aria-label', `${occupant}, position ${point + 1}`);
      button.setAttribute('aria-pressed', game.selectedPoint === point ? 'true' : 'false');
    });

    if (statusElement) {
      statusElement.textContent = botDifficulty && game.currentPlayer === 2 && game.phase !== 'finished'
        ? `Coral bot (${botLabels[botDifficulty]}) is thinking…`
        : game.statusText();
    }
    if (phaseElement) {
      phaseElement.textContent = game.phase === 'placing'
        ? 'Placement phase'
        : game.phase === 'moving'
          ? 'Movement phase'
          : game.phase === 'removing'
            ? 'Mill formed'
            : 'Match finished';
    }
    if (mintHandElement) mintHandElement.textContent = String(game.piecesToPlace[1]);
    if (mintBoardElement) mintBoardElement.textContent = String(game.pieceCount(1));
    if (coralHandElement) coralHandElement.textContent = String(game.piecesToPlace[2]);
    if (coralBoardElement) coralBoardElement.textContent = String(game.pieceCount(2));
    if (coralNameElement) coralNameElement.textContent = botDifficulty ? `Coral Bot · ${botLabels[botDifficulty]}` : 'Coral';
    turnMarker?.classList.toggle('coral', game.currentPlayer === 2);
    if (boardActions) boardActions.hidden = !matchStarted;
    if (game.phase === 'finished' && game.winner !== null && game.winner !== 0) {
      if (lastRenderedPhase !== 'finished') showVictoryEffect(game.winner);
    } else if (game.phase !== 'finished' && lastRenderedPhase === 'finished') {
      hideVictoryEffect();
    }
    lastRenderedPhase = game.phase;
    const trackedPlayer = (room?.session().online ? room.session().playerId : 1) ?? 1;
    resultReporter.report(game.phase === 'finished', {
      outcome: game.winner === 0 ? 'draw' : game.winner === trackedPlayer ? 'win' : 'loss',
      score: game.pieceCount(trackedPlayer),
    });
    scheduleBotTurn();
  }

  function scheduleBotTurn(): void {
    if (!botDifficulty || botTimer !== null || game.phase === 'finished' || game.currentPlayer !== 2
      || room?.session().online) return;
    const scheduledDifficulty = botDifficulty;
    botTimer = window.setTimeout(() => {
      botTimer = null;
      if (botDifficulty !== scheduledDifficulty || game.phase === 'finished' || game.currentPlayer !== 2
        || room?.session().online) return;
      const action = chooseTintarBotAction(game, scheduledDifficulty);
      if (action && applyTintarBotAction(game, action)) {
        matchStarted = true;
        render();
      }
    }, botDelays[scheduledDifficulty]);
  }

  function startBotMatch(difficulty: TintarBotDifficulty): void {
    room?.leave();
    setBotDifficulty(difficulty);
    matchStarted = true;
    game.reset();
    render();
  }

  function restartMatch(): void {
    matchStarted = true;
    if (room?.isGuest()) {
      if (room.sendAction({ type: 'restart' }) && revengeButton) {
        revengeButton.disabled = true;
        revengeButton.textContent = 'Waiting for Mint…';
      }
      return;
    }
    game.reset(); render();
    room?.broadcastState(snapshot(), true);
  }

  document.getElementById('tintarRestartButton')?.addEventListener('click', restartMatch);
  revengeButton?.addEventListener('click', restartMatch);
  botButtons.forEach(button => button.addEventListener('click', () => {
    const difficulty = button.dataset.tintarBotDifficulty;
    if (difficulty === 'easy' || difficulty === 'normal' || difficulty === 'hard') startBotMatch(difficulty);
  }));

  fullscreenButton?.addEventListener('click', () => { void toggleBoardFullscreen(); });
  document.addEventListener('fullscreenchange', updateFullscreenUi);
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && fallbackFullscreen) {
      event.preventDefault();
      void closeBoardFullscreen();
    }
  });
  document.querySelector('#tintarView [data-back-to-hub]')?.addEventListener('click', () => {
    hideVictoryEffect();
    void closeBoardFullscreen();
  });

  if (roomMount) {
    room = new GameRoomClient({
      game: 'tintar',
      mount: roomMount,
      onPlayLocal: () => { setBotDifficulty(null); matchStarted = true; game.reset(); render(); },
      onSessionChange: session => {
        if (session.online) setBotDifficulty(null);
        if (session.ready) matchStarted = true;
        if (session.ready && session.playerId === 1) {
          game.reset();
          room?.broadcastState(snapshot(), true);
        }
        render();
      },
      onRemoteAction: (action, from) => {
        if (!room?.isHost()) return;
        if (action.type === 'point' && from === game.currentPlayer && Number.isInteger(action.point)) {
          if (game.click(Number(action.point))) { matchStarted = true; render(); room.broadcastState(snapshot(), true); }
        } else if (action.type === 'restart') {
          matchStarted = true; game.reset(); render(); room.broadcastState(snapshot(), true);
        }
      },
      onState: state => { if (room?.isGuest()) { matchStarted = true; restore(state); render(); } },
    });
    roomMount.addEventListener('click', event => {
      const target = event.target instanceof Element ? event.target.closest('[data-room-matchmake], [data-room-create], [data-room-join]') : null;
      if (target) setBotDifficulty(null);
    });
  }

  render();
}
