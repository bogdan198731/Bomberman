import { GameRoomClient } from './game-room.js';
import { ArcadeResultReporter } from './stats.js';
import { capturePointer, bindDirectionalJoystick } from './touch-controls.js';
import { isArcadeSessionPaused, registerArcadeSession } from './session-control.js';
import { emitArcadeGameplayCue } from './feedback.js';
import { bindLevelSelect, normalizeLevel, type LevelInfo } from './levels.js';

export type TankPlayer = 1 | 2;
export type TankMode = 'bot' | 'duel';
export type TankDirection = 'up' | 'down' | 'left' | 'right';
export type TankPhase = 'ready' | 'playing' | 'round-over' | 'finished';
export type TankBotPace = 'rookie' | 'normal' | 'ace';

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

const steel = (x: number, y: number, width: number, height: number): TankObstacle =>
  ({ x, y, width, height, destructible: false });
const crate = (x: number, y: number, width: number, height: number): TankObstacle =>
  ({ x, y, width, height, destructible: true });

export interface TankLevel extends LevelInfo {
  obstacles: readonly TankObstacle[];
}

/**
 * Tanks spawn at (80, 300) and (820, 300). Every arena keeps both spawns
 * clear and leaves a drivable route between them without shooting anything.
 */
export const TANK_LEVELS: readonly TankLevel[] = [
  {
    name: 'Classic',
    blurb: 'Two steel walls and a crate cluster in the middle.',
    obstacles: [
      steel(220, 120, 42, 150), steel(638, 330, 42, 150),
      crate(405, 78, 90, 42), crate(405, 480, 90, 42),
      crate(366, 270, 62, 62), crate(472, 270, 62, 62),
    ],
  },
  {
    name: 'Bunkers',
    blurb: 'Steel bunkers in each corner, crates guarding the centre.',
    obstacles: [
      steel(180, 90, 120, 36), steel(600, 90, 120, 36),
      steel(180, 474, 120, 36), steel(600, 474, 120, 36),
      crate(420, 190, 60, 60), crate(420, 350, 60, 60),
    ],
  },
  {
    name: 'Crossfire',
    blurb: 'A steel spine splits the field - go over, under, or bank a shot.',
    obstacles: [
      steel(429, 150, 42, 300),
      crate(250, 255, 56, 90), crate(594, 255, 56, 90),
    ],
  },
  {
    name: 'Crate Field',
    blurb: 'A grid of crates to blast through, anchored by two steel posts.',
    obstacles: [
      steel(290, 280, 40, 40), steel(570, 280, 40, 40),
      crate(200, 110, 50, 50), crate(425, 110, 50, 50), crate(650, 110, 50, 50),
      crate(200, 440, 50, 50), crate(425, 440, 50, 50), crate(650, 440, 50, 50),
      crate(425, 275, 50, 50),
    ],
  },
];

/** A fresh copy per round, because crates are destroyed as they are shot. */
export function tankLevelObstacles(level: number): TankObstacle[] {
  return TANK_LEVELS[normalizeLevel(level, TANK_LEVELS.length) - 1].obstacles.map(obstacle => ({ ...obstacle }));
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
  level = 1;
  obstacles = tankLevelObstacles(1);
  mode: TankMode = 'bot';
  phase: TankPhase = 'ready';
  roundWinner: TankPlayer | null = null;
  matchWinner: TankPlayer | null = null;
  botPace: TankBotPace = 'rookie';
  private botDecisionTimer = 0;
  private elapsed = 0;
  private botDetour: { phase: 'sidestep' | 'push'; direction: TankDirection; resume: TankDirection; until: number } | null = null;

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

  /** Switching arena resets the whole match: scores from another layout mean nothing. */
  setLevel(level: number): void {
    this.level = normalizeLevel(level, TANK_LEVELS.length);
    this.restart(this.mode);
  }

  setBotPace(pace: TankBotPace): void {
    this.botPace = pace;
    this.botDecisionTimer = 0;
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
    this.elapsed += dt;
    this.tanks[1].cooldown = Math.max(0, this.tanks[1].cooldown - dt);
    this.tanks[2].cooldown = Math.max(0, this.tanks[2].cooldown - dt);
    this.botDecisionTimer -= dt;
    if (this.mode === 'bot' && this.botDecisionTimer <= 0) {
      this.updateBot();
      this.botDecisionTimer = this.botPace === 'rookie' ? .85 : this.botPace === 'normal' ? .42 : .2;
    }
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
    this.botDecisionTimer = 0;
    this.botDetour = null;
    this.obstacles = tankLevelObstacles(this.level);
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

  private blocked(tank: MiniTank, direction: TankDirection): boolean {
    const [dx, dy] = VECTORS[direction];
    const probe = TANK_SIZE * .7;
    const x = tank.x + dx * probe;
    const y = tank.y + dy * probe;
    const half = TANK_SIZE / 2;
    if (x < half || x > TANK_ARENA_WIDTH - half || y < half || y > TANK_ARENA_HEIGHT - half) return true;
    return this.obstacles.some(obstacle => overlapsRect(x, y, TANK_SIZE, obstacle));
  }

  private updateBot(): void {
    const bot = this.tanks[2];
    const target = this.tanks[1];
    this.inputs[2] = emptyInput();
    const dx = target.x - bot.x;
    const dy = target.y - bot.y;
    let move: TankDirection | null = null;
    if (Math.abs(dy) > 24) move = dy < 0 ? 'up' : 'down';
    else if (Math.abs(dx) > 24) move = dx < 0 ? 'left' : 'right';

    /*
     * Steering straight at the player leaves the bot pinned against any wall
     * in between. A detour has two legs: sidestep until the original way is
     * clear, then commit to pushing through it. Without the second leg the
     * bot's vertical-first steering drags it straight back behind the wall.
     */
    const detour = this.botDetour;
    if (detour && detour.phase === 'sidestep') {
      if (!this.blocked(bot, detour.resume)) {
        this.botDetour = { ...detour, phase: 'push', direction: detour.resume, until: this.elapsed + .7 };
        move = detour.resume;
      } else if (this.elapsed < detour.until && !this.blocked(bot, detour.direction)) {
        move = detour.direction;
      } else {
        this.botDetour = null;
      }
    } else if (detour && detour.phase === 'push') {
      if (this.elapsed < detour.until && !this.blocked(bot, detour.direction)) move = detour.direction;
      else this.botDetour = null;
    }

    if (!this.botDetour && move && this.blocked(bot, move)) {
      const sideways: TankDirection[] = move === 'left' || move === 'right'
        ? (dy < 0 ? ['up', 'down'] : ['down', 'up'])
        : (dx < 0 ? ['left', 'right'] : ['right', 'left']);
      const escape = sideways.find(direction => !this.blocked(bot, direction));
      if (escape) {
        this.botDetour = { phase: 'sidestep', direction: escape, resume: move, until: this.elapsed + 2.5 };
        move = escape;
      }
    }
    if (move) this.inputs[2][move] = true;

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
      if (bounced) { bullet.bounces += 1; emitArcadeGameplayCue('ricochet'); }
      if (bullet.bounces > 1) continue;

      const obstacleIndex = this.obstacles.findIndex(obstacle => overlapsRect(bullet.x, bullet.y, 8, obstacle));
      if (obstacleIndex >= 0) {
        if (this.obstacles[obstacleIndex].destructible) this.obstacles.splice(obstacleIndex, 1);
        continue;
      }

      const victim = (bullet.owner === 1 ? 2 : 1) as TankPlayer;
      if (bullet.age > .08 && Math.hypot(bullet.x - this.tanks[victim].x, bullet.y - this.tanks[victim].y) < TANK_SIZE * .62) {
        emitArcadeGameplayCue('hit', `${bullet.owner === 1 ? 'MINT' : 'CORAL'} HIT`);
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
  const readiness = document.getElementById('tanksShotReadiness');
  const paceSelect = document.getElementById('tanksBotPace') as HTMLSelectElement | null;
  const levelSelect = document.getElementById('tanksLevel') as HTMLSelectElement | null;
  const modeButtons = document.querySelectorAll<HTMLButtonElement>('[data-tanks-mode]');
  const mintControls = document.getElementById('tanksMintControls');
  const coralControls = document.getElementById('tanksCoralControls');
  const roomMount = document.querySelector<HTMLElement>('[data-game-room="tanks"]');
  let room: GameRoomClient | null = null;
  const resultReporter = new ArcadeResultReporter('tanks');

  game.setLevel(bindLevelSelect(levelSelect, 'tanks', TANK_LEVELS, level => {
    // An online guest plays the host's arena; its own picker only mirrors it.
    if (room?.isGuest()) {
      if (levelSelect) levelSelect.value = String(game.level);
      return;
    }
    game.setLevel(level);
    room?.broadcastState(snapshot(), true);
    syncUi(); render();
  }));

  function snapshot(): Record<string, unknown> {
    return {
      level: game.level,
      tanks: game.tanks, bullets: game.bullets, obstacles: game.obstacles,
      mode: game.mode, phase: game.phase, roundWinner: game.roundWinner, matchWinner: game.matchWinner,
      botPace: game.botPace,
    };
  }

  function restore(state: Record<string, unknown>): void {
    if (!state.tanks || !Array.isArray(state.bullets) || !Array.isArray(state.obstacles)) return;
    game.tanks = state.tanks as Record<TankPlayer, MiniTank>;
    game.bullets = state.bullets as TankBullet[];
    game.obstacles = state.obstacles as TankObstacle[];
    if (state.level !== undefined) {
      game.level = normalizeLevel(state.level, TANK_LEVELS.length);
      if (levelSelect) levelSelect.value = String(game.level);
    }
    game.mode = state.mode as TankMode;
    game.phase = state.phase as TankPhase;
    game.roundWinner = state.roundWinner as TankPlayer | null;
    game.matchWinner = state.matchWinner as TankPlayer | null;
    if (state.botPace === 'rookie' || state.botPace === 'normal' || state.botPace === 'ace') game.setBotPace(state.botPace);
  }

  function setPlayerInput(player: TankPlayer, action: keyof TankInput, pressed: boolean): void {
    if (pressed && isArcadeSessionPaused('tanks')) return;
    const session = room?.session();
    if (!session?.online) game.setInput(player, action, pressed);
    else if (session.ready && room?.canControl(player)) {
      if (room.isGuest()) room.sendAction({ type: 'input', action, pressed });
      else game.setInput(player, action, pressed);
    }
  }

  function launchRound(): void {
    if (isArcadeSessionPaused('tanks')) return;
    const session = room?.session();
    if (session?.online && !session.ready) return;
    if (room?.isGuest()) room.sendAction({ type: 'launch' });
    else {
      if (game.phase === 'finished') game.restart(game.mode);
      game.startRound();
      room?.broadcastState(snapshot(), true);
    }
    syncUi();
  }

  function visible(): boolean { return !view.classList.contains('view-hidden'); }
  function syncUi(): void {
    if (status) status.textContent = game.statusText();
    if (mintScore) mintScore.textContent = String(game.tanks[1].score);
    if (coralScore) coralScore.textContent = String(game.tanks[2].score);
    const tracked = (room?.session().online ? room.session().playerId : 1) ?? 1;
    if (readiness) {
      const ready = game.tanks[tracked].cooldown <= 0;
      readiness.textContent = ready ? '● Shot ready' : `◌ Reloading ${Math.ceil(game.tanks[tracked].cooldown * 10) / 10}s`;
      readiness.classList.toggle('ready', ready);
    }
    if (paceSelect) paceSelect.hidden = game.mode !== 'bot' || Boolean(room?.session().online);
    if (launchButton) launchButton.textContent = game.phase === 'round-over' ? 'Next round' : game.phase === 'finished' ? 'New match' : game.phase === 'ready' ? 'Start duel' : 'Battle live';
    modeButtons.forEach(button => {
      button.classList.toggle('active', button.dataset.tanksMode === game.mode);
      button.disabled = Boolean(room?.session().online);
    });
    const touchSession = room?.session();
    mintControls?.classList.toggle('solo-hidden', Boolean(touchSession?.online && touchSession.playerId === 2));
    coralControls?.classList.toggle('solo-hidden', touchSession?.online ? touchSession.playerId !== 2 : game.mode === 'bot');
    const trackedPlayer = tracked;
    resultReporter.report(game.phase === 'finished', {
      outcome: game.matchWinner === trackedPlayer ? 'win' : 'loss',
      score: game.tanks[trackedPlayer].score,
    });
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
      ctx.beginPath(); ctx.arc(bullet.x, bullet.y, 7, 0, Math.PI * 2); ctx.fill();
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
    if (command) { event.preventDefault(); setPlayerInput(command[0], command[1], true); }
    else if (event.code === 'Space' && !event.repeat) { event.preventDefault(); launchRound(); }
  });
  window.addEventListener('keyup', event => {
    const command = commands[event.code];
    if (command) setPlayerInput(command[0], command[1], false);
  });
  document.querySelectorAll<HTMLButtonElement>('[data-tank-player][data-tank-action]').forEach(button => {
    const player = Number(button.dataset.tankPlayer) as TankPlayer;
    const action = button.dataset.tankAction as keyof TankInput;
    const release = (): void => setPlayerInput(player, action, false);
    button.addEventListener('pointerdown', event => { event.preventDefault(); capturePointer(button, event.pointerId); setPlayerInput(player, action, true); });
    button.addEventListener('pointerup', release); button.addEventListener('pointercancel', release); button.addEventListener('lostpointercapture', release);
  });
  document.querySelectorAll<HTMLElement>('[data-tank-joystick]').forEach(track => {
    const player = Number(track.dataset.tankJoystick) as TankPlayer;
    bindDirectionalJoystick(track, (direction, pressed) => setPlayerInput(player, direction, pressed), 'cardinal');
  });
  modeButtons.forEach(button => button.addEventListener('click', () => {
    const mode = button.dataset.tanksMode;
    if (mode === 'bot' || mode === 'duel') { game.restart(mode); syncUi(); render(); }
  }));
  paceSelect?.addEventListener('change', () => {
    const pace = paceSelect.value;
    if (pace === 'rookie' || pace === 'normal' || pace === 'ace') game.setBotPace(pace);
  });
  launchButton?.addEventListener('click', launchRound);
  document.getElementById('tanksRestartButton')?.addEventListener('click', () => {
    if (room?.isGuest()) room.sendAction({ type: 'restart' });
    else {
      game.restart(game.mode); syncUi(); render();
      room?.broadcastState(snapshot(), true);
    }
  });

  if (roomMount) {
    room = new GameRoomClient({
      game: 'tanks',
      mount: roomMount,
      offlineModes: [
        { id: 'local', label: 'Local 2P', description: 'Two tank crews share this device.', onSelect: () => { game.restart('duel'); syncUi(); render(); } },
        { id: 'bot', label: 'Vs bot', description: 'Battle the Coral computer tank.', onSelect: () => { game.restart('bot'); syncUi(); render(); } },
      ],
      initialOfflineMode: 'bot',
      onSessionChange: session => {
        if (!session.online) game.restart('bot');
        else if (!session.ready && session.playerId === 1) {
          (['up', 'down', 'left', 'right', 'fire'] as Array<keyof TankInput>).forEach(action => game.setInput(2, action, false));
        }
        if (session.ready && session.playerId === 1) {
          game.restart('duel');
          room?.broadcastState(snapshot(), true);
        }
        syncUi(); render();
      },
      onRemoteAction: (action, from) => {
        if (!room?.isHost() || from !== 2) return;
        if (action.type === 'input' && (action.action === 'up' || action.action === 'down' || action.action === 'left' || action.action === 'right' || action.action === 'fire') && typeof action.pressed === 'boolean') {
          game.setInput(2, action.action, action.pressed);
        } else if (action.type === 'launch') {
          if (game.phase === 'finished') game.restart('duel');
          game.startRound();
        } else if (action.type === 'restart') game.restart('duel');
        room.broadcastState(snapshot(), true); syncUi();
      },
      onState: state => { if (room?.isGuest()) { restore(state); syncUi(); render(); } },
    });
  }

  registerArcadeSession({
    gameId: 'tanks',
    view,
    mode: () => room?.session().online ? 'online' : game.mode === 'bot' ? 'solo' : 'local',
    isActive: () => game.phase === 'playing',
    clearHeldInputs: () => {
      ([1, 2] as TankPlayer[]).forEach(player => {
        (['up', 'down', 'left', 'right', 'fire'] as Array<keyof TankInput>)
          .forEach(action => game.setInput(player, action, false));
      });
    },
  });

  let previous = performance.now();
  function loop(now: number): void {
    if (visible()) {
      if (!room?.isGuest()) {
        if (!isArcadeSessionPaused('tanks')) game.update((now - previous) / 1000);
        room?.broadcastState(snapshot());
      }
      render(); syncUi();
    }
    previous = now; requestAnimationFrame(loop);
  }
  syncUi(); render(); requestAnimationFrame(loop);
}
