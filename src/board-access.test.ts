import test from 'node:test';
import assert from 'node:assert/strict';
import { nextSpot, type BoardSpot } from './board-access.js';
import { mineCellLabel } from './mines.js';
import { reversiCellLabel, reversiMoveText, type ReversiDisc } from './reversi.js';
import { FOUR_COLUMNS, FOUR_ROWS, fourColumnLabel, type FourDisc } from './fourrow.js';
import { SolitaireGame, cardName, solitaireSpots, topRowLayout, type Card } from './solitaire.js';
import { translateArcadeText } from './i18n.js';

const grid = (columns: number, rows: number): BoardSpot[] => Array.from({ length: columns * rows }, (_, index) => ({
  key: String(index), x: (index % columns) * 10, y: Math.floor(index / columns) * 10, width: 10, height: 10, label: '',
}));

test('arrow keys move one square at a time on a grid and stop at the edge', () => {
  const spots = grid(3, 3);
  assert.equal(nextSpot(spots, '4', 'up')?.key, '1');
  assert.equal(nextSpot(spots, '4', 'down')?.key, '7');
  assert.equal(nextSpot(spots, '4', 'left')?.key, '3');
  assert.equal(nextSpot(spots, '4', 'right')?.key, '5');
  assert.equal(nextSpot(spots, '2', 'right'), null, 'no wrapping off the edge');
  assert.equal(nextSpot(spots, '0', 'up'), null);
  assert.equal(nextSpot(spots, 'gone', 'up')?.key, '0', 'a lost focus starts at the first spot');
});

test('arrow keys find the neighbouring pile on an uneven table', () => {
  // A short column next to a long one: Right from the bottom card lands on the other column, not back up.
  const spots: BoardSpot[] = [
    { key: 'a-top', x: 0, y: 0, width: 90, height: 30, label: '' },
    { key: 'a-bottom', x: 0, y: 30, width: 90, height: 120, label: '' },
    { key: 'b-only', x: 100, y: 0, width: 90, height: 120, label: '' },
    { key: 'c-deep', x: 200, y: 200, width: 90, height: 120, label: '' },
  ];
  assert.equal(nextSpot(spots, 'a-bottom', 'right')?.key, 'b-only');
  assert.equal(nextSpot(spots, 'a-top', 'down')?.key, 'a-bottom');
  assert.equal(nextSpot(spots, 'b-only', 'left')?.key, 'a-bottom', 'the card level with it, not the strip above');
});

test('a minesweeper square says where it is and what is known about it', () => {
  const cell = (props: Partial<{ mine: boolean; revealed: boolean; flagged: boolean; adjacent: number }>) => ({
    mine: false, revealed: false, flagged: false, adjacent: 0, ...props,
  });
  const game = { columns: 3, cells: [cell({}), cell({ flagged: true }), cell({ revealed: true }), cell({ revealed: true, adjacent: 1 }),
    cell({ revealed: true, adjacent: 3 }), cell({ revealed: true, mine: true })] };
  assert.deepEqual(game.cells.map((_, index) => mineCellLabel(game as never, index)), [
    'Row 1, column 1: hidden', 'Row 1, column 2: flagged', 'Row 1, column 3: clear',
    'Row 2, column 1: 1 mine next to it', 'Row 2, column 2: 3 mines next to it', 'Row 2, column 3: mine',
  ]);
});

test('a reversi square names its disc, and marks where the player can play', () => {
  const board = Array<ReversiDisc>(64).fill(0);
  board[27] = 1; board[28] = 2;
  assert.equal(reversiCellLabel(board, 27, false), 'Row 4, column 4: Mint');
  assert.equal(reversiCellLabel(board, 28, false), 'Row 4, column 5: Coral');
  assert.equal(reversiCellLabel(board, 29, true), 'Row 4, column 6: empty, you can play here');
  assert.equal(reversiMoveText(board, 28, 2), 'Coral played row 4, column 5, flipping 2.');
});

test('a four-in-a-row column reads its room left and its discs from the bottom up', () => {
  const board = Array<FourDisc>(FOUR_COLUMNS * FOUR_ROWS).fill(0);
  const bottom = (column: number, height: number): number => (FOUR_ROWS - 1 - height) * FOUR_COLUMNS + column;
  board[bottom(2, 0)] = 1; board[bottom(2, 1)] = 2;
  for (let height = 0; height < FOUR_ROWS; height++) board[bottom(4, height)] = height % 2 ? 2 : 1;
  board[bottom(5, 0)] = 2;
  for (let height = 0; height < FOUR_ROWS - 1; height++) board[bottom(6, height)] = 1;
  assert.equal(fourColumnLabel(board, 0), 'Column 1: 6 spaces free');
  assert.equal(fourColumnLabel(board, 2), 'Column 3: 4 spaces free. From the bottom: Mint, Coral');
  assert.equal(fourColumnLabel(board, 4), 'Column 5: full. From the bottom: Mint, Coral, Mint, Coral, Mint, Coral');
  assert.equal(fourColumnLabel(board, 6), 'Column 7: 1 space free. From the bottom: Mint, Mint, Mint, Mint, Mint');
});

test('the solitaire table offers every pile and face-up card, never a face-down one', () => {
  const game = new SolitaireGame();
  game.deal(() => 0.5, 1);
  const spots = solitaireSpots(game, topRowLayout(false, 'joystick-left'), null);
  const labels = spots.map(spot => spot.label);
  assert.equal(labels[0], 'Stock: 24 cards');
  assert.equal(labels[1], 'Waste: empty');
  assert.deepEqual(labels.slice(2, 6), ['Foundation 1: empty', 'Foundation 2: empty', 'Foundation 3: empty', 'Foundation 4: empty']);
  // Seven columns, each showing only its top card.
  const columns = labels.slice(6);
  assert.equal(columns.length, 7);
  assert.match(columns[0], /^Column 1: (Ace|[2-9]|10|Jack|Queen|King) of (spades|hearts|diamonds|clubs)$/);
  assert.match(columns[6], /^Column 7: .+, covering 6 face-down cards$/);
  // Left to right across the top, then column by column.
  assert.deepEqual(spots.slice(0, 6).map(spot => spot.x), [...spots.slice(0, 6).map(spot => spot.x)].sort((a, b) => a - b));

  const held = solitaireSpots(game, topRowLayout(false, 'joystick-left'), { pile: 'tableau', index: 6, card: 6 });
  assert.equal(held.find(spot => spot.key === 'column-6-6')?.pressed, true, 'a picked-up card says so');
});

test('cards are named in words, and a picked-up run lists every card', () => {
  const card = (suit: Card['suit'], rank: number): Card => ({ suit, rank, up: true });
  assert.equal(cardName(card(1, 12)), 'Queen of hearts');
  assert.equal(cardName(card(0, 1)), 'Ace of spades');
  assert.equal(cardName(card(3, 10)), '10 of clubs');
});

test('board labels and spoken moves read in Romanian', () => {
  const cases: [string, string][] = [
    ['Row 2, column 3: 2 mines next to it', 'Rândul 2, coloana 3: 2 mine alături'],
    ['Row 1, column 1: hidden', 'Rândul 1, coloana 1: acoperit'],
    ['Row 4, column 6: empty, you can play here', 'Rândul 4, coloana 6: gol, poți juca aici'],
    ['flagged', 'cu steag'],
    ['Column 3: 1 space free. From the bottom: Mint, Coral', 'Coloana 3: 1 loc liber. De jos în sus: Mint, Coral'],
    ['Column 5: full', 'Coloana 5: plină'],
    ['Column 2: Queen of hearts, covering 1 face-down card', 'Coloana 2: Damă de inimă roșie, peste 1 carte cu fața în jos'],
    ['Column 4: empty', 'Coloana 4: gol'],
    ['Stock: 24 cards', 'Pachet: 24 cărți'],
    ['Waste: 7 of clubs', 'Cărți trase: 7 de treflă'],
    ['Foundation 2: Ace of spades', 'Fundația 2: As de pică'],
    ['Picked up King of diamonds, Queen of spades. Choose where it goes.', 'Ai ridicat Popă de romb, Damă de pică. Alege unde o pui.'],
    ['Drew Jack of hearts.', 'Ai tras Valet de inimă roșie.'],
    ['Minesweeper field', 'Câmpul de mine'],
    ['No move there.', 'Nicio mutare acolo.'],
  ];
  for (const [english, romanian] of cases) assert.equal(translateArcadeText(english, 'ro'), romanian, english);
  assert.equal(translateArcadeText('Coral played row 4, column 5, flipping 2. Mint to play.', 'ro'),
    'Coral a jucat rândul 4, coloana 5, întorcând 2. Mint mută.');
  assert.match(translateArcadeText('Mint dropped in column 4. Coral bot is thinking…', 'ro'), /^Mint a pus în coloana 4\. (?!Coral bot)/);
});
