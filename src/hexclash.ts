/**
 * Hex Clash: turn-based army battles on a hex grid, in the spirit of the
 * classic fantasy strategy fights - stacks of creatures, initiative order,
 * one retaliation per round - without the campaign around them.
 * Pure rules and bot here; the board and controls live in hexclash-ui.ts.
 */

export type HexSide = 1 | 2;
export type HexMode = 'bot' | 'duel';
export type HexBotLevel = 'easy' | 'normal' | 'hard';
export type HexUnitId = 'spear' | 'archer' | 'knight' | 'griffin' | 'mage' | 'goblin' | 'wolf' | 'shaman' | 'ogre' | 'dragon';
export type HexArmyChoice = 'kingdom' | 'wild' | 'random';
export type HexFieldId = 'meadow' | 'forest' | 'ruins';

export const HEX_COLS = 11;
export const HEX_ROWS = 9;
export const HEX_CELLS = HEX_COLS * HEX_ROWS;
/** A battle that drags on is decided by the strength each side has left. */
export const HEX_ROUND_LIMIT = 30;
const ARMY_BUDGET = 10_000;

export interface HexUnitType {
  id: HexUnitId;
  /** Plural, as stacks are always named: "Knights ×6". */
  name: string;
  icon: string;
  hp: number;
  attack: number;
  defense: number;
  damage: readonly [number, number];
  speed: number;
  /** Arrows or bolts; zero for melee units. */
  shots: number;
  flying?: boolean;
  /** How many times per round the stack strikes back. */
  retaliations: number;
  /** Wolves bite twice. */
  strikes: number;
  /** Knights hit harder the further they ride before the blow. */
  charge?: boolean;
  /** Dragon fire also burns whatever stands behind the target. */
  breath?: boolean;
  /** Mages' bolts lose nothing when an enemy stands next to them. */
  steadyShot?: boolean;
  /** Worth per creature, used for army budgets, the bot and the final count. Tuned by simulation so the two factions win about equally. */
  value: number;
}

export const HEX_UNITS: Record<HexUnitId, HexUnitType> = {
  spear: { id: 'spear', name: 'Spearmen', icon: '🔱', hp: 10, attack: 4, defense: 6, damage: [1, 3], speed: 4, shots: 0, retaliations: 1, strikes: 1, value: 60 },
  archer: { id: 'archer', name: 'Archers', icon: '🏹', hp: 10, attack: 6, defense: 3, damage: [2, 3], speed: 4, shots: 12, retaliations: 1, strikes: 1, value: 105 },
  knight: { id: 'knight', name: 'Knights', icon: '🐎', hp: 35, attack: 11, defense: 10, damage: [6, 10], speed: 7, shots: 0, retaliations: 1, strikes: 1, charge: true, value: 400 },
  griffin: { id: 'griffin', name: 'Griffins', icon: '🦅', hp: 25, attack: 8, defense: 8, damage: [3, 6], speed: 8, shots: 0, flying: true, retaliations: 2, strikes: 1, value: 230 },
  mage: { id: 'mage', name: 'Mages', icon: '🔮', hp: 22, attack: 10, defense: 8, damage: [5, 8], speed: 5, shots: 10, retaliations: 1, strikes: 1, steadyShot: true, value: 415 },
  goblin: { id: 'goblin', name: 'Goblins', icon: '👺', hp: 6, attack: 4, defense: 2, damage: [1, 2], speed: 6, shots: 0, retaliations: 1, strikes: 1, value: 33 },
  wolf: { id: 'wolf', name: 'Wolves', icon: '🐺', hp: 12, attack: 6, defense: 4, damage: [2, 4], speed: 7, shots: 0, retaliations: 1, strikes: 2, value: 103 },
  shaman: { id: 'shaman', name: 'Shamans', icon: '🔥', hp: 16, attack: 8, defense: 5, damage: [3, 5], speed: 5, shots: 10, retaliations: 1, strikes: 1, value: 185 },
  ogre: { id: 'ogre', name: 'Ogres', icon: '👹', hp: 45, attack: 10, defense: 8, damage: [6, 12], speed: 4, shots: 0, retaliations: 1, strikes: 1, value: 390 },
  dragon: { id: 'dragon', name: 'Dragons', icon: '🐉', hp: 160, attack: 18, defense: 16, damage: [25, 40], speed: 9, shots: 0, flying: true, retaliations: 1, strikes: 1, breath: true, value: 2800 },
};

/** Each army spends the same budget, split across its units in these shares. */
export const HEX_FACTIONS: Record<'kingdom' | 'wild', readonly (readonly [HexUnitId, number])[]> = {
  kingdom: [['spear', .12], ['archer', .2], ['knight', .24], ['griffin', .2], ['mage', .24]],
  wild: [['goblin', .1], ['wolf', .16], ['shaman', .22], ['ogre', .24], ['dragon', .28]],
};

/** Rocks, trees and broken walls; the first and last two columns stay clear for deployment. */
export const HEX_FIELDS: Record<HexFieldId, readonly (readonly [number, number])[]> = {
  meadow: [[5, 4], [5, 3], [4, 6], [6, 1]],
  forest: [[3, 1], [4, 1], [7, 2], [5, 4], [6, 4], [3, 6], [7, 6], [7, 7], [4, 8]],
  ruins: [[4, 0], [4, 1], [4, 2], [6, 6], [6, 7], [6, 8], [5, 4], [3, 5], [7, 3]],
};

export interface HexStack {
  id: number;
  side: HexSide;
  unit: HexUnitId;
  count: number;
  startCount: number;
  /** Health of the creature at the top of the stack; the rest are whole. */
  topHp: number;
  pos: number;
  shots: number;
  retaliationsLeft: number;
  defending: boolean;
  waited: boolean;
}

export type HexAction =
  | { type: 'move'; to: number }
  | { type: 'attack'; target: number; from: number }
  | { type: 'shoot'; target: number }
  | { type: 'wait' }
  | { type: 'defend' };

/** What just happened, for the board to animate and the log to tell. */
export type HexEvent =
  | { kind: 'move'; id: number; path: number[] }
  | { kind: 'hit'; by: number; id: number; damage: number; killed: number; ranged: boolean; retaliation: boolean; breath: boolean }
  | { kind: 'wait' | 'defend'; id: number };

export type HexPhase = 'playing' | 'finished';

// ---------------------------------------------------------------- geometry

export const hexIndex = (col: number, row: number): number => row * HEX_COLS + col;
export const hexCol = (index: number): number => index % HEX_COLS;
export const hexRow = (index: number): number => Math.floor(index / HEX_COLS);

/** Odd rows sit half a hex to the right ("odd-r" layout). */
function toCube(index: number): [number, number] {
  const col = hexCol(index);
  const row = hexRow(index);
  return [col - (row - (row & 1)) / 2, row];
}

function fromCube(q: number, r: number): number {
  const col = q + (r - (r & 1)) / 2;
  return col < 0 || col >= HEX_COLS || r < 0 || r >= HEX_ROWS ? -1 : hexIndex(col, r);
}

export function hexDistance(a: number, b: number): number {
  const [aq, ar] = toCube(a);
  const [bq, br] = toCube(b);
  return (Math.abs(aq - bq) + Math.abs(ar - br) + Math.abs(aq + ar - bq - br)) / 2;
}

const CUBE_DIRECTIONS: readonly [number, number][] = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

export function hexNeighbors(index: number): number[] {
  const [q, r] = toCube(index);
  return CUBE_DIRECTIONS.map(([dq, dr]) => fromCube(q + dq, r + dr)).filter(next => next >= 0);
}

/** The hex on the far side of `target`, seen from `from` next to it: where dragon fire carries on to. */
export function hexBehind(from: number, target: number): number {
  const [fq, fr] = toCube(from);
  const [tq, tr] = toCube(target);
  return fromCube(2 * tq - fq, 2 * tr - fr);
}

// ---------------------------------------------------------------- armies

export function stackHealth(stack: HexStack): number {
  return stack.count <= 0 ? 0 : (stack.count - 1) * HEX_UNITS[stack.unit].hp + stack.topHp;
}

export function stackValue(stack: HexStack): number {
  const unit = HEX_UNITS[stack.unit];
  return (stackHealth(stack) / unit.hp) * unit.value;
}

function armyFor(choice: 'kingdom' | 'wild' | HexUnitId[]): [HexUnitId, number][] {
  if (Array.isArray(choice)) return choice.map(unit => [unit, 1 / choice.length]);
  return HEX_FACTIONS[choice].map(([unit, share]) => [unit, share]);
}

/** Five different units drawn at random, the same budget for both sides. */
export function randomArmy(random: () => number = Math.random): HexUnitId[] {
  const pool = Object.keys(HEX_UNITS) as HexUnitId[];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 5);
}

/** Rows the five stacks of an army stand on, spread down its edge. */
const DEPLOY_ROWS = [0, 2, 4, 6, 8];

export function deployArmy(side: HexSide, army: 'kingdom' | 'wild' | HexUnitId[], firstId: number): HexStack[] {
  const col = side === 1 ? 0 : HEX_COLS - 1;
  return armyFor(army).map(([unit, share], index) => {
    const type = HEX_UNITS[unit];
    const count = Math.max(1, Math.round((ARMY_BUDGET * share) / type.value));
    return {
      id: firstId + index, side, unit, count, startCount: count, topHp: type.hp,
      pos: hexIndex(col, DEPLOY_ROWS[index % DEPLOY_ROWS.length]),
      shots: type.shots, retaliationsLeft: type.retaliations, defending: false, waited: false,
    };
  });
}

// ---------------------------------------------------------------- damage

export interface StrikeOptions { ranged?: boolean; hexesMoved?: number }

/**
 * How attack, defense and circumstance scale a strike: every point of attack
 * over defense adds 5%, every point under takes 2.5%; defending stacks count
 * 30% more defense; a shooter with an enemy beside it does half; a charge adds
 * 5% per hex ridden.
 */
export function strikeMultiplier(attacker: HexStack, defender: HexStack, options: StrikeOptions = {}, shooterBlocked = false): number {
  const a = HEX_UNITS[attacker.unit];
  const defense = HEX_UNITS[defender.unit].defense * (defender.defending ? 1.3 : 1);
  let multiplier = a.attack >= defense ? Math.min(3, 1 + .05 * (a.attack - defense)) : Math.max(.3, 1 - .025 * (defense - a.attack));
  if (options.ranged && shooterBlocked && !a.steadyShot) multiplier *= .5;
  if (a.charge && options.hexesMoved) multiplier *= 1 + .05 * options.hexesMoved;
  return multiplier;
}

/** Lowest and highest damage of one strike, before the dice: what the preview shows. */
export function damageRange(attacker: HexStack, defender: HexStack, options: StrikeOptions = {}, shooterBlocked = false): [number, number] {
  const a = HEX_UNITS[attacker.unit];
  const multiplier = strikeMultiplier(attacker, defender, options, shooterBlocked);
  const low = Math.max(1, Math.floor(attacker.count * a.damage[0] * multiplier));
  const high = Math.max(1, Math.floor(attacker.count * a.damage[1] * multiplier));
  return [low, high];
}

/** Creatures a given amount of damage kills: none if the top one survives it. */
export function killsFor(stack: HexStack, damage: number): number {
  const remaining = stackHealth(stack) - damage;
  if (remaining <= 0) return stack.count;
  return stack.count - Math.ceil(remaining / HEX_UNITS[stack.unit].hp);
}

function applyDamage(stack: HexStack, damage: number): number {
  const hp = HEX_UNITS[stack.unit].hp;
  const remaining = stackHealth(stack) - damage;
  const before = stack.count;
  if (remaining <= 0) {
    stack.count = 0;
    stack.topHp = 0;
    stack.pos = -1;
  } else {
    stack.count = Math.ceil(remaining / hp);
    stack.topHp = remaining - (stack.count - 1) * hp;
  }
  return before - stack.count;
}

// ---------------------------------------------------------------- game

export interface HexSnapshot {
  stacks: HexStack[];
  obstacles: number[];
  field: HexFieldId;
  round: number;
  queue: number[];
  current: number;
  phase: HexPhase;
  winner: HexSide | 0 | null;
  mode: HexMode;
  wins: Record<HexSide, number>;
  log: string[];
  events: HexEvent[];
  seq: number;
}

export class HexClashGame {
  stacks: HexStack[] = [];
  obstacles = new Set<number>();
  field: HexFieldId = 'meadow';
  round = 1;
  /** Stacks still to act this round, in order; the first is acting now. */
  queue: number[] = [];
  phase: HexPhase = 'playing';
  winner: HexSide | 0 | null = null;
  mode: HexMode = 'bot';
  botLevel: HexBotLevel = 'normal';
  wins: Record<HexSide, number> = { 1: 0, 2: 0 };
  /** The latest lines of the battle log, newest last. */
  log: string[] = [];
  /** What the last action did, for the board to replay. */
  events: HexEvent[] = [];
  /** Counts actions, so a client can tell a new state from a repeat. */
  seq = 0;
  random: () => number;

  constructor(random: () => number = Math.random) {
    this.random = random;
    this.setup('kingdom', 'meadow');
  }

  /** Lines up a fresh battle. The first army is Mint's; the other side gets the rival faction. */
  setup(choice: HexArmyChoice, field: HexFieldId, mode: HexMode = this.mode): void {
    this.mode = mode;
    this.field = field;
    this.obstacles = new Set(HEX_FIELDS[field].map(([col, row]) => hexIndex(col, row)));
    if (choice === 'random') {
      this.stacks = [...deployArmy(1, randomArmy(this.random), 1), ...deployArmy(2, randomArmy(this.random), 6)];
    } else {
      this.stacks = [...deployArmy(1, choice, 1), ...deployArmy(2, choice === 'kingdom' ? 'wild' : 'kingdom', 6)];
    }
    this.round = 1;
    this.phase = 'playing';
    this.winner = null;
    this.log = [];
    this.events = [];
    this.seq++;
    this.startRound();
  }

  stack(id: number): HexStack | undefined { return this.stacks.find(stack => stack.id === id); }
  alive(side?: HexSide): HexStack[] { return this.stacks.filter(stack => stack.count > 0 && (!side || stack.side === side)); }
  get active(): HexStack | undefined { return this.phase === 'playing' ? this.stack(this.queue[0]) : undefined; }
  stackAt(hex: number): HexStack | undefined { return this.stacks.find(stack => stack.count > 0 && stack.pos === hex); }
  isBotTurn(): boolean { return this.mode === 'bot' && this.phase === 'playing' && this.active?.side === 2; }

  /** Faster stacks act first; on a tie the sides take turns going first each round. */
  private startRound(): void {
    const leader: HexSide = this.round % 2 === 1 ? 1 : 2;
    this.queue = this.alive()
      .sort((a, b) => HEX_UNITS[b.unit].speed - HEX_UNITS[a.unit].speed || (a.side === leader ? -1 : 0) - (b.side === leader ? -1 : 0) || a.id - b.id)
      .map(stack => stack.id);
    for (const stack of this.alive()) {
      stack.retaliationsLeft = HEX_UNITS[stack.unit].retaliations;
      stack.waited = false;
    }
    this.beginTurn();
  }

  private beginTurn(): void {
    // A defensive stance lasts until the stack's own next turn.
    const active = this.active;
    if (active) active.defending = false;
  }

  /** Where the acting stack can go this turn, with how many hexes each takes and the way there. */
  reach(stack: HexStack | undefined = this.active): Map<number, number[]> {
    const paths = new Map<number, number[]>();
    if (!stack || stack.count <= 0) return paths;
    const type = HEX_UNITS[stack.unit];
    const free = (hex: number): boolean => !this.obstacles.has(hex) && !this.stackAt(hex);
    if (type.flying) {
      for (let hex = 0; hex < HEX_CELLS; hex++) {
        if (hex !== stack.pos && free(hex) && hexDistance(stack.pos, hex) <= type.speed) paths.set(hex, [stack.pos, hex]);
      }
      return paths;
    }
    const queue = [stack.pos];
    const via = new Map<number, number>([[stack.pos, -1]]);
    const steps = new Map<number, number>([[stack.pos, 0]]);
    while (queue.length) {
      const hex = queue.shift()!;
      if (steps.get(hex)! >= type.speed) continue;
      for (const next of hexNeighbors(hex)) {
        if (via.has(next) || !free(next)) continue;
        via.set(next, hex);
        steps.set(next, steps.get(hex)! + 1);
        queue.push(next);
      }
    }
    for (const hex of via.keys()) {
      if (hex === stack.pos) continue;
      const path = [hex];
      for (let step = via.get(hex)!; step !== -1; step = via.get(step)!) path.unshift(step);
      paths.set(hex, path);
    }
    return paths;
  }

  /** Hexes the stack covers to get there: walkers count steps, flyers the straight distance. */
  travel(stack: HexStack, path: number[]): number {
    return HEX_UNITS[stack.unit].flying ? hexDistance(path[0], path[path.length - 1]) : path.length - 1;
  }

  canShoot(stack: HexStack | undefined = this.active): boolean {
    return Boolean(stack && stack.shots > 0);
  }

  /** A shooter with an enemy beside it aims badly. */
  shooterBlocked(stack: HexStack): boolean {
    return hexNeighbors(stack.pos).some(hex => { const other = this.stackAt(hex); return other !== undefined && other.side !== stack.side; });
  }

  /** The hexes from which the acting stack can hit `target` in melee, with the path to each. */
  attackHexes(target: HexStack, stack: HexStack | undefined = this.active): Map<number, number[]> {
    const options = new Map<number, number[]>();
    if (!stack || target.side === stack.side || target.count <= 0) return options;
    const reach = this.reach(stack);
    for (const hex of hexNeighbors(target.pos)) {
      if (hex === stack.pos) options.set(hex, [stack.pos]);
      else if (reach.has(hex)) options.set(hex, reach.get(hex)!);
    }
    return options;
  }

  /** Every action the acting stack may take right now. */
  legalActions(): HexAction[] {
    const stack = this.active;
    if (!stack) return [];
    const actions: HexAction[] = [{ type: 'defend' }];
    if (!stack.waited && this.queue.length > 1) actions.push({ type: 'wait' });
    for (const to of this.reach(stack).keys()) actions.push({ type: 'move', to });
    for (const enemy of this.alive(stack.side === 1 ? 2 : 1)) {
      if (this.canShoot(stack)) actions.push({ type: 'shoot', target: enemy.id });
      else for (const from of this.attackHexes(enemy, stack).keys()) actions.push({ type: 'attack', target: enemy.id, from });
    }
    return actions;
  }

  /** Plays an action for the acting stack. Returns false (and changes nothing) if it is not allowed. */
  act(action: HexAction): boolean {
    const stack = this.active;
    if (!stack) return false;
    const events: HexEvent[] = [];
    const name = HEX_UNITS[stack.unit].name;
    if (action.type === 'defend') {
      stack.defending = true;
      events.push({ kind: 'defend', id: stack.id });
      this.say(`${name} defend.`);
    } else if (action.type === 'wait') {
      if (stack.waited || this.queue.length < 2) return false;
      stack.waited = true;
      this.queue.push(this.queue.shift()!);
      this.events = [{ kind: 'wait', id: stack.id }];
      this.say(`${name} wait.`);
      this.seq++;
      this.beginTurn();
      return true;
    } else if (action.type === 'move') {
      const path = this.reach(stack).get(action.to);
      if (!path) return false;
      stack.pos = action.to;
      events.push({ kind: 'move', id: stack.id, path });
    } else if (action.type === 'shoot') {
      const target = this.stack(action.target);
      if (!target || target.count <= 0 || target.side === stack.side || !this.canShoot(stack)) return false;
      const blocked = this.shooterBlocked(stack);
      stack.shots--;
      this.strike(stack, target, { ranged: true }, blocked, false, events);
    } else {
      const target = this.stack(action.target);
      if (!target || target.count <= 0 || target.side === stack.side || this.canShoot(stack)) return false;
      const path = this.attackHexes(target, stack).get(action.from);
      if (!path) return false;
      const hexesMoved = this.travel(stack, path);
      if (path.length > 1) {
        stack.pos = action.from;
        events.push({ kind: 'move', id: stack.id, path });
      }
      this.melee(stack, target, hexesMoved, events);
    }
    this.events = events;
    this.seq++;
    this.endTurn();
    return true;
  }

  private melee(stack: HexStack, target: HexStack, hexesMoved: number, events: HexEvent[]): void {
    const strikes = HEX_UNITS[stack.unit].strikes;
    for (let strike = 0; strike < strikes && stack.count > 0 && target.count > 0; strike++) {
      this.strike(stack, target, { hexesMoved: strike === 0 ? hexesMoved : 0 }, false, false, events);
      // Only the first blow is answered, and only while the target still stands.
      if (strike === 0 && target.count > 0 && target.retaliationsLeft > 0) {
        target.retaliationsLeft--;
        this.strike(target, stack, {}, false, true, events);
      }
    }
  }

  private roll(stack: HexStack): number {
    const [low, high] = HEX_UNITS[stack.unit].damage;
    const rolls = Math.min(stack.count, 10);
    let total = 0;
    for (let i = 0; i < rolls; i++) total += low + Math.floor(this.random() * (high - low + 1));
    return (total * stack.count) / rolls;
  }

  private strike(attacker: HexStack, target: HexStack, options: StrikeOptions, blocked: boolean, retaliation: boolean, events: HexEvent[]): void {
    const unit = HEX_UNITS[attacker.unit];
    const damage = Math.max(1, Math.floor(this.roll(attacker) * strikeMultiplier(attacker, target, options, blocked)));
    const behind = unit.breath && !options.ranged ? this.stackAt(hexBehind(attacker.pos, target.pos)) : undefined;
    const killed = applyDamage(target, damage);
    events.push({ kind: 'hit', by: attacker.id, id: target.id, damage, killed, ranged: Boolean(options.ranged), retaliation, breath: false });
    this.say(`${retaliation ? '↩ ' : ''}${unit.name} → ${HEX_UNITS[target.unit].name}: ${damage} damage, ${killed} killed.`);
    if (behind) {
      const burn = Math.max(1, Math.floor(damage / 2));
      const burned = applyDamage(behind, burn);
      events.push({ kind: 'hit', by: attacker.id, id: behind.id, damage: burn, killed: burned, ranged: false, retaliation, breath: true });
      this.say(`🔥 ${unit.name} → ${HEX_UNITS[behind.unit].name}: ${burn} damage, ${burned} killed.`);
    }
  }

  private say(line: string): void {
    this.log = [...this.log, line].slice(-6);
  }

  private endTurn(): void {
    this.queue = this.queue.slice(1).filter(id => (this.stack(id)?.count ?? 0) > 0);
    if (this.checkFinished()) return;
    if (!this.queue.length) {
      this.round++;
      if (this.round > HEX_ROUND_LIMIT) { this.finishByStrength(); return; }
      this.startRound();
    } else {
      this.beginTurn();
    }
  }

  private checkFinished(): boolean {
    const mint = this.alive(1).length;
    const coral = this.alive(2).length;
    if (mint && coral) return false;
    this.finish(mint ? 1 : coral ? 2 : 0);
    return true;
  }

  private finishByStrength(): void {
    const strength = (side: HexSide): number => this.alive(side).reduce((sum, stack) => sum + stackValue(stack), 0);
    const mint = strength(1);
    const coral = strength(2);
    this.finish(Math.abs(mint - coral) < 1 ? 0 : mint > coral ? 1 : 2);
  }

  private finish(winner: HexSide | 0): void {
    this.phase = 'finished';
    this.winner = winner;
    this.queue = [];
    if (winner) this.wins[winner]++;
  }

  /** How much of a side's starting army still stands, 0-100. */
  strength(side: HexSide): number {
    const start = this.stacks.filter(stack => stack.side === side).reduce((sum, stack) => sum + stack.startCount * HEX_UNITS[stack.unit].value, 0);
    const now = this.alive(side).reduce((sum, stack) => sum + stackValue(stack), 0);
    return start ? Math.round((now / start) * 100) : 0;
  }

  statusText(): string {
    if (this.phase === 'finished') {
      return this.winner === 0 ? 'The battle ends in a draw.' : `${this.winner === 1 ? 'Mint' : 'Coral'} wins the battle!`;
    }
    const stack = this.active;
    if (!stack) return '';
    return `${stack.side === 1 ? 'Mint' : 'Coral'} ${HEX_UNITS[stack.unit].name} ×${stack.count} to act.`;
  }

  snapshot(): HexSnapshot {
    return {
      stacks: this.stacks.map(stack => ({ ...stack })), obstacles: [...this.obstacles], field: this.field,
      round: this.round, queue: [...this.queue], current: this.queue[0] ?? -1, phase: this.phase, winner: this.winner,
      mode: this.mode, wins: { ...this.wins }, log: [...this.log], events: this.events.map(event => ({ ...event })), seq: this.seq,
    };
  }

  /** Takes a state from the host; anything malformed is ignored. */
  restore(value: unknown): boolean {
    const state = normalizeHexSnapshot(value);
    if (!state) return false;
    this.stacks = state.stacks;
    this.obstacles = new Set(state.obstacles);
    this.field = state.field;
    this.round = state.round;
    this.queue = state.queue;
    this.phase = state.phase;
    this.winner = state.winner;
    this.mode = state.mode;
    this.wins = state.wins;
    this.log = state.log;
    this.events = state.events;
    this.seq = state.seq;
    return true;
  }
}

const isCell = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= -1 && (value as number) < HEX_CELLS;

/** Checks a state that came over the network before the board trusts it. */
export function normalizeHexSnapshot(value: unknown): HexSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const state = value as Partial<HexSnapshot>;
  if (!Array.isArray(state.stacks) || state.stacks.length > 20 || !Array.isArray(state.obstacles) || !Array.isArray(state.queue)) return null;
  const stacks: HexStack[] = [];
  for (const raw of state.stacks as Partial<HexStack>[]) {
    if (!raw || typeof raw !== 'object' || !(raw.unit && raw.unit in HEX_UNITS) || (raw.side !== 1 && raw.side !== 2)) return null;
    if (![raw.id, raw.count, raw.startCount, raw.topHp, raw.shots, raw.retaliationsLeft].every(n => Number.isInteger(n) && (n as number) >= 0) || !isCell(raw.pos)) return null;
    stacks.push({
      id: raw.id!, side: raw.side, unit: raw.unit, count: raw.count!, startCount: raw.startCount!, topHp: raw.topHp!, pos: raw.pos!,
      shots: raw.shots!, retaliationsLeft: raw.retaliationsLeft!, defending: raw.defending === true, waited: raw.waited === true,
    });
  }
  if (!state.obstacles.every(isCell) || !state.queue.every(id => stacks.some(stack => stack.id === id))) return null;
  const field = state.field && state.field in HEX_FIELDS ? state.field : 'meadow';
  const wins = state.wins && Number.isInteger(state.wins[1]) && Number.isInteger(state.wins[2]) ? { 1: state.wins[1], 2: state.wins[2] } : { 1: 0, 2: 0 };
  return {
    stacks, obstacles: state.obstacles as number[], field, round: Number.isInteger(state.round) ? state.round! : 1,
    queue: state.queue as number[], current: (state.queue as number[])[0] ?? -1,
    phase: state.phase === 'finished' ? 'finished' : 'playing',
    winner: state.winner === 1 || state.winner === 2 || state.winner === 0 ? state.winner : null,
    mode: state.mode === 'bot' ? 'bot' : 'duel', wins,
    log: Array.isArray(state.log) ? state.log.filter((line): line is string => typeof line === 'string').slice(-6) : [],
    events: Array.isArray(state.events) ? state.events.filter(event => event && typeof event === 'object').slice(0, 12) as HexEvent[] : [],
    seq: Number.isInteger(state.seq) ? state.seq! : 0,
  };
}

// ---------------------------------------------------------------- bot

const average = ([low, high]: [number, number]): number => (low + high) / 2;

/** Value of the creatures an amount of damage would kill or wound, with a bonus for wiping a stack out. */
function valueOfDamage(target: HexStack, damage: number): number {
  const lost = Math.min(stackHealth(target), damage);
  const type = HEX_UNITS[target.unit];
  return (lost / type.hp) * type.value + (lost >= stackHealth(target) ? type.value : 0);
}

/** How much the bot cares about removing this stack: shooters and dragons first. */
function priority(target: HexStack, level: HexBotLevel): number {
  if (level !== 'hard') return 1;
  const type = HEX_UNITS[target.unit];
  return type.shots > 0 ? 1.35 : type.breath ? 1.25 : 1;
}

/** Expected damage the enemy can bring to bear on a stack standing at `hex` next turn. */
function danger(game: HexClashGame, stack: HexStack, hex: number): number {
  let total = 0;
  for (const enemy of game.alive(stack.side === 1 ? 2 : 1)) {
    const type = HEX_UNITS[enemy.unit];
    const reachable = type.shots > 0 && enemy.shots > 0 ? true : hexDistance(enemy.pos, hex) <= type.speed + 1;
    if (reachable) total += valueOfDamage(stack, average(damageRange(enemy, stack, { ranged: type.shots > 0 && enemy.shots > 0 })));
  }
  return total;
}

function scoreAction(game: HexClashGame, action: HexAction, level: HexBotLevel): number {
  const stack = game.active!;
  // Standing still is the last resort; closing in always beats it.
  if (action.type === 'defend') return -1000;
  if (action.type === 'wait') return -1001;
  if (action.type === 'move') {
    // No target in reach: close in on the most valuable enemy, keeping out of harm's way on hard.
    const enemies = game.alive(stack.side === 1 ? 2 : 1);
    const nearest = Math.min(...enemies.map(enemy => hexDistance(action.to, enemy.pos) / priority(enemy, level)));
    const risk = level === 'hard' ? danger(game, { ...stack, pos: action.to }, action.to) * .15 : 0;
    return -nearest * 3 - risk - 100;
  }
  const target = game.stack(action.target)!;
  if (action.type === 'shoot') {
    const blocked = game.shooterBlocked(stack);
    return valueOfDamage(target, average(damageRange(stack, target, { ranged: true }, blocked))) * priority(target, level);
  }
  const path = game.attackHexes(target, stack).get(action.from)!;
  const moved = { ...stack, pos: action.from };
  const dealt = average(damageRange(moved, target, { hexesMoved: game.travel(stack, path) })) * HEX_UNITS[stack.unit].strikes;
  let score = valueOfDamage(target, dealt) * priority(target, level);
  const survivor = { ...target, count: target.count - killsFor(target, dealt) };
  if (survivor.count > 0 && target.retaliationsLeft > 0) {
    score -= valueOfDamage(moved, average(damageRange(survivor, moved)));
  }
  if (level === 'hard') score -= danger(game, moved, action.from) * .1;
  return score;
}

/** The bot's choice for the acting stack. Easy plays loosely, normal greedily, hard also weighs targets and danger. */
export function chooseHexAction(game: HexClashGame, level: HexBotLevel, random: () => number = Math.random): HexAction {
  const actions = game.legalActions();
  if (!actions.length) return { type: 'defend' };
  const scored = actions.map(action => ({ action, score: scoreAction(game, action, level) }));
  if (level === 'easy') {
    // Easy lunges at whatever it can hit, rarely the best target.
    const hits = scored.filter(entry => entry.action.type === 'attack' || entry.action.type === 'shoot');
    const pool = hits.length && random() < .6 ? hits : scored;
    if (random() < .5) return pool[Math.floor(random() * pool.length)].action;
  }
  scored.sort((a, b) => b.score - a.score);
  return scored[0].action;
}
