import { GameRoomClient } from './game-room.js';

export type RacingPlayer = 1 | 2;
export type RacingMode = 'bot' | 'duel';
export type RacingPhase = 'ready' | 'countdown' | 'racing' | 'finished';
export type RacingAction = 'accelerate' | 'brake' | 'left' | 'right';

export const RACING_ARENA_WIDTH = 900;
export const RACING_ARENA_HEIGHT = 600;
export const RACING_TARGET_LAPS = 3;
export const RACING_CHECKPOINTS = [
  { x: 450, y: 470 },
  { x: 150, y: 300 },
  { x: 450, y: 130 },
  { x: 750, y: 300 },
] as const;

const CAR_RADIUS = 18;
const NORMAL_TOP_SPEED = 255;
const BOOST_TOP_SPEED = 340;
const ACCELERATION = 205;
const BRAKE_FORCE = 250;
const TURN_SPEED = 2.7;

export interface RacingCar {
  x: number;
  y: number;
  angle: number;
  speed: number;
  laps: number;
  nextCheckpoint: number;
  boostTimer: number;
}

export interface RacingPickup {
  id: number;
  x: number;
  y: number;
  active: boolean;
  respawnTimer: number;
}

export interface RacingInput {
  accelerate: boolean;
  brake: boolean;
  left: boolean;
  right: boolean;
}

export interface RacingSnapshot {
  cars: Record<RacingPlayer, RacingCar>;
  pickups: RacingPickup[];
  mode: RacingMode;
  phase: RacingPhase;
  winner: RacingPlayer | null;
  countdown: number;
}

function blankInput(): RacingInput {
  return { accelerate: false, brake: false, left: false, right: false };
}

function createCar(player: RacingPlayer): RacingCar {
  return {
    x: player === 1 ? 480 : 520,
    y: player === 1 ? 455 : 490,
    angle: Math.PI,
    speed: 0,
    laps: 0,
    nextCheckpoint: 1,
    boostTimer: 0,
  };
}

function createPickups(): RacingPickup[] {
  return [
    { id: 1, x: 240, y: 420, active: true, respawnTimer: 0 },
    { id: 2, x: 240, y: 180, active: true, respawnTimer: 0 },
    { id: 3, x: 660, y: 180, active: true, respawnTimer: 0 },
    { id: 4, x: 660, y: 420, active: true, respawnTimer: 0 },
  ];
}

function normalizeAngle(angle: number): number {
  let normalized = angle;
  while (normalized > Math.PI) normalized -= Math.PI * 2;
  while (normalized < -Math.PI) normalized += Math.PI * 2;
  return normalized;
}

export function isPointOnRacingTrack(x: number, y: number): boolean {
  const dx = x - RACING_ARENA_WIDTH / 2;
  const dy = y - RACING_ARENA_HEIGHT / 2;
  const insideOuter = (dx * dx) / (410 * 410) + (dy * dy) / (255 * 255) <= 1;
  const outsideInner = (dx * dx) / (190 * 190) + (dy * dy) / (85 * 85) >= 1;
  return insideOuter && outsideInner;
}

export class MicroRacersGame {
  cars: Record<RacingPlayer, RacingCar> = { 1: createCar(1), 2: createCar(2) };
  inputs: Record<RacingPlayer, RacingInput> = { 1: blankInput(), 2: blankInput() };
  pickups: RacingPickup[] = createPickups();
  mode: RacingMode = 'bot';
  phase: RacingPhase = 'ready';
  winner: RacingPlayer | null = null;
  countdown = 3;

  restart(mode: RacingMode = this.mode): void {
    this.mode = mode;
    this.cars = { 1: createCar(1), 2: createCar(2) };
    this.inputs = { 1: blankInput(), 2: blankInput() };
    this.pickups = createPickups();
    this.phase = 'ready';
    this.winner = null;
    this.countdown = 3;
  }

  startRace(): boolean {
    if (this.phase !== 'ready') return false;
    this.phase = 'countdown';
    this.countdown = 3;
    return true;
  }

  setInput(player: RacingPlayer, action: RacingAction, pressed: boolean): void {
    if (this.mode === 'bot' && player === 2) return;
    this.inputs[player][action] = pressed;
  }

  update(seconds: number): void {
    const elapsed = Math.max(0, seconds);
    if (this.phase === 'countdown') {
      this.countdown = Math.max(0, this.countdown - elapsed);
      if (this.countdown === 0) this.phase = 'racing';
      return;
    }
    if (this.phase !== 'racing') return;
    const dt = Math.min(.05, elapsed);
    if (this.mode === 'bot') this.updateBot();
    this.moveCar(1, dt);
    if (this.phase === 'racing') this.moveCar(2, dt);
    if (this.phase === 'racing') {
      this.resolveCarContact();
      this.updatePickups(dt);
    }
  }

  statusText(): string {
    if (this.phase === 'ready') return this.mode === 'bot'
      ? 'Race the Coral bot through three turbo-charged laps.'
      : 'Two racers, one device, three laps. Start when ready.';
    if (this.phase === 'countdown') return `Race starts in ${Math.max(1, Math.ceil(this.countdown))}…`;
    if (this.phase === 'racing') return 'Hit every checkpoint, collect turbo bolts, and be first through three laps.';
    return `${this.winner === 1 ? 'Mint' : 'Coral'} wins the Micro Racers cup!`;
  }

  private moveCar(player: RacingPlayer, dt: number): void {
    const car = this.cars[player];
    const input = this.inputs[player];
    car.boostTimer = Math.max(0, car.boostTimer - dt);
    const topSpeed = car.boostTimer > 0 ? BOOST_TOP_SPEED : NORMAL_TOP_SPEED;

    if (input.accelerate) car.speed += ACCELERATION * dt;
    else if (input.brake) car.speed -= BRAKE_FORCE * dt;
    else if (car.speed > 0) car.speed = Math.max(0, car.speed - 58 * dt);
    else if (car.speed < 0) car.speed = Math.min(0, car.speed + 58 * dt);
    car.speed = Math.max(-90, Math.min(topSpeed, car.speed));

    const steering = (input.left ? -1 : 0) + (input.right ? 1 : 0);
    if (steering && Math.abs(car.speed) > 8) {
      const reverse = car.speed < 0 ? -1 : 1;
      const grip = .35 + .65 * Math.min(1, Math.abs(car.speed) / 110);
      car.angle = normalizeAngle(car.angle + steering * reverse * TURN_SPEED * grip * dt);
    }

    const previousX = car.x;
    const previousY = car.y;
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    if (!isPointOnRacingTrack(car.x, car.y)) {
      car.x = previousX;
      car.y = previousY;
      car.speed *= .48;
    }
    this.updateCheckpoint(player);
  }

  private updateBot(): void {
    const bot = this.cars[2];
    const target = RACING_CHECKPOINTS[bot.nextCheckpoint];
    const desired = Math.atan2(target.y - bot.y, target.x - bot.x);
    const delta = normalizeAngle(desired - bot.angle);
    this.inputs[2] = blankInput();
    this.inputs[2].accelerate = true;
    if (delta < -.06) this.inputs[2].left = true;
    else if (delta > .06) this.inputs[2].right = true;
    if (Math.abs(delta) > 1.25 && bot.speed > 145) {
      this.inputs[2].accelerate = false;
      this.inputs[2].brake = true;
    }
  }

  private updateCheckpoint(player: RacingPlayer): void {
    const car = this.cars[player];
    const target = RACING_CHECKPOINTS[car.nextCheckpoint];
    if (Math.hypot(car.x - target.x, car.y - target.y) > 82) return;
    if (car.nextCheckpoint === 0) {
      car.laps += 1;
      if (car.laps >= RACING_TARGET_LAPS) {
        this.phase = 'finished';
        this.winner = player;
        this.inputs = { 1: blankInput(), 2: blankInput() };
        car.speed = 0;
        return;
      }
    }
    car.nextCheckpoint = (car.nextCheckpoint + 1) % RACING_CHECKPOINTS.length;
  }

  private updatePickups(dt: number): void {
    for (const pickup of this.pickups) {
      if (!pickup.active) {
        pickup.respawnTimer = Math.max(0, pickup.respawnTimer - dt);
        if (pickup.respawnTimer === 0) pickup.active = true;
        continue;
      }
      for (const player of [1, 2] as RacingPlayer[]) {
        const car = this.cars[player];
        if (Math.hypot(car.x - pickup.x, car.y - pickup.y) >= 31) continue;
        car.boostTimer = 2.4;
        car.speed = Math.max(car.speed, 235);
        pickup.active = false;
        pickup.respawnTimer = 5;
        break;
      }
    }
  }

  private resolveCarContact(): void {
    const mint = this.cars[1];
    const coral = this.cars[2];
    const dx = coral.x - mint.x;
    const dy = coral.y - mint.y;
    const distance = Math.hypot(dx, dy);
    if (distance === 0 || distance >= CAR_RADIUS * 2) return;
    const overlap = (CAR_RADIUS * 2 - distance) / 2;
    const nx = dx / distance;
    const ny = dy / distance;
    const mintX = mint.x - nx * overlap;
    const mintY = mint.y - ny * overlap;
    const coralX = coral.x + nx * overlap;
    const coralY = coral.y + ny * overlap;
    if (isPointOnRacingTrack(mintX, mintY)) { mint.x = mintX; mint.y = mintY; }
    if (isPointOnRacingTrack(coralX, coralY)) { coral.x = coralX; coral.y = coralY; }
    mint.speed *= .82;
    coral.speed *= .82;
  }
}

export function createRacingSnapshot(game: MicroRacersGame): RacingSnapshot {
  return {
    cars: game.cars,
    pickups: game.pickups,
    mode: game.mode,
    phase: game.phase,
    winner: game.winner,
    countdown: game.countdown,
  };
}

export function applyRacingSnapshot(game: MicroRacersGame, state: RacingSnapshot): void {
  game.cars = state.cars;
  game.pickups = state.pickups;
  game.mode = state.mode;
  game.phase = state.phase;
  game.winner = state.winner;
  game.countdown = state.countdown;
}

export function initMicroRacers(): void {
  if (typeof document === 'undefined') return;
  const canvasElement = document.getElementById('racingCanvas') as HTMLCanvasElement | null;
  const contextValue = canvasElement?.getContext('2d');
  const viewElement = document.getElementById('racingView');
  if (!canvasElement || !contextValue || !viewElement) return;
  const canvas = canvasElement;
  const ctx = contextValue;
  const view = viewElement;
  canvas.width = RACING_ARENA_WIDTH;
  canvas.height = RACING_ARENA_HEIGHT;

  const game = new MicroRacersGame();
  const status = document.getElementById('racingStatus');
  const mintLap = document.getElementById('racingMintLap');
  const coralLap = document.getElementById('racingCoralLap');
  const mintSpeed = document.getElementById('racingMintSpeed');
  const coralSpeed = document.getElementById('racingCoralSpeed');
  const startButton = document.getElementById('racingStartButton') as HTMLButtonElement | null;
  const modeButtons = document.querySelectorAll<HTMLButtonElement>('[data-racing-mode]');
  const roomMount = document.querySelector<HTMLElement>('[data-game-room="racing"]');
  let room: GameRoomClient | null = null;

  function snapshot(): Record<string, unknown> {
    return createRacingSnapshot(game) as unknown as Record<string, unknown>;
  }

  function restore(state: Record<string, unknown>): void {
    if (!state.cars || !Array.isArray(state.pickups)) return;
    applyRacingSnapshot(game, state as unknown as RacingSnapshot);
  }

  function setPlayerInput(player: RacingPlayer, action: RacingAction, pressed: boolean): void {
    const session = room?.session();
    if (!session?.online) game.setInput(player, action, pressed);
    else if (session.ready && room?.canControl(player)) {
      if (room.isGuest()) room.sendAction({ type: 'input', action, pressed });
      else game.setInput(player, action, pressed);
    }
  }

  function startRace(): void {
    const session = room?.session();
    if (session?.online && !session.ready) return;
    if (room?.isGuest()) room.sendAction({ type: 'start' });
    else {
      if (game.phase === 'finished') game.restart(game.mode);
      game.startRace();
      room?.broadcastState(snapshot(), true);
    }
    syncUi();
  }

  function visible(): boolean { return !view.classList.contains('view-hidden'); }

  function syncUi(): void {
    if (status) status.textContent = game.statusText();
    if (mintLap) mintLap.textContent = `${Math.min(game.cars[1].laps + 1, RACING_TARGET_LAPS)}/${RACING_TARGET_LAPS}`;
    if (coralLap) coralLap.textContent = `${Math.min(game.cars[2].laps + 1, RACING_TARGET_LAPS)}/${RACING_TARGET_LAPS}`;
    if (mintSpeed) mintSpeed.textContent = `${Math.round(Math.abs(game.cars[1].speed))} km/h`;
    if (coralSpeed) coralSpeed.textContent = `${Math.round(Math.abs(game.cars[2].speed))} km/h`;
    if (startButton) {
      startButton.disabled = game.phase === 'countdown' || game.phase === 'racing' || Boolean(room?.session().online && !room.session().ready);
      startButton.textContent = game.phase === 'finished' ? 'New race' : game.phase === 'ready' ? 'Start race' : game.phase === 'countdown' ? 'Get ready' : 'Race live';
    }
    modeButtons.forEach(button => {
      button.classList.toggle('active', button.dataset.racingMode === game.mode);
      button.disabled = Boolean(room?.session().online) || game.phase === 'countdown' || game.phase === 'racing';
    });
  }

  function drawTrack(): void {
    const background = ctx.createLinearGradient(0, 0, 0, canvas.height);
    background.addColorStop(0, '#183a2d');
    background.addColorStop(1, '#0d251e');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = 'rgba(255,255,255,.035)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= canvas.width; x += 36) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke(); }
    for (let y = 0; y <= canvas.height; y += 36) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke(); }

    ctx.fillStyle = '#303744';
    ctx.beginPath();
    ctx.ellipse(450, 300, 410, 255, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#e5edf5';
    ctx.lineWidth = 8;
    ctx.stroke();

    ctx.fillStyle = '#123326';
    ctx.beginPath();
    ctx.ellipse(450, 300, 190, 85, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#e5edf5';
    ctx.lineWidth = 8;
    ctx.stroke();

    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,.38)';
    ctx.lineWidth = 3;
    ctx.setLineDash([22, 20]);
    ctx.beginPath();
    ctx.ellipse(450, 300, 300, 170, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    const checkerSize = 10;
    for (let row = 0; row < 10; row += 1) {
      for (let column = 0; column < 2; column += 1) {
        ctx.fillStyle = (row + column) % 2 ? '#111722' : '#f5f7fa';
        ctx.fillRect(440 + column * checkerSize, 420 + row * checkerSize, checkerSize, checkerSize);
      }
    }
  }

  function drawPickups(): void {
    for (const pickup of game.pickups) {
      if (!pickup.active) continue;
      ctx.save();
      ctx.translate(pickup.x, pickup.y);
      ctx.rotate(performance.now() / 500);
      ctx.shadowColor = '#ffc857';
      ctx.shadowBlur = 22;
      ctx.fillStyle = '#ffc857';
      ctx.beginPath();
      for (let side = 0; side < 8; side += 1) {
        const angle = side * Math.PI / 4;
        const radius = side % 2 ? 10 : 17;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        if (side === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#251a05';
      ctx.font = '900 18px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⚡', 0, 1);
      ctx.restore();
    }
  }

  function drawCar(player: RacingPlayer): void {
    const car = game.cars[player];
    const color = player === 1 ? '#54e38e' : '#ff6b78';
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    if (car.boostTimer > 0) {
      ctx.fillStyle = 'rgba(255,200,87,.72)';
      ctx.beginPath();
      ctx.moveTo(-24, -7); ctx.lineTo(-42, 0); ctx.lineTo(-24, 7); ctx.closePath(); ctx.fill();
    }
    ctx.shadowColor = color;
    ctx.shadowBlur = car.boostTimer > 0 ? 26 : 14;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(-23, -14, 46, 28, 9);
    ctx.fill();
    ctx.fillStyle = '#101722';
    ctx.fillRect(-6, -11, 15, 22);
    ctx.fillStyle = '#dce7f4';
    ctx.fillRect(14, -9, 5, 18);
    ctx.fillStyle = '#0b1018';
    ctx.fillRect(-14, -18, 11, 5); ctx.fillRect(10, -18, 11, 5);
    ctx.fillRect(-14, 13, 11, 5); ctx.fillRect(10, 13, 11, 5);
    ctx.restore();
  }

  function render(): void {
    drawTrack();
    drawPickups();
    drawCar(1);
    drawCar(2);
    if (game.phase === 'countdown') {
      ctx.fillStyle = 'rgba(7,10,16,.55)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#ffc857';
      ctx.font = '950 116px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = '#ffc857';
      ctx.shadowBlur = 32;
      ctx.fillText(String(Math.max(1, Math.ceil(game.countdown))), canvas.width / 2, canvas.height / 2);
      ctx.shadowBlur = 0;
    }
    if (game.phase === 'finished') {
      ctx.fillStyle = 'rgba(7,10,16,.64)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = game.winner === 1 ? '#54e38e' : '#ff6b78';
      ctx.font = '950 52px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(`${game.winner === 1 ? 'MINT' : 'CORAL'} WINS`, canvas.width / 2, canvas.height / 2);
    }
  }

  const commands: Record<string, readonly [RacingPlayer, RacingAction]> = {
    KeyW: [1, 'accelerate'], KeyS: [1, 'brake'], KeyA: [1, 'left'], KeyD: [1, 'right'],
    ArrowUp: [2, 'accelerate'], ArrowDown: [2, 'brake'], ArrowLeft: [2, 'left'], ArrowRight: [2, 'right'],
  };
  window.addEventListener('keydown', event => {
    if (!visible()) return;
    const command = commands[event.code];
    if (command) { event.preventDefault(); setPlayerInput(command[0], command[1], true); }
    else if (event.code === 'Space' && !event.repeat) { event.preventDefault(); startRace(); }
  });
  window.addEventListener('keyup', event => {
    const command = commands[event.code];
    if (command) setPlayerInput(command[0], command[1], false);
  });
  window.addEventListener('blur', () => {
    for (const player of [1, 2] as RacingPlayer[]) {
      for (const action of ['accelerate', 'brake', 'left', 'right'] as RacingAction[]) setPlayerInput(player, action, false);
    }
  });
  document.querySelectorAll<HTMLButtonElement>('[data-racing-player][data-racing-action]').forEach(button => {
    const player = Number(button.dataset.racingPlayer) as RacingPlayer;
    const action = button.dataset.racingAction as RacingAction;
    const release = (): void => { button.classList.remove('pressed'); setPlayerInput(player, action, false); };
    button.addEventListener('pointerdown', event => {
      event.preventDefault();
      button.setPointerCapture?.(event.pointerId);
      button.classList.add('pressed');
      setPlayerInput(player, action, true);
    });
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('lostpointercapture', release);
  });
  modeButtons.forEach(button => button.addEventListener('click', () => {
    if (room?.session().online) return;
    const mode = button.dataset.racingMode;
    if (mode === 'bot' || mode === 'duel') { game.restart(mode); syncUi(); render(); }
  }));
  startButton?.addEventListener('click', startRace);
  document.getElementById('racingRestartButton')?.addEventListener('click', () => {
    if (room?.isGuest()) room.sendAction({ type: 'restart' });
    else {
      game.restart(game.mode);
      syncUi(); render();
      room?.broadcastState(snapshot(), true);
    }
  });

  if (roomMount) {
    room = new GameRoomClient({
      game: 'racing',
      mount: roomMount,
      onPlayLocal: () => { game.restart('duel'); syncUi(); render(); },
      onSessionChange: session => {
        if (!session.online) game.restart('bot');
        else if (game.mode !== 'duel') game.restart('duel');
        if (session.online && !session.ready && session.playerId === 1) {
          for (const action of ['accelerate', 'brake', 'left', 'right'] as RacingAction[]) game.setInput(2, action, false);
        }
        if (session.ready && session.playerId === 1) {
          game.restart('duel');
          room?.broadcastState(snapshot(), true);
        }
        syncUi(); render();
      },
      onRemoteAction: (action, from) => {
        if (!room?.isHost() || from !== 2) return;
        if (action.type === 'input' && (action.action === 'accelerate' || action.action === 'brake' || action.action === 'left' || action.action === 'right') && typeof action.pressed === 'boolean') {
          game.setInput(2, action.action, action.pressed);
        } else if (action.type === 'start') {
          if (game.phase === 'finished') game.restart('duel');
          game.startRace();
        } else if (action.type === 'restart') game.restart('duel');
        room.broadcastState(snapshot(), true);
        syncUi();
      },
      onState: state => {
        if (!room?.isGuest()) return;
        restore(state);
        syncUi(); render();
      },
    });
  }

  let previous = performance.now();
  function loop(now: number): void {
    if (visible()) {
      if (!room?.isGuest()) {
        game.update((now - previous) / 1000);
        room?.broadcastState(snapshot());
      }
      render();
      syncUi();
    }
    previous = now;
    requestAnimationFrame(loop);
  }
  syncUi();
  render();
  requestAnimationFrame(loop);
}
