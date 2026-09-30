import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applySepticaOnlineState,
  createSepticaDeck,
  createSepticaOnlineState,
  SEPTICA_TRICK_REVEAL_MS,
  SepticaGame,
  shouldConfirmSepticaRestart,
  type SepticaCard,
} from './septica.js';

function card(rank: SepticaCard['rank'], suit: SepticaCard['suit'] = 'clubs'): SepticaCard {
  return { rank, suit, id: `${rank}-${suit}` };
}

test('Șeptică uses a 32-card deck and deals four cards each', () => {
  const game = new SepticaGame(() => .5);
  assert.equal(createSepticaDeck().length, 32);
  assert.equal(game.hands[1].length, 4);
  assert.equal(game.hands[2].length, 4);
  assert.equal(game.deck.length, 24);
});

test('Șeptică asks before discarding a deal only after play has begun', () => {
  const game = new SepticaGame(() => .5);
  assert.equal(shouldConfirmSepticaRestart(game), false);
  game.playCard(1, 0);
  assert.equal(shouldConfirmSepticaRestart(game), true);
  game.phase = 'finished';
  assert.equal(shouldConfirmSepticaRestart(game), false);
});

test('a seven cuts any opening card', () => {
  const game = new SepticaGame(() => .5);
  game.hands = { 1: [card('K')], 2: [card('7')] };
  game.deck = [];
  game.playCard(1, 0);
  game.playCard(2, 0);
  assert.equal(game.lastCutter, 2);
  assert.equal(game.phase, 'continue-choice');
});

test('a card matching the opening rank cuts', () => {
  const game = new SepticaGame(() => .5);
  game.hands = { 1: [card('9')], 2: [card('9', 'hearts')] };
  game.deck = [];
  game.playCard(1, 0);
  game.playCard(2, 0);
  assert.equal(game.lastCutter, 2);
});

test('a non-cutting response remains visible before the table is awarded', () => {
  const game = new SepticaGame(() => .5);
  game.hands = { 1: [card('10')], 2: [card('K')] };
  game.deck = [];
  game.playCard(1, 0);
  game.playCard(2, 0);

  assert.equal(SEPTICA_TRICK_REVEAL_MS, 1_000);
  assert.equal(game.phase, 'settling');
  assert.equal(game.table.length, 2);
  assert.equal(game.points[1], 0);
  assert.deepEqual(game.legalCardIndexes(1), []);
  assert.deepEqual(game.legalCardIndexes(2), []);
  assert.equal(game.settleTrick(), true);
  assert.equal(game.points[1], 1);
  assert.equal(game.lastTrickSummary, 'Mint takes 2 cards with the last cut · 1 point.');
  assert.equal(game.phase, 'finished');
  assert.equal(game.table.length, 0);
  assert.equal(game.settleTrick(), false);
});

test('a player can concede after being cut', () => {
  const game = new SepticaGame(() => .5);
  game.hands = { 1: [card('A')], 2: [card('7')] };
  game.deck = [];
  game.playCard(1, 0);
  game.playCard(2, 0);
  assert.equal(game.pass(1), true);
  assert.equal(game.points[2], 1);
});

test('only sevens or matching ranks can continue a cut battle', () => {
  const game = new SepticaGame(() => .5);
  game.hands = { 1: [card('K'), card('8'), card('7')], 2: [card('K', 'hearts')] };
  game.deck = [];
  game.playCard(1, 0);
  game.playCard(2, 0);
  assert.deepEqual(game.legalCardIndexes(1), [1]);
});

test('the responder must discard a card after the leader cuts back', () => {
  const game = new SepticaGame(() => .5);
  game.hands = {
    1: [card('A', 'spades'), card('A', 'clubs')],
    2: [card('A', 'hearts'), card('K', 'diamonds')],
  };
  game.deck = [];

  game.playCard(1, 0);
  game.playCard(2, 0);
  game.playCard(1, 0);

  assert.equal(game.currentPlayer, 2);
  assert.equal(game.phase, 'playing');
  assert.deepEqual(game.legalCardIndexes(2), [0]);
  assert.equal(game.pass(2), false);
  assert.equal(game.playCard(2, 0), true);
  assert.equal(game.phase, 'settling');
  assert.equal(game.table.length, 4);
  assert.equal(game.settleTrick(), true);
  assert.equal(game.table.length, 0);
  assert.equal(game.points[1], 3);
});

test('a forced response can cut and return the choice to the opening player', () => {
  const game = new SepticaGame(() => .5);
  game.hands = {
    1: [card('A', 'spades'), card('7', 'clubs'), card('9')],
    2: [card('A', 'hearts'), card('7', 'diamonds')],
  };
  game.deck = [];

  game.playCard(1, 0);
  game.playCard(2, 0);
  game.playCard(1, 0);
  game.playCard(2, 0);

  assert.equal(game.currentPlayer, 1);
  assert.equal(game.phase, 'continue-choice');
  assert.deepEqual(game.legalCardIndexes(1), []);
  assert.equal(game.pass(1), true);
  assert.equal(game.points[2], 2);
});

test('the last two deck cards are shared instead of given to one player', () => {
  const game = new SepticaGame(() => .5);
  game.hands = {
    1: [card('A', 'spades'), card('7', 'clubs'), card('A', 'clubs'), card('A', 'diamonds')],
    2: [card('A', 'hearts'), card('7', 'diamonds'), card('7', 'hearts'), card('K', 'spades')],
  };
  game.deck = [card('8'), card('9')];

  game.playCard(1, 0);
  game.playCard(2, 0);
  game.playCard(1, 0);
  game.playCard(2, 0);
  game.playCard(1, 0);
  game.playCard(2, 0);
  game.playCard(1, 0);
  game.playCard(2, 0);

  assert.equal(game.phase, 'settling');
  assert.equal(game.settleTrick(), true);
  assert.equal(game.deck.length, 0);
  assert.equal(game.hands[1].length, 1);
  assert.equal(game.hands[2].length, 1);
  assert.equal(game.currentPlayer, 1);
});

test('online snapshots reveal only the receiving player hand', () => {
  const hostGame = new SepticaGame(() => .5);
  hostGame.hands = {
    1: [card('A', 'spades'), card('10', 'hearts')],
    2: [card('7', 'clubs'), card('K', 'diamonds')],
  };
  hostGame.deck = [card('8'), card('9')];

  const guestState = createSepticaOnlineState(hostGame, 2);
  assert.deepEqual(guestState.hand, hostGame.hands[2]);
  assert.deepEqual(guestState.handCounts, { 1: 2 });
  assert.equal(guestState.deckCount, 2);
  assert.equal(JSON.stringify(guestState).includes('A-spades'), false);
  assert.equal(JSON.stringify(guestState).includes('10-hearts'), false);

  const guestGame = new SepticaGame(() => .5);
  applySepticaOnlineState(guestGame, guestState);
  assert.deepEqual(guestGame.hands[2], hostGame.hands[2]);
  assert.equal(guestGame.hands[1].length, 2);
  assert.equal(guestGame.deck.length, 2);
});

function seeded(seed: number): () => number {
  let state = seed;
  return () => { state = (state * 16807) % 2147483647; return state / 2147483647; };
}

test('three players drop two eights and four players use the full deck', () => {
  assert.equal(createSepticaDeck(3).length, 30);
  assert.equal(createSepticaDeck(3).filter(c => c.rank === '8').length, 2);
  assert.equal(createSepticaDeck(4).length, 32);
  for (const count of [3, 4] as const) {
    const game = new SepticaGame(() => .5, count);
    assert.deepEqual(game.players().map(p => game.hands[p].length), Array(count).fill(4));
    assert.equal(game.deck.length, createSepticaDeck(count).length - 4 * count);
    assert.equal(shouldConfirmSepticaRestart(game), false);
  }
});

test('with three players the trick goes round the table before it is decided', () => {
  const game = new SepticaGame(() => .5, 3);
  game.hands = { 1: [card('K')], 2: [card('9', 'hearts')], 3: [card('J', 'spades')] };
  game.deck = [];
  game.playCard(1, 0);
  assert.equal(game.currentPlayer, 2);
  game.playCard(2, 0);
  assert.equal(game.phase, 'playing', 'the third player still has to play');
  assert.equal(game.currentPlayer, 3);
  game.playCard(3, 0);
  assert.equal(game.phase, 'settling', 'nobody cut, so the leader keeps it');
  game.settleTrick();
  assert.equal(game.lastTrickSummary, 'Mint takes 3 cards with the last cut · no points.');
});

test('the last cut round the table wins, and the leader may cut back', () => {
  const game = new SepticaGame(() => .5, 3);
  game.hands = {
    1: [card('A'), card('7', 'hearts')],
    2: [card('7'), card('9')],
    3: [card('A', 'hearts'), card('10')],
  };
  game.deck = [];
  game.playCard(1, 0); // A leads
  game.playCard(2, 0); // 7 cuts
  game.playCard(3, 0); // A matches the lead: Sky cuts last
  assert.equal(game.lastCutter, 3);
  assert.equal(game.phase, 'continue-choice');
  assert.deepEqual(game.legalCardIndexes(1), [0], 'only the seven can carry on');
  game.playCard(1, 0);
  game.playCard(2, 0); // 9: no cut
  game.playCard(3, 0); // 10: no cut
  assert.equal(game.phase, 'settling');
  game.settleTrick();
  assert.equal(game.points[1], 3, 'Mint takes both aces and the ten');
  assert.equal(game.phase, 'finished');
  assert.equal(game.winner, 1);
  assert.equal(game.statusText(), 'Mint wins with 3 points!');
});

test('four players score as partners sitting opposite', () => {
  const game = new SepticaGame(() => .5, 4);
  assert.equal(game.teamOf(1), game.teamOf(3));
  assert.equal(game.teamOf(2), game.teamOf(4));
  assert.notEqual(game.teamOf(1), game.teamOf(2));
  game.points = { 1: 2, 2: 1, 3: 3, 4: 2 };
  assert.equal(game.sidePoints(1), 5);
  assert.equal(game.sidePoints(4), 3);
  game.hands = { 1: [], 2: [], 3: [], 4: [] };
  game.deck = [];
  game.table = [{ player: 1, card: card('9') }];
  game.lastCutter = 1;
  game.phase = 'settling';
  game.settleTrick();
  assert.equal(game.winner, 1);
  assert.equal(game.isWinner(3), true, 'the partner wins too');
  assert.equal(game.isWinner(2), false);
  assert.equal(game.statusText(), 'Mint & Sky win 5-3!');
});

test('a bot feeds points to a partner who holds the trick and never cuts them back', () => {
  const game = new SepticaGame(() => .5, 4);
  game.hands = {
    1: [card('K')],
    2: [card('8', 'hearts')],
    3: [card('9', 'spades'), card('A', 'hearts')],
    4: [card('J', 'diamonds')],
  };
  game.deck = [];
  game.playCard(1, 0);
  game.playCard(2, 0);
  assert.equal(game.currentPlayer, 3);
  game.botMove();
  assert.equal(game.table[2].card.id, 'A-hearts', 'Sky gives Mint the ace');
});

test('bot-only games of three and four finish with every card played and all points taken', () => {
  for (const count of [3, 4] as const) {
    for (let seed = 1; seed <= 30; seed++) {
      const game = new SepticaGame(seeded(seed), count);
      for (let step = 0; step < 500 && game.phase !== 'finished'; step++) {
        if (game.phase === 'settling') game.settleTrick(); else assert.equal(game.botMove(), true, `stuck at ${game.phase}`);
      }
      assert.equal(game.phase, 'finished', `${count} players, seed ${seed}`);
      assert.equal(game.players().reduce((sum, p) => sum + game.points[p], 0), 8);
      assert.ok(game.players().every(p => game.hands[p].length === 0));
    }
  }
});

test('an online snapshot always sets up a two-player table', () => {
  const host = new SepticaGame(() => .5);
  const guest = new SepticaGame(() => .5, 4);
  applySepticaOnlineState(guest, createSepticaOnlineState(host, 2));
  assert.equal(guest.playerCount, 2);
  assert.deepEqual(guest.players(), [1, 2]);
  assert.equal(guest.hands[1].length, 4);
});

test('in a four-seat online game each seat sees only its own hand', () => {
  const host = new SepticaGame(seeded(3), 4);
  for (const seat of [2, 3, 4] as const) {
    const view = createSepticaOnlineState(host, seat);
    assert.equal(view.playerCount, 4);
    assert.deepEqual(view.hand, host.hands[seat]);
    const text = JSON.stringify(view);
    for (const other of host.players().filter(p => p !== seat)) {
      for (const hidden of host.hands[other]) assert.equal(text.includes(hidden.id), false, `seat ${seat} sees ${hidden.id}`);
    }
    const guest = new SepticaGame(() => .5);
    applySepticaOnlineState(guest, view);
    assert.deepEqual(guest.players(), [1, 2, 3, 4]);
    assert.deepEqual(guest.players().map(p => guest.hands[p].length), [4, 4, 4, 4]);
    assert.deepEqual(guest.hands[seat], host.hands[seat]);
  }
});
