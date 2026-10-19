import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HEX_CELLS,
  HEX_COLS,
  HEX_FIELDS,
  HEX_ROUND_LIMIT,
  HEX_UNITS,
  HexClashGame,
  chooseHexAction,
  damageRange,
  hexBehind,
  hexDistance,
  hexIndex,
  hexNeighbors,
  killsFor,
  normalizeHexSnapshot,
  stackHealth,
  type HexBotLevel,
  type HexFieldId,
  type HexStack,
  type HexUnitId,
} from './hexclash.js';

function seeded(seed = 11): () => number {
  let state = seed;
  return () => { state = (state * 16807) % 2147483647; return state / 2147483647; };
}

/** An empty field with just the given stacks, Mint's first stack to act. */
function arena(stacks: [HexUnitId, 1 | 2, number, number, number][], random = seeded()): HexClashGame {
  const game = new HexClashGame(random);
  game.setup('kingdom', 'meadow', 'duel');
  game.obstacles = new Set();
  game.stacks = stacks.map(([unit, side, count, col, row], index): HexStack => ({
    id: index + 1, side, unit, count, startCount: count, topHp: HEX_UNITS[unit].hp, pos: hexIndex(col, row),
    shots: HEX_UNITS[unit].shots, retaliationsLeft: HEX_UNITS[unit].retaliations, defending: false, waited: false,
  }));
  game.queue = game.stacks.map(stack => stack.id);
  return game;
}

test('hex geometry: six neighbours inside the board, distance and the hex behind', () => {
  const centre = hexIndex(5, 4);
  assert.equal(hexNeighbors(centre).length, 6);
  assert.ok(hexNeighbors(centre).every(next => hexDistance(centre, next) === 1));
  assert.equal(hexNeighbors(hexIndex(0, 0)).length, 2, 'a corner has two neighbours');
  assert.equal(hexDistance(hexIndex(0, 4), hexIndex(10, 4)), 10);
  assert.equal(hexDistance(hexIndex(0, 0), hexIndex(0, 8)), 8, 'each row down is one step');
  assert.equal(hexDistance(hexIndex(0, 0), hexIndex(4, 8)), 8, 'and drifts half a hex sideways for free');
  for (const next of hexNeighbors(centre)) {
    const behind = hexBehind(next, centre);
    assert.equal(hexDistance(next, behind), 2, 'straight through the target');
    assert.equal(hexDistance(centre, behind), 1);
  }
});

test('every battlefield leaves every open hex reachable from both deployment edges', () => {
  for (const field of Object.keys(HEX_FIELDS) as HexFieldId[]) {
    const blocked = new Set(HEX_FIELDS[field].map(([col, row]) => hexIndex(col, row)));
    const seen = new Set([hexIndex(0, 0)]);
    const queue = [hexIndex(0, 0)];
    while (queue.length) for (const next of hexNeighbors(queue.shift()!)) if (!blocked.has(next) && !seen.has(next)) { seen.add(next); queue.push(next); }
    assert.equal(seen.size, HEX_CELLS - blocked.size, `${field} is connected`);
    for (const [col] of HEX_FIELDS[field]) assert.ok(col >= 2 && col <= HEX_COLS - 3, `${field} keeps the deployment columns clear`);
  }
});

test('both armies deploy on their own edge with the same budget', () => {
  const game = new HexClashGame(seeded());
  for (const choice of ['kingdom', 'wild', 'random'] as const) {
    game.setup(choice, 'forest', 'bot');
    assert.equal(game.alive(1).length, 5);
    assert.equal(game.alive(2).length, 5);
    const worth = (side: 1 | 2): number => game.alive(side).reduce((sum, stack) => sum + stack.count * HEX_UNITS[stack.unit].value, 0);
    assert.ok(Math.abs(worth(1) - worth(2)) / worth(1) < .25, `${choice}: ${worth(1)} vs ${worth(2)}`);
    assert.ok(game.alive(1).every(stack => stack.pos % HEX_COLS === 0) && game.alive(2).every(stack => stack.pos % HEX_COLS === HEX_COLS - 1));
  }
});

test('faster stacks act first each round', () => {
  const game = new HexClashGame(seeded());
  game.setup('kingdom', 'meadow', 'duel');
  const speeds = game.queue.map(id => HEX_UNITS[game.stack(id)!.unit].speed);
  assert.deepEqual(speeds, [...speeds].sort((a, b) => b - a));
  assert.equal(game.active!.unit, 'dragon', 'the dragon is the fastest unit on the field');
});

test('walkers go round obstacles and other stacks; flyers go over them', () => {
  const game = arena([['spear', 1, 10, 3, 4], ['griffin', 1, 5, 3, 6], ['ogre', 2, 3, 9, 4]]);
  game.obstacles = new Set([hexIndex(4, 4), hexIndex(4, 3), hexIndex(4, 5), hexIndex(3, 3), hexIndex(3, 5)]);
  const spear = game.reach();
  assert.ok(!spear.has(hexIndex(4, 4)), 'cannot stand on a rock');
  assert.ok(!spear.has(hexIndex(5, 4)) || spear.get(hexIndex(5, 4))!.length - 1 > 2, 'has to walk round the wall');
  assert.ok([...spear.keys()].every(hex => spear.get(hex)!.length - 1 <= HEX_UNITS.spear.speed));
  game.queue = [2, 1, 3];
  const griffin = game.reach();
  assert.ok(griffin.has(hexIndex(5, 4)), 'a griffin flies over the rocks');
  assert.ok(!griffin.has(hexIndex(3, 4)), 'but never lands on another stack');
});

test('damage scales with attack over defense, and defending softens the blow', () => {
  const knights: HexStack = arena([['knight', 1, 10, 0, 0]]).stacks[0];
  const goblins: HexStack = arena([['goblin', 2, 50, 0, 0]]).stacks[0];
  const ogres: HexStack = arena([['ogre', 2, 10, 0, 0]]).stacks[0];
  const [low, high] = damageRange(knights, goblins);
  assert.ok(low > 10 * 6 && high > 10 * 10, 'attack 11 against defense 2 hits harder than the base');
  const [againstOgres] = damageRange(knights, ogres);
  assert.ok(againstOgres < low, 'tougher defenders take less');
  assert.ok(damageRange(knights, { ...ogres, defending: true })[0] < againstOgres, 'defending stacks take less still');
  assert.ok(damageRange(knights, goblins, { hexesMoved: 6 })[0] > low, 'a long charge hits harder');
});

test('a stack loses whole creatures and keeps a wounded one on top', () => {
  const game = arena([['spear', 1, 1, 4, 4], ['ogre', 2, 5, 5, 4]]);
  const ogres = game.stacks[1];
  assert.equal(stackHealth(ogres), 225);
  assert.equal(killsFor(ogres, 44), 0);
  assert.equal(killsFor(ogres, 45), 1);
  assert.equal(killsFor(ogres, 1000), 5);
});

test('melee: the target strikes back once per round, griffins twice, and not after being wiped out', () => {
  // Row 3 is odd, so the griffin at (5,3) touches (5,4), (5,2) and (6,4).
  const game = arena([['spear', 1, 30, 5, 4], ['spear', 1, 30, 5, 2], ['griffin', 2, 5, 5, 3], ['spear', 1, 30, 6, 4]]);
  const griffins = game.stacks[2];
  assert.ok(game.act({ type: 'attack', target: 3, from: hexIndex(5, 4) }));
  assert.ok(game.events.some(event => event.kind === 'hit' && event.retaliation), 'struck back');
  assert.equal(griffins.retaliationsLeft, 1);
  assert.ok(game.act({ type: 'attack', target: 3, from: hexIndex(5, 2) }));
  assert.equal(griffins.retaliationsLeft, 0, 'griffins answer twice');
  game.queue = [4, 3];
  game.act({ type: 'attack', target: 3, from: hexIndex(6, 4) });
  assert.ok(!game.events.some(event => event.kind === 'hit' && event.retaliation), 'no third answer this round');
});

test('wolves bite twice and the second bite is not answered', () => {
  const game = arena([['wolf', 1, 20, 4, 4], ['spear', 2, 40, 5, 4]]);
  game.act({ type: 'attack', target: 2, from: hexIndex(4, 4) });
  const hits = game.events.filter(event => event.kind === 'hit');
  assert.deepEqual(hits.map(event => event.kind === 'hit' && [event.by, event.retaliation]), [[1, false], [2, true], [1, false]]);
});

test('shooters fire across the field, at half strength with an enemy beside them; mages do not care', () => {
  const game = arena([['archer', 1, 20, 0, 4], ['ogre', 2, 4, 10, 4], ['mage', 1, 10, 0, 0]]);
  assert.ok(game.legalActions().some(action => action.type === 'shoot'));
  assert.ok(!game.legalActions().some(action => action.type === 'attack'), 'a shooter with arrows shoots');
  game.act({ type: 'shoot', target: 2 });
  assert.equal(game.stacks[0].shots, HEX_UNITS.archer.shots - 1);
  assert.ok(!game.events.some(event => event.kind === 'hit' && event.retaliation), 'nobody strikes back at range');
  const archers = game.stacks[0];
  const ogres = game.stacks[1];
  const free = damageRange(archers, ogres, { ranged: true }, false);
  const blocked = damageRange(archers, ogres, { ranged: true }, true);
  assert.ok(Math.abs(blocked[1] - free[1] / 2) <= 1, `blocked archers do half: ${blocked[1]} of ${free[1]}`);
  const mages = game.stacks[2];
  assert.deepEqual(damageRange(mages, ogres, { ranged: true }, true), damageRange(mages, ogres, { ranged: true }, false));
});

test('dragon fire burns the stack behind the target, friend or foe', () => {
  const game = arena([['dragon', 1, 2, 3, 4], ['spear', 2, 20, 4, 4], ['archer', 2, 20, 5, 4]]);
  assert.equal(hexBehind(hexIndex(3, 4), hexIndex(4, 4)), hexIndex(5, 4));
  game.act({ type: 'attack', target: 2, from: hexIndex(3, 4) });
  assert.ok(game.events.some(event => event.kind === 'hit' && event.breath && event.id === 3));
});

test('waiting moves a stack to the end of the round, once; defending lasts until its next turn', () => {
  const game = arena([['spear', 1, 10, 0, 0], ['spear', 2, 10, 10, 0], ['spear', 1, 10, 0, 8]]);
  assert.ok(game.act({ type: 'wait' }));
  assert.deepEqual(game.queue, [2, 3, 1]);
  game.act({ type: 'defend' });
  assert.equal(game.stacks[1].defending, true);
  game.act({ type: 'defend' });
  assert.equal(game.active!.id, 1);
  assert.ok(!game.legalActions().some(action => action.type === 'wait'), 'no second wait in a round');
  game.act({ type: 'defend' });
  assert.equal(game.round, 2);
  assert.equal(game.active!.id, 2, 'on a speed tie Coral goes first in even rounds');
  assert.equal(game.stacks[1].defending, false, 'the stance ends when its turn comes round');
});

test('illegal actions change nothing', () => {
  const game = arena([['spear', 1, 10, 0, 0], ['spear', 2, 10, 10, 8]]);
  const before = JSON.stringify(game.snapshot());
  assert.equal(game.act({ type: 'move', to: hexIndex(10, 0) }), false, 'too far');
  assert.equal(game.act({ type: 'attack', target: 2, from: hexIndex(9, 8) }), false, 'out of reach');
  assert.equal(game.act({ type: 'shoot', target: 2 }), false, 'no arrows');
  assert.equal(game.act({ type: 'attack', target: 1, from: hexIndex(1, 0) }), false, 'not your own side');
  assert.equal(JSON.stringify(game.snapshot()), before);
});

test('the battle ends when one side is gone, and drags on no longer than the round limit', () => {
  const game = arena([['dragon', 1, 5, 4, 4], ['goblin', 2, 1, 5, 4]]);
  game.act({ type: 'attack', target: 2, from: hexIndex(4, 4) });
  assert.equal(game.phase, 'finished');
  assert.equal(game.winner, 1);
  assert.equal(game.wins[1], 1);
  assert.match(game.statusText(), /Mint wins the battle!/);

  const stalemate = arena([['spear', 1, 10, 0, 0], ['spear', 2, 5, 10, 8]]);
  for (let turn = 0; turn < HEX_ROUND_LIMIT * 2 + 2 && stalemate.phase === 'playing'; turn++) stalemate.act({ type: 'defend' });
  assert.equal(stalemate.phase, 'finished');
  assert.equal(stalemate.winner, 1, 'the stronger side left standing wins');
});

test('a state survives the trip to an online guest, and junk is refused', () => {
  const game = new HexClashGame(seeded(3));
  game.setup('random', 'ruins', 'duel');
  game.act(chooseHexAction(game, 'normal', seeded(4)));
  const copy = new HexClashGame(seeded(9));
  assert.ok(copy.restore(JSON.parse(JSON.stringify(game.snapshot()))));
  assert.deepEqual(copy.snapshot(), game.snapshot());
  assert.equal(normalizeHexSnapshot({ stacks: [{ unit: 'tank' }], obstacles: [], queue: [] }), null);
  assert.equal(normalizeHexSnapshot({ ...game.snapshot(), queue: [99] }), null, 'the queue names only real stacks');
  assert.equal(normalizeHexSnapshot('x'), null);
});

function battle(levels: Record<1 | 2, HexBotLevel>, choice: 'kingdom' | 'wild', field: HexFieldId, seed: number): 0 | 1 | 2 | null {
  const random = seeded(seed);
  const game = new HexClashGame(random);
  game.setup(choice, field, 'duel');
  for (let turn = 0; turn < 3000 && game.phase === 'playing'; turn++) {
    const action = chooseHexAction(game, levels[game.active!.side], random);
    assert.ok(game.act(action), `the bot picked an illegal ${action.type}`);
  }
  assert.equal(game.phase, 'finished');
  return game.winner;
}

test('bots only play legal actions and every battle ends', () => {
  for (const level of ['easy', 'normal', 'hard'] as const) {
    for (const field of Object.keys(HEX_FIELDS) as HexFieldId[]) battle({ 1: level, 2: level }, 'kingdom', field, 5);
  }
});

test('the hard bot beats the easy one, and the factions are roughly even', () => {
  let hard = 0;
  let kingdom = 0;
  let games = 0;
  for (let seed = 1; seed <= 12; seed++) {
    for (const field of Object.keys(HEX_FIELDS) as HexFieldId[]) {
      if (battle({ 1: 'hard', 2: 'easy' }, seed % 2 ? 'kingdom' : 'wild', field, seed) === 1) hard++;
      const choice = seed % 2 ? 'kingdom' : 'wild';
      if (battle({ 1: 'normal', 2: 'normal' }, choice, field, seed + 100) === (choice === 'kingdom' ? 1 : 2)) kingdom++;
      games++;
    }
  }
  assert.ok(hard >= games * .8, `hard won only ${hard} of ${games}`);
  assert.ok(kingdom >= games * .25 && kingdom <= games * .75, `Kingdom won ${kingdom} of ${games}`);
});

test('a bot decision is quick even with full armies', () => {
  const game = new HexClashGame(seeded(2));
  game.setup('random', 'forest', 'bot');
  const started = performance.now();
  for (let i = 0; i < 10 && game.phase === 'playing'; i++) game.act(chooseHexAction(game, 'hard', seeded(i)));
  assert.ok(performance.now() - started < 1500, 'ten hard decisions took too long');
});

test('every line a battle produces reads in Romanian', async () => {
  const { translateArcadeText } = await import('./i18n.js');
  const { previewText, infoText } = await import('./hexclash-ui.js');
  const lines = new Set<string>();
  for (const choice of ['kingdom', 'wild', 'random'] as const) {
    const random = seeded(choice.length);
    const game = new HexClashGame(random);
    game.setup(choice, 'forest', 'duel');
    for (let turn = 0; turn < 400 && game.phase === 'playing'; turn++) {
      lines.add(game.statusText());
      const stack = game.active!;
      lines.add(infoText(stack));
      for (const enemy of game.alive(stack.side === 1 ? 2 : 1)) {
        if (game.canShoot(stack)) lines.add(previewText(game, enemy, stack.pos, [stack.pos]));
        for (const [from, path] of game.attackHexes(enemy)) lines.add(previewText(game, enemy, from, path));
        lines.add(`${HEX_UNITS[enemy.unit].name} are out of reach.`);
      }
      game.act(turn % 7 === 3 ? { type: 'wait' } : turn % 11 === 5 ? { type: 'defend' } : chooseHexAction(game, 'normal', random));
      game.log.forEach(line => lines.add(line));
    }
    lines.add(game.statusText());
  }
  lines.add('Row 3, column 7: Coral Ogres ×4, acting');
  lines.add('Row 1, column 2: empty, in reach');
  lines.add('Round 12');
  const untranslated = [...lines].filter(line => translateArcadeText(line, 'ro') === line);
  assert.deepEqual(untranslated.slice(0, 5), [], 'lines left in English');
  assert.ok(lines.size > 200, `only ${lines.size} lines were checked`);
  assert.equal(translateArcadeText('Ogres → Spearmen: 40 damage, 1 killed.', 'ro'), 'Căpcăuni → Lăncieri: 40 daune, 1 ucis.');
  assert.equal(translateArcadeText('Row 3, column 7: Coral Ogres ×4, acting', 'ro'), 'Rândul 3, coloana 7: Căpcăuni Coral ×4, la mutare');
});
