export type TankPlayer = 1 | 2;
export type TankMode = 'bot' | 'duel';
export type TankDirection = 'up' | 'down' | 'left' | 'right';
export type TankPhase = 'ready' | 'playing' | 'round-over' | 'finished';

export const TANK_ARENA_WIDTH = 900;
export const TANK_ARENA_HEIGHT = 600;
export const TANK_TARGET_SCORE = 5;
const TANK_SIZE = 34;
const TANK_SPEED = 190;
const BULLET_SPEED = 470;

export interface MiniTank {
  x: number;
  y: number;
  direction: TankDirection;
  score: number;
  cooldown: number;
}

export interface TankBullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  owner: TankPlayer;
  bounces: number;
  age: number;
}

export interface TankObstacle {
  x: number;
  y: number;
  width: number;
  height: number;
  destructible: boolean;
}

interface TankInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  fire: boolean;
}

const VECTORS: Record<TankDirection, readonly [number, number]> = {
  up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0],
};

function defaultObstacles(): TankObstacle[] {
  return [
    { x: 220, y: 120, width: 42, height: 150, destructible: false },
    { x: 638, y: 330, width: 42, height: 150, destructible: false },
    { x: 405, y: 78, width: 90, height: 42, destructible: true },
    { x: 405, y: 480, width: 90, height: 42, destructible: true },
    { x: 366, y: 270, width: 62, height: 62, destructible: true },
    { x: 472, y: 270, width: 62, height: 62, destructible: true },
  ];
}

function emptyInput(): TankInput {
  return { up: false, down: false, left: false, right: false, fire: false };
}

function overlapsRect(x: number, y: number, size: number, obstacle: TankObstacle): boolean {
  const half = size / 2;
  return x + half > obstacle.x && x - half < obstacle.x + obstacle.width &&
    y + half > obstacle.y && y - half < obstacle.y + obstacle.height;
}

export class MiniTanksGame {
  tanks: Record<TankPlayer, MiniTank> = {
    1: { x: 80, y: TANK_ARENA_HEIGHT / 2, direction: 'right', score: 0, cooldown: 0 },
    2: { x: TANK_ARENA_WIDTH - 80, y: TANK_ARENA_HEIGHT / 2, direction: 'left', score: 0, cooldown: 0 },
  };
  inputs: Record<TankPlayer, TankInput> = { 1: emptyInput(), 2: emptyInput() };
  bullets: TankBullet[] = [];
  obstacles = defaultObstacles();
  mode: TankMode = 'bot';
  phase: TankPhase = 'ready';
  roundWinner: TankPlayer | null = null;
  matchWinner: TankPlayer | null = null;

  restart(mode: TankMode = this.mode): void {
    this.mode = mode;
    this.tanks[1].score = 0;
    this.tanks[2].score = 0;
    this.matchWinner = null;
    this.resetRound();
  }

  startRound(): boolean {
    if (this.phase !== 'ready' && this.phase !== 'round-over') return false;
    if (this.phase === 'round-over') this.resetRound();
    this.phase = 'playing';
    return true;
  }

  setInput(player: TankPlayer, action: keyof TankInput, pressed: boolean): void {
    if (this.mode === 'bot' && player === 2) return;
    this.inputs[player][action] = pressed;
  }

  fire(player: TankPlayer): boolean {
    const tank = this.tanks[player];
    if (this.phase !== 'playing' || tank.cooldown > 0) return false;
    const [dx, dy] = VECTORS[tank.direction];
    this.bullets.push({
      x: tank.x + dx * 25,
      y: tank.y + dy * 25,
      vx: dx * BULLET_SPEED,
      vy: dy * BULLET_SPEED,
      owner: player,
      bounces: 0,
      age: 0,
    });
    tank.cooldown = .65;
    return true;
  }

  update(seconds: number): void {
    if (this.phase !== 'playing') return;
    const dt = Math.max(0, Math.min(.04, seconds));
    this.tanks[1].cooldown = Math.max(0, this.tanks[1].cooldown - dt);
    this.tanks[2].cooldown = Math.max(0, this.tanks[2].cooldown - dt);
    if (this.mode === 'bot') this.updateBot();
    this.moveTank(1, dt);
    this.moveTank(2, dt);
    ([1, 2] as TankPlayer[]).forEach(player => {
      if (this.inputs[player].fire) {
        this.fire(player);
        this.inputs[player].fire = false;
      }
    });
    this.updateBullets(dt);
  }

  statusText(): string {
    if (this.phase === 'ready') return this.mode === 'bot' ? 'Start a duel against the Coral bot.' : 'Start the local tank duel.';
    if (this.phase === 'playing') return 'Move, aim, and bank one-bounce shots off the arena walls.';
    if (this.phase === 'round-over') return `${this.roundWinner === 1 ? 'Mint' : 'Coral'} takes the round. Launch the next one.`;
    return `${this.matchWinner === 1 ? 'Mint' : 'Coral'} wins the tank clash!`;
  }

  private resetRound(): void {
    this.tanks[1] = { ...this.tanks[1], x: 80, y: TANK_ARENA_HEIGHT / 2, direction: 'right', cooldown: 0 };
    this.tanks[2] = { ...this.tanks[2], x: TANK_ARENA_WIDTH - 80, y: TANK_ARENA_HEIGHT / 2, direction: 'left', cooldown: 0 };
    this.inputs = { 1: emptyInput(), 2: emptyInput() };
    this.bullets = [];
    this.obstacles = defaultObstacles();
    this.phase = 'ready';
    this.roundWinner = null;
  }

  private moveTank(player: TankPlayer, dt: number): void {
    const tank = this.tanks[player];
    const input = this.inputs[player];
    let direction: TankDirection | null = null;
    if (input.up) direction = 'up';
    else if (input.down) direction = 'down';
    else if (input.left) direction = 'left';
    else if (input.right) direction = 'right';
    if (!direction) return;
    tank.direction = direction;
    const [dx, dy] = VECTORS[direction];
    const nextX = Math.max(TANK_SIZE / 2, Math.min(TANK_ARENA_WIDTH - TANK_SIZE / 2, tank.x + dx * TANK_SPEED * dt));
    const nextY = Math.max(TANK_SIZE / 2, Math.min(TANK_ARENA_HEIGHT - TANK_SIZE / 2, tank.y + dy * TANK_SPEED * dt));
    if (!this.obstacles.some(obstacle => overlapsRect(nextX, nextY, TANK_SIZE, obstacle))) {
      tank.x = nextX;
      tank.y = nextY;
    }
  }

  private updateBot(): void {
    const bot = this.tanks[2];
    const target = this.tanks[1];
    this.inputs[2] = emptyInput();
    const dx = target.x - bot.x;
    const dy = target.y - bot.y;
    if (Math.abs(dy) > 24) this.inputs[2][dy < 0 ? 'up' : 'down'] = true;
    else if (Math.abs(dx) > 24) this.inputs[2][dx < 0 ? 'left' : 'right'] = true;
    const aligned = Math.abs(dx) < 28 || Math.abs(dy) < 28;
    if (aligned) {
      bot.direction = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
      this.inputs[2].fire = true;
    }
  }

  private updateBullets(dt: number): void {
    const survivors: TankBullet[] = [];
    for (const bullet of this.bullets) {
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      bullet.age += dt;
      let bounced = false;
      if (bullet.x <= 5 || bullet.x >= TANK_ARENA_WIDTH - 5) {
        bullet.vx *= -1; bounced = true;
        bullet.x = Math.max(5, Math.min(TANK_ARENA_WIDTH - 5, bullet.x));
      }
      if (bullet.y <= 5 || bullet.y >= TANK_ARENA_HEIGHT - 5) {
        bullet.vy *= -1; bounced = true;
        bullet.y = Math.max(5, Math.min(TANK_ARENA_HEIGHT - 5, bullet.y));
      }
      if (bounced) bullet.bounces += 1;
      if (bullet.bounces > 1) continue;

      const obstacleIndex = this.obstacles.findIndex(obstacle => overlapsRect(bullet.x, bullet.y, 8, obstacle));
      if (obstacleIndex >= 0) {
        if (this.obstacles[obstacleIndex].destructible) this.obstacles.splice(obstacleIndex, 1);
        continue;
      }

      const victim = (bullet.owner === 1 ? 2 : 1) as TankPlayer;
      if (bullet.age > .08 && Math.hypot(bullet.x - this.tanks[victim].x, bullet.y - this.tanks[victim].y) < TANK_SIZE * .62) {
        this.finishRound(bullet.owner);
        return;
      }
      survivors.push(bullet);
    }
    this.bullets = survivors;
  }

  private finishRound(winner: TankPlayer): void {
    this.tanks[winner].score += 1;
    this.roundWinner = winner;
    this.bullets = [];
    if (this.tanks[winner].score >= TANK_TARGET_SCORE) {
      this.phase = 'finished';
      this.matchWinner = winner;
    } else this.phase = 'round-over';
  }
}

export function initMiniTanks(): void {
  if (typeof document === 'undefined') return;
  const canvasElement = document.getElementById('tanksCanvas') as HTMLCanvasElement | null;
  const contextValue = canvasElement?.getContext('2d');
  const viewElement = document.getElementById('tanksView');
  if (!canvasElement || !contextValue || !viewElement) return;
  const canvas = canvasElement;
  const ctx = contextValue;
  const view = viewElement;
  canvas.width = TANK_ARENA_WIDTH;
  canvas.height = TANK_ARENA_HEIGHT;
  const game = new MiniTanksGame();
  const status = document.getElementById('tanksStatus');
  const mintScore = document.getElementById('tanksMintScore');
  const coralScore = document.getElementById('tanksCoralScore');
  const launchButton = document.getElementById('tanksLaunchButton') as HTMLButtonElement | null;
  const modeButtons = document.querySelectorAll<HTMLButtonElement>('[data-tanks-mode]');

  function visible(): boolean { return !view.classList.contains('view-hidden'); }
  function syncUi(): void {
    if (status) status.textContent = game.statusText();
    if (mintScore) mintScore.textContent = String(game.tanks[1].score);
    if (coralScore) coralScore.textContent = String(game.tanks[2].score);
    if (launchButton) launchButton.textContent = game.phase === 'round-over' ? 'Next round' : game.phase === 'finished' ? 'New match' : game.phase === 'ready' ? 'Start duel' : 'Battle live';
    modeButtons.forEach(button => button.classList.toggle('active', button.dataset.tanksMode === game.mode));
  }

  function render(): void {
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#172a23'); gradient.addColorStop(.5, '#121a27'); gradient.addColorStop(1, '#321b20');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(255,255,255,.045)'; ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke(); }
    for (let y = 0; y < canvas.height; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke(); }
    game.obstacles.forEach(obstacle => {
      ctx.fillStyle = obstacle.destructible ? '#b96f35' : '#536270';
      ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
      ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 3; ctx.strokeRect(obstacle.x + 2, obstacle.y + 2, obstacle.width - 4, obstacle.height - 4);
    });
    const colors: Record<TankPlayer, string> = { 1: '#54e38e', 2: '#ff6b78' };
    ([1, 2] as TankPlayer[]).forEach(player => {
      const tank = game.tanks[player];
      const [dx, dy] = VECTORS[tank.direction];
      ctx.save(); ctx.translate(tank.x, tank.y); ctx.shadowBlur = 18; ctx.shadowColor = colors[player];
      ctx.fillStyle = colors[player]; ctx.fillRect(-17, -17, 34, 34);
      ctx.fillStyle = '#111722'; ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = colors[player]; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(dx * 28, dy * 28); ctx.stroke(); ctx.restore();
    });
    game.bullets.forEach(bullet => {
      ctx.fillStyle = '#ffc857'; ctx.shadowBlur = 15; ctx.shadowColor = '#ffc857';
      ctx.beginPath(); ctx.arc(bullet.x, bullet.y, 5, 0, Math.PI * 2); ctx.fill();
    });
    ctx.shadowBlur = 0;
  }

  const commands: Record<string, readonly [TankPlayer, keyof TankInput]> = {
    KeyW: [1, 'up'], KeyS: [1, 'down'], KeyA: [1, 'left'], KeyD: [1, 'right'], KeyF: [1, 'fire'],
    ArrowUp: [2, 'up'], ArrowDown: [2, 'down'], ArrowLeft: [2, 'left'], ArrowRight: [2, 'right'], Enter: [2, 'fire'],
  };
  window.addEventListener('keydown', event => {
    if (!visible()) return;
    const command = commands[event.code];
    if (command) { event.preventDefault(); game.setInput(command[0], command[1], true); }
    else if (event.code === 'Space' && !event.repeat) { event.preventDefault(); if (game.phase === 'finished') game.restart(); game.startRound(); syncUi(); }
  });
  window.addEventListener('keyup', event => {
    const command = commands[event.code];
    if (command) game.setInput(command[0], command[1], false);
  });
  document.querySelectorAll<HTMLButtonElement>('[data-tank-player][data-tank-action]').forEach(button => {
    const player = Number(button.dataset.tankPlayer) as TankPlayer;
    const action = button.dataset.tankAction as keyof TankInput;
    const release = (): void => game.setInput(player, action, false);
    button.addEventListener('pointerdown', event => { event.preventDefault(); button.setPointerCapture?.(event.pointerId); game.setInput(player, action, true); });
    button.addEventListener('pointerup', release); button.addEventListener('pointercancel', release); button.addEventListener('lostpointercapture', release);
  });
  modeButtons.forEach(button => button.addEventListener('click', () => {
    const mode = button.dataset.tanksMode;
    if (mode === 'bot' || mode === 'duel') { game.restart(mode); syncUi(); render(); }
  }));
  launchButton?.addEventListener('click', () => { if (game.phase === 'finished') game.restart(); game.startRound(); syncUi(); });
  document.getElementById('tanksRestartButton')?.addEventListener('click', () => { game.restart(); syncUi(); render(); });

  let previous = performance.now();
  function loop(now: number): void {
    if (visible()) { game.update((now - previous) / 1000); render(); syncUi(); }
    previous = now; requestAnimationFrame(loop);
  }
  syncUi(); render(); requestAnimationFrame(loop);
}
