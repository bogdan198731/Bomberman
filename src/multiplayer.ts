import {
  BOMB_TIMER,
  EXPLOSION_RADIUS,
  GameState,
  TileType,
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
export type BotDifficulty = 'easy' | 'normal' | 'hard';

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
  botDifficulty?: BotDifficulty;
  overlayText: string;
  statusText: string;
}

const ROUND_INTRO_DURATION = 1_750;
const DIRECTIONS = [
  { dx: 1 as const, dy: 0 as const },
  { dx: -1 as const, dy: 0 as const },
  { dx: 0 as const, dy: 1 as const },
  { dx: 0 as const, dy: -1 as const },
];

const BOT_PROFILES: Record<BotDifficulty, {
  reactionMs: number;
  dangerLookahead: number;
  mistakeRate: number;
  collectsPowerUps: boolean;
}> = {
  easy: { reactionMs: 520, dangerLookahead: 900, mistakeRate: 0.3, collectsPowerUps: false },
  normal: { reactionMs: 270, dangerLookahead: 1_750, mistakeRate: 0.09, collectsPowerUps: true },
  hard: { reactionMs: 140, dangerLookahead: BOMB_TIMER, mistakeRate: 0, collectsPowerUps: true },
};

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
  botDifficulty?: BotDifficulty;

  private readonly lastMovedAt: Record<PlayerId, number> = { 1: 0, 2: 0 };
  private statusMessageUntil = 0;
  private lastBotActionAt = 0;
  private botDecisionCount = 0;

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

  connectBot(difficulty: BotDifficulty, now: number = Date.now()): void {
    this.botDifficulty = difficulty;
    this.connectedPlayers.add(2);
    this.startRound(false, now);
    this.statusText = `${difficulty[0].toUpperCase()}${difficulty.slice(1)} bot ready`;
  }

  disconnectPlayer(playerId: PlayerId): void {
    this.connectedPlayers.delete(playerId);
    if (this.botDifficulty && playerId === 1) this.connectedPlayers.delete(2);
    this.phase = 'waiting';
    this.statusText = 'Opponent disconnected';
  }

  handleAction(playerId: PlayerId, action: PlayerAction, now: number = Date.now()): void {
    if (!this.connectedPlayers.has(playerId)) return;
    if (this.botDifficulty && playerId === 2) return;

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

    this.updateBot(now);
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
      botDifficulty: this.botDifficulty,
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
    this.lastBotActionAt = 0;
    this.botDecisionCount = 0;
    this.statusText = 'Get ready';
  }

  private updateBot(now: number): void {
    if (!this.botDifficulty || this.phase !== 'playing') return;
    const bot = this.players[1];
    if (!bot.alive) return;

    const profile = BOT_PROFILES[this.botDifficulty];
    if (now - this.lastBotActionAt < profile.reactionMs) return;
    this.lastBotActionAt = now;
    this.botDecisionCount += 1;

    const dangerTimes = this.calculateDangerTimes(now);
    const currentDanger = dangerTimes.get(`${bot.x},${bot.y}`) ?? Infinity;
    if (currentDanger <= profile.dangerLookahead || this.gameState.isExplosion(bot.x, bot.y)) {
      const escape = this.findPathStep(
        bot,
        (x, y, arrival) => (dangerTimes.get(`${x},${y}`) ?? Infinity) > profile.dangerLookahead + arrival,
        dangerTimes,
        profile.reactionMs,
        10
      );
      if (escape) this.moveBot(bot, escape, now);
      return;
    }

    const roll = this.botRoll();
    if (roll < profile.mistakeRate) {
      const shuffled = this.rotatedDirections();
      const wanderingMove = shuffled.find(direction => this.isSafeBotDestination(
        bot.x + direction.dx,
        bot.y + direction.dy,
        dangerTimes,
        profile.dangerLookahead
      ));
      if (wanderingMove) this.moveBot(bot, wanderingMove, now);
      return;
    }

    const human = this.players[0];
    const hasBombTarget = this.hasAdjacentCrate(bot) || this.canHitPlayer(bot, human);
    const bombChance = this.botDifficulty === 'hard' ? 1 : this.botDifficulty === 'normal' ? 0.88 : 0.62;
    if (hasBombTarget && this.botRoll(19) < bombChance && this.canBotEscapeOwnBomb(bot, now)) {
      this.placeBotBomb(bot, now);
      return;
    }

    if (profile.collectsPowerUps && this.gameState.powerUps.size > 0) {
      const powerUpKeys = new Set(this.gameState.powerUps.keys());
      const step = this.findPathStep(
        bot,
        (x, y) => powerUpKeys.has(`${x},${y}`),
        dangerTimes,
        profile.reactionMs,
        this.botDifficulty === 'hard' ? 18 : 12
      );
      if (step) {
        this.moveBot(bot, step, now);
        return;
      }
    }

    const distanceToHuman = Math.abs(bot.x - human.x) + Math.abs(bot.y - human.y);
    if (this.botDifficulty === 'hard' || (this.botDifficulty === 'normal' && distanceToHuman <= 6)) {
      const pursuit = this.findPathStep(
        bot,
        (x, y) => Math.abs(x - human.x) + Math.abs(y - human.y) <= 1,
        dangerTimes,
        profile.reactionMs,
        22
      );
      if (pursuit) {
        this.moveBot(bot, pursuit, now);
        return;
      }
    }

    const crateStep = this.findPathStep(
      bot,
      (x, y) => DIRECTIONS.some(direction =>
        this.gameState.getCellAt({ x: x + direction.dx, y: y + direction.dy }) === TileType.WALL_DESTRUCTIBLE
      ),
      dangerTimes,
      profile.reactionMs,
      20
    );
    if (crateStep) {
      this.moveBot(bot, crateStep, now);
      return;
    }

    const fallback = this.findPathStep(
      bot,
      (x, y) => Math.abs(x - human.x) + Math.abs(y - human.y) <= 2,
      dangerTimes,
      profile.reactionMs,
      24
    );
    if (fallback) this.moveBot(bot, fallback, now);
  }

  private moveBot(
    bot: Player,
    direction: { dx: -1 | 0 | 1; dy: -1 | 0 | 1 },
    now: number
  ): void {
    const previousX = bot.x;
    const previousY = bot.y;
    movePlayer(bot, direction.dx, direction.dy, {
      width: this.gameState.width,
      height: this.gameState.height,
      tiles: this.gameState.grid,
    });
    if (bot.x !== previousX || bot.y !== previousY) {
      this.lastMovedAt[2] = now;
      this.collectFor(bot, now);
    }
  }

  private placeBotBomb(bot: Player, now: number): boolean {
    const activeBombs = this.gameState.bombs.filter(
      bomb => bomb.ownerId === 2 && bomb.explodedAt === undefined
    ).length;
    if (activeBombs >= (bot.maxBombs ?? 1)) return false;
    return this.gameState.placeBomb(
      { x: bot.x, y: bot.y },
      now,
      2,
      bot.blastRadius ?? EXPLOSION_RADIUS
    );
  }

  private canBotEscapeOwnBomb(bot: Player, now: number): boolean {
    const radius = bot.blastRadius ?? EXPLOSION_RADIUS;
    const dangerTimes = this.calculateDangerTimes(now, {
      x: bot.x,
      y: bot.y,
      radius,
      timeUntilExplosion: BOMB_TIMER,
    });
    return Boolean(this.findPathStep(
      bot,
      (x, y) => !dangerTimes.has(`${x},${y}`),
      dangerTimes,
      bot.moveDuration ?? 125,
      Math.max(6, radius + 3)
    ));
  }

  private hasAdjacentCrate(player: Player): boolean {
    return DIRECTIONS.some(direction =>
      this.gameState.getCellAt({ x: player.x + direction.dx, y: player.y + direction.dy }) ===
      TileType.WALL_DESTRUCTIBLE
    );
  }

  private canHitPlayer(attacker: Player, target: Player): boolean {
    if (!target.alive) return false;
    const radius = attacker.blastRadius ?? EXPLOSION_RADIUS;
    if (attacker.x !== target.x && attacker.y !== target.y) return false;
    const distance = Math.abs(attacker.x - target.x) + Math.abs(attacker.y - target.y);
    if (distance > radius) return false;

    const dx = Math.sign(target.x - attacker.x);
    const dy = Math.sign(target.y - attacker.y);
    for (let step = 1; step < distance; step += 1) {
      const tile = this.gameState.getCellAt({ x: attacker.x + dx * step, y: attacker.y + dy * step });
      if (tile !== TileType.EMPTY) return false;
    }
    return true;
  }

  private calculateDangerTimes(
    now: number,
    extraBomb?: { x: number; y: number; radius: number; timeUntilExplosion: number }
  ): Map<string, number> {
    const danger = new Map<string, number>();
    for (const key of this.gameState.explosions.keys()) danger.set(key, 0);

    const bombs = this.gameState.bombs
      .filter(bomb => bomb.explodedAt === undefined)
      .map(bomb => ({
        x: bomb.position.x,
        y: bomb.position.y,
        radius: bomb.radius ?? EXPLOSION_RADIUS,
        timeUntilExplosion: Math.max(0, (bomb.placedAt ?? now) + bomb.timer - now),
      }));
    if (extraBomb) bombs.push(extraBomb);

    for (const bomb of bombs) {
      for (const position of this.getBlastPositions(bomb.x, bomb.y, bomb.radius)) {
        const key = `${position.x},${position.y}`;
        danger.set(key, Math.min(danger.get(key) ?? Infinity, bomb.timeUntilExplosion));
      }
    }
    return danger;
  }

  private getBlastPositions(x: number, y: number, radius: number): Array<{ x: number; y: number }> {
    const positions = [{ x, y }];
    for (const direction of DIRECTIONS) {
      for (let distance = 1; distance <= radius; distance += 1) {
        const nx = x + direction.dx * distance;
        const ny = y + direction.dy * distance;
        const tile = this.gameState.getCellAt({ x: nx, y: ny });
        if (tile === TileType.WALL_INDESTRUCTIBLE) break;
        positions.push({ x: nx, y: ny });
        if (tile === TileType.WALL_DESTRUCTIBLE || tile === TileType.BOMB) break;
      }
    }
    return positions;
  }

  private findPathStep(
    player: Player,
    isGoal: (x: number, y: number, arrivalMs: number) => boolean,
    dangerTimes: Map<string, number>,
    stepDuration: number,
    maxDepth: number
  ): { dx: -1 | 0 | 1; dy: -1 | 0 | 1 } | undefined {
    type SearchNode = {
      x: number;
      y: number;
      depth: number;
      first?: { dx: -1 | 0 | 1; dy: -1 | 0 | 1 };
    };
    const queue: SearchNode[] = [{ x: player.x, y: player.y, depth: 0 }];
    const visited = new Set([`${player.x},${player.y}`]);
    const directions = this.rotatedDirections();

    while (queue.length > 0) {
      const current = queue.shift() as SearchNode;
      const arrivalMs = current.depth * stepDuration;
      if (current.depth > 0 && isGoal(current.x, current.y, arrivalMs)) return current.first;
      if (current.depth >= maxDepth) continue;

      for (const direction of directions) {
        const nx = current.x + direction.dx;
        const ny = current.y + direction.dy;
        const key = `${nx},${ny}`;
        if (visited.has(key)) continue;
        if (this.gameState.getCellAt({ x: nx, y: ny }) !== TileType.EMPTY) continue;

        const nextArrival = (current.depth + 1) * stepDuration;
        const dangerAt = dangerTimes.get(key) ?? Infinity;
        if (dangerAt <= nextArrival + 180) continue;

        visited.add(key);
        queue.push({
          x: nx,
          y: ny,
          depth: current.depth + 1,
          first: current.first ?? direction,
        });
      }
    }
    return undefined;
  }

  private isSafeBotDestination(
    x: number,
    y: number,
    dangerTimes: Map<string, number>,
    safetyWindow: number
  ): boolean {
    return (
      this.gameState.getCellAt({ x, y }) === TileType.EMPTY &&
      (dangerTimes.get(`${x},${y}`) ?? Infinity) > safetyWindow
    );
  }

  private rotatedDirections(): typeof DIRECTIONS[number][] {
    const offset = (this.botDecisionCount + this.round) % DIRECTIONS.length;
    return [...DIRECTIONS.slice(offset), ...DIRECTIONS.slice(0, offset)];
  }

  private botRoll(salt: number = 0): number {
    const bot = this.players[1];
    return ((this.round * 97 + this.botDecisionCount * 53 + bot.x * 17 + bot.y * 31 + salt) % 100) / 100;
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
