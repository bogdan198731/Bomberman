import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CARD_H,
  CARD_W,
  SolitaireGame,
  TABLE_HEIGHT,
  isDealStuck,
  normalizeSolitaireSession,
  tableauSpots,
  topRowLayout,
  wasteFanX,
  type Card,
  type Suit,
} from './solitaire.js';

function seeded(seed = 23): () => number {
  let state = seed;
  return () => { state = (state * 16807) % 2147483647; return state / 2147483647; };
}

const card = (suit: Suit, rank: number, up = true): Card => ({ suit, rank, up });
const allCards = (game: SolitaireGame): Card[] =>
  [...game.stock, ...game.waste, ...game.foundations.flat(), ...game.tableau.flat()];

/** A table with nothing on it, for building exact positions. */
function emptyTable(): SolitaireGame {
  const game = new SolitaireGame(seeded());
  game.stock = []; game.waste = [];
  game.foundations = [[], [], [], []];
  game.tableau = [[], [], [], [], [], [], []];
  return game;
}

test('a deal uses one full deck in the classic shape', () => {
  const game = new SolitaireGame(seeded(5));
  const cards = allCards(game);
  assert.equal(cards.length, 52);
  assert.equal(new Set(cards.map(c => c.suit * 13 + c.rank)).size, 52, 'no duplicates');
  game.tableau.forEach((pile, column) => {
    assert.equal(pile.length, column + 1, `column ${column} holds ${column + 1}`);
    pile.forEach((c, i) => assert.equal(c.up, i === column, 'only the top card is face up'));
  });
  assert.equal(game.stock.length, 24);
  assert.equal(game.waste.length, 0);
});

test('drawing turns one or three cards, then recycles the waste', () => {
  const one = new SolitaireGame(seeded(), 1);
  one.draw();
  assert.equal(one.waste.length, 1);
  assert.equal(one.waste[0].up, true);

  const three = new SolitaireGame(seeded(), 3);
  three.draw();
  assert.equal(three.waste.length, 3);
  while (three.stock.length) three.draw();
  assert.equal(three.waste.length, 24);
  three.draw();
  assert.equal(three.stock.length, 24, 'the waste goes back to the stock');
  assert.ok(three.stock.every(c => !c.up), 'face down again');

  const empty = emptyTable();
  assert.equal(empty.draw(), false, 'nothing to draw');
});

test('foundations build up by suit from the ace', () => {
  const game = emptyTable();
  assert.equal(game.canPlaceOnFoundation(card(1, 1), 0), true, 'ace starts a pile');
  assert.equal(game.canPlaceOnFoundation(card(1, 2), 0), false, 'nothing else starts one');
  game.foundations[0] = [card(1, 1)];
  assert.equal(game.canPlaceOnFoundation(card(1, 2), 0), true);
  assert.equal(game.canPlaceOnFoundation(card(2, 2), 0), false, 'same suit only');
  assert.equal(game.canPlaceOnFoundation(card(1, 3), 0), false, 'one step at a time');
});

test('columns build down in alternating colours, and only a king fills a gap', () => {
  const game = emptyTable();
  assert.equal(game.canPlaceOnTableau(card(0, 13), 0), true);
  assert.equal(game.canPlaceOnTableau(card(0, 12), 0), false);
  game.tableau[0] = [card(0, 9)]; // black nine
  assert.equal(game.canPlaceOnTableau(card(1, 8), 0), true, 'red eight');
  assert.equal(game.canPlaceOnTableau(card(3, 8), 0), false, 'not black on black');
  assert.equal(game.canPlaceOnTableau(card(1, 7), 0), false, 'not two steps down');
});

test('a run moves together and the card it uncovers turns over', () => {
  const game = emptyTable();
  game.tableau[0] = [card(2, 4, false), card(0, 9), card(1, 8), card(3, 7)];
  game.tableau[1] = [card(1, 10)];
  assert.equal(game.move({ pile: 'tableau', index: 0, card: 1 }, { pile: 'tableau', index: 1 }), true);
  assert.deepEqual(game.tableau[1].map(c => c.rank), [10, 9, 8, 7]);
  assert.equal(game.tableau[0].length, 1);
  assert.equal(game.tableau[0][0].up, true, 'the hidden four is revealed');
  assert.equal(game.move({ pile: 'tableau', index: 0, card: 0 }, { pile: 'tableau', index: 0 }), false, 'not onto itself');
});

test('face-down cards cannot be lifted, and foundations only give back one card', () => {
  const game = emptyTable();
  game.tableau[0] = [card(0, 5, false), card(1, 4)];
  assert.deepEqual(game.lift({ pile: 'tableau', index: 0, card: 0 }), []);
  game.foundations[0] = [card(0, 1), card(0, 2)];
  game.tableau[1] = [card(1, 3)];
  assert.equal(game.move({ pile: 'foundation', index: 0 }, { pile: 'tableau', index: 1 }), true, 'a foundation card can come back down');
  assert.equal(game.move({ pile: 'foundation', index: 0 }, { pile: 'foundation', index: 1 }), false, 'but not across foundations');
});

test('undo takes back moves one at a time, including a reveal', () => {
  const game = emptyTable();
  game.tableau[0] = [card(2, 4, false), card(0, 9)];
  game.tableau[1] = [card(1, 10)];
  game.stock = [card(3, 1, false)];
  const before = JSON.stringify(game.tableau);
  game.move({ pile: 'tableau', index: 0, card: 1 }, { pile: 'tableau', index: 1 });
  game.draw();
  assert.equal(game.moves, 2);
  assert.equal(game.undo(), true);
  assert.equal(game.waste.length, 0, 'the draw is undone');
  assert.equal(game.undo(), true);
  assert.equal(JSON.stringify(game.tableau), before, 'the move and the reveal are undone');
  assert.equal(game.moves, 0);
  assert.equal(game.undo(), false, 'nothing left to undo');
});

test('a double-tap prefers the foundation over a column', () => {
  const game = emptyTable();
  game.tableau[0] = [card(1, 1)];
  game.tableau[1] = [card(0, 2)];
  assert.deepEqual(game.bestTarget({ pile: 'tableau', index: 0, card: 0 }), { pile: 'foundation', index: 0 });
});

test('clearing the table wins, and the rest finishes itself once nothing is hidden', () => {
  const game = emptyTable();
  for (let suit = 0; suit < 4; suit++) {
    game.foundations[suit] = Array.from({ length: 12 }, (_, i) => card(suit as Suit, i + 1));
    game.tableau[suit] = [card(suit as Suit, 13)];
  }
  assert.equal(game.canAutoComplete(), true);
  assert.equal(game.autoFoundation(10_000), 4);
  assert.equal(game.phase, 'won');
  assert.ok(game.score(10_000) >= 500);
  assert.match(game.statusText(10_000), /^Solved in \d+ moves/);
  assert.equal(game.draw(), false, 'nothing moves after a win');
});

test('even the longest possible column stays on the table', () => {
  const game = emptyTable();
  const pile: Card[] = [];
  for (let i = 0; i < 6; i++) pile.push(card(0, 1 + i, false));
  for (let rank = 13; rank >= 1; rank--) pile.push(card(rank % 2 ? 1 : 0, rank));
  game.tableau[6] = pile;
  const spots = tableauSpots(game.tableau);
  assert.equal(spots.length, 19);
  for (const spot of spots) assert.ok(spot.y + CARD_H <= TABLE_HEIGHT, `card at y=${Math.round(spot.y)} falls off the table`);
  const ys = spots.map(spot => spot.y);
  assert.ok(ys.every((y, i) => i === 0 || y > ys[i - 1]), 'cards still fan downward in order');
});

test('an unfinished game survives a reload; a broken save is refused', () => {
  const game = new SolitaireGame(seeded(31));
  game.draw(1_000);
  game.draw(2_000);
  const saved = JSON.parse(JSON.stringify(game.session(61_000)));
  const back = new SolitaireGame(seeded(99));
  assert.equal(back.restore(saved, 100_000), true);
  assert.deepEqual(back.tableau, game.tableau);
  assert.deepEqual(back.waste, game.waste);
  assert.equal(back.moves, 2);
  assert.equal(back.elapsed(100_000), 60, 'the clock resumes where it stopped');

  const dupe = { ...saved, stock: [...saved.stock.slice(1), saved.waste[0]] };
  const short = { ...saved, stock: saved.stock.slice(1) };
  const badFoundation = { ...saved, foundations: [[card(0, 5)], [], [], []], stock: saved.stock.filter((c: Card) => !(c.suit === 0 && c.rank === 5)) };
  for (const bad of [dupe, short, badFoundation, null, 'nope', { ...saved, tableau: saved.tableau.slice(1) }]) {
    assert.equal(normalizeSolitaireSession(bad), null, `accepted ${JSON.stringify(bad)?.slice(0, 50)}`);
  }
  assert.equal(new SolitaireGame().session(), null, 'an untouched deal is not saved');
});

test('a dead end is spotted: nothing can ever turn a hidden card or reach the foundations', () => {
  // A hidden ace under a lone 5 of hearts that fits nowhere; the stock holds only a 3 of clubs.
  const game = emptyTable();
  game.tableau[0] = [card(0, 1, false), card(1, 5)];
  game.stock = [card(3, 3, false)];
  assert.equal(isDealStuck(game, 1), true);
  // A 4 of clubs in the stock still fits on the 5, but that frees nothing: still stuck.
  game.stock = [card(3, 4, false)];
  assert.equal(isDealStuck(game, 1), true);
  // An ace in the stock can go home, so the deal is still open.
  game.stock = [card(1, 1, false)];
  assert.equal(isDealStuck(game, 1), false);
});

test('draw three can bury a card that draw one would reach', () => {
  const game = emptyTable();
  game.tableau[0] = [card(0, 1, false), card(1, 5)];
  // Drawn three at a time, the ace of hearts is always in the middle of the fan.
  game.stock = [card(3, 7, false), card(1, 1, false), card(3, 8, false)];
  assert.equal(isDealStuck(game, 3), true);
  assert.equal(isDealStuck(game, 1), false);
});

test('a card can come back off the foundations to unlock a column', () => {
  const game = emptyTable();
  // The 3 of spades is hidden under the 4 of hearts, which needs a black 5 to move onto...
  game.tableau[0] = [card(0, 3, false), card(1, 4)];
  // ...and the only black 5 sits on the foundations, above a red 6 it could come down onto.
  game.tableau[1] = [card(1, 6)];
  game.foundations[3] = [1, 2, 3, 4, 5].map(rank => card(3, rank));
  assert.equal(isDealStuck(game, 1), false, 'take the 5 of clubs down, put the 4 on it, flip the 3');
});

test('reaching a dead end ends the game for good: no more moves and no undo', () => {
  const game = emptyTable();
  game.tableau[0] = [card(0, 1, false), card(1, 5)];
  game.stock = [card(3, 3, false)];
  assert.equal(game.draw(1_000), true);
  assert.equal(game.phase, 'stuck');
  assert.match(game.statusText(), /No moves left/);
  assert.equal(game.draw(), false, 'a stopped game takes no more moves');
  assert.equal(game.score(), 0);
  assert.equal(game.session(), null, 'a dead end is not saved to resume');
  assert.equal(game.canUndo(), false, 'an ended game cannot be taken back');
  assert.equal(game.undo(), false);
  assert.equal(game.phase, 'stuck');
  assert.equal(game.move({ pile: 'tableau', index: 0, card: 1 }, { pile: 'tableau', index: 1 }), false);
  assert.match(game.statusText(), /Deal again/);
  assert.doesNotMatch(game.statusText(), /Undo/);
});

test('fresh deals are checked quickly and are almost never dead from the start', () => {
  const random = seeded(99);
  let stuck = 0;
  const started = Date.now();
  for (let i = 0; i < 100; i++) {
    const game = new SolitaireGame(random, i % 2 ? 3 : 1);
    if (isDealStuck(game, game.drawCount)) stuck++;
  }
  assert.ok(stuck <= 5, `${stuck} of 100 fresh deals were called dead`);
  assert.ok(Date.now() - started < 3_000, 'the check is cheap enough to run after every move');
});

test('on a phone the stock sits on the joystick side; desktop keeps it on the left', () => {
  const desktop = topRowLayout(false, 'joystick-right');
  assert.equal(desktop.deckSide, 'left');
  assert.ok(desktop.stockX < desktop.wasteX && desktop.wasteX < desktop.foundationX[0]);
  assert.deepEqual(topRowLayout(true, 'joystick-left'), desktop);

  const right = topRowLayout(true, 'joystick-right');
  assert.equal(right.deckSide, 'right');
  assert.ok(right.stockX > right.wasteX && right.wasteX > right.foundationX[3], 'stock, then waste, then foundations, right to left');
  assert.equal(right.stockX, desktop.foundationX[3], 'the stock takes the rightmost column');
});

test('a draw-three fan never runs into the stock or the foundations', () => {
  for (const row of [topRowLayout(false, 'joystick-right'), topRowLayout(true, 'joystick-right')]) {
    const xs = [0, 1, 2].map(i => wasteFanX(row, i, 3));
    // The playable card is drawn last and rightmost, so the cards under it still show their corner rank.
    assert.equal(xs[2], Math.max(...xs));
    const [left, right] = [Math.min(...xs), Math.max(...xs) + CARD_W];
    const others = [row.stockX, ...row.foundationX];
    for (const x of others) assert.ok(right <= x || left >= x + CARD_W, `fan ${left}-${right} overlaps a pile at ${x}`);
  }
});
