import { GameRoomClient } from './game-room.js';
import { ArcadeResultReporter } from './stats.js';
import { isArcadeSessionPaused, registerArcadeSession } from './session-control.js';
import { AccessibleBoard } from './board-access.js';
import { translateArcadeText } from './i18n.js';
import {
  HEX_CELLS,
  HEX_COLS,
  HEX_FIELDS,
  HEX_ROWS,
  HEX_UNITS,
  HexClashGame,
  chooseHexAction,
  damageRange,
  hexCol,
  hexRow,
  killsFor,
  type HexAction,
  type HexArmyChoice,
  type HexBotLevel,
  type HexFieldId,
  type HexSide,
  type HexStack,
} from './hexclash.js';

export const HEX_SETTINGS_STORAGE_KEY = 'blast-arcade-hexclash-v1';

const RADIUS = 34;
const HEX_WIDTH = Math.sqrt(3) * RADIUS;
const MARGIN = 6;
const STEP_MS = 110;
const SIDE_COLORS: Record<HexSide, string> = { 1: '#54e38e', 2: '#ff6b78' };
const FIELD_COLORS: Record<HexFieldId, [string, string]> = {
  meadow: ['#1f3d27', '#24462d'],
  forest: ['#15301f', '#1a3824'],
  ruins: ['#2c2a23', '#34312a'],
};

/** Centre of a hex on the canvas; odd rows sit half a hex to the right. */
export function hexCenter(index: number): [number, number] {
  const row = hexRow(index);
  return [MARGIN + HEX_WIDTH * (hexCol(index) + .5 + (row & 1) * .5), MARGIN + RADIUS + row * 1.5 * RADIUS];
}

/** The hex under a canvas point, or -1 between hexes and off the board. */
export function hexAtPoint(x: number, y: number): number {
  let best = -1;
  let bestDistance = RADIUS * .95;
  for (let index = 0; index < HEX_CELLS; index++) {
    const [cx, cy] = hexCenter(index);
    const distance = Math.hypot(x - cx, y - cy);
    if (distance < bestDistance) { best = index; bestDistance = distance; }
  }
  return best;
}

const sideName = (side: HexSide): string => side === 1 ? 'Mint' : 'Coral';
const stackName = (stack: HexStack): string => `${HEX_UNITS[stack.unit].name} ×${stack.count}`;

/** What a strike would do, as the preview line shows it. */
export function previewText(game: HexClashGame, target: HexStack, from: number, path: number[]): string {
  const stack = game.active!;
  const shooting = game.canShoot(stack);
  const attacker = shooting ? stack : { ...stack, pos: from };
  const options = shooting ? { ranged: true } : { hexesMoved: game.travel(stack, path) };
  const [low, high] = damageRange(attacker, target, options, shooting && game.shooterBlocked(stack));
  const strikes = shooting ? 1 : HEX_UNITS[stack.unit].strikes;
  const minKills = killsFor(target, low * strikes);
  const maxKills = killsFor(target, high * strikes);
  const kills = minKills === maxKills ? `${minKills}` : `${minKills}–${maxKills}`;
  const damage = strikes > 1 ? `${low}–${high} damage twice` : `${low}–${high} damage`;
  const answer = !shooting && target.retaliationsLeft > 0 && minKills < target.count ? ' They strike back.' : '';
  return `${shooting ? 'Shoot' : 'Attack'} ${stackName(target)}: ${damage}, kills ${kills}.${answer}`;
}

export function infoText(stack: HexStack): string {
  const unit = HEX_UNITS[stack.unit];
  const extra = unit.shots ? ` · shots ${stack.shots}` : '';
  return `${sideName(stack.side)} ${stackName(stack)} · health ${unit.hp} · attack ${unit.attack} · defense ${unit.defense} · damage ${unit.damage[0]}–${unit.damage[1]} · speed ${unit.speed}${extra}`;
}

interface Settings { army: HexArmyChoice; field: HexFieldId; bot: HexBotLevel }

function loadSettings(): Settings {
  const fallback: Settings = { army: 'kingdom', field: 'meadow', bot: 'normal' };
  try {
    const saved = JSON.parse(localStorage.getItem(HEX_SETTINGS_STORAGE_KEY) ?? '{}') as Partial<Settings>;
    return {
      army: saved.army === 'wild' || saved.army === 'random' ? saved.army : fallback.army,
      field: saved.field && saved.field in HEX_FIELDS ? saved.field : fallback.field,
      bot: saved.bot === 'easy' || saved.bot === 'hard' ? saved.bot : fallback.bot,
    };
  } catch {
    return fallback;
  }
}

interface Floater { hex: number; text: string; sub: string; color: string; start: number }
interface Walk { id: number; path: number[]; start: number }

export function initHexClash(): void {
  if (typeof document === 'undefined') return;
  const canvas = document.getElementById('hexclashCanvas') as HTMLCanvasElement | null;
  const context = canvas?.getContext('2d');
  const view = document.getElementById('hexclashView');
  if (!canvas || !context || !view) return;
  const board = canvas;
  const ctx = context;
  const hexView = view;
  board.width = Math.ceil(MARGIN * 2 + HEX_WIDTH * (HEX_COLS + .5));
  board.height = Math.ceil(MARGIN * 2 + RADIUS * 2 + (HEX_ROWS - 1) * 1.5 * RADIUS);

  const $ = <T extends HTMLElement>(id: string): T | null => document.getElementById(id) as T | null;
  const status = $('hexclashStatus');
  const log = $('hexclashLog');
  const queueStrip = $('hexclashQueue');
  const mintStrength = $('hexclashMintStrength');
  const coralStrength = $('hexclashCoralStrength');
  const roundLabel = $('hexclashRound');
  const seriesLabel = $('hexclashSeries');
  const waitButton = $<HTMLButtonElement>('hexclashWaitButton');
  const defendButton = $<HTMLButtonElement>('hexclashDefendButton');
  const nextButton = $<HTMLButtonElement>('hexclashNextButton');
  const armySelect = $<HTMLSelectElement>('hexclashArmy');
  const fieldSelect = $<HTMLSelectElement>('hexclashField');
  const botSelect = $<HTMLSelectElement>('hexclashBotLevel');
  const roomMount = document.querySelector<HTMLElement>('[data-game-room="hexclash"]');

  const settings = loadSettings();
  if (armySelect) armySelect.value = settings.army;
  if (fieldSelect) fieldSelect.value = settings.field;
  if (botSelect) botSelect.value = settings.bot;
  const game = new HexClashGame();
  game.botLevel = settings.bot;
  game.setup(settings.army, settings.field, 'bot');

  let room: GameRoomClient | null = null;
  const resultReporter = new ArcadeResultReporter('hexclash');
  let selection: { target: number; from: number } | null = null;
  let hint = '';
  let hoverHex = -1;
  let shownSeq = game.seq;
  let busyUntil = 0;
  let walks: Walk[] = [];
  let floaters: Floater[] = [];
  let shots: { from: number; to: number; start: number }[] = [];
  let botTimer: number | undefined;
  let spokenSeq = game.seq;
  // The battle counts as under way once the player has acted; a fast bot stack may move first.
  let playerActed = false;

  const access = new AccessibleBoard({
    canvas: board,
    label: 'Hex Clash battlefield',
    activate: key => tapHex(Number(key), false),
    onKey: key => {
      if (key === 'w' || key === 'W') { waitTurn(); return true; }
      if (key === 'd' || key === 'D') { defendTurn(); return true; }
      return false;
    },
  });

  function saveSettings(): void {
    try { localStorage.setItem(HEX_SETTINGS_STORAGE_KEY, JSON.stringify(settings)); } catch { /* optional */ }
  }

  function online(): boolean { return Boolean(room?.session().online); }

  function mySide(): HexSide | null {
    const session = room?.session();
    if (session?.online) return session.ready && (session.playerId === 1 || session.playerId === 2) ? session.playerId : null;
    return game.mode === 'bot' ? 1 : game.active?.side ?? 1;
  }

  function myTurn(): boolean {
    const active = game.active;
    return Boolean(active && active.side === mySide() && !game.isBotTurn());
  }

  const busy = (): boolean => performance.now() < busyUntil;
  /** Players who asked for less motion see each move land at once. */
  const calm = (): boolean => document.documentElement.classList.contains('reduce-motion')
    || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);

  function snapshot(): Record<string, unknown> { return game.snapshot() as unknown as Record<string, unknown>; }

  /** Turns the last action's events into moves, shots and damage numbers on the board. */
  function playEvents(): void {
    if (game.seq === shownSeq) return;
    shownSeq = game.seq;
    let at = performance.now();
    const step = calm() ? 0 : STEP_MS;
    const beat = calm() ? 60 : 380;
    for (const event of game.events) {
      if (event.kind === 'move') {
        if (step) walks.push({ id: event.id, path: event.path, start: at });
        at += (event.path.length - 1) * step;
      } else if (event.kind === 'hit') {
        const target = game.stack(event.id);
        const by = game.stack(event.by);
        if (event.ranged && by) shots.push({ from: by.pos, to: target?.pos ?? -1, start: at });
        const hex = target && target.pos >= 0 ? target.pos : by?.pos ?? -1;
        floaters.push({
          hex, text: `-${event.damage}`, sub: event.killed ? `☠ ${event.killed}` : '',
          color: event.breath ? '#ffb347' : event.retaliation ? '#ffc857' : '#ffffff', start: at + (event.ranged ? 180 : 60),
        });
        at += beat;
      }
    }
    // Only something to watch makes the board busy; a bare state update must not swallow the next tap.
    if (!game.events.length) return;
    busyUntil = at + 120;
    // The action buttons stay off while it plays and come back the moment it ends.
    window.setTimeout(syncUi, busyUntil - performance.now() + 10);
  }

  function perform(action: HexAction): void {
    if (isArcadeSessionPaused('hexclash') || !myTurn() || busy()) return;
    selection = null;
    hint = '';
    playerActed = true;
    if (room?.isGuest()) { room.sendAction({ type: 'act', action }); return; }
    if (!game.act(action)) return;
    room?.broadcastState(snapshot(), true);
    afterAction();
  }

  function afterAction(): void {
    playEvents();
    syncUi();
    scheduleBot();
  }

  function scheduleBot(): void {
    window.clearTimeout(botTimer);
    if (!game.isBotTurn() || online()) return;
    const delay = Math.max(0, busyUntil - performance.now()) + (calm() ? 120 : 450);
    botTimer = window.setTimeout(() => {
      if (!game.isBotTurn()) return;
      if (isArcadeSessionPaused('hexclash') || busy()) { scheduleBot(); return; }
      game.act(chooseHexAction(game, game.botLevel));
      afterAction();
    }, delay);
  }

  /** The side to attack from: for a mouse, the one pointed at; otherwise the shortest way in, or the longest charge. */
  function chooseFrom(options: Map<number, number[]>, point?: [number, number]): number {
    const entries = [...options.entries()];
    if (point) {
      return entries.reduce((best, entry) => {
        const [bx, by] = hexCenter(best[0]);
        const [ex, ey] = hexCenter(entry[0]);
        return Math.hypot(ex - point[0], ey - point[1]) < Math.hypot(bx - point[0], by - point[1]) ? entry : best;
      })[0];
    }
    const charge = HEX_UNITS[game.active!.unit].charge;
    return entries.reduce((best, entry) => (charge ? entry[1].length > best[1].length : entry[1].length < best[1].length) ? entry : best)[0];
  }

  /**
   * A tap picks: an enemy is first previewed, then a second tap (or a tap on a
   * highlighted side of it) strikes; an empty hex in reach is walked to at once.
   * A mouse strikes on the first click, from the side it points at.
   */
  function tapHex(hex: number, immediate: boolean, point?: [number, number]): void {
    if (hex < 0 || game.phase !== 'playing') return;
    const stack = game.active!;
    const there = game.stackAt(hex);
    if (there && there.side === stack.side && there.id !== stack.id) { hint = infoText(there); selection = null; syncUi(); return; }
    // Taps during a move or a blow are dropped rather than queued.
    if (busy()) return;
    if (!myTurn()) {
      if (there) { hint = infoText(there); syncUi(); }
      return;
    }
    if (there && there.id === stack.id) { hint = infoText(there); selection = null; syncUi(); return; }
    if (there) {
      if (game.canShoot(stack)) {
        if (immediate || selection?.target === there.id) { perform({ type: 'shoot', target: there.id }); return; }
        selection = { target: there.id, from: stack.pos };
        hint = previewText(game, there, stack.pos, [stack.pos]);
        syncUi();
        return;
      }
      const options = game.attackHexes(there);
      if (!options.size) { hint = `${HEX_UNITS[there.unit].name} are out of reach.`; selection = null; syncUi(); return; }
      const from = chooseFrom(options, point);
      if (immediate || selection?.target === there.id) {
        perform({ type: 'attack', target: there.id, from: selection?.target === there.id && !point ? selection.from : from });
        return;
      }
      selection = { target: there.id, from };
      hint = previewText(game, there, from, options.get(from)!);
      syncUi();
      return;
    }
    if (selection) {
      const target = game.stack(selection.target);
      const options = target ? game.attackHexes(target) : new Map<number, number[]>();
      if (target && options.has(hex)) { perform({ type: 'attack', target: target.id, from: hex }); return; }
    }
    if (game.reach().has(hex)) { perform({ type: 'move', to: hex }); return; }
    selection = null;
    hint = game.obstacles.has(hex) ? 'Nothing can stand there.' : 'That hex is out of reach.';
    syncUi();
  }

  function waitTurn(): void { if (game.legalActions().some(action => action.type === 'wait')) perform({ type: 'wait' }); }
  function defendTurn(): void { perform({ type: 'defend' }); }

  function newBattle(keepSeries: boolean): void {
    if (room?.isGuest()) { room.sendAction({ type: keepSeries ? 'next' : 'restart' }); return; }
    window.clearTimeout(botTimer);
    const wins = keepSeries ? { ...game.wins } : { 1: 0, 2: 0 };
    game.setup(settings.army, settings.field, online() ? 'duel' : game.mode);
    game.wins = wins;
    walks = []; floaters = []; shots = []; busyUntil = 0;
    shownSeq = game.seq;
    selection = null;
    hint = '';
    playerActed = false;
    resultReporter.report(false);
    room?.broadcastState(snapshot(), true);
    syncUi();
    scheduleBot();
  }

  /** A setting changed before the first move takes effect at once; later it waits for the next battle. */
  function settingChanged(): void {
    saveSettings();
    const untouched = game.phase === 'playing' && !playerActed;
    if (untouched && !room?.isGuest()) newBattle(true);
  }

  function syncUi(): void {
    const finished = game.phase === 'finished';
    if (status) status.textContent = hint || game.statusText();
    if (log) {
      const lines = game.log.slice(-3);
      log.replaceChildren(...lines.map(line => { const span = document.createElement('span'); span.textContent = line; return span; }));
    }
    if (mintStrength) mintStrength.textContent = `${game.strength(1)}%`;
    if (coralStrength) coralStrength.textContent = `${game.strength(2)}%`;
    if (roundLabel) roundLabel.textContent = `Round ${game.round}`;
    if (seriesLabel) seriesLabel.textContent = `Series ${game.wins[1]}-${game.wins[2]}`;
    const canAct = myTurn() && !finished && !busy();
    if (waitButton) waitButton.disabled = !canAct || !game.legalActions().some(action => action.type === 'wait');
    if (defendButton) defendButton.disabled = !canAct;
    if (nextButton) nextButton.disabled = !finished;
    const guest = Boolean(room?.isGuest());
    for (const select of [armySelect, fieldSelect]) if (select) select.disabled = guest;
    if (botSelect) botSelect.closest('label')?.toggleAttribute('hidden', game.mode !== 'bot' || online());
    if (queueStrip) {
      const chips = game.queue.slice(0, 10).map((id, index) => {
        const stack = game.stack(id)!;
        const chip = document.createElement('span');
        chip.className = `hexclash-chip side-${stack.side}${index === 0 ? ' active' : ''}`;
        chip.textContent = `${HEX_UNITS[stack.unit].icon} ${stack.count}`;
        chip.title = `${sideName(stack.side)} ${stackName(stack)}`;
        return chip;
      });
      queueStrip.replaceChildren(...chips);
    }
    const tracked: HexSide = online() ? (mySide() ?? 1) : 1;
    resultReporter.report(finished, {
      outcome: game.winner === 0 ? 'draw' : game.winner === tracked ? 'win' : 'loss',
      score: game.strength(tracked) * 10,
    });
    syncAccess();
  }

  function hexLabel(index: number, reach: Map<number, number[]>): string {
    const place = `Row ${hexRow(index) + 1}, column ${hexCol(index) + 1}`;
    const stack = game.stackAt(index);
    if (stack) return `${place}: ${sideName(stack.side)} ${stackName(stack)}${stack.id === game.active?.id ? ', acting' : ''}`;
    if (game.obstacles.has(index)) return `${place}: blocked`;
    return reach.has(index) ? `${place}: empty, in reach` : `${place}: empty`;
  }

  function syncAccess(): void {
    const reach = myTurn() ? game.reach() : new Map<number, number[]>();
    access.update(Array.from({ length: HEX_CELLS }, (_, index) => {
      const [cx, cy] = hexCenter(index);
      return { key: String(index), x: cx - HEX_WIDTH / 2, y: cy - RADIUS * .75, width: HEX_WIDTH, height: RADIUS * 1.5, label: hexLabel(index, reach) };
    }));
    if (game.seq !== spokenSeq) {
      spokenSeq = game.seq;
      // Each line is translated on its own; joined, they would match no translation.
      access.announce([...game.log.slice(-2), game.statusText()].map(line => translateArcadeText(line)).join(' '));
    }
  }

  // ------------------------------------------------------------ drawing

  function hexPath(cx: number, cy: number, radius: number): void {
    ctx.beginPath();
    for (let corner = 0; corner < 6; corner++) {
      const angle = Math.PI / 180 * (60 * corner - 30);
      const x = cx + radius * Math.cos(angle);
      const y = cy + radius * Math.sin(angle);
      if (corner) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.closePath();
  }

  function drawObstacle(cx: number, cy: number, index: number): void {
    if (game.field === 'forest') {
      ctx.fillStyle = '#0d2415';
      ctx.beginPath(); ctx.arc(cx, cy + 4, RADIUS * .62, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = index % 2 ? '#2f7a43' : '#3b8f50';
      ctx.beginPath(); ctx.arc(cx - 6, cy - 2, RADIUS * .45, 0, Math.PI * 2); ctx.arc(cx + 8, cy + 2, RADIUS * .4, 0, Math.PI * 2); ctx.fill();
    } else if (game.field === 'ruins') {
      hexPath(cx, cy, RADIUS * .86);
      ctx.fillStyle = '#6b5a45';
      ctx.fill();
      ctx.strokeStyle = '#3d3226'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx - 16, cy - 5); ctx.lineTo(cx + 16, cy - 5); ctx.moveTo(cx - 16, cy + 7); ctx.lineTo(cx + 16, cy + 7); ctx.moveTo(cx, cy - 5); ctx.lineTo(cx, cy + 7); ctx.stroke();
    } else {
      ctx.fillStyle = '#6f7785';
      ctx.beginPath(); ctx.ellipse(cx, cy + 3, RADIUS * .62, RADIUS * .45, -.3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#9aa3b1';
      ctx.beginPath(); ctx.ellipse(cx - 5, cy - 2, RADIUS * .36, RADIUS * .24, -.3, 0, Math.PI * 2); ctx.fill();
    }
  }

  /** Where a stack is drawn right now: along its path while it walks. */
  function stackPoint(stack: HexStack, now: number): [number, number] {
    const walk = walks.find(entry => entry.id === stack.id);
    if (!walk) return hexCenter(stack.pos);
    const steps = walk.path.length - 1;
    const progress = Math.max(0, (now - walk.start) / STEP_MS);
    if (progress >= steps) { walks = walks.filter(entry => entry !== walk); return hexCenter(stack.pos); }
    const step = Math.floor(progress);
    const [ax, ay] = hexCenter(walk.path[step]);
    const [bx, by] = hexCenter(walk.path[step + 1]);
    const t = progress - step;
    return [ax + (bx - ax) * t, ay + (by - ay) * t];
  }

  function drawStack(stack: HexStack, now: number, active: boolean, targetable: boolean): void {
    const [x, y] = stackPoint(stack, now);
    const radius = RADIUS * .7;
    if (active) {
      ctx.strokeStyle = `rgba(255, 200, 87, ${.55 + .45 * Math.sin(now / 220)})`;
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(x, y, radius + 6, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.fillStyle = '#111a25';
    ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = SIDE_COLORS[stack.side];
    ctx.lineWidth = 3;
    ctx.stroke();
    if (targetable) {
      ctx.strokeStyle = 'rgba(255, 90, 90, .95)';
      ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.arc(x, y, radius + 4, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.font = `${Math.round(RADIUS * .78)}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(HEX_UNITS[stack.unit].icon, x, y + 1);
    const label = String(stack.count);
    ctx.font = 'bold 13px Inter, system-ui, sans-serif';
    const width = Math.max(20, ctx.measureText(label).width + 10);
    ctx.fillStyle = stack.side === 1 ? '#1f9d5a' : '#d83c51';
    ctx.beginPath();
    // roundRect is missing on older phones; a square badge reads just as well there.
    if (typeof ctx.roundRect === 'function') ctx.roundRect(x + radius * .25, y + radius * .45, width, 17, 6); else ctx.rect(x + radius * .25, y + radius * .45, width, 17);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, x + radius * .25 + width / 2, y + radius * .45 + 9);
    if (stack.defending) {
      ctx.font = '14px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
      ctx.fillText('🛡', x - radius * .75, y - radius * .7);
    }
  }

  function render(now: number): void {
    const [base, alt] = FIELD_COLORS[game.field];
    ctx.fillStyle = '#0c111a';
    ctx.fillRect(0, 0, board.width, board.height);
    const stack = game.active;
    const mine = myTurn() && !busy();
    const reach = mine ? game.reach() : new Map<number, number[]>();
    const target = selection ? game.stack(selection.target) : undefined;
    const attackOptions = mine && target && !game.canShoot(stack) ? game.attackHexes(target) : new Map<number, number[]>();
    const enemies = mine && stack ? game.alive(stack.side === 1 ? 2 : 1) : [];
    const targetable = new Set(enemies.filter(enemy => game.canShoot(stack) || game.attackHexes(enemy).size > 0).map(enemy => enemy.id));
    for (let index = 0; index < HEX_CELLS; index++) {
      const [cx, cy] = hexCenter(index);
      hexPath(cx, cy, RADIUS - 1);
      ctx.fillStyle = (hexCol(index) + hexRow(index)) % 2 ? base : alt;
      ctx.fill();
      if (attackOptions.has(index)) {
        ctx.fillStyle = index === selection?.from ? 'rgba(255, 200, 87, .55)' : 'rgba(255, 200, 87, .25)';
        ctx.fill();
      } else if (reach.has(index)) {
        ctx.fillStyle = index === hoverHex ? 'rgba(150, 255, 190, .45)' : 'rgba(150, 255, 190, .2)';
        ctx.fill();
      }
      // Hexes in reach get a bright edge: a tint alone disappears on green grass.
      ctx.strokeStyle = reach.has(index) ? 'rgba(180, 255, 205, .55)' : 'rgba(255, 255, 255, .07)';
      ctx.lineWidth = reach.has(index) ? 1.5 : 1;
      ctx.stroke();
      if (game.obstacles.has(index)) drawObstacle(cx, cy, index);
    }
    for (const shot of shots) {
      const age = now - shot.start;
      if (age < 0 || shot.to < 0) continue;
      const [ax, ay] = hexCenter(shot.from);
      const [bx, by] = hexCenter(shot.to);
      ctx.strokeStyle = `rgba(255, 236, 170, ${Math.max(0, 1 - age / 300)})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    }
    shots = shots.filter(shot => now - shot.start < 300);
    for (const piece of game.alive()) drawStack(piece, now, piece.id === stack?.id && game.phase === 'playing', targetable.has(piece.id));
    for (const floater of floaters) {
      const age = now - floater.start;
      if (age < 0 || floater.hex < 0) continue;
      const [x, y] = hexCenter(floater.hex);
      ctx.globalAlpha = Math.max(0, 1 - age / 1100);
      ctx.font = 'bold 20px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#0c111a';
      ctx.strokeText(floater.text, x, y - 30 - age / 40);
      ctx.fillStyle = floater.color;
      ctx.fillText(floater.text, x, y - 30 - age / 40);
      if (floater.sub) {
        ctx.font = 'bold 15px Inter, system-ui, sans-serif';
        ctx.strokeText(floater.sub, x, y - 12 - age / 40);
        ctx.fillText(floater.sub, x, y - 12 - age / 40);
      }
      ctx.globalAlpha = 1;
    }
    floaters = floaters.filter(floater => now - floater.start < 1100);
  }

  // ------------------------------------------------------------ input

  function boardPoint(event: PointerEvent): [number, number] {
    const bounds = board.getBoundingClientRect();
    return [((event.clientX - bounds.left) / bounds.width) * board.width, ((event.clientY - bounds.top) / bounds.height) * board.height];
  }
  board.addEventListener('pointerup', event => {
    const point = boardPoint(event);
    const mouse = event.pointerType === 'mouse';
    tapHex(hexAtPoint(...point), mouse, mouse ? point : undefined);
  });
  board.addEventListener('pointermove', event => {
    if (event.pointerType !== 'mouse') return;
    const point = boardPoint(event);
    const hex = hexAtPoint(...point);
    if (hex === hoverHex) return;
    hoverHex = hex;
    // A mouse previews the strike under the pointer before the click.
    const there = hex >= 0 ? game.stackAt(hex) : undefined;
    const stack = game.active;
    if (myTurn() && there && stack && there.side !== stack.side) {
      const options = game.canShoot(stack) ? new Map([[stack.pos, [stack.pos]]]) : game.attackHexes(there);
      if (options.size) {
        const from = game.canShoot(stack) ? stack.pos : chooseFrom(options, point);
        hint = previewText(game, there, from, options.get(from)!);
        syncUi();
        return;
      }
    }
    if (hint && !selection) { hint = ''; syncUi(); }
  });
  board.addEventListener('pointerleave', () => { hoverHex = -1; });

  waitButton?.addEventListener('click', waitTurn);
  defendButton?.addEventListener('click', defendTurn);
  nextButton?.addEventListener('click', () => newBattle(true));
  document.getElementById('hexclashRestartButton')?.addEventListener('click', () => newBattle(false));
  armySelect?.addEventListener('change', () => {
    const value = armySelect.value;
    settings.army = value === 'wild' || value === 'random' ? value : 'kingdom';
    settingChanged();
  });
  fieldSelect?.addEventListener('change', () => {
    const value = fieldSelect.value;
    settings.field = value in HEX_FIELDS ? value as HexFieldId : 'meadow';
    settingChanged();
  });
  botSelect?.addEventListener('change', () => {
    const value = botSelect.value;
    settings.bot = value === 'easy' || value === 'hard' ? value : 'normal';
    game.botLevel = settings.bot;
    saveSettings();
  });

  if (roomMount) {
    room = new GameRoomClient({
      game: 'hexclash',
      mount: roomMount,
      offlineModes: [
        { id: 'bot', label: 'Solo · vs bot', description: 'Command Mint against the Coral bot.', onSelect: () => { game.mode = 'bot'; newBattle(false); } },
        { id: 'local', label: 'Same device', description: 'Take turns on this device.', onSelect: () => { game.mode = 'duel'; newBattle(false); } },
      ],
      initialOfflineMode: 'bot',
      onSessionChange: session => {
        window.clearTimeout(botTimer);
        if (!session.online) { game.mode = 'bot'; newBattle(false); return; }
        if (session.ready && session.playerId === 1) { game.mode = 'duel'; newBattle(false); }
        syncUi();
      },
      onRemoteAction: (action, from) => {
        if (!room?.isHost() || from !== 2) return;
        if (action.type === 'act' && game.active?.side === 2 && !busy()) {
          if (!game.act(action.action as HexAction)) return;
        } else if (action.type === 'next' && game.phase === 'finished') {
          newBattle(true);
          return;
        } else if (action.type === 'restart') {
          newBattle(false);
          return;
        } else {
          return;
        }
        room.broadcastState(snapshot(), true);
        afterAction();
      },
      onState: state => {
        if (!room?.isGuest() || !game.restore(state)) return;
        if (game.seq < shownSeq) shownSeq = game.seq;
        selection = null;
        hint = '';
        afterAction();
      },
    });
  }

  registerArcadeSession({
    gameId: 'hexclash',
    view: hexView,
    mode: () => online() ? 'online' : game.mode === 'bot' ? 'solo' : 'local',
    isActive: () => game.phase === 'playing' && playerActed,
    clearHeldInputs: () => undefined,
    resumeCountdown: false,
  });

  function loop(now: number): void {
    if (!hexView.classList.contains('view-hidden')) render(now);
    requestAnimationFrame(loop);
  }
  syncUi();
  scheduleBot();
  requestAnimationFrame(loop);
}
