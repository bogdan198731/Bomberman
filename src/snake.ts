import { GameRoomClient } from './game-room.js';
import { ArcadeResultReporter } from './stats.js';
import { bindVirtualJoystick, digitalJoystickState, type JoystickInputDirection } from './touch-controls.js';
import { isArcadeSessionPaused, registerArcadeSession } from './session-control.js';
import { bindLevelSelect, normalizeLevel, type LevelInfo } from './levels.js';
import { translateArcadeText } from './i18n.js';

export type SnakePlayer = 1 | 2;
export type SnakeMode = 'solo' | 'duel';
export type SnakePhase = 'ready' | 'playing' | 'finished';
export type SnakeDirection = 'up' | 'down' | 'left' | 'right';

export const SNAKE_COLUMNS = 24;
export const SNAKE_ROWS = 16;

export interface SnakeCell {
  x: number;
  y: number;
}

export interface SnakeRider {
  body: SnakeCell[];
  direction: SnakeDirection;
  queuedDirection: SnakeDirection;
  alive: boolean;
  score: number;
  /** Ticks left as a ghost that slips through snakes. */
  ghostTicks: number;
}

export type SnakeBonusKind = 'star' | 'shrink' | 'slow' | 'ghost';

export interface SnakeBonusInfo {
  label: string;
  /** Shown in the status line when caught. */
  notice: string;
  color: string;
  /** How many ticks the effect lasts; 0 for one-off bonuses. */
  ticks: number;
  /** Relative chance of this bonus among spawns. */
  weight: number;
}

export const SNAKE_BONUSES: Record<SnakeBonusKind, SnakeBonusInfo> = {
  star: { label: 'Star fruit', notice: 'Star fruit - 5 points!', color: '#ff9f43', ticks: 0, weight: 3 },
  shrink: { label: 'Shrink', notice: 'Shrink - tail trimmed!', color: '#5cd8ff', ticks: 0, weight: 2 },
  slow: { label: 'Slow time', notice: 'Slow time!', color: '#b28dff', ticks: 60, weight: 2 },
  ghost: { label: 'Ghost', notice: 'Ghost - slip through snakes!', color: '#e6ebff', ticks: 45, weight: 2 },
};
export const SNAKE_BONUS_KINDS = Object.keys(SNAKE_BONUSES) as SnakeBonusKind[];
/** Chance that eating a fruit makes a bonus appear, when none is out. */
export const SNAKE_BONUS_CHANCE = 0.35;
/** A bonus left alone fades after this many ticks. */
export const SNAKE_BONUS_LIFETIME = 50;
export const SNAKE_STAR_POINTS = 5;
export const SNAKE_SHRINK_CELLS = 3;
export const SNAKE_MIN_LENGTH = 3;
/** Slow time stretches every tick by this much. */
export const SNAKE_SLOW_FACTOR = 1.6;
const NOTICE_TICKS = 18;

export interface SnakeBonus extends SnakeCell {
  kind: SnakeBonusKind;
  ticksLeft: number;
}

/** Picks a bonus by weight; `roll` is in [0, 1). */
export function pickSnakeBonus(roll: number): SnakeBonusKind {
  const total = SNAKE_BONUS_KINDS.reduce((sum, kind) => sum + SNAKE_BONUSES[kind].weight, 0);
  let left = roll * total;
  for (const kind of SNAKE_BONUS_KINDS) {
    left -= SNAKE_BONUSES[kind].weight;
    if (left < 0) return kind;
  }
  return SNAKE_BONUS_KINDS[SNAKE_BONUS_KINDS.length - 1];
}

export interface SnakeLevel extends LevelInfo {
  walls: readonly SnakeCell[];
}

function wallRect(x: number, y: number, width: number, height: number): SnakeCell[] {
  const cells: SnakeCell[] = [];
  for (let row = y; row < y + height; row += 1) {
    for (let col = x; col < x + width; col += 1) cells.push({ x: col, y: row });
  }
  return cells;
}

/**
 * Arenas are built around the fixed spawns on row 8 (Mint at x 3-5 heading
 * right, Coral at x 18-20 heading left), so row 8 always stays open.
 */
export const SNAKE_LEVELS: readonly SnakeLevel[] = [
  { name: 'Open Arena', blurb: 'No walls, just the edges.', walls: [] },
  {
    name: 'Pillars',
    blurb: 'Four blocks to weave between.',
    walls: [...wallRect(5, 3, 2, 2), ...wallRect(17, 3, 2, 2), ...wallRect(5, 11, 2, 2), ...wallRect(17, 11, 2, 2)],
  },
  {
    name: 'Lanes',
    blurb: 'Two long walls split the arena, with a gap in the middle.',
    walls: [...wallRect(3, 4, 7, 1), ...wallRect(14, 4, 7, 1), ...wallRect(3, 11, 7, 1), ...wallRect(14, 11, 7, 1)],
  },
  {
    name: 'Fortress',
    blurb: 'An inner ring with a gate on every side.',
    walls: [
      ...wallRect(4, 2, 7, 1), ...wallRect(13, 2, 7, 1),
      ...wallRect(4, 13, 7, 1), ...wallRect(13, 13, 7, 1),
      ...wallRect(2, 4, 1, 3), ...wallRect(2, 9, 1, 3),
      ...wallRect(21, 4, 1, 3), ...wallRect(21, 9, 1, 3),
    ],
  },
  {
    name: 'Divider',
    blurb: 'A wall cuts the arena in two, open only through the middle.',
    walls: [...wallRect(11, 0, 2, 6), ...wallRect(11, 10, 2, 6)],
  },
  {
    name: 'Blocks',
    blurb: 'Sixteen blocks in a grid - plan every turn.',
    walls: [3, 8, 14, 19].flatMap(x => [2, 5, 10, 13].flatMap(y => wallRect(x, y, 2, 2))),
  },
  {
    name: 'Switchback',
    blurb: 'Long walls from either side force wide detours.',
    walls: [...wallRect(0, 4, 16, 1), ...wallRect(8, 11, 16, 1), ...wallRect(5, 1, 1, 3), ...wallRect(18, 12, 1, 3)],
  },
  {
    name: 'Crossbars',
    blurb: 'Bars from every edge leave four corner rooms to slip in and out of.',
    walls: [
      ...wallRect(0, 4, 9, 1), ...wallRect(15, 4, 9, 1),
      ...wallRect(0, 11, 9, 1), ...wallRect(15, 11, 9, 1),
      ...wallRect(11, 0, 2, 4), ...wallRect(11, 12, 2, 4),
    ],
  },
  {
    name: 'Comb',
    blurb: 'Teeth from the top and bottom - one wrong turn and you are boxed in.',
    walls: [
      ...[2, 7, 12, 17, 21].flatMap(x => wallRect(x, 0, 1, 6)),
      ...[4, 9, 14, 19].flatMap(x => wallRect(x, 10, 1, 6)),
    ],
  },
  {
    name: 'Labyrinth',
    blurb: 'Dense walls everywhere. The ultimate test of steering.',
    walls: [
      ...[2, 5, 8, 11, 14, 17, 20].flatMap(x => wallRect(x, 0, 1, 7)),
      ...[3, 6, 9, 12, 15, 18, 21].flatMap(x => wallRect(x, 10, 1, 6)),
      ...wallRect(0, 9, 2, 1), ...wallRect(22, 7, 2, 1),
    ],
  },
];

export function snakeWallKeys(level: number): Set<string> {
  const walls = SNAKE_LEVELS[normalizeLevel(level, SNAKE_LEVELS.length) - 1].walls;
  return new Set(walls.map(cell => `${cell.x},${cell.y}`));
}

const VECTORS: Record<SnakeDirection, SnakeCell> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const OPPOSITE: Record<SnakeDirection, SnakeDirection> = {
  up: 'down', down: 'up', left: 'right', right: 'left',
};

function sameCell(left: SnakeCell, right: SnakeCell): boolean {
  return left.x === right.x && left.y === right.y;
}

function makeRiders(): Record<SnakePlayer, SnakeRider> {
  return {
    1: {
      body: [{ x: 5, y: 8 }, { x: 4, y: 8 }, { x: 3, y: 8 }],
      direction: 'right', queuedDirection: 'right', alive: true, score: 0, ghostTicks: 0,
    },
    2: {
      body: [{ x: 18, y: 8 }, { x: 19, y: 8 }, { x: 20, y: 8 }],
      direction: 'left', queuedDirection: 'left', alive: true, score: 0, ghostTicks: 0,
    },
  };
}

export class NeonSnakeGame {
  riders = makeRiders();
  food: SnakeCell = { x: 12, y: 8 };
  bonus: SnakeBonus | null = null;
  /** Ticks left of slow time, which affects the whole arena. */
  slowTicks = 0;
  notice = '';
  noticeTicks = 0;
  mode: SnakeMode = 'solo';
  phase: SnakePhase = 'ready';
  winner: SnakePlayer | 0 | null = null;
  ticks = 0;
  collisionCause = '';
  level = 1;
  private walls = snakeWallKeys(1);
  private random: () => number;

  constructor(random: () => number = Math.random, level = 1) {
    this.random = random;
    this.setLevel(level, false);
    this.riders[2].alive = false;
    this.spawnFood();
  }

  /** Switches arena; restarting is optional so an online guest can just mirror it. */
  setLevel(level: number, restart = true): void {
    this.level = normalizeLevel(level, SNAKE_LEVELS.length);
    this.walls = snakeWallKeys(this.level);
    if (restart) this.restart(this.mode);
  }

  isWall(cell: SnakeCell): boolean {
    return this.walls.has(`${cell.x},${cell.y}`);
  }

  restart(mode: SnakeMode = this.mode): void {
    this.mode = mode;
    this.riders = makeRiders();
    this.riders[2].alive = mode === 'duel';
    this.phase = 'ready';
    this.winner = null;
    this.ticks = 0;
    this.collisionCause = '';
    this.bonus = null;
    this.slowTicks = 0;
    this.noticeTicks = 0;
    this.spawnFood();
  }

  /** How much longer than normal each tick should last right now. */
  tickScale(): number {
    return this.slowTicks > 0 ? SNAKE_SLOW_FACTOR : 1;
  }

  /** Timed bonuses still running, longest-lasting first. */
  activeEffects(): { kind: SnakeBonusKind; ticks: number; player?: SnakePlayer }[] {
    const effects: { kind: SnakeBonusKind; ticks: number; player?: SnakePlayer }[] = [];
    if (this.slowTicks > 0) effects.push({ kind: 'slow', ticks: this.slowTicks });
    ([1, 2] as SnakePlayer[]).forEach(player => {
      const rider = this.riders[player];
      if (rider.alive && rider.ghostTicks > 0) effects.push({ kind: 'ghost', ticks: rider.ghostTicks, player });
    });
    return effects.sort((a, b) => b.ticks - a.ticks);
  }

  /** Applies a bonus the player's head just reached. */
  collect(player: SnakePlayer, kind: SnakeBonusKind): void {
    const rider = this.riders[player];
    const info = SNAKE_BONUSES[kind];
    this.notice = this.mode === 'duel' ? `${player === 1 ? 'Mint' : 'Coral'}: ${info.notice}` : info.notice;
    this.noticeTicks = NOTICE_TICKS;
    if (kind === 'star') rider.score += SNAKE_STAR_POINTS;
    else if (kind === 'shrink') rider.body = rider.body.slice(0, Math.max(SNAKE_MIN_LENGTH, rider.body.length - SNAKE_SHRINK_CELLS));
    else if (kind === 'slow') this.slowTicks = info.ticks;
    else rider.ghostTicks = info.ticks;
  }

  start(): boolean {
    if (this.phase !== 'ready') return false;
    this.phase = 'playing';
    return true;
  }

  turn(player: SnakePlayer, direction: SnakeDirection): boolean {
    const rider = this.riders[player];
    if (!rider.alive || OPPOSITE[rider.direction] === direction) return false;
    rider.queuedDirection = direction;
    return true;
  }

  tick(): void {
    if (this.phase !== 'playing') return;
    const activePlayers = ([1, 2] as SnakePlayer[]).filter(player => this.riders[player].alive);
    const nextHeads = new Map<SnakePlayer, SnakeCell>();
    activePlayers.forEach(player => {
      const rider = this.riders[player];
      rider.direction = rider.queuedDirection;
      const vector = VECTORS[rider.direction];
      nextHeads.set(player, { x: rider.body[0].x + vector.x, y: rider.body[0].y + vector.y });
    });

    const growing = new Map<SnakePlayer, boolean>();
    activePlayers.forEach(player => growing.set(player, sameCell(nextHeads.get(player)!, this.food)));
    const occupied = new Map<string, SnakePlayer[]>();
    activePlayers.forEach(player => {
      // A ghost's body is no obstacle to anyone.
      if (this.riders[player].ghostTicks > 0) return;
      const body = growing.get(player) ? this.riders[player].body : this.riders[player].body.slice(0, -1);
      body.forEach(cell => {
        const key = `${cell.x},${cell.y}`;
        occupied.set(key, [...(occupied.get(key) || []), player]);
      });
    });

    const anyGhost = activePlayers.some(player => this.riders[player].ghostTicks > 0);
    const headOnCollision = activePlayers.length === 2 && !anyGhost && sameCell(nextHeads.get(1)!, nextHeads.get(2)!);
    activePlayers.forEach(player => {
      const head = nextHeads.get(player)!;
      const outOfBounds = head.x < 0 || head.x >= SNAKE_COLUMNS || head.y < 0 || head.y >= SNAKE_ROWS;
      const wallCollision = this.isWall(head);
      const bodyCollision = this.riders[player].ghostTicks === 0 && occupied.has(`${head.x},${head.y}`);
      if (outOfBounds || wallCollision || bodyCollision || headOnCollision) {
        this.riders[player].alive = false;
        this.collisionCause = outOfBounds || wallCollision ? 'wall' : headOnCollision ? 'head-on collision' : 'snake trail';
      }
    });

    activePlayers.forEach(player => {
      const rider = this.riders[player];
      if (!rider.alive) return;
      rider.body.unshift(nextHeads.get(player)!);
      if (growing.get(player)) rider.score += 1;
      else rider.body.pop();
    });

    // Bonuses tick down before a new catch, so a fresh one starts at full length.
    if (this.slowTicks > 0) this.slowTicks -= 1;
    activePlayers.forEach(player => {
      if (this.riders[player].ghostTicks > 0) this.riders[player].ghostTicks -= 1;
    });
    if (this.noticeTicks > 0) this.noticeTicks -= 1;
    if (this.bonus) {
      const bonus = this.bonus;
      const catcher = activePlayers.find(player => this.riders[player].alive && sameCell(this.riders[player].body[0], bonus));
      if (catcher) {
        this.bonus = null;
        this.collect(catcher, bonus.kind);
      } else if (--bonus.ticksLeft <= 0) this.bonus = null;
    }

    if (activePlayers.some(player => growing.get(player) && this.riders[player].alive)) {
      this.spawnFood();
      if (!this.bonus && this.random() < SNAKE_BONUS_CHANCE) this.spawnBonus();
    }
    this.ticks += 1;
    this.resolveGameOver();
  }

  statusText(): string {
    if (this.phase === 'ready') return this.mode === 'solo' ? 'Start a solo high-score run.' : 'Start the two-player duel.';
    if (this.phase === 'playing' && this.noticeTicks > 0) return this.notice;
    if (this.phase === 'playing') return this.mode === 'solo'
      ? `Score ${this.riders[1].score} — collect the neon cells.`
      : 'Last snake moving wins the arena.';
    if (this.mode === 'solo') return `Run over — hit ${this.collisionCause || 'an obstacle'} · final score ${this.riders[1].score}.`;
    if (this.winner === 0) return 'Double crash — draw!';
    return `${this.winner === 1 ? 'Mint' : 'Coral'} wins the arena!`;
  }

  private resolveGameOver(): void {
    if (this.mode === 'solo') {
      if (!this.riders[1].alive) this.phase = 'finished';
      return;
    }
    const alivePlayers = ([1, 2] as SnakePlayer[]).filter(player => this.riders[player].alive);
    if (alivePlayers.length < 2) {
      this.phase = 'finished';
      this.winner = alivePlayers[0] ?? 0;
    }
  }

  private spawnFood(): void {
    const bonus = this.bonus;
    const open = this.openCells().filter(cell => !bonus || !sameCell(cell, bonus));
    this.food = open[Math.floor(this.random() * open.length)] || { x: 12, y: 8 };
  }

  private spawnBonus(): void {
    const open = this.openCells().filter(cell => !sameCell(cell, this.food));
    const cell = open[Math.floor(this.random() * open.length)];
    if (cell) this.bonus = { ...cell, kind: pickSnakeBonus(this.random()), ticksLeft: SNAKE_BONUS_LIFETIME };
  }

  private openCells(): SnakeCell[] {
    const occupied = new Set<string>();
    ([1, 2] as SnakePlayer[]).forEach(player => {
      if (this.mode === 'solo' && player === 2) return;
      this.riders[player].body.forEach(cell => occupied.add(`${cell.x},${cell.y}`));
    });
    const open: SnakeCell[] = [];
    for (let y = 0; y < SNAKE_ROWS; y += 1) {
      for (let x = 0; x < SNAKE_COLUMNS; x += 1) {
        if (!occupied.has(`${x},${y}`) && !this.walls.has(`${x},${y}`)) open.push({ x, y });
      }
    }
    return open;
  }
}

export function initNeonSnake(): void {
  if (typeof document === 'undefined') return;
  const canvas = document.getElementById('snakeCanvas') as HTMLCanvasElement | null;
  const context = canvas?.getContext('2d');
  const view = document.getElementById('snakeView');
  if (!canvas || !context || !view) return;
  const snakeCanvas = canvas;
  const snakeContext = context;
  const snakeView = view;

  const cellSize = 32;
  canvas.width = SNAKE_COLUMNS * cellSize;
  canvas.height = SNAKE_ROWS * cellSize;
  const game = new NeonSnakeGame();
  const status = document.getElementById('snakeStatus');
  const mintScore = document.getElementById('snakeMintScore');
  const coralScore = document.getElementById('snakeCoralScore');
  const secondaryStat = document.getElementById('snakeSecondaryStat');
  const secondaryLabel = document.getElementById('snakeSecondaryLabel');
  const startButton = document.getElementById('snakeStartButton') as HTMLButtonElement | null;
  const speedSelect = document.getElementById('snakeSpeed') as HTMLSelectElement | null;
  const levelSelect = document.getElementById('snakeLevel') as HTMLSelectElement | null;
  const modeButtons = document.querySelectorAll<HTMLButtonElement>('[data-snake-mode]');
  const mintControls = document.getElementById('snakeMintControls');
  const coralControls = document.getElementById('snakeCoralControls');
  const roomMount = document.querySelector<HTMLElement>('[data-game-room="snake"]');
  let room: GameRoomClient | null = null;
  const resultReporter = new ArcadeResultReporter('snake');
  let tickInterval = Number(speedSelect?.value) || 115;
  try {
    const savedSpeed = Number(localStorage.getItem('blast-arcade-snake-speed-v1'));
    if (savedSpeed >= 80 && savedSpeed <= 180) {
      tickInterval = savedSpeed;
      if (speedSelect && Array.from(speedSelect.options).some(option => Number(option.value) === savedSpeed)) {
        speedSelect.value = String(savedSpeed);
      }
    }
  } catch {
    // Keep the approachable default when storage is unavailable.
  }

  game.setLevel(bindLevelSelect(levelSelect, 'snake', SNAKE_LEVELS, level => {
    // A guest follows the host's arena, so only the host may switch it.
    if (room?.isGuest()) {
      if (levelSelect) levelSelect.value = String(game.level);
      return;
    }
    game.setLevel(level);
    room?.broadcastState(snapshot(), true);
    syncUi(); render();
  }), true);

  function snapshot(): Record<string, unknown> {
    return {
      riders: game.riders, food: game.food, mode: game.mode, level: game.level,
      bonus: game.bonus, slowTicks: game.slowTicks, notice: game.notice, noticeTicks: game.noticeTicks,
      phase: game.phase, winner: game.winner, ticks: game.ticks, collisionCause: game.collisionCause, tickInterval,
    };
  }

  function restore(state: Record<string, unknown>): void {
    if (!state.riders || !state.food) return;
    game.riders = state.riders as Record<SnakePlayer, SnakeRider>;
    game.food = state.food as SnakeCell;
    game.bonus = (state.bonus as SnakeBonus | null) ?? null;
    game.slowTicks = Number(state.slowTicks) || 0;
    game.notice = typeof state.notice === 'string' ? state.notice : '';
    game.noticeTicks = Number(state.noticeTicks) || 0;
    game.mode = state.mode as SnakeMode;
    if (state.level !== undefined && Number(state.level) !== game.level) {
      game.setLevel(Number(state.level), false);
      if (levelSelect) levelSelect.value = String(game.level);
    }
    game.phase = state.phase as SnakePhase;
    game.winner = state.winner as SnakePlayer | 0 | null;
    game.ticks = Number(state.ticks) || 0;
    game.collisionCause = typeof state.collisionCause === 'string' ? state.collisionCause : '';
    if (Number(state.tickInterval) >= 80 && Number(state.tickInterval) <= 180) tickInterval = Number(state.tickInterval);
  }

  function turn(player: SnakePlayer, direction: SnakeDirection): void {
    if (isArcadeSessionPaused('snake')) return;
    const session = room?.session();
    if (!session?.online) game.turn(player, direction);
    else if (session.ready && room?.canControl(player)) {
      if (room.isGuest()) room.sendAction({ type: 'turn', direction });
      else game.turn(player, direction);
    }
  }

  function startRun(): void {
    if (isArcadeSessionPaused('snake')) return;
    const session = room?.session();
    if (session?.online && !session.ready) return;
    if (room?.isGuest()) room.sendAction({ type: 'start' });
    else {
      if (game.phase === 'finished') game.restart(game.mode);
      game.start();
      room?.broadcastState(snapshot(), true);
    }
    syncUi(); render();
  }

  function visible(): boolean {
    return !snakeView.classList.contains('view-hidden');
  }

  function syncUi(): void {
    const solo = game.mode === 'solo';
    if (status) status.textContent = game.statusText();
    if (mintScore) mintScore.textContent = String(game.riders[1].score);
    if (secondaryLabel) secondaryLabel.textContent = solo ? 'Length' : 'Coral';
    if (coralScore) coralScore.textContent = solo ? String(game.riders[1].body.length) : String(game.riders[2].score);
    secondaryStat?.classList.toggle('solo-stat', solo);
    if (startButton) startButton.textContent = game.phase === 'ready' ? 'Start run' : game.phase === 'finished' ? 'Play again' : 'Running';
    modeButtons.forEach(button => {
      button.classList.toggle('active', button.dataset.snakeMode === game.mode);
      button.disabled = Boolean(room?.session().online);
    });
    const touchSession = room?.session();
    mintControls?.classList.toggle('solo-hidden', Boolean(touchSession?.online && touchSession.playerId === 2));
    coralControls?.classList.toggle('solo-hidden', touchSession?.online ? touchSession.playerId !== 2 : game.mode === 'solo');
    const trackedPlayer = (room?.session().online ? room.session().playerId : 1) ?? 1;
    resultReporter.report(game.phase === 'finished', {
      outcome: game.mode === 'solo' ? 'complete' : game.winner === 0 ? 'draw' : game.winner === trackedPlayer ? 'win' : 'loss',
      score: game.riders[trackedPlayer].score,
      runOver: game.mode === 'solo',
    });
  }

  function render(): void {
    const canvas = snakeCanvas;
    const context = snakeContext;
    const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#10291f');
    gradient.addColorStop(.52, '#101824');
    gradient.addColorStop(1, '#2d1720');
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = 'rgba(255,255,255,.045)';
    context.lineWidth = 1;
    for (let x = 0; x <= canvas.width; x += cellSize) {
      context.beginPath(); context.moveTo(x, 0); context.lineTo(x, canvas.height); context.stroke();
    }
    for (let y = 0; y <= canvas.height; y += cellSize) {
      context.beginPath(); context.moveTo(0, y); context.lineTo(canvas.width, y); context.stroke();
    }

    const wallCells = SNAKE_LEVELS[game.level - 1].walls;
    if (wallCells.length) {
      context.shadowBlur = 10;
      context.shadowColor = '#7c8cff';
      context.fillStyle = '#39406e';
      wallCells.forEach(cell => {
        context.beginPath();
        context.roundRect(cell.x * cellSize + 2, cell.y * cellSize + 2, cellSize - 4, cellSize - 4, 5);
        context.fill();
      });
      context.shadowBlur = 0;
      context.strokeStyle = 'rgba(160,172,255,.55)';
      context.lineWidth = 1.5;
      wallCells.forEach(cell => context.strokeRect(cell.x * cellSize + 3.5, cell.y * cellSize + 3.5, cellSize - 7, cellSize - 7));
    }

    context.shadowBlur = 20;
    context.shadowColor = '#ffc857';
    context.fillStyle = '#ffc857';
    context.beginPath();
    context.arc((game.food.x + .5) * cellSize, (game.food.y + .5) * cellSize, cellSize * .25, 0, Math.PI * 2);
    context.fill();
    context.shadowBlur = 0;
    if (game.bonus) drawBonus(game.bonus);

    const colors: Record<SnakePlayer, readonly [string, string]> = {
      1: ['#54e38e', '#1f9d5a'], 2: ['#ff6b78', '#d83c51'],
    };
    ([1, 2] as SnakePlayer[]).forEach(player => {
      if (game.mode === 'solo' && player === 2) return;
      // A ghost snake is see-through, so everyone can tell it will slip past.
      context.globalAlpha = game.riders[player].ghostTicks > 0 ? 0.45 : 1;
      game.riders[player].body.forEach((cell, index) => {
        context.fillStyle = index === 0 ? colors[player][0] : colors[player][1];
        context.shadowBlur = index === 0 ? 14 : 0;
        context.shadowColor = colors[player][0];
        context.beginPath();
        context.roundRect(cell.x * cellSize + 4, cell.y * cellSize + 4, cellSize - 8, cellSize - 8, index === 0 ? 10 : 7);
        context.fill();
      });
    });
    context.globalAlpha = 1;
    context.shadowBlur = 0;
    drawEffects();
  }

  function drawBonus(bonus: SnakeBonus): void {
    const { color } = SNAKE_BONUSES[bonus.kind];
    // A bonus about to fade blinks.
    if (bonus.ticksLeft < 15 && bonus.ticksLeft % 2 === 0) return;
    const x = bonus.x * cellSize;
    const y = bonus.y * cellSize;
    snakeContext.fillStyle = color;
    snakeContext.shadowBlur = 16;
    snakeContext.shadowColor = color;
    snakeContext.beginPath();
    snakeContext.roundRect(x + 2, y + 2, cellSize - 4, cellSize - 4, 8);
    snakeContext.fill();
    snakeContext.shadowBlur = 0;
    drawIcon(bonus.kind, x + cellSize / 2, y + cellSize / 2, 18, '#0a1120');
  }

  /** Language-free symbols, so a bonus reads the same in every language and font. */
  function drawIcon(kind: SnakeBonusKind, x: number, y: number, size: number, color: string): void {
    const ctx = snakeContext;
    const h = size / 2;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = size / 6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    if (kind === 'star') {
      for (let i = 0; i < 10; i += 1) {
        const radius = i % 2 === 0 ? h : h * 0.45;
        const angle = -Math.PI / 2 + (i * Math.PI) / 5;
        ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
      }
      ctx.closePath();
      ctx.fill();
    } else if (kind === 'shrink') {
      // Two arrows pressing inwards.
      ctx.moveTo(-h, 0); ctx.lineTo(-h * 0.15, 0);
      ctx.moveTo(-h * 0.55, -h * 0.45); ctx.lineTo(-h * 0.15, 0); ctx.lineTo(-h * 0.55, h * 0.45);
      ctx.moveTo(h, 0); ctx.lineTo(h * 0.15, 0);
      ctx.moveTo(h * 0.55, -h * 0.45); ctx.lineTo(h * 0.15, 0); ctx.lineTo(h * 0.55, h * 0.45);
      ctx.stroke();
    } else if (kind === 'slow') {
      // An hourglass.
      ctx.moveTo(-h * 0.7, -h); ctx.lineTo(h * 0.7, -h); ctx.lineTo(-h * 0.7, h); ctx.lineTo(h * 0.7, h);
      ctx.closePath();
      ctx.fill();
    } else {
      // A little ghost with a wavy hem.
      ctx.moveTo(-h * 0.8, h);
      ctx.lineTo(-h * 0.8, -h * 0.1);
      ctx.arc(0, -h * 0.1, h * 0.8, Math.PI, 0);
      ctx.lineTo(h * 0.8, h);
      ctx.lineTo(h * 0.4, h * 0.6);
      ctx.lineTo(0, h);
      ctx.lineTo(-h * 0.4, h * 0.6);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  /** Running bonuses as small chips in the top-right corner, each with a draining bar. */
  function drawEffects(): void {
    const ctx = snakeContext;
    const effects = game.activeEffects();
    if (!effects.length) return;
    const chipH = 42;
    const secondsPerTick = (tickInterval * game.tickScale()) / 1000;
    ctx.font = '700 22px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    let right = snakeCanvas.width - 14;
    effects.forEach(effect => {
      const { color, ticks, label } = SNAKE_BONUSES[effect.kind];
      const text = `${translateArcadeText(label)} ${Math.ceil(effect.ticks * secondsPerTick)}`;
      const width = 40 + ctx.measureText(text).width + 14;
      const x = right - width;
      const y = 6;
      // In a duel the chip border says whose ghost it is.
      const edge = effect.player === 2 && game.mode === 'duel' ? '#ff6b78' : effect.player === 1 && game.mode === 'duel' ? '#54e38e' : color;
      ctx.fillStyle = 'rgba(10,17,32,.88)';
      ctx.strokeStyle = edge;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(x, y, width, chipH, 9);
      ctx.fill();
      ctx.stroke();
      drawIcon(effect.kind, x + 20, y + chipH / 2 - 2, 20, color);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(text, x + 38, y + chipH / 2 - 2);
      ctx.fillStyle = color;
      ctx.fillRect(x + 7, y + chipH - 6, (width - 14) * (effect.ticks / ticks), 3);
      right = x - 8;
    });
  }

  const directions: Record<string, readonly [SnakePlayer, SnakeDirection]> = {
    KeyW: [1, 'up'], KeyS: [1, 'down'], KeyA: [1, 'left'], KeyD: [1, 'right'],
    ArrowUp: [2, 'up'], ArrowDown: [2, 'down'], ArrowLeft: [2, 'left'], ArrowRight: [2, 'right'],
  };
  window.addEventListener('keydown', event => {
    if (!visible()) return;
    const command = directions[event.code];
    if (command) {
      event.preventDefault();
      turn(command[0], command[1]);
    } else if (event.code === 'Space' && !event.repeat) {
      event.preventDefault();
      startRun();
    }
  });

  document.querySelectorAll<HTMLButtonElement>('[data-snake-player][data-snake-direction]').forEach(button => {
    button.addEventListener('pointerdown', event => {
      event.preventDefault();
      turn(Number(button.dataset.snakePlayer) as SnakePlayer, button.dataset.snakeDirection as SnakeDirection);
    });
  });
  document.querySelectorAll<HTMLElement>('[data-snake-joystick]').forEach(track => {
    const player = Number(track.dataset.snakeJoystick) as SnakePlayer;
    let activeDirection: JoystickInputDirection | undefined;
    bindVirtualJoystick(track, vector => {
      const state = digitalJoystickState(vector, 'cardinal');
      const direction = (Object.keys(state) as JoystickInputDirection[]).find(candidate => state[candidate]);
      if (direction && direction !== activeDirection) turn(player, direction);
      activeDirection = direction;
    });
  });
  modeButtons.forEach(button => button.addEventListener('click', () => {
    const mode = button.dataset.snakeMode;
    if (mode === 'solo' || mode === 'duel') {
      game.restart(mode);
      syncUi();
      render();
    }
  }));
  startButton?.addEventListener('click', startRun);
  document.getElementById('snakeRestartButton')?.addEventListener('click', () => {
    if (room?.isGuest()) room.sendAction({ type: 'restart' });
    else {
      game.restart(game.mode); syncUi(); render();
      room?.broadcastState(snapshot(), true);
    }
  });

  if (roomMount) {
    room = new GameRoomClient({
      game: 'snake',
      mount: roomMount,
      offlineModes: [
        { id: 'local', label: 'Local 2P', description: 'Two snakes share this device.', onSelect: () => { accumulator = 0; game.restart('duel'); syncUi(); render(); } },
        { id: 'solo', label: 'Solo', description: 'Chase fruit and your own high score.', onSelect: () => { accumulator = 0; game.restart('solo'); syncUi(); render(); } },
      ],
      initialOfflineMode: 'solo',
      onSessionChange: session => {
        accumulator = 0;
        if (!session.online) game.restart('solo');
        else if (session.ready && session.playerId === 1) {
          game.restart('duel');
          room?.broadcastState(snapshot(), true);
        }
        syncUi(); render();
      },
      onRemoteAction: (action, from) => {
        if (!room?.isHost() || from !== 2) return;
        if (action.type === 'turn' && (action.direction === 'up' || action.direction === 'down' || action.direction === 'left' || action.direction === 'right')) {
          game.turn(2, action.direction);
        } else if (action.type === 'start') {
          if (game.phase === 'finished') game.restart('duel');
          game.start();
        } else if (action.type === 'restart') game.restart('duel');
        room.broadcastState(snapshot(), true); syncUi(); render();
      },
      onState: state => { if (room?.isGuest()) { restore(state); syncUi(); render(); } },
    });
  }

  registerArcadeSession({
    gameId: 'snake',
    view: snakeView,
    mode: () => room?.session().online ? 'online' : game.mode === 'solo' ? 'solo' : 'local',
    isActive: () => game.phase === 'playing',
    clearHeldInputs: () => { accumulator = 0; },
  });
  let swipeStart: { x: number; y: number; id: number } | null = null;
  canvas.addEventListener('pointerdown', event => { swipeStart = { x: event.clientX, y: event.clientY, id: event.pointerId }; });
  canvas.addEventListener('pointerup', event => {
    if (!swipeStart || swipeStart.id !== event.pointerId) return;
    const dx = event.clientX - swipeStart.x; const dy = event.clientY - swipeStart.y; swipeStart = null;
    if (Math.hypot(dx, dy) < 24) return;
    turn(1, Math.abs(dx) > Math.abs(dy) ? dx > 0 ? 'right' : 'left' : dy > 0 ? 'down' : 'up');
  });
  speedSelect?.addEventListener('change', () => {
    tickInterval = Math.max(80, Math.min(180, Number(speedSelect.value) || 115));
    try { localStorage.setItem('blast-arcade-snake-speed-v1', String(tickInterval)); } catch { /* optional */ }
  });

  let accumulator = 0;
  let previous = performance.now();
  function loop(now: number): void {
    if (visible()) {
      if (!room?.isGuest() && !isArcadeSessionPaused('snake')) {
        accumulator += Math.min(100, now - previous);
        while (accumulator >= tickInterval * game.tickScale()) {
          accumulator -= tickInterval * game.tickScale();
          game.tick();
          syncUi();
        }
        room?.broadcastState(snapshot());
      }
      render();
    } else accumulator = 0;
    previous = now;
    requestAnimationFrame(loop);
  }

  syncUi();
  render();
  requestAnimationFrame(loop);
}
