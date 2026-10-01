import { GameRoomClient } from './game-room.js';
import { ArcadeResultReporter } from './stats.js';
import { capturePointer, bindDirectionalJoystick } from './touch-controls.js';
import { isArcadeSessionPaused, registerArcadeSession } from './session-control.js';
import { translateArcadeText } from './i18n.js';

export type PaddlePlayer = 1 | 2;
export type PaddleDirection = 'up' | 'down';
export type PaddlePhase = 'ready' | 'playing' | 'finished';

export const PADDLE_WIDTH = 900;
export const PADDLE_HEIGHT = 540;
export const PADDLE_TARGET_SCORE = 7;
const BAT_WIDTH = 18;
export const BAT_HEIGHT = 108;
const BAT_MARGIN = 38;
const BALL_RADIUS = 11;
const BAT_SPEED = 460;
const START_BALL_SPEED = 360;
const MAX_BALL_SPEED = 780;

export interface PaddleBat {
  y: number;
  score: number;
}

export type PaddleBonusKind = 'big' | 'tiny' | 'shield';

export interface PaddleBonusInfo {
  label: string;
  /** Shown in the status line when caught. */
  notice: string;
  color: string;
  /** How long the effect lasts; 0 until used up. */
  seconds: number;
  /** Relative chance of this bonus among orbs. */
  weight: number;
}

export const PADDLE_BONUSES: Record<PaddleBonusKind, PaddleBonusInfo> = {
  big: { label: 'Big paddle', notice: 'Big paddle!', color: '#54e3d0', seconds: 10, weight: 3 },
  tiny: { label: 'Tiny rival', notice: 'Tiny rival paddle!', color: '#b28dff', seconds: 8, weight: 2 },
  shield: { label: 'Goal shield', notice: 'Goal shield - saves one point!', color: '#5cd8ff', seconds: 0, weight: 2 },
};
export const PADDLE_BONUS_KINDS = Object.keys(PADDLE_BONUSES) as PaddleBonusKind[];
/** Chance that a bat hit brings out an orb, when none is out. */
export const PADDLE_ORB_CHANCE = 0.3;
export const PADDLE_ORB_RADIUS = 24;
/** An orb nobody hits fades after this long. */
export const PADDLE_ORB_SECONDS = 9;
export const BIG_BAT_HEIGHT = 162;
export const TINY_BAT_HEIGHT = 70;
const NOTICE_SECONDS = 2.5;

export interface PaddleOrb { x: number; y: number; kind: PaddleBonusKind; secondsLeft: number }

/** Bonuses a player holds: timed effects in seconds, and a one-save shield. */
export interface PaddleEffects { big: number; tiny: number; shield: boolean }

/** Picks a bonus by weight; `roll` is in [0, 1). */
export function pickPaddleBonus(roll: number): PaddleBonusKind {
  const total = PADDLE_BONUS_KINDS.reduce((sum, kind) => sum + PADDLE_BONUSES[kind].weight, 0);
  let left = roll * total;
  for (const kind of PADDLE_BONUS_KINDS) {
    left -= PADDLE_BONUSES[kind].weight;
    if (left < 0) return kind;
  }
  return PADDLE_BONUS_KINDS[PADDLE_BONUS_KINDS.length - 1];
}

const noEffects = (): Record<PaddlePlayer, PaddleEffects> => ({
  1: { big: 0, tiny: 0, shield: false },
  2: { big: 0, tiny: 0, shield: false },
});

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
  orb: PaddleOrb | null = null;
  /** Bonuses on each side; 'tiny' counts down on the side it shrinks. */
  effects = noEffects();
  /** Who touched the ball last, and so who an orb it passes through goes to. */
  lastHitter: PaddlePlayer = 1;
  notice = '';
  noticeLeft = 0;
  private serveDirection: 1 | -1 = 1;
  private serveIndex = 0;

  constructor(private readonly random: () => number = Math.random) {}

  batHeight(player: PaddlePlayer): number {
    const effects = this.effects[player];
    if (effects.tiny > 0) return TINY_BAT_HEIGHT;
    return effects.big > 0 ? BIG_BAT_HEIGHT : BAT_HEIGHT;
  }

  /** Bonuses helping a player, longest-lasting first; a tiny rival shows on the side that caught it. */
  activeEffects(player: PaddlePlayer): { kind: PaddleBonusKind; seconds: number }[] {
    const own = this.effects[player];
    const rival = this.effects[player === 1 ? 2 : 1];
    const timed = [{ kind: 'big' as const, seconds: own.big }, { kind: 'tiny' as const, seconds: rival.tiny }]
      .filter(effect => effect.seconds > 0)
      .sort((a, b) => b.seconds - a.seconds);
    return own.shield ? [{ kind: 'shield', seconds: 0 }, ...timed] : timed;
  }

  /** Gives a bonus to a player. */
  collect(player: PaddlePlayer, kind: PaddleBonusKind): void {
    const rival = player === 1 ? 2 : 1;
    this.notice = `${player === 1 ? 'Mint' : 'Coral'}: ${PADDLE_BONUSES[kind].notice}`;
    this.noticeLeft = NOTICE_SECONDS;
    const centres = this.batCentres();
    if (kind === 'shield') this.effects[player].shield = true;
    else if (kind === 'big') {
      this.effects[player].big = PADDLE_BONUSES.big.seconds;
      this.effects[player].tiny = 0;
    } else {
      this.effects[rival].tiny = PADDLE_BONUSES.tiny.seconds;
      this.effects[rival].big = 0;
    }
    this.recentre(centres);
  }

  private batCentres(): Record<PaddlePlayer, number> {
    return { 1: this.players[1].y + this.batHeight(1) / 2, 2: this.players[2].y + this.batHeight(2) / 2 };
  }

  /** A bat that changes size keeps its centre, sliding back in if it would poke off the court. */
  private recentre(centres: Record<PaddlePlayer, number>): void {
    this.moveBatTo(1, centres[1]);
    this.moveBatTo(2, centres[2]);
  }

  restart(): void {
    this.effects = noEffects();
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

  moveBatTo(player: PaddlePlayer, centerY: number): void {
    const height = this.batHeight(player);
    this.players[player].y = Math.max(0, Math.min(PADDLE_HEIGHT - height, centerY - height / 2));
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
    this.lastHitter = this.serveDirection === 1 ? 1 : 2;
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
    this.tickBonuses(dt);

    // A goal shield bounces the ball back once instead of conceding.
    if (this.ball.x - BALL_RADIUS <= 0 && this.ball.vx < 0 && this.effects[1].shield) this.shieldSave(1);
    else if (this.ball.x + BALL_RADIUS >= PADDLE_WIDTH && this.ball.vx > 0 && this.effects[2].shield) this.shieldSave(2);

    if (this.ball.x + BALL_RADIUS < 0) this.scorePoint(2);
    else if (this.ball.x - BALL_RADIUS > PADDLE_WIDTH) this.scorePoint(1);
  }

  statusText(): string {
    if (this.phase === 'finished') return `${this.winner === 1 ? 'Mint' : 'Coral'} wins the clash!`;
    if (this.phase === 'ready') return 'Press Serve or Space to start the rally.';
    if (this.noticeLeft > 0) return this.notice;
    return this.rallyHits >= 5 ? `Rally x${this.rallyHits} — the ball is heating up!` : 'Keep the ball in play.';
  }

  private moveBat(player: PaddlePlayer, dt: number): void {
    const input = this.inputs[player];
    const direction = Number(input.down) - Number(input.up);
    const bat = this.players[player];
    bat.y = Math.max(0, Math.min(PADDLE_HEIGHT - this.batHeight(player), bat.y + direction * BAT_SPEED * dt));
  }

  private tickBonuses(dt: number): void {
    const centres = this.batCentres();
    ([1, 2] as PaddlePlayer[]).forEach(player => {
      const effects = this.effects[player];
      effects.big = Math.max(0, effects.big - dt);
      effects.tiny = Math.max(0, effects.tiny - dt);
    });
    this.recentre(centres);
    this.noticeLeft = Math.max(0, this.noticeLeft - dt);
    const orb = this.orb;
    if (!orb) return;
    if (Math.hypot(this.ball.x - orb.x, this.ball.y - orb.y) <= PADDLE_ORB_RADIUS + BALL_RADIUS) {
      this.orb = null;
      this.collect(this.lastHitter, orb.kind);
    } else {
      orb.secondsLeft -= dt;
      if (orb.secondsLeft <= 0) this.orb = null;
    }
  }

  private shieldSave(player: PaddlePlayer): void {
    this.effects[player].shield = false;
    this.ball.vx = -this.ball.vx;
    this.ball.x = player === 1 ? BALL_RADIUS : PADDLE_WIDTH - BALL_RADIUS;
    this.lastHitter = player;
  }

  private maybeSpawnOrb(): void {
    if (this.orb || this.random() >= PADDLE_ORB_CHANCE) return;
    // Orbs float in the middle of the court, away from both bats.
    this.orb = {
      x: PADDLE_WIDTH * (0.33 + this.random() * 0.34),
      y: 70 + this.random() * (PADDLE_HEIGHT - 140),
      kind: pickPaddleBonus(this.random()),
      secondsLeft: PADDLE_ORB_SECONDS,
    };
  }

  private collideWithBat(player: PaddlePlayer): void {
    const bat = this.players[player];
    const batX = player === 1 ? BAT_MARGIN : PADDLE_WIDTH - BAT_MARGIN - BAT_WIDTH;
    const movingTowardBat = player === 1 ? this.ball.vx < 0 : this.ball.vx > 0;
    if (!movingTowardBat) return;
    const overlapsX = this.ball.x + BALL_RADIUS >= batX && this.ball.x - BALL_RADIUS <= batX + BAT_WIDTH;
    const height = this.batHeight(player);
    const overlapsY = this.ball.y + BALL_RADIUS >= bat.y && this.ball.y - BALL_RADIUS <= bat.y + height;
    if (!overlapsX || !overlapsY) return;

    const currentSpeed = Math.hypot(this.ball.vx, this.ball.vy);
    const nextSpeed = Math.min(MAX_BALL_SPEED, currentSpeed * 1.065 + 8);
    const relativeHit = Math.max(-1, Math.min(1, (this.ball.y - (bat.y + height / 2)) / (height / 2)));
    const angle = relativeHit * Math.PI * 0.34;
    const horizontalDirection = player === 1 ? 1 : -1;
    this.ball.vx = horizontalDirection * nextSpeed * Math.cos(angle);
    this.ball.vy = nextSpeed * Math.sin(angle);
    this.ball.x = player === 1 ? batX + BAT_WIDTH + BALL_RADIUS : batX - BALL_RADIUS;
    this.rallyHits += 1;
    this.lastHitter = player;
    this.maybeSpawnOrb();
  }

  private scorePoint(player: PaddlePlayer): void {
    this.players[player].score += 1;
    if (this.players[player].score >= PADDLE_TARGET_SCORE) {
      this.phase = 'finished';
      this.winner = player;
      this.ball.vx = 0;
      this.ball.vy = 0;
      this.clearBonuses();
      return;
    }
    this.phase = 'ready';
    this.serveDirection = player === 1 ? -1 : 1;
    this.resetBall();
  }

  private resetBall(): void {
    this.ball = { x: PADDLE_WIDTH / 2, y: PADDLE_HEIGHT / 2, vx: 0, vy: 0 };
    this.rallyHits = 0;
    this.clearBonuses();
  }

  /** Bonuses last one rally: every point starts level. */
  private clearBonuses(): void {
    const centres = this.batCentres();
    this.orb = null;
    this.effects = noEffects();
    this.noticeLeft = 0;
    this.recentre(centres);
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
  const coralControls = document.getElementById('paddleCoralControls');
  const roomMount = document.querySelector<HTMLElement>('[data-game-room="paddle"]');
  let room: GameRoomClient | null = null;
  let practiceBot = true;
  const resultReporter = new ArcadeResultReporter('paddle');

  function snapshot(): Record<string, unknown> {
    return {
      players: game.players, ball: game.ball, phase: game.phase,
      winner: game.winner, rallyHits: game.rallyHits,
      orb: game.orb, effects: game.effects, notice: game.notice, noticeLeft: game.noticeLeft,
    };
  }

  function restore(state: Record<string, unknown>): void {
    if (!state.players || !state.ball) return;
    game.players = state.players as Record<PaddlePlayer, PaddleBat>;
    game.ball = state.ball as PaddleBall;
    game.phase = state.phase as PaddlePhase;
    game.winner = state.winner as PaddlePlayer | null;
    game.rallyHits = Number(state.rallyHits) || 0;
    game.orb = (state.orb as PaddleOrb | null) ?? null;
    if (state.effects) game.effects = state.effects as Record<PaddlePlayer, PaddleEffects>;
    game.notice = typeof state.notice === 'string' ? state.notice : '';
    game.noticeLeft = Number(state.noticeLeft) || 0;
  }

  function setPlayerInput(player: PaddlePlayer, direction: PaddleDirection, pressed: boolean): void {
    if (pressed && isArcadeSessionPaused('paddle')) return;
    const session = room?.session();
    if (!session?.online) game.setInput(player, direction, pressed);
    else if (session.ready && room?.canControl(player)) {
      if (room.isGuest()) room.sendAction({ type: 'input', direction, pressed });
      else game.setInput(player, direction, pressed);
    }
  }

  function serve(): void {
    if (isArcadeSessionPaused('paddle')) return;
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
    if (status) {
      const touchFriendly = window.matchMedia('(max-width: 760px), (pointer: coarse)').matches;
      status.textContent = game.phase === 'ready' && touchFriendly
        ? 'Tap Serve to start the rally.'
        : game.statusText();
    }
    if (mintScore) mintScore.textContent = String(game.players[1].score);
    if (coralScore) coralScore.textContent = String(game.players[2].score);
    const touchSession = room?.session();
    document.getElementById('paddleMintControls')?.classList.toggle('solo-hidden', Boolean(touchSession?.online && touchSession.playerId === 2));
    coralControls?.classList.toggle('solo-hidden', touchSession?.online ? touchSession.playerId !== 2 : practiceBot);
    if (serveButton) {
      serveButton.disabled = game.phase !== 'ready';
      serveButton.textContent = game.phase === 'finished' ? 'Match over' : 'Serve ball';
    }
    const trackedPlayer = (room?.session().online ? room.session().playerId : 1) ?? 1;
    resultReporter.report(game.phase === 'finished', {
      outcome: game.winner === trackedPlayer ? 'win' : 'loss',
      score: game.players[trackedPlayer].score,
    });
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
      roundedRect(ctx, x, game.players[player].y, BAT_WIDTH, game.batHeight(player), 9);
      if (game.effects[player].shield) {
        // The goal shield glows along that player's back wall.
        ctx.fillStyle = PADDLE_BONUSES.shield.color;
        ctx.shadowColor = PADDLE_BONUSES.shield.color;
        roundedRect(ctx, player === 1 ? 2 : PADDLE_WIDTH - 8, 10, 6, PADDLE_HEIGHT - 20, 3);
      }
    });
    if (game.orb) drawOrb(game.orb);

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
    drawEffects(1);
    drawEffects(2);
  }

  function drawOrb(orb: PaddleOrb): void {
    const ctx = renderContext;
    const { color } = PADDLE_BONUSES[orb.kind];
    // An orb about to fade blinks.
    if (orb.secondsLeft < 2 && Math.floor(orb.secondsLeft * 6) % 2 === 0) return;
    ctx.fillStyle = color;
    ctx.shadowBlur = 20; ctx.shadowColor = color;
    ctx.beginPath(); ctx.arc(orb.x, orb.y, PADDLE_ORB_RADIUS, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    drawIcon(orb.kind, orb.x, orb.y, 24, '#0a1120');
  }

  /** Language-free symbols, so a bonus reads the same in every language and font. */
  function drawIcon(kind: PaddleBonusKind, x: number, y: number, size: number, color: string): void {
    const ctx = renderContext;
    const h = size / 2;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = size / 6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    if (kind === 'big') {
      // Arrows pushing a bar apart.
      ctx.moveTo(0, -h); ctx.lineTo(0, h);
      ctx.moveTo(-h * 0.55, -h * 0.45); ctx.lineTo(0, -h); ctx.lineTo(h * 0.55, -h * 0.45);
      ctx.moveTo(-h * 0.55, h * 0.45); ctx.lineTo(0, h); ctx.lineTo(h * 0.55, h * 0.45);
      ctx.stroke();
    } else if (kind === 'tiny') {
      // Arrows squeezing a bar together.
      ctx.moveTo(0, -h); ctx.lineTo(0, -h * 0.15);
      ctx.moveTo(-h * 0.5, -h * 0.6); ctx.lineTo(0, -h * 0.15); ctx.lineTo(h * 0.5, -h * 0.6);
      ctx.moveTo(0, h); ctx.lineTo(0, h * 0.15);
      ctx.moveTo(-h * 0.5, h * 0.6); ctx.lineTo(0, h * 0.15); ctx.lineTo(h * 0.5, h * 0.6);
      ctx.stroke();
    } else {
      ctx.moveTo(0, -h);
      ctx.lineTo(h * 0.85, -h * 0.6);
      ctx.quadraticCurveTo(h * 0.8, h * 0.5, 0, h);
      ctx.quadraticCurveTo(-h * 0.8, h * 0.5, -h * 0.85, -h * 0.6);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  /** Each player's bonuses stack down from the top of their own half, with a draining bar. */
  function drawEffects(player: PaddlePlayer): void {
    const ctx = renderContext;
    const effects = game.activeEffects(player);
    if (!effects.length) return;
    const chipH = 44;
    const gap = 8;
    ctx.font = '700 22px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const edge = player === 1 ? 70 : PADDLE_WIDTH - 70;
    effects.forEach((effect, index) => {
      const { color, seconds, label } = PADDLE_BONUSES[effect.kind];
      const text = effect.kind === 'shield' ? translateArcadeText(label) : `${translateArcadeText(label)} ${Math.ceil(effect.seconds)}`;
      const width = 40 + ctx.measureText(text).width + 14;
      const x = player === 1 ? edge : edge - width;
      const y = 10 + index * (chipH + gap);
      ctx.fillStyle = 'rgba(10,17,32,.88)';
      ctx.strokeStyle = player === 1 ? '#54e38e' : '#ff6b78';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(x, y, width, chipH, 10);
      ctx.fill();
      ctx.stroke();
      drawIcon(effect.kind, x + 20, y + chipH / 2 - 2, 20, color);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(text, x + 38, y + chipH / 2 - 2);
      ctx.fillStyle = color;
      const share = effect.kind === 'shield' ? 1 : effect.seconds / seconds;
      ctx.fillRect(x + 8, y + chipH - 7, (width - 16) * share, 3);
    });
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
      capturePointer(button, event.pointerId);
      button.classList.add('pressed');
      setPlayerInput(player, direction, true);
    });
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('lostpointercapture', release);
  });
  document.querySelectorAll<HTMLElement>('[data-paddle-joystick]').forEach(track => {
    const player = Number(track.dataset.paddleJoystick) as PaddlePlayer;
    bindDirectionalJoystick(track, (direction, pressed) => {
      if (direction === 'up' || direction === 'down') setPlayerInput(player, direction, pressed);
    }, 'vertical');
  });

  let directTouchId: number | null = null;
  const moveMintToPointer = (event: PointerEvent): void => {
    if (!practiceBot || room?.session().online || isArcadeSessionPaused('paddle')) return;
    const bounds = canvas.getBoundingClientRect();
    game.moveBatTo(1, (event.clientY - bounds.top) / Math.max(1, bounds.height) * PADDLE_HEIGHT);
  };
  canvas.addEventListener('pointerdown', event => {
    if (!practiceBot || room?.session().online) return;
    directTouchId = event.pointerId;
    capturePointer(canvas, event.pointerId);
    moveMintToPointer(event);
  });
  canvas.addEventListener('pointermove', event => { if (directTouchId === event.pointerId) moveMintToPointer(event); });
  const releaseDirectTouch = (event: PointerEvent): void => { if (directTouchId === event.pointerId) directTouchId = null; };
  canvas.addEventListener('pointerup', releaseDirectTouch);
  canvas.addEventListener('pointercancel', releaseDirectTouch);

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
      offlineModes: [
        { id: 'bot', label: 'Practice bot', description: 'Drag the Mint paddle directly or use W/S.', onSelect: () => { practiceBot = true; game.restart(); syncUi(); render(); } },
        { id: 'local', label: 'Local 2P', description: 'Two players share this device.', onSelect: () => { practiceBot = false; game.restart(); syncUi(); render(); } },
      ],
      initialOfflineMode: 'bot',
      onSessionChange: session => {
        if (session.online) practiceBot = false;
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

  registerArcadeSession({
    gameId: 'paddle',
    view: paddleView,
    mode: () => room?.session().online ? 'online' : practiceBot ? 'solo' : 'local',
    isActive: () => game.phase === 'playing',
    clearHeldInputs: () => {
      ([1, 2] as PaddlePlayer[]).forEach(player => {
        game.setInput(player, 'up', false);
        game.setInput(player, 'down', false);
      });
    },
  });

  let lastFrame = performance.now();
  function loop(now: number): void {
    const seconds = (now - lastFrame) / 1000;
    lastFrame = now;
    if (isVisible()) {
      if (!room?.isGuest()) {
        const previousPhase = game.phase;
        const previousScore = game.players[1].score + game.players[2].score;
        const previousStatus = game.statusText();
        if (!isArcadeSessionPaused('paddle')) {
          if (practiceBot && !room?.session().online) {
            const coralCenter = game.players[2].y + game.batHeight(2) / 2;
            const target = game.phase === 'playing' ? game.ball.y : PADDLE_HEIGHT / 2;
            game.setInput(2, 'up', target < coralCenter - 34);
            game.setInput(2, 'down', target > coralCenter + 34);
          }
          game.update(seconds);
        }
        if (game.phase !== previousPhase || game.players[1].score + game.players[2].score !== previousScore
          || game.statusText() !== previousStatus) syncUi();
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
