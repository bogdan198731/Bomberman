import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BALL_R,
  BRICK_ARENA_HEIGHT,
  BRICK_ARENA_WIDTH,
  BRICK_LEVELS,
  BrickBreakerGame,
  PADDLE_W,
  PADDLE_Y,
  START_LIVES,
  buildBricks,
} from './bricks.js';

/** update() caps a frame at 50ms, so longer spans are stepped frame by frame. */
function run(game: BrickBreakerGame, seconds: number): void {
  for (let t = 0; t < seconds; t += 1 / 60) game.update(1 / 60);
}

function seeded(seed = 13): () => number {
  let state = seed;
  return () => { state = (state * 16807) % 2147483647; return state / 2147483647; };
}

test('every wall fits the arena and leaves room above the paddle', () => {
  BRICK_LEVELS.forEach((level, index) => {
    const bricks = buildBricks(index + 1);
    assert.ok(bricks.some(brick => !brick.steel), `${level.name}: has something to break`);
    for (const brick of bricks) {
      assert.ok(brick.x >= 0 && brick.x + 72 <= BRICK_ARENA_WIDTH, `${level.name}: brick inside the arena`);
      assert.ok(brick.y + 24 < PADDLE_Y - 120, `${level.name}: bricks stop well above the paddle`);
    }
    level.rows.forEach(row => assert.equal(row.length, 10, `${level.name}: rows are 10 wide`));
  });
});

test('no breakable brick is sealed off behind steel', () => {
  BRICK_LEVELS.forEach(level => {
    const rows = [...level.rows, '..........']; // the open field above the paddle
    const seen = new Set<string>();
    const queue: [number, number][] = [];
    for (let c = 0; c < 10; c++) { queue.push([rows.length - 1, c]); seen.add(`${rows.length - 1},${c}`); }
    while (queue.length) {
      const [r, c] = queue.shift()!;
      for (const [nr, nc] of [[r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1]]) {
        const key = `${nr},${nc}`;
        // Breakable bricks can be smashed through, so only steel blocks the ball's way.
        if (nr < 0 || nr >= rows.length || nc < 0 || nc >= 10 || seen.has(key) || rows[nr][nc] === '#') continue;
        seen.add(key);
        queue.push([nr, nc]);
      }
    }
    level.rows.forEach((row, r) => [...row].forEach((code, c) => {
      if (code >= '1' && code <= '3') assert.ok(seen.has(`${r},${c}`), `${level.name}: brick at row ${r}, column ${c} is unreachable`);
    }));
  });
});

test('the paddle stays in the arena and carries the ball until launch', () => {
  const game = new BrickBreakerGame();
  game.restart(1);
  game.movePaddleTo(-500);
  assert.equal(game.paddleX, PADDLE_W / 2);
  game.movePaddleTo(99_999);
  assert.equal(game.paddleX, BRICK_ARENA_WIDTH - PADDLE_W / 2);
  assert.equal(game.ball.x, game.paddleX, 'the served ball rides the paddle');
  assert.equal(game.launch(), true);
  assert.ok(game.ball.vy < 0, 'launch sends the ball up');
  assert.equal(game.launch(), false, 'no double launch');
});

test('the paddle edge sends the ball wide, the centre sends it straight', () => {
  const returnAngle = (offset: number): number => {
    const game = new BrickBreakerGame();
    game.restart(1);
    game.bricks = [];
    game.bricks.push({ x: -1000, y: -1000, hits: 1, steel: false }); // keep the level from clearing
    game.launch();
    game.movePaddleTo(400);
    game.ball = { x: 400 + offset, y: PADDLE_Y - 40, vx: 0, vy: 300 };
    run(game, 0.2);
    return Math.atan2(game.ball.vx, -game.ball.vy);
  };
  assert.ok(Math.abs(returnAngle(0)) < 0.05, 'centre hit goes nearly straight up');
  assert.ok(returnAngle(50) > 0.8, 'right edge sends it right');
  assert.ok(returnAngle(-50) < -0.8, 'left edge sends it left');
});

test('bricks take their hits, steel never breaks, and points add up', () => {
  const game = new BrickBreakerGame();
  game.restart(1);
  const tough = { x: 360, y: 200, hits: 2, steel: false };
  const steel = { x: 100, y: 200, hits: 1, steel: true };
  game.bricks = [tough, steel];
  game.launch();
  game.ball = { x: 396, y: 260, vx: 0, vy: -400 };
  run(game, 0.1);
  assert.equal(tough.hits, 1);
  assert.equal(game.score, 10);
  assert.ok(game.ball.vy > 0, 'the ball bounces back down');

  game.ball = { x: 136, y: 260, vx: 0, vy: -400 };
  run(game, 0.1);
  assert.ok(game.bricks.includes(steel), 'steel is still standing');
  assert.equal(game.score, 10, 'steel is worth nothing');
});

test('a fast ball cannot skip through a brick in one frame', () => {
  const game = new BrickBreakerGame();
  game.restart(1);
  const brick = { x: 360, y: 200, hits: 5, steel: false };
  game.bricks = [brick];
  game.launch();
  // 660 px/s over a long 50ms frame is 33px - more than the brick is tall.
  game.ball = { x: 396, y: 250, vx: 0, vy: -660 };
  game.update(0.05);
  assert.equal(brick.hits, 4, 'the hit registered');
});

test('dropping the ball costs a life; losing the last ends the run', () => {
  const game = new BrickBreakerGame();
  game.restart(1);
  for (let life = START_LIVES; life > 0; life--) {
    game.launch();
    game.ball = { x: 30, y: BRICK_ARENA_HEIGHT - 20, vx: 0, vy: 500 };
    game.movePaddleTo(700);
    run(game, 0.1);
    assert.equal(game.lives, life - 1);
  }
  assert.equal(game.phase, 'lost');
  assert.equal(game.launch(), false);
});

test('clearing a wall banks a bonus and the next wall keeps score and lives', () => {
  const game = new BrickBreakerGame();
  game.restart(1);
  game.bricks = [{ x: 360, y: 200, hits: 1, steel: false }, { x: 100, y: 200, hits: 1, steel: true }];
  game.launch();
  game.ball = { x: 396, y: 260, vx: 0, vy: -400 };
  run(game, 0.1);
  assert.equal(game.phase, 'cleared', 'steel does not have to be broken');
  assert.equal(game.score, 10 + 40 + 250 + START_LIVES * 100);
  const score = game.score;
  assert.equal(game.advance(), true);
  assert.equal(game.level, 2);
  assert.equal(game.score, score);
  assert.equal(game.lives, START_LIVES);
  assert.equal(game.bricks.length, buildBricks(2).length);
});

test('clearing the last wall wins the run', () => {
  const game = new BrickBreakerGame();
  game.restart(BRICK_LEVELS.length);
  game.bricks = [{ x: 360, y: 200, hits: 1, steel: false }];
  game.launch();
  game.ball = { x: 396, y: 260, vx: 0, vy: -400 };
  run(game, 0.1);
  assert.equal(game.phase, 'won');
});

test('an attentive player can clear every wall - no traps, loops, or lost bricks', () => {
  const random = seeded(29);
  BRICK_LEVELS.forEach((level, index) => {
    const game = new BrickBreakerGame();
    game.restart(index + 1);
    let offset = 0;
    let lastVy = 0;
    let seconds = 0;
    while (seconds < 900 && game.phase !== 'cleared' && game.phase !== 'won') {
      if (game.phase === 'ready') game.launch();
      // Track the ball, hitting at a new spot on the paddle after every return.
      if (lastVy < 0 && game.ball.vy > 0) offset = (random() - 0.5) * (PADDLE_W - 2 * BALL_R);
      lastVy = game.ball.vy;
      game.movePaddleTo(game.ball.x - offset);
      game.update(1 / 60);
      seconds += 1 / 60;
    }
    assert.ok(game.phase === 'cleared' || game.phase === 'won',
      `${level.name}: not cleared after ${Math.round(seconds)}s (${game.breakableLeft()} bricks left, ${game.lives} balls)`);
    assert.equal(game.lives, START_LIVES, `${level.name}: a tracking paddle never drops the ball`);
  });
});
