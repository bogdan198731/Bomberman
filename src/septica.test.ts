import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applySepticaOnlineState,
  createSepticaDeck,
  createSepticaOnlineState,
  SepticaGame,
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

test('a non-cutting response awards the table to the leader', () => {
  const game = new SepticaGame(() => .5);
  game.hands = { 1: [card('10')], 2: [card('K')] };
  game.deck = [];
  game.playCard(1, 0);
  game.playCard(2, 0);
  assert.equal(game.points[1], 1);
  assert.equal(game.phase, 'finished');
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
  assert.equal(guestState.opponentHandCount, 2);
  assert.equal(guestState.deckCount, 2);
  assert.equal(JSON.stringify(guestState).includes('A-spades'), false);
  assert.equal(JSON.stringify(guestState).includes('10-hearts'), false);

  const guestGame = new SepticaGame(() => .5);
  applySepticaOnlineState(guestGame, guestState);
  assert.deepEqual(guestGame.hands[2], hostGame.hands[2]);
  assert.equal(guestGame.hands[1].length, 2);
  assert.equal(guestGame.deck.length, 2);
});
