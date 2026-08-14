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
      direction: 'right', queuedDirection: 'right', alive: true, score: 0,
    },
    2: {
      body: [{ x: 18, y: 8 }, { x: 19, y: 8 }, { x: 20, y: 8 }],
      direction: 'left', queuedDirection: 'left', alive: true, score: 0,
    },
  };
}

export class NeonSnakeGame {
  riders = makeRiders();
  food: SnakeCell = { x: 12, y: 8 };
  mode: SnakeMode = 'solo';
  phase: SnakePhase = 'ready';
  winner: SnakePlayer | 0 | null = null;
  ticks = 0;
  private random: () => number;

  constructor(random: () => number = Math.random) {
    this.random = random;
    this.riders[2].alive = false;
    this.spawnFood();
  }

  restart(mode: SnakeMode = this.mode): void {
    this.mode = mode;
    this.riders = makeRiders();
    this.riders[2].alive = mode === 'duel';
    this.phase = 'ready';
    this.winner = null;
    this.ticks = 0;
    this.spawnFood();
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
      const body = growing.get(player) ? this.riders[player].body : this.riders[player].body.slice(0, -1);
      body.forEach(cell => {
        const key = `${cell.x},${cell.y}`;
        occupied.set(key, [...(occupied.get(key) || []), player]);
      });
    });

    const headOnCollision = activePlayers.length === 2 && sameCell(nextHeads.get(1)!, nextHeads.get(2)!);
    activePlayers.forEach(player => {
      const head = nextHeads.get(player)!;
      const outOfBounds = head.x < 0 || head.x >= SNAKE_COLUMNS || head.y < 0 || head.y >= SNAKE_ROWS;
      const bodyCollision = occupied.has(`${head.x},${head.y}`);
      if (outOfBounds || bodyCollision || headOnCollision) this.riders[player].alive = false;
    });

    activePlayers.forEach(player => {
      const rider = this.riders[player];
      if (!rider.alive) return;
      rider.body.unshift(nextHeads.get(player)!);
      if (growing.get(player)) rider.score += 1;
      else rider.body.pop();
    });

    if (activePlayers.some(player => growing.get(player) && this.riders[player].alive)) this.spawnFood();
    this.ticks += 1;
    this.resolveGameOver();
  }

  statusText(): string {
    if (this.phase === 'ready') return this.mode === 'solo' ? 'Start a solo high-score run.' : 'Start the two-player duel.';
    if (this.phase === 'playing') return this.mode === 'solo'
      ? `Score ${this.riders[1].score} — collect the neon cells.`
      : 'Last snake moving wins the arena.';
    if (this.mode === 'solo') return `Run over — final score ${this.riders[1].score}.`;
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
    const occupied = new Set<string>();
    ([1, 2] as SnakePlayer[]).forEach(player => {
      if (this.mode === 'solo' && player === 2) return;
      this.riders[player].body.forEach(cell => occupied.add(`${cell.x},${cell.y}`));
    });
    const open: SnakeCell[] = [];
    for (let y = 0; y < SNAKE_ROWS; y += 1) {
      for (let x = 0; x < SNAKE_COLUMNS; x += 1) {
        if (!occupied.has(`${x},${y}`)) open.push({ x, y });
      }
    }
    this.food = open[Math.floor(this.random() * open.length)] || { x: 12, y: 8 };
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
  const startButton = document.getElementById('snakeStartButton') as HTMLButtonElement | null;
  const modeButtons = document.querySelectorAll<HTMLButtonElement>('[data-snake-mode]');

  function visible(): boolean {
    return !snakeView.classList.contains('view-hidden');
  }

  function syncUi(): void {
    if (status) status.textContent = game.statusText();
    if (mintScore) mintScore.textContent = String(game.riders[1].score);
    if (coralScore) coralScore.textContent = game.mode === 'solo' ? '—' : String(game.riders[2].score);
    if (startButton) startButton.textContent = game.phase === 'ready' ? 'Start run' : game.phase === 'finished' ? 'Play again' : 'Running';
    modeButtons.forEach(button => button.classList.toggle('active', button.dataset.snakeMode === game.mode));
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

    context.shadowBlur = 20;
    context.shadowColor = '#ffc857';
    context.fillStyle = '#ffc857';
    context.beginPath();
    context.arc((game.food.x + .5) * cellSize, (game.food.y + .5) * cellSize, cellSize * .25, 0, Math.PI * 2);
    context.fill();
    context.shadowBlur = 0;

    const colors: Record<SnakePlayer, readonly [string, string]> = {
      1: ['#54e38e', '#1f9d5a'], 2: ['#ff6b78', '#d83c51'],
    };
    ([1, 2] as SnakePlayer[]).forEach(player => {
      if (game.mode === 'solo' && player === 2) return;
      game.riders[player].body.forEach((cell, index) => {
        context.fillStyle = index === 0 ? colors[player][0] : colors[player][1];
        context.shadowBlur = index === 0 ? 14 : 0;
        context.shadowColor = colors[player][0];
        context.beginPath();
        context.roundRect(cell.x * cellSize + 4, cell.y * cellSize + 4, cellSize - 8, cellSize - 8, index === 0 ? 10 : 7);
        context.fill();
      });
    });
    context.shadowBlur = 0;
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
      game.turn(command[0], command[1]);
    } else if (event.code === 'Space' && !event.repeat) {
      event.preventDefault();
      if (game.phase === 'finished') game.restart();
      game.start();
      syncUi();
    }
  });

  document.querySelectorAll<HTMLButtonElement>('[data-snake-player][data-snake-direction]').forEach(button => {
    button.addEventListener('pointerdown', event => {
      event.preventDefault();
      game.turn(Number(button.dataset.snakePlayer) as SnakePlayer, button.dataset.snakeDirection as SnakeDirection);
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
  startButton?.addEventListener('click', () => {
    if (game.phase === 'finished') game.restart();
    game.start();
    syncUi();
    render();
  });
  document.getElementById('snakeRestartButton')?.addEventListener('click', () => {
    game.restart(); syncUi(); render();
  });

  let accumulator = 0;
  let previous = performance.now();
  function loop(now: number): void {
    if (visible()) {
      accumulator += Math.min(100, now - previous);
      while (accumulator >= 115) {
        game.tick();
        accumulator -= 115;
        syncUi();
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
