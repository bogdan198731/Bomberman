import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BALL_R,
  BRICK_ARENA_HEIGHT,
  BRICK_ARENA_WIDTH,
  BRICK_LEVELS,
  BrickBreakerGame,
  CAPSULES,
  CAPSULE_KINDS,
  DROP_CHANCE,
  MAX_LIVES,
  PADDLE_W,
  WIDE_PADDLE_W,
  PADDLE_Y,
  START_LIVES,
  buildBricks,
  pickCapsule,
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
    const game = new BrickBreakerGame(() => 1); // walls alone, no capsules
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

const noDrops = (): number => 1;

/** A game mid-rally with one far-away brick so the level never clears. */
function inPlay(random: () => number = noDrops): BrickBreakerGame {
  const game = new BrickBreakerGame(random);
  game.restart(1);
  game.bricks = [{ x: -1000, y: -1000, hits: 1, steel: false }];
  game.launch();
  game.ball = { x: 100, y: 300, vx: 0, vy: -300 };
  return game;
}

test('capsules are picked by weight, extra lives the rarest', () => {
  const counts = Object.fromEntries(CAPSULE_KINDS.map(kind => [kind, 0])) as Record<string, number>;
  for (let i = 0; i < 1000; i++) counts[pickCapsule(i / 1000)]++;
  CAPSULE_KINDS.forEach(kind => assert.ok(counts[kind] > 0, `${kind} can drop`));
  assert.ok(CAPSULE_KINDS.every(kind => kind === 'life' || counts[kind] > counts.life), 'extra life is the rarest');
  assert.ok(DROP_CHANCE > 0.05 && DROP_CHANCE < 0.25, 'drops are occasional, not constant');
  CAPSULE_KINDS.forEach(kind => assert.equal(CAPSULES[kind].seconds > 0, kind !== 'life' && kind !== 'multi', `${kind} timing`));
});

test('a broken brick can drop a capsule that the paddle catches', () => {
  const rolls = [0, 0]; // drop, then the first kind: an extra life
  const game = new BrickBreakerGame(() => rolls.shift() ?? 1);
  game.restart(1);
  game.bricks = [{ x: 360, y: 200, hits: 1, steel: false }, { x: -1000, y: -1000, hits: 1, steel: false }];
  game.launch();
  game.ball = { x: 396, y: 260, vx: 0, vy: -400 };
  run(game, 0.1);
  assert.equal(game.capsules.length, 1);
  assert.equal(game.capsules[0].kind, 'life');
  game.movePaddleTo(game.capsules[0].x);
  game.ball = { x: game.paddleX, y: 300, vx: 0, vy: -300 }; // rallies off the paddle meanwhile
  run(game, 3);
  assert.equal(game.capsules.length, 0, 'caught');
  assert.equal(game.lives, START_LIVES + 1);
  assert.match(game.statusText(), /Extra life/);
});

test('a missed capsule falls away harmlessly', () => {
  const game = inPlay();
  game.capsules = [{ x: 700, y: 300, kind: 'wide' }];
  game.movePaddleTo(100);
  run(game, 3);
  assert.equal(game.capsules.length, 0);
  assert.equal(game.effects.wide, 0);
});

test('extra lives stop at the cap and pay points instead', () => {
  const game = inPlay();
  while (game.lives < MAX_LIVES) game.collect('life');
  const score = game.score;
  game.collect('life');
  assert.equal(game.lives, MAX_LIVES);
  assert.equal(game.score, score + 500);
});

test('the power ball smashes through tough bricks without bouncing, but not steel', () => {
  const game = inPlay();
  const tough = { x: 360, y: 200, hits: 3, steel: false };
  const above = { x: 360, y: 150, hits: 2, steel: false };
  const steel = { x: 360, y: 60, hits: 1, steel: true };
  game.bricks.push(tough, above, steel);
  game.collect('power');
  game.ball = { x: 396, y: 260, vx: 0, vy: -400 };
  run(game, 0.3);
  assert.ok(!game.bricks.includes(tough) && !game.bricks.includes(above), 'both broken in one pass');
  assert.equal(game.score, (30 + 40) + (20 + 40), 'full value for every hit it skipped');
  run(game, 0.3);
  assert.ok(game.bricks.includes(steel), 'steel still stands');
  assert.ok(game.ball.vy > 0, 'and still turns the ball back');
});

test('timed bonuses wear off', () => {
  const game = inPlay();
  game.collect('wide');
  assert.equal(game.paddleWidth(), WIDE_PADDLE_W);
  game.movePaddleTo(9999);
  assert.equal(game.paddleX, BRICK_ARENA_WIDTH - WIDE_PADDLE_W / 2, 'the wide paddle still stays inside the walls');
  assert.deepEqual(game.activeEffects().map(effect => effect.kind), ['wide']);
  for (let t = 0; t < CAPSULES.wide.seconds + 0.5; t += 1 / 60) {
    game.ball = { x: 100, y: 300, vx: 0, vy: -300 }; // keep the ball safely in play
    game.update(1 / 60);
  }
  assert.equal(game.paddleWidth(), PADDLE_W);
  assert.equal(game.activeEffects().length, 0);
});

test('slow ball slows every ball, and speed comes back when it ends', () => {
  const game = inPlay();
  const speed = (): number => Math.hypot(game.ball.vx, game.ball.vy);
  game.collect('slow');
  const slowed = speed();
  game.balls.push({ x: 600, y: 300, vx: 380, vy: 0 });
  game.collect('slow');
  assert.ok(slowed < 380 * 0.75, 'slowed');
  assert.ok(Math.abs(Math.hypot(game.balls[1].vx, game.balls[1].vy) - slowed) < 0.01, 'every ball in play slows');
  game.effects.slow = 0.01;
  game.update(0.02);
  assert.ok(Math.abs(speed() - slowed / 0.68) < 0.01, 'back to full speed');
});

test('multi-ball splits into three, and only the last ball lost costs a life', () => {
  const game = inPlay();
  game.collect('multi');
  assert.equal(game.balls.length, 3);
  game.collect('multi');
  assert.equal(game.balls.length, 3, 'never more than three at once');
  game.balls[0] = { x: 30, y: BRICK_ARENA_HEIGHT - 20, vx: 0, vy: 500 };
  game.movePaddleTo(700);
  game.update(0.05);
  game.update(0.05);
  assert.equal(game.balls.length, 2);
  assert.equal(game.lives, START_LIVES);
  assert.equal(game.phase, 'playing');
});

test('losing a ball or clearing a wall ends every bonus', () => {
  const game = inPlay();
  game.collect('wide');
  game.collect('power');
  game.capsules = [{ x: 400, y: 100, kind: 'slow' }];
  game.ball = { x: 30, y: BRICK_ARENA_HEIGHT - 20, vx: 0, vy: 500 };
  game.movePaddleTo(700);
  run(game, 0.1);
  assert.equal(game.lives, START_LIVES - 1);
  assert.equal(game.activeEffects().length, 0);
  assert.equal(game.capsules.length, 0);
  assert.equal(game.paddleWidth(), PADDLE_W);
});

test('with bonuses on, an attentive player still clears every wall', () => {
  BRICK_LEVELS.forEach((level, index) => {
    const random = seeded(41 + index);
    const game = new BrickBreakerGame(random);
    game.restart(index + 1);
    let seconds = 0;
    while (seconds < 900 && game.phase !== 'cleared' && game.phase !== 'won' && game.phase !== 'lost') {
      if (game.phase === 'ready') game.launch();
      // Follow the lowest ball heading down, as a player would.
      const falling = game.balls.filter(ball => ball.vy > 0).sort((a, b) => b.y - a.y)[0] ?? game.ball;
      game.movePaddleTo(falling.x + (falling.x % 30) - 15);
      game.update(1 / 60);
      seconds += 1 / 60;
    }
    assert.ok(game.phase === 'cleared' || game.phase === 'won', `${level.name}: ended ${game.phase} after ${Math.round(seconds)}s`);
    assert.ok(game.balls.length <= 3);
  });
});
