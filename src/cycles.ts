import { GameRoomClient } from './game-room.js';
import { ArcadeResultReporter } from './stats.js';
import { bindVirtualJoystick, digitalJoystickState, type JoystickInputDirection } from './touch-controls.js';
import { isArcadeSessionPaused, registerArcadeSession } from './session-control.js';

export type CyclePlayer = 1 | 2;
export type CycleMode = 'bot' | 'duel';
export type CyclePhase = 'ready' | 'playing' | 'round-over' | 'finished';
export type CycleDirection = 'up' | 'down' | 'left' | 'right';
export type CycleBotLevel = 'easy' | 'normal' | 'hard';

export const CYCLE_COLUMNS = 30;
export const CYCLE_ROWS = 20;
export const CYCLE_TARGET = 3;
const TICK_MS = 95;

export interface CycleRider {
  x: number;
  y: number;
  direction: CycleDirection;
  queued: CycleDirection;
  alive: boolean;
  score: number;
}

const VECTORS: Record<CycleDirection, readonly [number, number]> = {
  up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0],
};
const OPPOSITE: Record<CycleDirection, CycleDirection> = { up: 'down', down: 'up', left: 'right', right: 'left' };
const TURNS: Record<CycleDirection, readonly CycleDirection[]> = {
  up: ['up', 'left', 'right'], down: ['down', 'right', 'left'],
  left: ['left', 'down', 'up'], right: ['right', 'up', 'down'],
};

function startRiders(scores: Record<CyclePlayer, number> = { 1: 0, 2: 0 }): Record<CyclePlayer, CycleRider> {
  return {
    1: { x: 5, y: CYCLE_ROWS / 2, direction: 'right', queued: 'right', alive: true, score: scores[1] },
    2: { x: CYCLE_COLUMNS - 6, y: CYCLE_ROWS / 2, direction: 'left', queued: 'left', alive: true, score: scores[2] },
  };
}

export class LightCyclesGame {
  riders = startRiders();
  /** One char per cell: '0' empty, '1' Mint trail, '2' Coral trail. Compact enough to sync online. */
  trails = '0'.repeat(CYCLE_COLUMNS * CYCLE_ROWS);
  mode: CycleMode = 'bot';
  phase: CyclePhase = 'ready';
  roundWinner: CyclePlayer | 0 | null = null;
  matchWinner: CyclePlayer | null = null;
  botLevel: CycleBotLevel = 'normal';
  private random: () => number;

  constructor(random: () => number = Math.random) {
    this.random = random;
    this.resetRound();
  }

  restart(mode: CycleMode = this.mode): void {
    this.mode = mode;
    this.riders = startRiders();
    this.matchWinner = null;
    this.resetRound();
  }

  startRound(): boolean {
    if (this.phase === 'round-over') this.resetRound();
    if (this.phase !== 'ready') return false;
    this.phase = 'playing';
    return true;
  }

  turn(player: CyclePlayer, direction: CycleDirection): boolean {
    const rider = this.riders[player];
    if (!rider.alive || OPPOSITE[rider.direction] === direction) return false;
    rider.queued = direction;
    return true;
  }

  occupant(x: number, y: number): CyclePlayer | 0 | -1 {
    if (x < 0 || y < 0 || x >= CYCLE_COLUMNS || y >= CYCLE_ROWS) return -1;
    return Number(this.trails[y * CYCLE_COLUMNS + x]) as CyclePlayer | 0;
  }

  tick(): void {
    if (this.phase !== 'playing') return;
    if (this.mode === 'bot') this.riders[2].queued = this.chooseBotDirection();

    const next = new Map<CyclePlayer, [number, number]>();
    ([1, 2] as CyclePlayer[]).forEach(player => {
      const rider = this.riders[player];
      rider.direction = rider.queued;
      const [dx, dy] = VECTORS[rider.direction];
      next.set(player, [rider.x + dx, rider.y + dy]);
    });
    const [ax, ay] = next.get(1)!;
    const [bx, by] = next.get(2)!;
    const headOn = ax === bx && ay === by;
    ([1, 2] as CyclePlayer[]).forEach(player => {
      const [x, y] = next.get(player)!;
      if (headOn || this.occupant(x, y) !== 0) this.riders[player].alive = false;
    });
    ([1, 2] as CyclePlayer[]).forEach(player => {
      const rider = this.riders[player];
      if (!rider.alive) return;
      [rider.x, rider.y] = next.get(player)!;
      this.mark(rider.x, rider.y, player);
    });
    this.resolveRound();
  }

  statusText(): string {
    const name = (player: CyclePlayer): string => (player === 1 ? 'Mint' : 'Coral');
    if (this.phase === 'ready') return this.mode === 'bot' ? 'Outlast the Coral bot. First to 3 rounds.' : 'Two riders, one grid. First to 3 rounds.';
    if (this.phase === 'playing') return 'Box your rival in - never cross a trail.';
    if (this.phase === 'round-over') return this.roundWinner === 0 ? 'Both crashed - no point this round.' : `${name(this.roundWinner as CyclePlayer)} takes the round.`;
    return `${name(this.matchWinner as CyclePlayer)} wins the grid!`;
  }

  /** Cells reachable from a start cell, with both riders' trails treated as walls. */
  openArea(x: number, y: number, limit = CYCLE_COLUMNS * CYCLE_ROWS): number {
    if (this.occupant(x, y) !== 0) return 0;
    const seen = new Set<number>([y * CYCLE_COLUMNS + x]);
    const queue: number[] = [y * CYCLE_COLUMNS + x];
    while (queue.length && seen.size < limit) {
      const cell = queue.shift()!;
      const cx = cell % CYCLE_COLUMNS;
      const cy = Math.floor(cell / CYCLE_COLUMNS);
      for (const [dx, dy] of Object.values(VECTORS)) {
        const nx = cx + dx;
        const ny = cy + dy;
        const key = ny * CYCLE_COLUMNS + nx;
        if (this.occupant(nx, ny) !== 0 || seen.has(key)) continue;
        seen.add(key);
        queue.push(key);
      }
    }
    return seen.size;
  }

  /**
   * Picks the move that keeps the most room to ride. Harder bots also lean
   * toward the player to cut them off; easier ones sometimes just wander.
   */
  chooseBotDirection(): CycleDirection {
    const bot = this.riders[2];
    const rival = this.riders[1];
    const options = TURNS[bot.direction].map(direction => {
      const [dx, dy] = VECTORS[direction];
      const x = bot.x + dx;
      const y = bot.y + dy;
      return { direction, area: this.openArea(x, y), distance: Math.abs(x - rival.x) + Math.abs(y - rival.y) };
    });
    const safe = options.filter(option => option.area > 0);
    if (!safe.length) return bot.direction;
    if (this.botLevel === 'easy' && this.random() < 0.25) {
      return safe[Math.floor(this.random() * safe.length)].direction;
    }
    const best = Math.max(...safe.map(option => option.area));
    if (this.botLevel === 'hard') {
      const roomy = safe.filter(option => option.area >= best * 0.9);
      roomy.sort((left, right) => left.distance - right.distance);
      return roomy[0].direction;
    }
    // Normal: most room; the options list starts with "straight", so ties keep going.
    return safe.find(option => option.area === best)!.direction;
  }

  private mark(x: number, y: number, player: CyclePlayer): void {
    const index = y * CYCLE_COLUMNS + x;
    this.trails = this.trails.slice(0, index) + player + this.trails.slice(index + 1);
  }

  private resetRound(): void {
    this.riders = startRiders({ 1: this.riders[1].score, 2: this.riders[2].score });
    this.trails = '0'.repeat(CYCLE_COLUMNS * CYCLE_ROWS);
    this.mark(this.riders[1].x, this.riders[1].y, 1);
    this.mark(this.riders[2].x, this.riders[2].y, 2);
    this.phase = 'ready';
    this.roundWinner = null;
  }

  private resolveRound(): void {
    const mint = this.riders[1].alive;
    const coral = this.riders[2].alive;
    if (mint && coral) return;
    this.roundWinner = mint ? 1 : coral ? 2 : 0;
    if (this.roundWinner) this.riders[this.roundWinner].score += 1;
    const champion = ([1, 2] as CyclePlayer[]).find(player => this.riders[player].score >= CYCLE_TARGET);
    if (champion) {
      this.matchWinner = champion;
      this.phase = 'finished';
    } else {
      this.phase = 'round-over';
    }
  }
}

export function initLightCycles(): void {
  if (typeof document === 'undefined') return;
  const canvas = document.getElementById('cyclesCanvas') as HTMLCanvasElement | null;
  const context = canvas?.getContext('2d');
  const view = document.getElementById('cyclesView');
  if (!canvas || !context || !view) return;
  const cyclesView = view;
  const ctx = context;

  const cell = 24;
  canvas.width = CYCLE_COLUMNS * cell;
  canvas.height = CYCLE_ROWS * cell;
  const game = new LightCyclesGame();
  const status = document.getElementById('cyclesStatus');
  const mintScore = document.getElementById('cyclesMintScore');
  const coralScore = document.getElementById('cyclesCoralScore');
  const startButton = document.getElementById('cyclesStartButton') as HTMLButtonElement | null;
  const levelSelect = document.getElementById('cyclesBotLevel') as HTMLSelectElement | null;
  const coralControls = document.getElementById('cyclesCoralControls');
  const mintControls = document.getElementById('cyclesMintControls');
  const roomMount = document.querySelector<HTMLElement>('[data-game-room="cycles"]');
  let room: GameRoomClient | null = null;
  const resultReporter = new ArcadeResultReporter('cycles');

  function snapshot(): Record<string, unknown> {
    return {
      riders: game.riders, trails: game.trails, mode: game.mode, phase: game.phase,
      roundWinner: game.roundWinner, matchWinner: game.matchWinner,
    };
  }

  function restore(state: Record<string, unknown>): void {
    if (!state.riders || typeof state.trails !== 'string' || state.trails.length !== CYCLE_COLUMNS * CYCLE_ROWS) return;
    game.riders = state.riders as Record<CyclePlayer, CycleRider>;
    game.trails = state.trails;
    game.mode = state.mode === 'duel' ? 'duel' : 'bot';
    game.phase = state.phase as CyclePhase;
    game.roundWinner = state.roundWinner as CyclePlayer | 0 | null;
    game.matchWinner = state.matchWinner as CyclePlayer | null;
  }

  function turn(player: CyclePlayer, direction: CycleDirection): void {
    if (isArcadeSessionPaused('cycles')) return;
    if (game.mode === 'bot' && player === 2) return;
    const session = room?.session();
    if (!session?.online) game.turn(player, direction);
    else if (session.ready && room?.canControl(player)) {
      if (room.isGuest()) room.sendAction({ type: 'turn', direction });
      else game.turn(player, direction);
    }
  }

  function launch(): void {
    if (isArcadeSessionPaused('cycles')) return;
    const session = room?.session();
    if (session?.online && !session.ready) return;
    if (room?.isGuest()) { room.sendAction({ type: 'start' }); return; }
    if (game.phase === 'finished') game.restart(game.mode);
    game.startRound();
    room?.broadcastState(snapshot(), true);
    syncUi(); render();
  }

  function visible(): boolean {
    return !cyclesView.classList.contains('view-hidden');
  }

  function syncUi(): void {
    if (status) status.textContent = game.statusText();
    if (mintScore) mintScore.textContent = String(game.riders[1].score);
    if (coralScore) coralScore.textContent = String(game.riders[2].score);
    if (startButton) {
      startButton.textContent = game.phase === 'ready' ? 'Start round'
        : game.phase === 'round-over' ? 'Next round' : game.phase === 'finished' ? 'Play again' : 'Riding';
    }
    const session = room?.session();
    if (levelSelect) levelSelect.hidden = game.mode !== 'bot' || Boolean(session?.online);
    mintControls?.classList.toggle('solo-hidden', Boolean(session?.online && session.playerId === 2));
    coralControls?.classList.toggle('solo-hidden', session?.online ? session.playerId !== 2 : game.mode === 'bot');
    const tracked = (session?.online ? session.playerId : 1) ?? 1;
    resultReporter.report(game.phase === 'finished', {
      outcome: game.matchWinner === tracked ? 'win' : 'loss',
      score: game.riders[tracked].score,
    });
  }

  function render(): void {
    ctx.fillStyle = '#070b14';
    ctx.fillRect(0, 0, canvas!.width, canvas!.height);
    ctx.strokeStyle = 'rgba(104,223,255,.07)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= CYCLE_COLUMNS; x++) { ctx.beginPath(); ctx.moveTo(x * cell, 0); ctx.lineTo(x * cell, canvas!.height); ctx.stroke(); }
    for (let y = 0; y <= CYCLE_ROWS; y++) { ctx.beginPath(); ctx.moveTo(0, y * cell); ctx.lineTo(canvas!.width, y * cell); ctx.stroke(); }

    const colors: Record<CyclePlayer, string> = { 1: '#54e38e', 2: '#ff6b78' };
    for (let index = 0; index < game.trails.length; index++) {
      const owner = game.trails[index];
      if (owner === '0') continue;
      const player = Number(owner) as CyclePlayer;
      ctx.fillStyle = colors[player];
      ctx.globalAlpha = .55;
      ctx.fillRect((index % CYCLE_COLUMNS) * cell + 5, Math.floor(index / CYCLE_COLUMNS) * cell + 5, cell - 10, cell - 10);
    }
    ctx.globalAlpha = 1;
    ([1, 2] as CyclePlayer[]).forEach(player => {
      const rider = game.riders[player];
      ctx.shadowBlur = 18;
      ctx.shadowColor = colors[player];
      ctx.fillStyle = rider.alive ? colors[player] : '#6b7280';
      ctx.beginPath();
      ctx.roundRect(rider.x * cell + 2, rider.y * cell + 2, cell - 4, cell - 4, 6);
      ctx.fill();
    });
    ctx.shadowBlur = 0;
  }

  const keys: Record<string, readonly [CyclePlayer, CycleDirection]> = {
    KeyW: [1, 'up'], KeyS: [1, 'down'], KeyA: [1, 'left'], KeyD: [1, 'right'],
    ArrowUp: [2, 'up'], ArrowDown: [2, 'down'], ArrowLeft: [2, 'left'], ArrowRight: [2, 'right'],
  };
  window.addEventListener('keydown', event => {
    if (!visible() || event.target instanceof HTMLInputElement) return;
    const command = keys[event.code];
    if (command) {
      event.preventDefault();
      // Solo players expect the arrows to steer them too.
      turn(game.mode === 'bot' ? 1 : command[0], command[1]);
    } else if (event.code === 'Space' && !event.repeat) {
      event.preventDefault();
      launch();
    }
  });

  document.querySelectorAll<HTMLElement>('[data-cycles-joystick]').forEach(track => {
    const player = Number(track.dataset.cyclesJoystick) as CyclePlayer;
    let active: JoystickInputDirection | undefined;
    bindVirtualJoystick(track, vector => {
      const state = digitalJoystickState(vector, 'cardinal');
      const direction = (Object.keys(state) as JoystickInputDirection[]).find(candidate => state[candidate]);
      if (direction && direction !== active) turn(player, direction);
      active = direction;
    });
  });

  let swipe: { x: number; y: number; id: number } | null = null;
  canvas.addEventListener('pointerdown', event => { swipe = { x: event.clientX, y: event.clientY, id: event.pointerId }; });
  canvas.addEventListener('pointerup', event => {
    if (!swipe || swipe.id !== event.pointerId) return;
    const dx = event.clientX - swipe.x;
    const dy = event.clientY - swipe.y;
    swipe = null;
    if (Math.hypot(dx, dy) < 24) { launch(); return; }
    turn(1, Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  });

  startButton?.addEventListener('click', launch);
  document.getElementById('cyclesRestartButton')?.addEventListener('click', () => {
    if (room?.isGuest()) { room.sendAction({ type: 'restart' }); return; }
    game.restart(game.mode);
    room?.broadcastState(snapshot(), true);
    syncUi(); render();
  });
  levelSelect?.addEventListener('change', () => {
    const level = levelSelect.value;
    if (level === 'easy' || level === 'normal' || level === 'hard') game.botLevel = level;
    try { localStorage.setItem('blast-arcade-cycles-bot-v1', level); } catch { /* optional */ }
  });
  try {
    const saved = localStorage.getItem('blast-arcade-cycles-bot-v1');
    if (saved === 'easy' || saved === 'normal' || saved === 'hard') {
      game.botLevel = saved;
      if (levelSelect) levelSelect.value = saved;
    }
  } catch { /* keep the default */ }

  if (roomMount) {
    room = new GameRoomClient({
      game: 'cycles',
      mount: roomMount,
      offlineModes: [
        { id: 'bot', label: 'Solo · vs bot', description: 'Outride the Coral bot.', onSelect: () => { accumulator = 0; game.restart('bot'); syncUi(); render(); } },
        { id: 'local', label: 'Same device', description: 'Two riders share this device.', onSelect: () => { accumulator = 0; game.restart('duel'); syncUi(); render(); } },
      ],
      initialOfflineMode: 'bot',
      onSessionChange: session => {
        accumulator = 0;
        if (!session.online) game.restart('bot');
        else if (session.ready && session.playerId === 1) {
          game.restart('duel');
          room?.broadcastState(snapshot(), true);
        }
        syncUi(); render();
      },
      onRemoteAction: (action, from) => {
        if (!room?.isHost() || from !== 2) return;
        const direction = action.direction;
        if (action.type === 'turn' && (direction === 'up' || direction === 'down' || direction === 'left' || direction === 'right')) {
          game.turn(2, direction);
        } else if (action.type === 'start') {
          if (game.phase === 'finished') game.restart('duel');
          game.startRound();
        } else if (action.type === 'restart') {
          game.restart('duel');
        }
        room.broadcastState(snapshot(), true); syncUi(); render();
      },
      onState: state => { if (room?.isGuest()) { restore(state); syncUi(); render(); } },
    });
  }

  registerArcadeSession({
    gameId: 'cycles',
    view: cyclesView,
    mode: () => room?.session().online ? 'online' : game.mode === 'bot' ? 'solo' : 'local',
    isActive: () => game.phase === 'playing',
    clearHeldInputs: () => { accumulator = 0; },
  });

  let accumulator = 0;
  let previous = performance.now();
  function loop(now: number): void {
    if (visible()) {
      if (!room?.isGuest() && !isArcadeSessionPaused('cycles')) {
        accumulator += Math.min(100, now - previous);
        while (accumulator >= TICK_MS) {
          const before = game.phase;
          game.tick();
          accumulator -= TICK_MS;
          if (game.phase !== before) syncUi();
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
