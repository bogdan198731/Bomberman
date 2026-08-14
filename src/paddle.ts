import { GameRoomClient } from './game-room.js';

export type PaddlePlayer = 1 | 2;
export type PaddleDirection = 'up' | 'down';
export type PaddlePhase = 'ready' | 'playing' | 'finished';

export const PADDLE_WIDTH = 900;
export const PADDLE_HEIGHT = 540;
export const PADDLE_TARGET_SCORE = 7;
const BAT_WIDTH = 18;
const BAT_HEIGHT = 108;
const BAT_MARGIN = 38;
const BALL_RADIUS = 11;
const BAT_SPEED = 460;
const START_BALL_SPEED = 360;
const MAX_BALL_SPEED = 780;

export interface PaddleBat {
  y: number;
  score: number;
}

export interface PaddleBall {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface PaddleInputs {
  up: boolean;
  down: boolean;
}

export class PaddleClashGame {
  players: Record<PaddlePlayer, PaddleBat> = {
    1: { y: (PADDLE_HEIGHT - BAT_HEIGHT) / 2, score: 0 },
    2: { y: (PADDLE_HEIGHT - BAT_HEIGHT) / 2, score: 0 },
  };
  ball: PaddleBall = { x: PADDLE_WIDTH / 2, y: PADDLE_HEIGHT / 2, vx: 0, vy: 0 };
  inputs: Record<PaddlePlayer, PaddleInputs> = {
    1: { up: false, down: false },
    2: { up: false, down: false },
  };
  phase: PaddlePhase = 'ready';
  winner: PaddlePlayer | null = null;
  rallyHits = 0;
  private serveDirection: 1 | -1 = 1;
  private serveIndex = 0;

  restart(): void {
    this.players = {
      1: { y: (PADDLE_HEIGHT - BAT_HEIGHT) / 2, score: 0 },
      2: { y: (PADDLE_HEIGHT - BAT_HEIGHT) / 2, score: 0 },
    };
    this.inputs = {
      1: { up: false, down: false },
      2: { up: false, down: false },
    };
    this.phase = 'ready';
    this.winner = null;
    this.rallyHits = 0;
    this.serveDirection = 1;
    this.serveIndex = 0;
    this.resetBall();
  }

  setInput(player: PaddlePlayer, direction: PaddleDirection, pressed: boolean): void {
    this.inputs[player][direction] = pressed;
  }

  serve(): boolean {
    if (this.phase !== 'ready') return false;
    const verticalDirections = [-0.34, 0.26, -0.18, 0.38];
    const verticalRatio = verticalDirections[this.serveIndex % verticalDirections.length];
    this.serveIndex += 1;
    this.ball.vx = this.serveDirection * START_BALL_SPEED;
    this.ball.vy = START_BALL_SPEED * verticalRatio;
    this.phase = 'playing';
    this.rallyHits = 0;
    return true;
  }

  update(seconds: number): void {
    const dt = Math.max(0, Math.min(seconds, 0.04));
    this.moveBat(1, dt);
    this.moveBat(2, dt);
    if (this.phase !== 'playing' || dt === 0) return;

    this.ball.x += this.ball.vx * dt;
    this.ball.y += this.ball.vy * dt;

    if (this.ball.y - BALL_RADIUS <= 0 && this.ball.vy < 0) {
      this.ball.y = BALL_RADIUS;
      this.ball.vy = Math.abs(this.ball.vy);
    } else if (this.ball.y + BALL_RADIUS >= PADDLE_HEIGHT && this.ball.vy > 0) {
      this.ball.y = PADDLE_HEIGHT - BALL_RADIUS;
      this.ball.vy = -Math.abs(this.ball.vy);
    }

    this.collideWithBat(1);
    this.collideWithBat(2);

    if (this.ball.x + BALL_RADIUS < 0) this.scorePoint(2);
    else if (this.ball.x - BALL_RADIUS > PADDLE_WIDTH) this.scorePoint(1);
  }

  statusText(): string {
    if (this.phase === 'finished') return `${this.winner === 1 ? 'Mint' : 'Coral'} wins the clash!`;
    if (this.phase === 'ready') return 'Press Serve or Space to start the rally.';
    return this.rallyHits >= 5 ? `Rally x${this.rallyHits} — the ball is heating up!` : 'Keep the ball in play.';
  }

  private moveBat(player: PaddlePlayer, dt: number): void {
    const input = this.inputs[player];
    const direction = Number(input.down) - Number(input.up);
    const bat = this.players[player];
    bat.y = Math.max(0, Math.min(PADDLE_HEIGHT - BAT_HEIGHT, bat.y + direction * BAT_SPEED * dt));
  }

  private collideWithBat(player: PaddlePlayer): void {
    const bat = this.players[player];
    const batX = player === 1 ? BAT_MARGIN : PADDLE_WIDTH - BAT_MARGIN - BAT_WIDTH;
    const movingTowardBat = player === 1 ? this.ball.vx < 0 : this.ball.vx > 0;
    if (!movingTowardBat) return;
    const overlapsX = this.ball.x + BALL_RADIUS >= batX && this.ball.x - BALL_RADIUS <= batX + BAT_WIDTH;
    const overlapsY = this.ball.y + BALL_RADIUS >= bat.y && this.ball.y - BALL_RADIUS <= bat.y + BAT_HEIGHT;
    if (!overlapsX || !overlapsY) return;

    const currentSpeed = Math.hypot(this.ball.vx, this.ball.vy);
    const nextSpeed = Math.min(MAX_BALL_SPEED, currentSpeed * 1.065 + 8);
    const relativeHit = Math.max(-1, Math.min(1, (this.ball.y - (bat.y + BAT_HEIGHT / 2)) / (BAT_HEIGHT / 2)));
    const angle = relativeHit * Math.PI * 0.34;
    const horizontalDirection = player === 1 ? 1 : -1;
    this.ball.vx = horizontalDirection * nextSpeed * Math.cos(angle);
    this.ball.vy = nextSpeed * Math.sin(angle);
    this.ball.x = player === 1 ? batX + BAT_WIDTH + BALL_RADIUS : batX - BALL_RADIUS;
    this.rallyHits += 1;
  }

  private scorePoint(player: PaddlePlayer): void {
    this.players[player].score += 1;
    if (this.players[player].score >= PADDLE_TARGET_SCORE) {
      this.phase = 'finished';
      this.winner = player;
      this.ball.vx = 0;
      this.ball.vy = 0;
      return;
    }
    this.phase = 'ready';
    this.serveDirection = player === 1 ? -1 : 1;
    this.resetBall();
  }

  private resetBall(): void {
    this.ball = { x: PADDLE_WIDTH / 2, y: PADDLE_HEIGHT / 2, vx: 0, vy: 0 };
    this.rallyHits = 0;
  }
}

export function initPaddleClash(): void {
  if (typeof document === 'undefined') return;
  const canvas = document.getElementById('paddleCanvas') as HTMLCanvasElement | null;
  const ctx = canvas?.getContext('2d');
  const view = document.getElementById('paddleView');
  if (!canvas || !ctx || !view) return;
  const renderContext = ctx;
  const paddleView = view;

  canvas.width = PADDLE_WIDTH;
  canvas.height = PADDLE_HEIGHT;
  const game = new PaddleClashGame();
  const status = document.getElementById('paddleStatus');
  const mintScore = document.getElementById('paddleMintScore');
  const coralScore = document.getElementById('paddleCoralScore');
  const serveButton = document.getElementById('paddleServeButton') as HTMLButtonElement | null;
  const restartButton = document.getElementById('paddleRestartButton');
  const roomMount = document.querySelector<HTMLElement>('[data-game-room="paddle"]');
  let room: GameRoomClient | null = null;

  function snapshot(): Record<string, unknown> {
    return {
      players: game.players, ball: game.ball, phase: game.phase,
      winner: game.winner, rallyHits: game.rallyHits,
    };
  }

  function restore(state: Record<string, unknown>): void {
    if (!state.players || !state.ball) return;
    game.players = state.players as Record<PaddlePlayer, PaddleBat>;
    game.ball = state.ball as PaddleBall;
    game.phase = state.phase as PaddlePhase;
    game.winner = state.winner as PaddlePlayer | null;
    game.rallyHits = Number(state.rallyHits) || 0;
  }

  function setPlayerInput(player: PaddlePlayer, direction: PaddleDirection, pressed: boolean): void {
    const session = room?.session();
    if (!session?.online) game.setInput(player, direction, pressed);
    else if (session.ready && room?.canControl(player)) {
      if (room.isGuest()) room.sendAction({ type: 'input', direction, pressed });
      else game.setInput(player, direction, pressed);
    }
  }

  function serve(): void {
    const session = room?.session();
    if (session?.online && !session.ready) return;
    if (room?.isGuest()) room.sendAction({ type: 'serve' });
    else {
      game.serve();
      room?.broadcastState(snapshot(), true);
    }
    syncUi();
  }

  function syncUi(): void {
    if (status) status.textContent = game.statusText();
    if (mintScore) mintScore.textContent = String(game.players[1].score);
    if (coralScore) coralScore.textContent = String(game.players[2].score);
    if (serveButton) {
      serveButton.disabled = game.phase !== 'ready';
      serveButton.textContent = game.phase === 'finished' ? 'Match over' : 'Serve ball';
    }
  }

  function roundedRect(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number
  ): void {
    context.beginPath();
    context.roundRect(x, y, width, height, radius);
    context.fill();
  }

  function render(): void {
    const ctx = renderContext;
    const background = ctx.createLinearGradient(0, 0, PADDLE_WIDTH, PADDLE_HEIGHT);
    background.addColorStop(0, '#10261e');
    background.addColorStop(.5, '#111925');
    background.addColorStop(1, '#321820');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, PADDLE_WIDTH, PADDLE_HEIGHT);

    ctx.strokeStyle = 'rgba(255,255,255,.055)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= PADDLE_WIDTH; x += 45) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, PADDLE_HEIGHT); ctx.stroke();
    }
    for (let y = 0; y <= PADDLE_HEIGHT; y += 45) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(PADDLE_WIDTH, y); ctx.stroke();
    }

    ctx.setLineDash([14, 18]);
    ctx.strokeStyle = 'rgba(255,255,255,.24)';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(PADDLE_WIDTH / 2, 24); ctx.lineTo(PADDLE_WIDTH / 2, PADDLE_HEIGHT - 24); ctx.stroke();
    ctx.setLineDash([]);

    const batColors: Record<PaddlePlayer, string> = { 1: '#54e38e', 2: '#ff6b78' };
    ([1, 2] as PaddlePlayer[]).forEach(player => {
      const x = player === 1 ? BAT_MARGIN : PADDLE_WIDTH - BAT_MARGIN - BAT_WIDTH;
      ctx.shadowBlur = 22;
      ctx.shadowColor = batColors[player];
      ctx.fillStyle = batColors[player];
      roundedRect(ctx, x, game.players[player].y, BAT_WIDTH, BAT_HEIGHT, 9);
    });

    ctx.shadowBlur = game.rallyHits > 4 ? 28 : 16;
    ctx.shadowColor = game.rallyHits > 4 ? '#ffc857' : '#ffffff';
    ctx.fillStyle = game.rallyHits > 4 ? '#ffc857' : '#f8fafc';
    ctx.beginPath();
    ctx.arc(game.ball.x, game.ball.y, BALL_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    if (game.phase !== 'playing') {
      ctx.fillStyle = 'rgba(7, 11, 17, .54)';
      ctx.fillRect(0, 0, PADDLE_WIDTH, PADDLE_HEIGHT);
      ctx.fillStyle = '#f8fafc';
      ctx.textAlign = 'center';
      ctx.font = '900 34px Inter, sans-serif';
      ctx.fillText(game.phase === 'finished' ? game.statusText().toUpperCase() : 'READY TO CLASH?', PADDLE_WIDTH / 2, PADDLE_HEIGHT / 2 - 8);
      ctx.fillStyle = '#aab5c5';
      ctx.font = '700 16px Inter, sans-serif';
      ctx.fillText(game.phase === 'finished' ? 'Choose New match to play again' : 'Serve to launch the ball', PADDLE_WIDTH / 2, PADDLE_HEIGHT / 2 + 28);
    }
  }

  function isVisible(): boolean {
    return !paddleView.classList.contains('view-hidden');
  }

  const keyMap: Record<string, readonly [PaddlePlayer, PaddleDirection]> = {
    KeyW: [1, 'up'],
    KeyS: [1, 'down'],
    ArrowUp: [2, 'up'],
    ArrowDown: [2, 'down'],
  };
  window.addEventListener('keydown', event => {
    if (!isVisible()) return;
    const input = keyMap[event.code];
    if (input) {
      event.preventDefault();
      setPlayerInput(input[0], input[1], true);
    } else if (event.code === 'Space' && !event.repeat) {
      event.preventDefault();
      serve();
    }
  });
  window.addEventListener('keyup', event => {
    const input = keyMap[event.code];
    if (input) setPlayerInput(input[0], input[1], false);
  });

  document.querySelectorAll<HTMLButtonElement>('[data-paddle-player][data-paddle-direction]').forEach(button => {
    const player = Number(button.dataset.paddlePlayer) as PaddlePlayer;
    const direction = button.dataset.paddleDirection as PaddleDirection;
    const release = (): void => {
      setPlayerInput(player, direction, false);
      button.classList.remove('pressed');
    };
    button.addEventListener('pointerdown', event => {
      event.preventDefault();
      button.setPointerCapture?.(event.pointerId);
      button.classList.add('pressed');
      setPlayerInput(player, direction, true);
    });
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('lostpointercapture', release);
  });

  serveButton?.addEventListener('click', serve);
  restartButton?.addEventListener('click', () => {
    if (room?.isGuest()) room.sendAction({ type: 'restart' });
    else {
      game.restart(); syncUi();
      room?.broadcastState(snapshot(), true);
    }
  });

  if (roomMount) {
    room = new GameRoomClient({
      game: 'paddle',
      mount: roomMount,
      onPlayLocal: () => { game.restart(); syncUi(); render(); },
      onSessionChange: session => {
        if (session.online && !session.ready && session.playerId === 1) {
          game.setInput(2, 'up', false); game.setInput(2, 'down', false);
        }
        if (session.ready && session.playerId === 1) {
          game.restart();
          room?.broadcastState(snapshot(), true);
        }
        syncUi(); render();
      },
      onRemoteAction: (action, from) => {
        if (!room?.isHost() || from !== 2) return;
        if (action.type === 'input' && (action.direction === 'up' || action.direction === 'down') && typeof action.pressed === 'boolean') {
          game.setInput(2, action.direction, action.pressed);
        } else if (action.type === 'serve') game.serve();
        else if (action.type === 'restart') game.restart();
        room.broadcastState(snapshot(), true); syncUi();
      },
      onState: state => { if (room?.isGuest()) { restore(state); syncUi(); render(); } },
    });
  }

  let lastFrame = performance.now();
  function loop(now: number): void {
    const seconds = (now - lastFrame) / 1000;
    lastFrame = now;
    if (isVisible()) {
      if (!room?.isGuest()) {
        const previousPhase = game.phase;
        const previousScore = game.players[1].score + game.players[2].score;
        game.update(seconds);
        if (game.phase !== previousPhase || game.players[1].score + game.players[2].score !== previousScore) syncUi();
        room?.broadcastState(snapshot());
      }
      render();
    }
    requestAnimationFrame(loop);
  }

  syncUi();
  render();
  requestAnimationFrame(loop);
}
