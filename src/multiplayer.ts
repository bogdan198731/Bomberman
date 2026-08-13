import {
  BOMB_TIMER,
  EXPLOSION_RADIUS,
  GameState,
  type GameStatus,
  type Player,
  type PowerUp,
  type RenderState,
  createMapGrid,
  createPlayers,
  getGameStatus,
  killPlayer,
  movePlayer,
} from './index.js';

export type PlayerId = 1 | 2;
export type RoomPhase = 'waiting' | 'countdown' | 'playing' | 'finished';

export type PlayerAction =
  | { type: 'move'; dx: -1 | 0 | 1; dy: -1 | 0 | 1 }
  | { type: 'bomb' }
  | { type: 'restart' };

export interface OnlineSnapshot extends RenderState {
  phase: RoomPhase;
  round: number;
  scores: Record<PlayerId, number>;
  gameStatus: GameStatus;
  connectedPlayers: PlayerId[];
  overlayText: string;
  statusText: string;
}

const ROUND_INTRO_DURATION = 1_750;

export class OnlineRoom {
  readonly code: string;
  readonly connectedPlayers = new Set<PlayerId>();
  gameState = new GameState();
  players = createPlayers();
  phase: RoomPhase = 'waiting';
  round = 1;
  scores: Record<PlayerId, number> = { 1: 0, 2: 0 };
  gameStatus: GameStatus = 'playing';
  roundStartedAt = 0;
  statusText = 'Waiting for opponent';

  private readonly lastMovedAt: Record<PlayerId, number> = { 1: 0, 2: 0 };
  private statusMessageUntil = 0;

  constructor(code: string) {
    this.code = code;
  }

  connectPlayer(playerId: PlayerId, now: number = Date.now()): void {
    this.connectedPlayers.add(playerId);
    if (this.connectedPlayers.size === 2) {
      this.startRound(false, now);
    } else {
      this.phase = 'waiting';
      this.statusText = 'Waiting for opponent';
    }
  }

  disconnectPlayer(playerId: PlayerId): void {
    this.connectedPlayers.delete(playerId);
    this.phase = 'waiting';
    this.statusText = 'Opponent disconnected';
  }

  handleAction(playerId: PlayerId, action: PlayerAction, now: number = Date.now()): void {
    if (!this.connectedPlayers.has(playerId)) return;

    if (action.type === 'restart') {
      if (this.connectedPlayers.size === 2) this.startRound(true, now);
      return;
    }

    if (this.phase !== 'playing') return;
    const player = this.players[playerId - 1];
    if (!player?.alive) return;

    if (action.type === 'move') {
      const isSingleStep = Math.abs(action.dx) + Math.abs(action.dy) === 1;
      if (!isSingleStep) return;

      const moveDuration = player.moveDuration ?? 125;
      if (now - this.lastMovedAt[playerId] < moveDuration) return;

      const previousX = player.x;
      const previousY = player.y;
      movePlayer(player, action.dx, action.dy, {
        width: this.gameState.width,
        height: this.gameState.height,
        tiles: this.gameState.grid,
      });

      if (player.x !== previousX || player.y !== previousY) {
        this.lastMovedAt[playerId] = now;
        this.collectFor(player, now);
      }
      return;
    }

    const activeBombs = this.gameState.bombs.filter(
      bomb => bomb.ownerId === playerId && bomb.explodedAt === undefined
    ).length;
    if (activeBombs >= (player.maxBombs ?? 1)) return;

    this.gameState.placeBomb(
      { x: player.x, y: player.y },
      now,
      playerId,
      player.blastRadius ?? EXPLOSION_RADIUS
    );
  }

  update(now: number = Date.now()): void {
    if (this.phase === 'countdown') {
      if (now - this.roundStartedAt >= ROUND_INTRO_DURATION) {
        this.phase = 'playing';
        this.statusText = 'Round live';
      }
      return;
    }

    if (this.phase !== 'playing') return;

    this.gameState.update(now);
    for (const player of this.players) {
      if (player.alive && this.gameState.isExplosion(player.x, player.y)) {
        killPlayer(player);
      }
      if (player.alive) this.collectFor(player, now);
    }

    if (this.statusMessageUntil > 0 && now >= this.statusMessageUntil) {
      this.statusMessageUntil = 0;
      this.statusText = 'Round live';
    }

    const nextStatus = getGameStatus(this.players);
    if (nextStatus === 'playing') return;

    this.gameStatus = nextStatus;
    this.phase = 'finished';
    if (nextStatus === 'player1-wins') {
      this.scores[1] += 1;
      this.statusText = 'Mint wins';
    } else if (nextStatus === 'player2-wins') {
      this.scores[2] += 1;
      this.statusText = 'Coral wins';
    } else {
      this.statusText = 'Double knockout';
    }
  }

  snapshot(now: number = Date.now()): OnlineSnapshot {
    const explosions = [...this.gameState.explosions.keys()].map(key => {
      const [x, y] = key.split(',').map(Number);
      return { x, y };
    });
    const powerUps: PowerUp[] = [...this.gameState.powerUps.entries()].map(([key, type]) => {
      const [x, y] = key.split(',').map(Number);
      return { x, y, type };
    });
    const bombs = this.gameState.bombs
      .filter(bomb => bomb.explodedAt === undefined)
      .map(bomb => ({ x: bomb.position.x, y: bomb.position.y }));

    return {
      phase: this.phase,
      round: this.round,
      scores: { ...this.scores },
      gameStatus: this.gameStatus,
      connectedPlayers: [...this.connectedPlayers],
      overlayText: this.getOverlayText(now),
      statusText: this.statusText,
      grid: {
        width: this.gameState.width,
        height: this.gameState.height,
        tiles: this.gameState.grid,
      },
      players: this.players,
      bombs,
      explosions,
      powerUps,
    };
  }

  private startRound(incrementRound: boolean, now: number): void {
    if (incrementRound) this.round += 1;
    const map = createMapGrid();
    this.gameState = new GameState(map);
    this.players = createPlayers();
    this.gameStatus = 'playing';
    this.phase = 'countdown';
    this.roundStartedAt = now;
    this.lastMovedAt[1] = 0;
    this.lastMovedAt[2] = 0;
    this.statusMessageUntil = 0;
    this.statusText = 'Get ready';
  }

  private collectFor(player: Player, now: number): void {
    const collected = this.gameState.collectPowerUp(player);
    if (!collected) return;

    const names = {
      'bomb-up': 'Bomb Up',
      'fire-up': 'Fire Up',
      'speed-up': 'Speed Up',
    };
    this.statusMessageUntil = now + 1_600;
    this.statusText = `${player.id === 1 ? 'Mint' : 'Coral'}: ${names[collected]}!`;
  }

  private getOverlayText(now: number): string {
    if (this.phase === 'waiting') return 'WAITING';
    if (this.phase !== 'countdown') return '';

    const elapsed = now - this.roundStartedAt;
    if (elapsed < 650) return `ROUND ${this.round}`;
    if (elapsed < 1_300) return 'READY';
    return 'BLAST!';
  }
}

export function isPlayerAction(value: unknown): value is PlayerAction {
  if (!value || typeof value !== 'object') return false;
  const action = value as Partial<PlayerAction>;
  if (action.type === 'bomb' || action.type === 'restart') return true;
  if (action.type !== 'move') return false;
  return (
    typeof action.dx === 'number' &&
    typeof action.dy === 'number' &&
    Math.abs(action.dx) + Math.abs(action.dy) === 1
  );
}

export { BOMB_TIMER };
