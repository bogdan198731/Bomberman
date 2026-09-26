import { ArcadeResultReporter } from './stats.js';
import { isArcadeSessionPaused, registerArcadeSession } from './session-control.js';
import { bindLevelSelect, normalizeLevel, type LevelInfo } from './levels.js';

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
  ball = { x: BRICK_ARENA_WIDTH / 2, y: PADDLE_Y - PADDLE_H / 2 - BALL_R, vx: 0, vy: 0 };
  lives = START_LIVES;
  score = 0;
  phase: BrickPhase = 'ready';
  private steer = 0;
  private speed = BALL_START_SPEED;

  /** Starts a fresh run on a chosen level. */
  restart(level: number = this.level): void {
    this.level = normalizeLevel(level, BRICK_LEVELS.length);
    this.lives = START_LIVES;
    this.score = 0;
    this.bricks = buildBricks(this.level);
    this.resetBall();
    this.phase = 'ready';
  }

  /** Moves on from a cleared wall to the next one, keeping score and lives. */
  advance(): boolean {
    if (this.phase !== 'cleared') return false;
    this.level += 1;
    this.bricks = buildBricks(this.level);
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
    this.paddleX = Math.max(PADDLE_W / 2, Math.min(BRICK_ARENA_WIDTH - PADDLE_W / 2, x));
    if (this.phase === 'ready') this.ball.x = this.paddleX;
  }

  breakableLeft(): number {
    return this.bricks.filter(brick => !brick.steel).length;
  }

  update(seconds: number): void {
    const dt = Math.max(0, Math.min(0.05, seconds));
    if (this.steer) this.movePaddleTo(this.paddleX + this.steer * PADDLE_SPEED * dt);
    if (this.phase !== 'playing') return;

    // Sub-steps keep a fast ball from passing through a brick in one frame.
    const distance = Math.hypot(this.ball.vx, this.ball.vy) * dt;
    const steps = Math.max(1, Math.ceil(distance / MAX_STEP));
    for (let i = 0; i < steps && this.phase === 'playing'; i++) this.step(dt / steps);
  }

  statusText(): string {
    const name = BRICK_LEVELS[this.level - 1].name;
    if (this.phase === 'ready') return `Level ${this.level} · ${name}. Launch when ready.`;
    if (this.phase === 'playing') return `Level ${this.level} · ${this.breakableLeft()} bricks to go.`;
    if (this.phase === 'cleared') return `${name} cleared! Launch for level ${this.level + 1}.`;
    if (this.phase === 'won') return `Every wall broken - final score ${this.score}!`;
    return `Out of balls on level ${this.level} - final score ${this.score}.`;
  }

  private step(dt: number): void {
    const ball = this.ball;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    if (ball.x < BALL_R) { ball.x = BALL_R; ball.vx = Math.abs(ball.vx); }
    if (ball.x > BRICK_ARENA_WIDTH - BALL_R) { ball.x = BRICK_ARENA_WIDTH - BALL_R; ball.vx = -Math.abs(ball.vx); }
    if (ball.y < BALL_R) { ball.y = BALL_R; ball.vy = Math.abs(ball.vy); }

    // Paddle: the further from centre it hits, the steeper the return.
    const paddleTop = PADDLE_Y - PADDLE_H / 2;
    if (ball.vy > 0 && ball.y + BALL_R >= paddleTop && ball.y - BALL_R <= PADDLE_Y + PADDLE_H / 2
      && Math.abs(ball.x - this.paddleX) <= PADDLE_W / 2 + BALL_R) {
      const offset = Math.max(-1, Math.min(1, (ball.x - this.paddleX) / (PADDLE_W / 2)));
      this.speed = Math.min(BALL_MAX_SPEED, this.speed * 1.03);
      const angle = offset * (Math.PI / 3);
      ball.vx = Math.sin(angle) * this.speed;
      ball.vy = -Math.cos(angle) * this.speed;
      ball.y = paddleTop - BALL_R;
    }

    for (let index = 0; index < this.bricks.length; index++) {
      const brick = this.bricks[index];
      const nearestX = Math.max(brick.x, Math.min(ball.x, brick.x + BRICK_W));
      const nearestY = Math.max(brick.y, Math.min(ball.y, brick.y + BRICK_H));
      if ((ball.x - nearestX) ** 2 + (ball.y - nearestY) ** 2 > BALL_R ** 2) continue;
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
        }
      }
      break;
    }

    if (this.breakableLeft() === 0) {
      this.score += 250 + this.lives * 100;
      this.phase = this.level >= BRICK_LEVELS.length ? 'won' : 'cleared';
      return;
    }
    if (ball.y - BALL_R > BRICK_ARENA_HEIGHT) {
      this.lives -= 1;
      this.resetBall();
      this.phase = this.lives > 0 ? 'ready' : 'lost';
    }
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
    resultReporter.report(game.phase === 'won' || game.phase === 'lost', { outcome: 'complete', score: game.score });
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
    ctx.fillStyle = '#54e38e';
    ctx.shadowBlur = 16; ctx.shadowColor = '#54e38e';
    ctx.beginPath();
    ctx.roundRect(game.paddleX - PADDLE_W / 2, PADDLE_Y - PADDLE_H / 2, PADDLE_W, PADDLE_H, 7);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#ffffff';
    ctx.beginPath(); ctx.arc(game.ball.x, game.ball.y, BALL_R, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
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

  let previous = performance.now();
  function loop(now: number): void {
    if (visible()) {
      if (!isArcadeSessionPaused('bricks')) {
        const before = game.phase;
        const bricksBefore = game.bricks.length;
        game.update((now - previous) / 1000);
        if (game.phase !== before || game.bricks.length !== bricksBefore) syncUi();
      }
      render();
    }
    previous = now;
    requestAnimationFrame(loop);
  }
  syncUi();
  requestAnimationFrame(loop);
}
