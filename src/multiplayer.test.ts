import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { OnlineRoom, isPlayerAction } from './multiplayer.js';
import { GameState, PowerUpType, TileType, type MapGrid } from './index.js';

function createOpenGrid(width: number = 9, height: number = 9): MapGrid {
  const tiles = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) =>
      x === 0 || y === 0 || x === width - 1 || y === height - 1
        ? TileType.WALL_INDESTRUCTIBLE
        : TileType.EMPTY
    )
  );
  return { width, height, tiles };
}

function createPlayingRoom(): OnlineRoom {
  const room = new OnlineRoom('TEST1');
  room.connectPlayer(1, 1_000);
  room.connectPlayer(2, 1_000);
  room.update(2_750);
  return room;
}

test('online room waits for two players before starting', () => {
  const room = new OnlineRoom('TEST1');
  room.connectPlayer(1, 1_000);
  assert.strictEqual(room.phase, 'waiting');

  room.connectPlayer(2, 1_000);
  assert.strictEqual(room.phase, 'countdown');
  assert.strictEqual(room.snapshot(1_700).overlayText, 'READY');

  room.update(2_750);
  assert.strictEqual(room.phase, 'playing');
});

test('each online client can move only its assigned player', () => {
  const room = createPlayingRoom();

  room.handleAction(1, { type: 'move', dx: 1, dy: 0 }, 3_000);

  assert.deepStrictEqual(
    { x: room.players[0].x, y: room.players[0].y },
    { x: 2, y: 1 }
  );
  assert.deepStrictEqual(
    { x: room.players[1].x, y: room.players[1].y },
    { x: 11, y: 11 }
  );
});

test('online bomb actions retain owner and player blast radius', () => {
  const room = createPlayingRoom();
  room.players[1].blastRadius = 4;

  room.handleAction(2, { type: 'bomb' }, 3_000);

  assert.strictEqual(room.gameState.bombs.length, 1);
  assert.strictEqual(room.gameState.bombs[0].ownerId, 2);
  assert.strictEqual(room.gameState.bombs[0].radius, 4);
});

test('room snapshots are JSON serializable and include both players', () => {
  const room = createPlayingRoom();
  const snapshot = room.snapshot(3_000);

  assert.strictEqual(snapshot.connectedPlayers.length, 2);
  assert.strictEqual(snapshot.players.length, 2);
  assert.doesNotThrow(() => JSON.stringify(snapshot));
});

test('either online player can start the next round', () => {
  const room = createPlayingRoom();

  room.handleAction(2, { type: 'restart' }, 4_000);

  assert.strictEqual(room.round, 2);
  assert.strictEqual(room.phase, 'countdown');
});

test('disconnecting a player pauses the room', () => {
  const room = createPlayingRoom();

  room.disconnectPlayer(2);

  assert.strictEqual(room.phase, 'waiting');
  assert.deepStrictEqual(room.snapshot().connectedPlayers, [1]);
});

test('network action validation rejects diagonal and malformed movement', () => {
  assert.strictEqual(isPlayerAction({ type: 'move', dx: 1, dy: 0 }), true);
  assert.strictEqual(isPlayerAction({ type: 'move', dx: 1, dy: 1 }), false);
  assert.strictEqual(isPlayerAction({ type: 'move', dx: 4, dy: 0 }), false);
  assert.strictEqual(isPlayerAction({ type: 'bomb' }), true);
  assert.strictEqual(isPlayerAction({ type: 'unknown' }), false);
});

test('bot mode immediately fills player two and starts a countdown', () => {
  const room = new OnlineRoom('BOT01');
  room.connectPlayer(1, 1_000);
  room.connectBot('normal', 1_000);

  assert.strictEqual(room.phase, 'countdown');
  assert.strictEqual(room.snapshot(1_000).botDifficulty, 'normal');
  assert.deepStrictEqual(room.snapshot(1_000).connectedPlayers, [1, 2]);
});

test('normal bot navigates to and collects an exposed power-up', () => {
  const room = new OnlineRoom('BOT02');
  room.connectPlayer(1, 1_000);
  room.connectBot('normal', 1_000);
  room.update(2_750);
  room.gameState.powerUps.set('10,11', PowerUpType.BOMB_UP);

  room.update(3_100);

  assert.strictEqual(room.players[1].x, 10);
  assert.strictEqual(room.players[1].maxBombs, 2);
  assert.strictEqual(room.gameState.powerUps.has('10,11'), false);
});

test('hard bot escapes a bomb before it detonates', () => {
  const room = new OnlineRoom('BOT03');
  room.connectPlayer(1, 1_000);
  room.connectBot('hard', 1_000);
  room.update(2_750);
  room.gameState = new GameState(createOpenGrid());
  room.players[1].x = 3;
  room.players[1].y = 3;
  room.gameState.placeBomb({ x: 3, y: 3 }, 1_000, 2, 2);

  room.update(3_500);

  assert.notDeepStrictEqual(
    { x: room.players[1].x, y: room.players[1].y },
    { x: 3, y: 3 }
  );
});

test('hard bot attacks only when its own bomb has an escape route', () => {
  const room = new OnlineRoom('BOT04');
  room.connectPlayer(1, 1_000);
  room.connectBot('hard', 1_000);
  room.update(2_750);
  room.gameState = new GameState(createOpenGrid());
  room.players[1].x = 3;
  room.players[1].y = 3;
  room.players[0].x = 3;
  room.players[0].y = 4;

  room.update(3_000);
  assert.strictEqual(room.gameState.bombs[0]?.ownerId, 2, 'bot plants when it can escape');

  const trapped = new OnlineRoom('BOT05');
  trapped.connectPlayer(1, 1_000);
  trapped.connectBot('hard', 1_000);
  trapped.update(2_750);
  trapped.gameState = new GameState(createOpenGrid());
  trapped.players[1].x = 5;
  trapped.players[1].y = 5;
  trapped.players[0].x = 5;
  trapped.players[0].y = 5;
  for (const { x, y } of [{ x: 4, y: 5 }, { x: 6, y: 5 }, { x: 5, y: 4 }, { x: 5, y: 6 }]) {
    trapped.gameState.grid[y][x] = TileType.WALL_INDESTRUCTIBLE;
  }

  trapped.update(3_000);
  assert.strictEqual(trapped.gameState.bombs.length, 0, 'bot refuses a suicidal bomb');
});

test('easy bot has a substantially slower reaction cadence than hard bot', () => {
  const easy = new OnlineRoom('BOT06');
  easy.connectPlayer(1, 1_000);
  easy.connectBot('easy', 1_000);
  easy.update(2_750);
  easy.update(3_300);
  const easyPosition = { x: easy.players[1].x, y: easy.players[1].y };
  easy.update(3_450);

  const hard = new OnlineRoom('BOT07');
  hard.connectPlayer(1, 1_000);
  hard.connectBot('hard', 1_000);
  hard.update(2_750);
  hard.update(3_300);
  const hardPosition = { x: hard.players[1].x, y: hard.players[1].y };
  hard.update(3_450);

  assert.deepStrictEqual({ x: easy.players[1].x, y: easy.players[1].y }, easyPosition);
  assert.notDeepStrictEqual({ x: hard.players[1].x, y: hard.players[1].y }, hardPosition);
});
