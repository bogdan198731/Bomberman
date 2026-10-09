import { GameRoomClient } from './game-room.js';
import { ArcadeResultReporter } from './stats.js';
import { isArcadeSessionPaused, registerArcadeSession } from './session-control.js';
import { emitArcadeGameplayCue } from './feedback.js';

export type HockeyPlayer = 1 | 2;
export type HockeyMode = 'bot' | 'duel';
export type HockeyPhase = 'ready' | 'playing' | 'scored' | 'finished';
export type HockeyBotLevel = 'easy' | 'normal' | 'hard';

export const RINK_WIDTH = 900;
export const RINK_HEIGHT = 540;
export const HOCKEY_TARGET = 7;
export const PUCK_R = 18;
export const MALLET_R = 30;
/** The goal mouth on each end wall, centred vertically. */
export const GOAL_TOP = 185;
export const GOAL_BOTTOM = 355;
const PUCK_MAX_SPEED = 1150;
const MALLET_MAX_SPEED = 1500;
const FRICTION_PER_SECOND = 0.6;
const WALL_BOUNCE = 0.92;
const HIT_BOUNCE = 0.95;
const MAX_STEP = 6;
const SCORED_PAUSE = 1.1;
const BOT_SPEED: Record<HockeyBotLevel, number> = { easy: 480, normal: 780, hard: 1150 };

export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

function centred(player: HockeyPlayer): Body {
  return { x: player === 1 ? 120 : RINK_WIDTH - 120, y: RINK_HEIGHT / 2, vx: 0, vy: 0 };
}

export class AirHockeyGame {
  puck: Body = { x: RINK_WIDTH / 2, y: RINK_HEIGHT / 2, vx: 0, vy: 0 };
  mallets: Record<HockeyPlayer, Body> = { 1: centred(1), 2: centred(2) };
  /** Where each player wants their mallet; it chases this at a capped speed. */
  targets: Record<HockeyPlayer, { x: number; y: number }> = { 1: { x: 120, y: RINK_HEIGHT / 2 }, 2: { x: RINK_WIDTH - 120, y: RINK_HEIGHT / 2 } };
  scores: Record<HockeyPlayer, number> = { 1: 0, 2: 0 };
  mode: HockeyMode = 'bot';
  phase: HockeyPhase = 'ready';
  lastScorer: HockeyPlayer | null = null;
  winner: HockeyPlayer | null = null;
  botLevel: HockeyBotLevel = 'normal';
  /** Swappable so tests can replay the bot's choices. */
  random: () => number = Math.random;
  /** Where the bot's current shot is headed; picked afresh for every strike. */
  private botShot: { x: number; y: number } | null = null;
  /** Lined up behind the puck and swinging through it. */
  private botStriking = 0;
  /** How long the bot has been pinning a dead puck, and how long it backs off after. */
  private botStall = 0;
  private botStallAt = { x: 0, y: 0 };
  private botBackoff = 0;
  /** Time left to let a shot go before chasing the puck again. */
  private botRecover = 0;
  private pause = 0;

  restart(mode: HockeyMode = this.mode): void {
    this.mode = mode;
    this.scores = { 1: 0, 2: 0 };
    this.winner = null;
    this.lastScorer = null;
    this.faceOff(null);
    this.phase = 'ready';
  }

  start(): boolean {
    if (this.phase === 'finished') this.restart(this.mode);
    if (this.phase !== 'ready') return false;
    this.phase = 'playing';
    return true;
  }

  /** Clamps a requested mallet position to that player's half of the rink. */
  aim(player: HockeyPlayer, x: number, y: number): void {
    const minX = player === 1 ? MALLET_R : RINK_WIDTH / 2 + MALLET_R;
    const maxX = player === 1 ? RINK_WIDTH / 2 - MALLET_R : RINK_WIDTH - MALLET_R;
    this.targets[player] = {
      x: Math.max(minX, Math.min(maxX, x)),
      y: Math.max(MALLET_R, Math.min(RINK_HEIGHT - MALLET_R, y)),
    };
  }

  /** Nudges the target by a direction, for keyboard play. */
  nudge(player: HockeyPlayer, dx: number, dy: number, seconds: number): void {
    const target = this.targets[player];
    this.aim(player, target.x + dx * 700 * seconds, target.y + dy * 700 * seconds);
  }

  update(seconds: number): void {
    const dt = Math.max(0, Math.min(0.05, seconds));
    if (this.phase === 'scored') {
      this.pause -= dt;
      if (this.pause <= 0) this.phase = this.winner ? 'finished' : 'playing';
      return;
    }
    if (this.phase !== 'playing') return;
    if (this.mode === 'bot') this.steerBot(dt);

    const travel = Math.max(Math.hypot(this.puck.vx, this.puck.vy), MALLET_MAX_SPEED) * dt;
    const steps = Math.max(1, Math.ceil(travel / MAX_STEP));
    for (let i = 0; i < steps && this.phase === 'playing'; i++) this.step(dt / steps);
  }

  statusText(): string {
    const name = (player: HockeyPlayer): string => (player === 1 ? 'Mint' : 'Coral');
    if (this.phase === 'ready') return this.mode === 'bot' ? `Beat the Coral bot to ${HOCKEY_TARGET}. Start when ready.` : `First to ${HOCKEY_TARGET} goals wins.`;
    if (this.phase === 'scored') return `${name(this.lastScorer as HockeyPlayer)} scores!`;
    if (this.phase === 'finished') return `${name(this.winner as HockeyPlayer)} wins the table!`;
    return 'Guard your goal and strike through the puck.';
  }

  private step(dt: number): void {
    ([1, 2] as HockeyPlayer[]).forEach(player => this.moveMallet(player, dt));
    const puck = this.puck;
    const damping = Math.pow(FRICTION_PER_SECOND, dt);
    puck.vx *= damping;
    puck.vy *= damping;
    puck.x += puck.vx * dt;
    puck.y += puck.vy * dt;

    if (puck.y < PUCK_R) { puck.y = PUCK_R; puck.vy = Math.abs(puck.vy) * WALL_BOUNCE; }
    if (puck.y > RINK_HEIGHT - PUCK_R) { puck.y = RINK_HEIGHT - PUCK_R; puck.vy = -Math.abs(puck.vy) * WALL_BOUNCE; }

    const inMouth = puck.y > GOAL_TOP && puck.y < GOAL_BOTTOM;
    if (puck.x < PUCK_R) {
      if (inMouth) { if (puck.x < -PUCK_R) { this.goal(2); return; } }
      else { puck.x = PUCK_R; puck.vx = Math.abs(puck.vx) * WALL_BOUNCE; }
    }
    if (puck.x > RINK_WIDTH - PUCK_R) {
      if (inMouth) { if (puck.x > RINK_WIDTH + PUCK_R) { this.goal(1); return; } }
      else { puck.x = RINK_WIDTH - PUCK_R; puck.vx = -Math.abs(puck.vx) * WALL_BOUNCE; }
    }

    ([1, 2] as HockeyPlayer[]).forEach(player => {
      // Once the bot has struck, its next touch gets a new shot rather than the same line again.
      if (this.collide(this.mallets[player]) && player === 2) {
        this.botShot = null;
        this.botStriking = 0;
        this.botRecover = 0.35;
      }
    });
    // A mallet can shove the puck into a wall; keep it on the table and let it bounce off.
    if (puck.y < PUCK_R) { puck.y = PUCK_R; puck.vy = Math.abs(puck.vy); }
    if (puck.y > RINK_HEIGHT - PUCK_R) { puck.y = RINK_HEIGHT - PUCK_R; puck.vy = -Math.abs(puck.vy); }
    if (!(puck.y > GOAL_TOP && puck.y < GOAL_BOTTOM)) {
      if (puck.x < PUCK_R) { puck.x = PUCK_R; puck.vx = Math.abs(puck.vx); }
      if (puck.x > RINK_WIDTH - PUCK_R) { puck.x = RINK_WIDTH - PUCK_R; puck.vx = -Math.abs(puck.vx); }
    }
  }

  private moveMallet(player: HockeyPlayer, dt: number): void {
    const mallet = this.mallets[player];
    const target = this.targets[player];
    const dx = target.x - mallet.x;
    const dy = target.y - mallet.y;
    const distance = Math.hypot(dx, dy);
    const limit = (this.mode === 'bot' && player === 2 ? BOT_SPEED[this.botLevel] : MALLET_MAX_SPEED) * dt;
    const scale = distance > limit ? limit / distance : 1;
    // Mallet velocity is what gets passed on to the puck in a hit.
    mallet.vx = dt > 0 ? (dx * scale) / dt : 0;
    mallet.vy = dt > 0 ? (dy * scale) / dt : 0;
    mallet.x += dx * scale;
    mallet.y += dy * scale;
  }

  private collide(mallet: Body): boolean {
    const puck = this.puck;
    const dx = puck.x - mallet.x;
    const dy = puck.y - mallet.y;
    const distance = Math.hypot(dx, dy);
    const reach = PUCK_R + MALLET_R;
    if (distance >= reach || distance === 0) return false;
    const nx = dx / distance;
    const ny = dy / distance;
    // Push the puck clear, then bounce it off the moving mallet.
    puck.x = mallet.x + nx * reach;
    puck.y = mallet.y + ny * reach;
    const closing = (puck.vx - mallet.vx) * nx + (puck.vy - mallet.vy) * ny;
    if (closing < 0) {
      puck.vx -= (1 + HIT_BOUNCE) * closing * nx;
      puck.vy -= (1 + HIT_BOUNCE) * closing * ny;
    }
    const speed = Math.hypot(puck.vx, puck.vy);
    if (speed > PUCK_MAX_SPEED) {
      puck.vx *= PUCK_MAX_SPEED / speed;
      puck.vy *= PUCK_MAX_SPEED / speed;
    }
    return true;
  }

  private goal(scorer: HockeyPlayer): void {
    this.scores[scorer] += 1;
    this.lastScorer = scorer;
    // Cues show a toast, so only goals get one - not every puck contact.
    emitArcadeGameplayCue('hit', `${scorer === 1 ? 'MINT' : 'CORAL'} GOAL`);
    if (this.scores[scorer] >= HOCKEY_TARGET) this.winner = scorer;
    this.faceOff(scorer === 1 ? 2 : 1);
    this.phase = 'scored';
    this.pause = SCORED_PAUSE;
  }

  /** Resets positions; the player who conceded gets the puck on their side. */
  private faceOff(receiver: HockeyPlayer | null): void {
    this.mallets = { 1: centred(1), 2: centred(2) };
    this.targets = { 1: { x: 120, y: RINK_HEIGHT / 2 }, 2: { x: RINK_WIDTH - 120, y: RINK_HEIGHT / 2 } };
    const offset = receiver === 1 ? -120 : receiver === 2 ? 120 : 0;
    this.puck = { x: RINK_WIDTH / 2 + offset, y: RINK_HEIGHT / 2, vx: 0, vy: 0 };
    this.botShot = null;
    this.botStriking = this.botStall = this.botBackoff = this.botRecover = 0;
  }

  /**
   * Defends when the puck is heading away, and attacks when it is on the
   * bot's half: it lines up behind the puck on the line to its chosen shot
   * and drives through it. Each strike picks a fresh shot (a corner of the
   * goal or a bank off a side wall) that the Mint mallet is not standing on,
   * so a player who just parks in front of their goal cannot trap the bot in
   * an endless straight rally.
   */
  private steerBot(dt: number): void {
    const puck = this.puck;
    const bot = this.mallets[2];
    const reach = PUCK_R + MALLET_R;
    const onBotSide = puck.x > RINK_WIDTH / 2 - PUCK_R;
    if (!onBotSide) {
      this.botShot = null;
      this.botStriking = 0;
      this.botStall = 0;
      this.botBackoff = 0;
      if (puck.vx > 60) {
        // Incoming: meet it on the line to Mint's goal, a little way back.
        const gx = puck.x + 40;
        const gy = puck.y - RINK_HEIGHT / 2;
        const length = Math.hypot(gx, gy) || 1;
        const behind = reach + 30;
        this.aim(2, puck.x + (gx / length) * behind + puck.vx * 0.05, puck.y + (gy / length) * behind + puck.vy * 0.05);
      } else {
        this.aim(2, RINK_WIDTH - 110, Math.max(GOAL_TOP, Math.min(GOAL_BOTTOM, puck.y)));
      }
      return;
    }

    // A fast puck heading for the bot's goal: block first, attack after.
    const guardX = RINK_WIDTH - 110;
    const arrivesAt = puck.vx > 0 ? puck.y + (puck.vy * (guardX - puck.x)) / puck.vx : 0;
    const onTarget = arrivesAt > GOAL_TOP - 60 && arrivesAt < GOAL_BOTTOM + 60;
    if (puck.x < guardX && (puck.vx > 250 || (puck.vx > 60 && onTarget))) {
      const y = arrivesAt;
      this.botStriking = 0;
      this.aim(2, guardX, Math.max(GOAL_TOP - 20, Math.min(GOAL_BOTTOM + 20, y)));
      return;
    }

    // Just struck: let the shot go and fall back instead of chasing it down.
    if (this.botRecover > 0) this.botRecover -= dt;
    if (this.botRecover > 0 && puck.vx < -250 && puck.x < bot.x) {
      this.botShot = null;
      this.aim(2, guardX, Math.max(GOAL_TOP, Math.min(GOAL_BOTTOM, puck.y)));
      return;
    }

    // A dead puck pinned in a corner: back off towards the open table, then come again.
    // Judged by where the puck is, not its speed: jammed against the boards it can rattle fast and go nowhere.
    const stuck = Math.hypot(puck.x - this.botStallAt.x, puck.y - this.botStallAt.y) < 12;
    if (stuck && Math.hypot(puck.x - bot.x, puck.y - bot.y) < reach + 6) this.botStall += dt;
    else { this.botStall = 0; this.botStallAt = { x: puck.x, y: puck.y }; }
    if (this.botStall > 0.5) {
      this.botStall = 0;
      this.botBackoff = 0.3;
      this.botShot = null;
      this.botStriking = 0;
    }
    if (this.botBackoff > 0) {
      this.botBackoff -= dt;
      const ox = RINK_WIDTH * 0.75 - puck.x;
      const oy = RINK_HEIGHT / 2 - puck.y;
      const length = Math.hypot(ox, oy) || 1;
      this.aim(2, puck.x + (ox / length) * (reach + 70), puck.y + (oy / length) * (reach + 70));
      return;
    }

    const px = puck.x + puck.vx * 0.08;
    const py = puck.y + puck.vy * 0.08;
    const shot = (this.botShot ??= this.chooseShot());
    const sx = shot.x - px;
    const sy = shot.y - py;
    const length = Math.hypot(sx, sy) || 1;
    const ux = sx / length;
    const uy = sy / length;
    // Wind up on the shot line behind the puck, then swing straight through it,
    // so the mallet's own motion sends the puck where it was aimed.
    const ideal = { x: px - ux * (reach + 35), y: py - uy * (reach + 35) };
    this.aim(2, ideal.x, ideal.y);
    const windup = { ...this.targets[2] };
    if (Math.hypot(windup.x - ideal.x, windup.y - ideal.y) > 10) {
      // No room to wind up against the boards: lean into the puck from behind and dig it out.
      this.botStriking = 0;
      this.aim(2, px - ux * (reach - 12), py - uy * (reach - 12));
      return;
    }
    if (this.botStriking > 0) this.botStriking -= dt;
    else if (Math.hypot(windup.x - bot.x, windup.y - bot.y) < 8) this.botStriking = 0.45;
    if (this.botStriking > 0) {
      // Drive through the puck's centre from where the mallet actually is.
      const dx = px - bot.x;
      const dy = py - bot.y;
      const span = Math.hypot(dx, dy) || 1;
      this.aim(2, px + (dx / span) * 60, py + (dy / span) * 60);
    } else if (segmentDistance(puck, bot, windup) < reach + 4) {
      // The puck is in the way of the windup: go round it on the bot's side.
      const side = Math.sign((bot.x - px) * -uy + (bot.y - py) * ux) || 1;
      this.aim(2, px - uy * side * (reach + 28) - ux * 20, py + ux * side * (reach + 28) - uy * 20);
    } else {
      this.aim(2, windup.x, windup.y);
    }
  }

  /**
   * Scores every candidate shot by how far its path stays from the Mint
   * mallet, then picks at random among the open ones. Easy also takes blocked
   * shots now and then; Hard sticks to lines with room to spare.
   */
  private chooseShot(): { x: number; y: number } {
    const puck = this.puck;
    const guard = this.mallets[1];
    const reach = PUCK_R + MALLET_R;
    // The puck must still be inside the mouth when it reaches the end wall, so aim there, not beyond it.
    const mouth = [GOAL_TOP + 35, RINK_HEIGHT / 2, GOAL_BOTTOM - 35];
    const top = PUCK_R;
    const bottom = RINK_HEIGHT - PUCK_R;
    const shots: { x: number; y: number; clear: number }[] = [];
    for (const y of mouth) {
      // Straight at the goal, and off each side wall: aiming at the goal's mirror image banks it in.
      // A wall bounce takes some of the puck's sideways speed, so a bank aims a little further out.
      for (const aimY of [y, top - (y - top) / WALL_BOUNCE, bottom + (bottom - y) / WALL_BOUNCE]) {
        const aim = { x: PUCK_R, y: aimY };
        const path = foldedPath(puck, aim, top, bottom);
        const clear = Math.min(...path.slice(1).map((point, i) => segmentDistance(guard, path[i], point))) - reach;
        // The bot must be able to stand behind the puck on this line, inside its own half.
        const length = Math.hypot(aim.x - puck.x, aim.y - puck.y) || 1;
        const backX = puck.x - ((aim.x - puck.x) / length) * (reach + 35);
        const backY = puck.y - ((aim.y - puck.y) / length) * (reach + 35);
        const reachable = backX <= RINK_WIDTH - MALLET_R + 10 && backY >= MALLET_R - 10 && backY <= RINK_HEIGHT - MALLET_R + 10;
        shots.push({ ...aim, clear: reachable ? clear : Math.min(clear, 0) - 1000 });
      }
    }
    shots.sort((a, b) => b.clear - a.clear);
    const open = shots.filter(shot => shot.clear > 0);
    const wide = shots.filter(shot => shot.clear > 30);
    const pool = this.botLevel === 'easy' ? (this.random() < 0.35 ? shots : open)
      : this.botLevel === 'hard' && wide.length ? wide : open;
    const pick = pool.length ? pool[Math.floor(this.random() * pool.length)] : shots[0];
    return { x: pick.x, y: pick.y };
  }
}

/** The puck's path to an aim point, folded back at whichever side wall it banks off. */
function foldedPath(from: { x: number; y: number }, aim: { x: number; y: number }, top: number, bottom: number): { x: number; y: number }[] {
  const wall = aim.y < top ? top : aim.y > bottom ? bottom : null;
  if (wall === null) return [from, aim];
  const t = (wall - from.y) / (aim.y - from.y);
  const bounce = { x: from.x + (aim.x - from.x) * t, y: wall };
  return [from, bounce, { x: aim.x, y: 2 * wall - aim.y }];
}

function segmentDistance(point: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(point.x - a.x - dx * t, point.y - a.y - dy * t);
}

export function initAirHockey(): void {
  if (typeof document === 'undefined') return;
  const canvas = document.getElementById('hockeyCanvas') as HTMLCanvasElement | null;
  const context = canvas?.getContext('2d');
  const view = document.getElementById('hockeyView');
  if (!canvas || !context || !view) return;
  const rink = canvas;
  const ctx = context;
  const hockeyView = view;
  canvas.width = RINK_WIDTH;
  canvas.height = RINK_HEIGHT;

  const game = new AirHockeyGame();
  const status = document.getElementById('hockeyStatus');
  const mintScore = document.getElementById('hockeyMintScore');
  const coralScore = document.getElementById('hockeyCoralScore');
  const startButton = document.getElementById('hockeyStartButton') as HTMLButtonElement | null;
  const levelSelect = document.getElementById('hockeyBotLevel') as HTMLSelectElement | null;
  const roomMount = document.querySelector<HTMLElement>('[data-game-room="hockey"]');
  let room: GameRoomClient | null = null;
  const resultReporter = new ArcadeResultReporter('hockey');
  const held = new Set<string>();
  let lastSent = 0;

  function snapshot(): Record<string, unknown> {
    return {
      puck: game.puck, mallets: game.mallets, scores: game.scores, phase: game.phase,
      lastScorer: game.lastScorer, winner: game.winner,
    };
  }

  function restore(state: Record<string, unknown>): void {
    if (!state.puck || !state.mallets || !state.scores) return;
    game.puck = state.puck as Body;
    game.mallets = state.mallets as Record<HockeyPlayer, Body>;
    game.scores = state.scores as Record<HockeyPlayer, number>;
    game.phase = state.phase as HockeyPhase;
    game.lastScorer = state.lastScorer as HockeyPlayer | null;
    game.winner = state.winner as HockeyPlayer | null;
    game.mode = 'duel';
  }

  /** Which mallet a local input steers: in solo and online you only ever have one. */
  function localPlayer(): HockeyPlayer {
    const session = room?.session();
    return session?.online && session.playerId === 2 ? 2 : 1;
  }

  function steer(player: HockeyPlayer, x: number, y: number): void {
    if (isArcadeSessionPaused('hockey')) return;
    const session = room?.session();
    if (session?.online) {
      if (!session.ready || !room?.canControl(player)) return;
      if (room.isGuest()) {
        const now = performance.now();
        if (now - lastSent > 33) { room.sendAction({ type: 'aim', x: Math.round(x), y: Math.round(y) }); lastSent = now; }
        return;
      }
    }
    game.aim(player, x, y);
  }

  function launch(): void {
    if (isArcadeSessionPaused('hockey')) return;
    const session = room?.session();
    if (session?.online && !session.ready) return;
    if (room?.isGuest()) { room.sendAction({ type: 'start' }); return; }
    game.start();
    room?.broadcastState(snapshot(), true);
    syncUi();
  }

  function syncUi(): void {
    if (status) status.textContent = game.statusText();
    if (mintScore) mintScore.textContent = String(game.scores[1]);
    if (coralScore) coralScore.textContent = String(game.scores[2]);
    if (startButton) {
      startButton.textContent = game.phase === 'ready' ? 'Face off' : game.phase === 'finished' ? 'Play again' : 'In play';
    }
    const session = room?.session();
    if (levelSelect) levelSelect.hidden = game.mode !== 'bot' || Boolean(session?.online);
    const tracked = (session?.online ? session.playerId : 1) ?? 1;
    resultReporter.report(game.phase === 'finished', {
      outcome: game.winner === tracked ? 'win' : 'loss',
      score: game.scores[tracked],
    });
  }

  function render(): void {
    ctx.fillStyle = '#0d1a2b';
    ctx.fillRect(0, 0, rink.width, rink.height);
    ctx.strokeStyle = 'rgba(104,223,255,.35)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(RINK_WIDTH / 2, 0); ctx.lineTo(RINK_WIDTH / 2, RINK_HEIGHT); ctx.stroke();
    ctx.beginPath(); ctx.arc(RINK_WIDTH / 2, RINK_HEIGHT / 2, 70, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#54e38e';
    ctx.beginPath(); ctx.moveTo(3, GOAL_TOP); ctx.lineTo(3, GOAL_BOTTOM); ctx.stroke();
    ctx.strokeStyle = '#ff6b78';
    ctx.beginPath(); ctx.moveTo(RINK_WIDTH - 3, GOAL_TOP); ctx.lineTo(RINK_WIDTH - 3, GOAL_BOTTOM); ctx.stroke();

    const colors: Record<HockeyPlayer, string> = { 1: '#54e38e', 2: '#ff6b78' };
    ([1, 2] as HockeyPlayer[]).forEach(player => {
      const mallet = game.mallets[player];
      ctx.shadowBlur = 18; ctx.shadowColor = colors[player];
      ctx.fillStyle = colors[player];
      ctx.beginPath(); ctx.arc(mallet.x, mallet.y, MALLET_R, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(0,0,0,.25)';
      ctx.beginPath(); ctx.arc(mallet.x, mallet.y, MALLET_R * .45, 0, Math.PI * 2); ctx.fill();
    });
    ctx.shadowBlur = 16; ctx.shadowColor = '#ffffff';
    ctx.fillStyle = '#f4f6f8';
    ctx.beginPath(); ctx.arc(game.puck.x, game.puck.y, PUCK_R, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
  }

  const toRink = (event: PointerEvent): { x: number; y: number } => {
    const bounds = rink.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * RINK_WIDTH,
      y: ((event.clientY - bounds.top) / bounds.height) * RINK_HEIGHT,
    };
  };
  /*
   * Each finger steers the mallet on the half it touched first, so two
   * players can share one screen. Solo and online, any touch steers yours.
   */
  const owners = new Map<number, HockeyPlayer>();
  rink.addEventListener('pointerdown', event => {
    const point = toRink(event);
    const owner: HockeyPlayer = game.mode === 'duel' && !room?.session().online ? (point.x < RINK_WIDTH / 2 ? 1 : 2) : localPlayer();
    owners.set(event.pointerId, owner);
    if (game.phase === 'ready' || game.phase === 'finished') launch();
    steer(owner, point.x, point.y);
  });
  rink.addEventListener('pointermove', event => {
    const owner = owners.get(event.pointerId) ?? (event.pointerType === 'mouse' ? localPlayer() : undefined);
    if (!owner) return;
    const point = toRink(event);
    steer(owner, point.x, point.y);
  });
  const release = (event: PointerEvent): void => { owners.delete(event.pointerId); };
  rink.addEventListener('pointerup', release);
  rink.addEventListener('pointercancel', release);

  window.addEventListener('keydown', event => {
    if (hockeyView.classList.contains('view-hidden') || event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
      event.preventDefault();
      held.add(event.code);
    } else if (event.code === 'Space' && !event.repeat) {
      event.preventDefault();
      launch();
    }
  });
  window.addEventListener('keyup', event => { held.delete(event.code); });
  function keyboard(seconds: number): void {
    const axis = (neg: string, pos: string): number => Number(held.has(pos)) - Number(held.has(neg));
    const wasd = [axis('KeyA', 'KeyD'), axis('KeyW', 'KeyS')];
    const arrows = [axis('ArrowLeft', 'ArrowRight'), axis('ArrowUp', 'ArrowDown')];
    const local = !room?.session().online && game.mode === 'duel';
    // Two keyboard sets only when two people share the device; otherwise both steer you.
    const mine = local ? wasd : [wasd[0] || arrows[0], wasd[1] || arrows[1]];
    if (mine[0] || mine[1]) {
      const player = localPlayer();
      const target = game.targets[player];
      steer(player, target.x + mine[0] * 700 * seconds, target.y + mine[1] * 700 * seconds);
    }
    if (local && (arrows[0] || arrows[1])) game.nudge(2, arrows[0], arrows[1], seconds);
  }

  startButton?.addEventListener('click', launch);
  document.getElementById('hockeyRestartButton')?.addEventListener('click', () => {
    if (room?.isGuest()) { room.sendAction({ type: 'restart' }); return; }
    game.restart(game.mode);
    room?.broadcastState(snapshot(), true);
    syncUi();
  });
  levelSelect?.addEventListener('change', () => {
    const level = levelSelect.value;
    if (level === 'easy' || level === 'normal' || level === 'hard') game.botLevel = level;
    try { localStorage.setItem('blast-arcade-hockey-bot-v1', level); } catch { /* optional */ }
  });
  try {
    const saved = localStorage.getItem('blast-arcade-hockey-bot-v1');
    if (saved === 'easy' || saved === 'normal' || saved === 'hard') {
      game.botLevel = saved;
      if (levelSelect) levelSelect.value = saved;
    }
  } catch { /* keep the default */ }

  if (roomMount) {
    room = new GameRoomClient({
      game: 'hockey',
      mount: roomMount,
      offlineModes: [
        { id: 'bot', label: 'Solo · vs bot', description: 'Face the Coral bot.', onSelect: () => { game.restart('bot'); syncUi(); } },
        { id: 'local', label: 'Same device', description: 'One end of the table each.', onSelect: () => { game.restart('duel'); syncUi(); } },
      ],
      initialOfflineMode: 'bot',
      onSessionChange: session => {
        if (!session.online) game.restart('bot');
        else if (session.ready && session.playerId === 1) {
          game.restart('duel');
          room?.broadcastState(snapshot(), true);
        }
        syncUi();
      },
      onRemoteAction: (action, from) => {
        if (!room?.isHost() || from !== 2) return;
        if (action.type === 'aim') game.aim(2, Number(action.x), Number(action.y));
        else if (action.type === 'start') game.start();
        else if (action.type === 'restart') game.restart('duel');
        if (action.type !== 'aim') { room.broadcastState(snapshot(), true); syncUi(); }
      },
      onState: state => { if (room?.isGuest()) { restore(state); syncUi(); } },
    });
  }

  registerArcadeSession({
    gameId: 'hockey',
    view: hockeyView,
    mode: () => room?.session().online ? 'online' : game.mode === 'bot' ? 'solo' : 'local',
    isActive: () => game.phase === 'playing' || game.phase === 'scored',
    clearHeldInputs: () => { held.clear(); owners.clear(); },
  });

  let previous = performance.now();
  function loop(now: number): void {
    const seconds = Math.min(0.05, (now - previous) / 1000);
    previous = now;
    if (!hockeyView.classList.contains('view-hidden')) {
      if (!isArcadeSessionPaused('hockey')) {
        keyboard(seconds);
        if (!room?.isGuest()) {
          const before = game.phase;
          const goals = game.scores[1] + game.scores[2];
          game.update(seconds);
          if (game.phase !== before || game.scores[1] + game.scores[2] !== goals) syncUi();
          room?.broadcastState(snapshot());
        }
      }
      render();
    }
    requestAnimationFrame(loop);
  }
  syncUi();
  requestAnimationFrame(loop);
}
