import { ArcadeResultReporter } from './stats.js';
import { isArcadeSessionPaused, registerArcadeSession } from './session-control.js';
import { bindLevelSelect, normalizeLevel, type LevelInfo } from './levels.js';
import { translateArcadeText } from './i18n.js';

export const BRICK_ARENA_WIDTH = 800;
export const BRICK_ARENA_HEIGHT = 600;
export const BRICK_COLUMNS = 10;
const BRICK_W = 72;
const BRICK_H = 24;
const BRICK_GAP = 6;
const BRICK_LEFT = (BRICK_ARENA_WIDTH - (BRICK_COLUMNS * BRICK_W + (BRICK_COLUMNS - 1) * BRICK_GAP)) / 2;
const BRICK_TOP = 72;
export const PADDLE_Y = 560;
export const PADDLE_W = 112;
const PADDLE_H = 14;
const PADDLE_SPEED = 640;
export const BALL_R = 8;
const BALL_START_SPEED = 380;
const BALL_MAX_SPEED = 660;
const MAX_STEP = 5;
export const START_LIVES = 3;
export const MAX_LIVES = 5;
export const WIDE_PADDLE_W = 168;
export const CAPSULE_W = 72;
export const CAPSULE_H = 30;
const CAPSULE_SPEED = 170;
/** Roughly one broken brick in seven drops a capsule. */
export const DROP_CHANCE = 0.14;
const MAX_FALLING = 2;
const MAX_BALLS = 3;
const SLOW_FACTOR = 0.68;
const NOTICE_SECONDS = 2.5;

export type CapsuleKind = 'life' | 'power' | 'wide' | 'multi' | 'slow';

export interface CapsuleInfo {
  label: string;
  /** Shown in the status line when caught. */
  notice: string;
  color: string;
  /** How long the effect lasts; 0 for one-off bonuses. */
  seconds: number;
  /** Relative chance of this capsule among drops. */
  weight: number;
}

export const CAPSULES: Record<CapsuleKind, CapsuleInfo> = {
  life: { label: 'Extra life', notice: 'Extra life!', color: '#ff5d8f', seconds: 0, weight: 1 },
  power: { label: 'Power ball', notice: 'Power ball - smash straight through!', color: '#ff9f43', seconds: 8, weight: 2 },
  wide: { label: 'Wide paddle', notice: 'Wide paddle!', color: '#54e38e', seconds: 15, weight: 3 },
  multi: { label: 'Multi-ball', notice: 'Multi-ball!', color: '#5c8dff', seconds: 0, weight: 2 },
  slow: { label: 'Slow ball', notice: 'Slow ball!', color: '#b28dff', seconds: 10, weight: 3 },
};
export const CAPSULE_KINDS = Object.keys(CAPSULES) as CapsuleKind[];
const TIMED_KINDS = CAPSULE_KINDS.filter(kind => CAPSULES[kind].seconds > 0);

export interface Ball { x: number; y: number; vx: number; vy: number }

export interface Capsule { x: number; y: number; kind: CapsuleKind }

/** Picks a capsule by weight; `roll` is in [0, 1). */
export function pickCapsule(roll: number): CapsuleKind {
  const total = CAPSULE_KINDS.reduce((sum, kind) => sum + CAPSULES[kind].weight, 0);
  let left = roll * total;
  for (const kind of CAPSULE_KINDS) {
    left -= CAPSULES[kind].weight;
    if (left < 0) return kind;
  }
  return CAPSULE_KINDS[CAPSULE_KINDS.length - 1];
}

export type BrickPhase = 'ready' | 'playing' | 'cleared' | 'won' | 'lost';

export interface Brick {
  x: number;
  y: number;
  hits: number;
  /** Steel bricks never break and do not count toward clearing a level. */
  steel: boolean;
}

export interface BrickLevel extends LevelInfo {
  /** One string per row: '.' gap, '1'-'3' hits to break, '#' steel. */
  rows: readonly string[];
}

export const BRICK_LEVELS: readonly BrickLevel[] = [
  { name: 'First Wall', blurb: 'Four rows of single-hit bricks.', rows: ['1111111111', '1111111111', '1111111111', '1111111111'] },
  { name: 'Checkerboard', blurb: 'Tougher bricks with gaps to slip the ball through.', rows: ['2.2.2.2.2.', '.2.2.2.2.2', '2.2.2.2.2.', '.1.1.1.1.1', '1.1.1.1.1.'] },
  { name: 'Pyramid', blurb: 'A three-hit peak on a wide base.', rows: ['....33....', '...2222...', '..222222..', '.11111111.', '1111111111'] },
  { name: 'Fortress', blurb: 'Steel towers guard a tough core.', rows: ['#22222222#', '#23333332#', '#2......2#', '#11111111#', '..........', '1111..1111'] },
  { name: 'Vault', blurb: 'Crack the steel-lined vault.', rows: ['3333333333', '#........#', '#.333333.#', '#.2####2.#', '#.222222.#', '#11111111#'] },
];

export function buildBricks(level: number): Brick[] {
  const rows = BRICK_LEVELS[normalizeLevel(level, BRICK_LEVELS.length) - 1].rows;
  const bricks: Brick[] = [];
  rows.forEach((row, r) => {
    [...row].forEach((code, c) => {
      if (code === '.') return;
      bricks.push({
        x: BRICK_LEFT + c * (BRICK_W + BRICK_GAP),
        y: BRICK_TOP + r * (BRICK_H + BRICK_GAP),
        hits: code === '#' ? 1 : Number(code),
        steel: code === '#',
      });
    });
  });
  return bricks;
}

export class BrickBreakerGame {
  level = 1;
  bricks: Brick[] = buildBricks(1);
  paddleX = BRICK_ARENA_WIDTH / 2;
  balls: Ball[] = [{ x: BRICK_ARENA_WIDTH / 2, y: PADDLE_Y - PADDLE_H / 2 - BALL_R, vx: 0, vy: 0 }];
  capsules: Capsule[] = [];
  /** Seconds left on each timed bonus. */
  effects: Record<CapsuleKind, number> = { life: 0, power: 0, wide: 0, multi: 0, slow: 0 };
  lives = START_LIVES;
  score = 0;
  phase: BrickPhase = 'ready';
  private steer = 0;
  private speed = BALL_START_SPEED;
  private notice = '';
  private noticeLeft = 0;

  constructor(private readonly random: () => number = Math.random) {}

  /** The first ball in play; setting it leaves just that one ball. */
  get ball(): Ball { return this.balls[0]; }
  set ball(ball: Ball) { this.balls = [ball]; }

  paddleWidth(): number {
    return this.effects.wide > 0 ? WIDE_PADDLE_W : PADDLE_W;
  }

  /** Starts a fresh run on a chosen level. */
  restart(level: number = this.level): void {
    this.level = normalizeLevel(level, BRICK_LEVELS.length);
    this.lives = START_LIVES;
    this.score = 0;
    this.bricks = buildBricks(this.level);
    this.clearBonuses();
    this.resetBall();
    this.phase = 'ready';
  }

  /** Moves on from a cleared wall to the next one, keeping score and lives. */
  advance(): boolean {
    if (this.phase !== 'cleared') return false;
    this.level += 1;
    this.bricks = buildBricks(this.level);
    this.clearBonuses();
    this.resetBall();
    this.phase = 'ready';
    return true;
  }

  launch(): boolean {
    if (this.phase === 'cleared') this.advance();
    if (this.phase !== 'ready') return false;
    // Serve up and slightly toward the open side of the paddle.
    const angle = (this.paddleX < BRICK_ARENA_WIDTH / 2 ? 1 : -1) * 0.35;
    this.ball.vx = Math.sin(angle) * this.speed;
    this.ball.vy = -Math.cos(angle) * this.speed;
    this.phase = 'playing';
    return true;
  }

  setSteer(direction: -1 | 0 | 1): void {
    this.steer = direction;
  }

  /** Pointer and drag control: put the paddle's centre under the finger. */
  movePaddleTo(x: number): void {
    const half = this.paddleWidth() / 2;
    this.paddleX = Math.max(half, Math.min(BRICK_ARENA_WIDTH - half, x));
    if (this.phase === 'ready') this.ball.x = this.paddleX;
  }

  breakableLeft(): number {
    return this.bricks.filter(brick => !brick.steel).length;
  }

  update(seconds: number): void {
    const dt = Math.max(0, Math.min(0.05, seconds));
    if (this.steer) this.movePaddleTo(this.paddleX + this.steer * PADDLE_SPEED * dt);
    if (this.phase !== 'playing') return;
    this.tickBonuses(dt);

    // Sub-steps keep a fast ball from passing through a brick in one frame.
    const fastest = Math.max(...this.balls.map(ball => Math.hypot(ball.vx, ball.vy)));
    const steps = Math.max(1, Math.ceil((fastest * dt) / MAX_STEP));
    for (let i = 0; i < steps && this.phase === 'playing'; i++) this.step(dt / steps);
  }

  /** Timed bonuses still running, longest-lasting first. */
  activeEffects(): { kind: CapsuleKind; seconds: number }[] {
    return TIMED_KINDS.filter(kind => this.effects[kind] > 0)
      .map(kind => ({ kind, seconds: this.effects[kind] }))
      .sort((a, b) => b.seconds - a.seconds);
  }

  /** Applies a caught capsule. */
  collect(kind: CapsuleKind): void {
    const info = CAPSULES[kind];
    this.notice = info.notice;
    this.noticeLeft = NOTICE_SECONDS;
    if (kind === 'life') {
      if (this.lives < MAX_LIVES) this.lives += 1;
      else { this.score += 500; this.notice = 'Balls full - 500 bonus points!'; }
    } else if (kind === 'multi') {
      // Each ball in play splits, fanning out from its own heading.
      const spawned: Ball[] = [];
      for (const ball of this.balls) {
        const speed = Math.hypot(ball.vx, ball.vy) || this.ballSpeed();
        const heading = Math.atan2(ball.vx, -Math.abs(ball.vy));
        for (const turn of [-0.45, 0.45]) {
          if (this.balls.length + spawned.length >= MAX_BALLS) break;
          spawned.push({ x: ball.x, y: ball.y, vx: Math.sin(heading + turn) * speed, vy: -Math.cos(heading + turn) * speed });
        }
      }
      this.balls.push(...spawned);
    } else {
      this.effects[kind] = info.seconds;
      if (kind === 'slow') this.rescaleBalls();
      // A paddle widening against a wall slides out to stay inside the arena.
      if (kind === 'wide') this.movePaddleTo(this.paddleX);
    }
  }

  statusText(): string {
    const name = BRICK_LEVELS[this.level - 1].name;
    if (this.phase === 'ready') return `Level ${this.level} · ${name}. Launch when ready.`;
    if (this.phase === 'playing') return this.noticeLeft > 0 ? this.notice : `Level ${this.level} · ${this.breakableLeft()} bricks to go.`;
    if (this.phase === 'cleared') return `${name} cleared! Launch for level ${this.level + 1}.`;
    if (this.phase === 'won') return `Every wall broken - final score ${this.score}!`;
    return `Out of balls on level ${this.level} - final score ${this.score}.`;
  }

  private step(dt: number): void {
    for (const ball of [...this.balls]) this.moveBall(ball, dt);
    this.moveCapsules(dt);

    if (this.breakableLeft() === 0) {
      this.score += 250 + this.lives * 100;
      this.phase = this.level >= BRICK_LEVELS.length ? 'won' : 'cleared';
      this.clearBonuses();
      return;
    }
    this.balls = this.balls.filter(ball => ball.y - BALL_R <= BRICK_ARENA_HEIGHT);
    if (this.balls.length === 0) {
      this.lives -= 1;
      this.clearBonuses();
      this.resetBall();
      this.phase = this.lives > 0 ? 'ready' : 'lost';
    }
  }

  private moveBall(ball: Ball, dt: number): void {
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    if (ball.x < BALL_R) { ball.x = BALL_R; ball.vx = Math.abs(ball.vx); }
    if (ball.x > BRICK_ARENA_WIDTH - BALL_R) { ball.x = BRICK_ARENA_WIDTH - BALL_R; ball.vx = -Math.abs(ball.vx); }
    if (ball.y < BALL_R) { ball.y = BALL_R; ball.vy = Math.abs(ball.vy); }

    // Paddle: the further from centre it hits, the steeper the return.
    const paddleTop = PADDLE_Y - PADDLE_H / 2;
    const half = this.paddleWidth() / 2;
    if (ball.vy > 0 && ball.y + BALL_R >= paddleTop && ball.y - BALL_R <= PADDLE_Y + PADDLE_H / 2
      && Math.abs(ball.x - this.paddleX) <= half + BALL_R) {
      const offset = Math.max(-1, Math.min(1, (ball.x - this.paddleX) / half));
      this.speed = Math.min(BALL_MAX_SPEED, this.speed * 1.03);
      const angle = offset * (Math.PI / 3);
      ball.vx = Math.sin(angle) * this.ballSpeed();
      ball.vy = -Math.cos(angle) * this.ballSpeed();
      ball.y = paddleTop - BALL_R;
    }

    const power = this.effects.power > 0;
    for (let index = 0; index < this.bricks.length; index++) {
      const brick = this.bricks[index];
      const nearestX = Math.max(brick.x, Math.min(ball.x, brick.x + BRICK_W));
      const nearestY = Math.max(brick.y, Math.min(ball.y, brick.y + BRICK_H));
      if ((ball.x - nearestX) ** 2 + (ball.y - nearestY) ** 2 > BALL_R ** 2) continue;
      if (power && !brick.steel) {
        // A power ball smashes any coloured brick in one go and keeps flying.
        this.bricks.splice(index, 1);
        this.score += 10 * brick.hits + 40;
        this.maybeDrop(brick);
        index--;
        continue;
      }
      // Bounce off whichever face the ball is pushed into least.
      const overlapX = Math.min(ball.x + BALL_R - brick.x, brick.x + BRICK_W - (ball.x - BALL_R));
      const overlapY = Math.min(ball.y + BALL_R - brick.y, brick.y + BRICK_H - (ball.y - BALL_R));
      if (overlapX < overlapY) {
        ball.vx = ball.x < brick.x + BRICK_W / 2 ? -Math.abs(ball.vx) : Math.abs(ball.vx);
      } else {
        ball.vy = ball.y < brick.y + BRICK_H / 2 ? -Math.abs(ball.vy) : Math.abs(ball.vy);
      }
      if (!brick.steel) {
        brick.hits -= 1;
        this.score += 10;
        if (brick.hits <= 0) {
          this.bricks.splice(index, 1);
          this.score += 40;
          this.maybeDrop(brick);
        }
      }
      break;
    }
  }

  private maybeDrop(brick: Brick): void {
    if (this.capsules.length >= MAX_FALLING || this.random() >= DROP_CHANCE) return;
    this.capsules.push({ x: brick.x + BRICK_W / 2, y: brick.y + BRICK_H / 2, kind: pickCapsule(this.random()) });
  }

  private moveCapsules(dt: number): void {
    const half = this.paddleWidth() / 2;
    const paddleTop = PADDLE_Y - PADDLE_H / 2;
    this.capsules = this.capsules.filter(capsule => {
      capsule.y += CAPSULE_SPEED * dt;
      const caught = capsule.y + CAPSULE_H / 2 >= paddleTop && capsule.y - CAPSULE_H / 2 <= PADDLE_Y + PADDLE_H / 2
        && Math.abs(capsule.x - this.paddleX) <= half + CAPSULE_W / 2;
      if (caught) this.collect(capsule.kind);
      return !caught && capsule.y - CAPSULE_H / 2 <= BRICK_ARENA_HEIGHT;
    });
  }

  private tickBonuses(dt: number): void {
    const wasSlow = this.effects.slow > 0;
    for (const kind of TIMED_KINDS) this.effects[kind] = Math.max(0, this.effects[kind] - dt);
    if (wasSlow && this.effects.slow === 0) this.rescaleBalls();
    this.noticeLeft = Math.max(0, this.noticeLeft - dt);
  }

  private ballSpeed(): number {
    return this.speed * (this.effects.slow > 0 ? SLOW_FACTOR : 1);
  }

  /** Keeps every ball's heading but sets it to the current speed, e.g. when slow starts or ends. */
  private rescaleBalls(): void {
    for (const ball of this.balls) {
      const length = Math.hypot(ball.vx, ball.vy);
      if (length === 0) continue;
      ball.vx = (ball.vx / length) * this.ballSpeed();
      ball.vy = (ball.vy / length) * this.ballSpeed();
    }
  }

  private clearBonuses(): void {
    this.capsules = [];
    for (const kind of CAPSULE_KINDS) this.effects[kind] = 0;
    this.noticeLeft = 0;
  }

  private resetBall(): void {
    this.speed = BALL_START_SPEED;
    this.ball = { x: this.paddleX, y: PADDLE_Y - PADDLE_H / 2 - BALL_R, vx: 0, vy: 0 };
  }
}

export function initBrickBreaker(): void {
  if (typeof document === 'undefined') return;
  const canvas = document.getElementById('bricksCanvas') as HTMLCanvasElement | null;
  const context = canvas?.getContext('2d');
  const view = document.getElementById('bricksView');
  if (!canvas || !context || !view) return;
  const board = canvas;
  const ctx = context;
  const bricksView = view;
  canvas.width = BRICK_ARENA_WIDTH;
  canvas.height = BRICK_ARENA_HEIGHT;

  const game = new BrickBreakerGame();
  const status = document.getElementById('bricksStatus');
  const scoreEl = document.getElementById('bricksScore');
  const livesEl = document.getElementById('bricksLives');
  const levelEl = document.getElementById('bricksLevelName');
  const launchButton = document.getElementById('bricksLaunchButton') as HTMLButtonElement | null;
  const resultReporter = new ArcadeResultReporter('bricks');
  const held = new Set<string>();

  game.restart(bindLevelSelect(
    document.getElementById('bricksLevel') as HTMLSelectElement | null,
    'bricks',
    BRICK_LEVELS,
    level => { game.restart(level); syncUi(); },
  ));

  function visible(): boolean {
    return !bricksView.classList.contains('view-hidden');
  }

  function launch(): void {
    if (isArcadeSessionPaused('bricks')) return;
    if (game.phase === 'won' || game.phase === 'lost') game.restart(game.level === BRICK_LEVELS.length && game.phase === 'won' ? 1 : game.level);
    else game.launch();
    syncUi();
  }

  function syncUi(): void {
    if (status) status.textContent = game.statusText();
    if (scoreEl) scoreEl.textContent = String(game.score);
    if (livesEl) livesEl.textContent = String(game.lives);
    if (levelEl) levelEl.textContent = `Level ${game.level} · ${BRICK_LEVELS[game.level - 1].name}`;
    if (launchButton) {
      launchButton.textContent = game.phase === 'playing' ? 'In play'
        : game.phase === 'cleared' ? 'Next wall' : game.phase === 'won' || game.phase === 'lost' ? 'Play again' : 'Launch';
    }
    resultReporter.report(game.phase === 'won' || game.phase === 'lost', { outcome: 'complete', score: game.score, runOver: game.phase === 'lost' });
  }

  function render(): void {
    ctx.fillStyle = '#0a1120';
    ctx.fillRect(0, 0, board.width, board.height);
    const tint: Record<number, string> = { 1: '#68dfff', 2: '#ffc857', 3: '#ff6b78' };
    for (const brick of game.bricks) {
      ctx.fillStyle = brick.steel ? '#5b6678' : tint[Math.min(3, brick.hits)];
      ctx.beginPath();
      ctx.roundRect(brick.x, brick.y, BRICK_W, BRICK_H, 5);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.22)';
      ctx.fillRect(brick.x + 4, brick.y + 3, BRICK_W - 8, 4);
    }
    for (const capsule of game.capsules) drawCapsule(capsule);
    drawEffects();
    const paddleW = game.paddleWidth();
    ctx.fillStyle = '#54e38e';
    ctx.shadowBlur = 16; ctx.shadowColor = '#54e38e';
    ctx.beginPath();
    ctx.roundRect(game.paddleX - paddleW / 2, PADDLE_Y - PADDLE_H / 2, paddleW, PADDLE_H, 7);
    ctx.fill();
    // A power ball glows orange so the player knows it will smash through.
    const ballColor = game.effects.power > 0 ? CAPSULES.power.color : '#ffffff';
    ctx.fillStyle = ballColor;
    ctx.shadowColor = ballColor;
    for (const ball of game.balls) { ctx.beginPath(); ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2); ctx.fill(); }
    ctx.shadowBlur = 0;
  }

  function drawCapsule(capsule: Capsule): void {
    const { color } = CAPSULES[capsule.kind];
    ctx.fillStyle = color;
    ctx.shadowBlur = 12; ctx.shadowColor = color;
    ctx.beginPath();
    ctx.roundRect(capsule.x - CAPSULE_W / 2, capsule.y - CAPSULE_H / 2, CAPSULE_W, CAPSULE_H, CAPSULE_H / 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    drawIcon(capsule.kind, capsule.x, capsule.y, 22, '#0a1120');
  }

  /** Language-free symbols, so a capsule reads the same in every language and font. */
  function drawIcon(kind: CapsuleKind, x: number, y: number, size: number, color: string): void {
    const h = size / 2;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = size / 6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    if (kind === 'life') {
      ctx.moveTo(0, h);
      ctx.bezierCurveTo(-h * 1.6, -h * 0.2, -h * 0.7, -h * 1.4, 0, -h * 0.45);
      ctx.bezierCurveTo(h * 0.7, -h * 1.4, h * 1.6, -h * 0.2, 0, h);
      ctx.fill();
    } else if (kind === 'power') {
      ctx.moveTo(h * 0.25, -h);
      ctx.lineTo(-h * 0.6, h * 0.15);
      ctx.lineTo(0, h * 0.15);
      ctx.lineTo(-h * 0.25, h);
      ctx.lineTo(h * 0.6, -h * 0.15);
      ctx.lineTo(0, -h * 0.15);
      ctx.closePath();
      ctx.fill();
    } else if (kind === 'wide') {
      ctx.moveTo(-h * 1.3, 0); ctx.lineTo(h * 1.3, 0);
      ctx.moveTo(-h * 0.7, -h * 0.6); ctx.lineTo(-h * 1.3, 0); ctx.lineTo(-h * 0.7, h * 0.6);
      ctx.moveTo(h * 0.7, -h * 0.6); ctx.lineTo(h * 1.3, 0); ctx.lineTo(h * 0.7, h * 0.6);
      ctx.stroke();
    } else if (kind === 'multi') {
      for (const [dx, dy] of [[-h * 0.9, h * 0.4], [0, -h * 0.5], [h * 0.9, h * 0.4]]) {
        ctx.moveTo(dx + h * 0.42, dy);
        ctx.arc(dx, dy, h * 0.42, 0, Math.PI * 2);
      }
      ctx.fill();
    } else {
      // Slow: an hourglass.
      ctx.moveTo(-h * 0.7, -h); ctx.lineTo(h * 0.7, -h); ctx.lineTo(-h * 0.7, h); ctx.lineTo(h * 0.7, h);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  /** Running bonuses sit in the empty band above the wall, each with a draining bar. */
  function drawEffects(): void {
    const effects = game.activeEffects();
    if (!effects.length) return;
    const chipH = 46;
    const gap = 12;
    const labels = effects.map(effect => translateArcadeText(CAPSULES[effect.kind].label));
    let fontSize = 22;
    const widthOf = (label: string): number => 40 + ctx.measureText(`${label} ${Math.ceil(CAPSULES.slow.seconds)}`).width + 16;
    ctx.font = `700 ${fontSize}px system-ui, sans-serif`;
    // Shrink the text rather than let a long translation run off the arena.
    while (fontSize > 14 && labels.reduce((sum, label) => sum + widthOf(label) + gap, -gap) > BRICK_ARENA_WIDTH - 24) {
      fontSize -= 1;
      ctx.font = `700 ${fontSize}px system-ui, sans-serif`;
    }
    let x = 12;
    effects.forEach((effect, index) => {
      const { color, seconds } = CAPSULES[effect.kind];
      const width = widthOf(labels[index]);
      const y = 12;
      ctx.fillStyle = 'rgba(10,17,32,.92)';
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(x, y, width, chipH, 10);
      ctx.fill();
      ctx.stroke();
      drawIcon(effect.kind, x + 22, y + chipH / 2 - 2, 20, color);
      ctx.fillStyle = '#ffffff';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillText(`${labels[index]} ${Math.ceil(effect.seconds)}`, x + 40, y + chipH / 2 - 2);
      ctx.fillStyle = color;
      ctx.fillRect(x + 8, y + chipH - 7, (width - 16) * (effect.seconds / seconds), 3);
      x += width + gap;
    });
  }

  const toArena = (clientX: number): number => {
    const bounds = board.getBoundingClientRect();
    return ((clientX - bounds.left) / bounds.width) * BRICK_ARENA_WIDTH;
  };
  let dragStart: { x: number; moved: boolean } | null = null;
  board.addEventListener('pointerdown', event => { dragStart = { x: event.clientX, moved: false }; game.movePaddleTo(toArena(event.clientX)); });
  board.addEventListener('pointermove', event => {
    if (event.pointerType === 'mouse' || dragStart) game.movePaddleTo(toArena(event.clientX));
    if (dragStart && Math.abs(event.clientX - dragStart.x) > 8) dragStart.moved = true;
  });
  // A tap (no drag) launches; a drag only steers.
  board.addEventListener('pointerup', () => { if (dragStart && !dragStart.moved) launch(); dragStart = null; });

  window.addEventListener('keydown', event => {
    if (!visible() || event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
    if (['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'].includes(event.code)) {
      event.preventDefault();
      held.add(event.code);
      game.setSteer(held.has('ArrowLeft') || held.has('KeyA') ? -1 : 1);
    } else if (event.code === 'Space' && !event.repeat) {
      event.preventDefault();
      launch();
    }
  });
  window.addEventListener('keyup', event => {
    held.delete(event.code);
    const left = held.has('ArrowLeft') || held.has('KeyA');
    const right = held.has('ArrowRight') || held.has('KeyD');
    game.setSteer(left === right ? 0 : left ? -1 : 1);
  });
  launchButton?.addEventListener('click', launch);
  document.getElementById('bricksRestartButton')?.addEventListener('click', () => { game.restart(game.level); syncUi(); });

  registerArcadeSession({
    gameId: 'bricks',
    view: bricksView,
    mode: () => 'solo',
    isActive: () => game.phase === 'playing',
    clearHeldInputs: () => { held.clear(); game.setSteer(0); },
  });

  const uiKey = (): string => `${game.phase}|${game.score}|${game.lives}|${game.statusText()}`;
  let previous = performance.now();
  function loop(now: number): void {
    if (visible()) {
      if (!isArcadeSessionPaused('bricks')) {
        const before = uiKey();
        game.update((now - previous) / 1000);
        if (uiKey() !== before) syncUi();
      }
      render();
    }
    previous = now;
    requestAnimationFrame(loop);
  }
  syncUi();
  requestAnimationFrame(loop);
}
