import test from 'node:test';
import assert from 'node:assert/strict';
import { createSepticaDeck, SepticaGame, type SepticaCard } from './septica.js';

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
