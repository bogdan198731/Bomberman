import assert from 'node:assert/strict';
import test from 'node:test';
import { isRelayPayload } from './relay.js';
import {
  ConnectionCounter,
  Heartbeat,
  MessageBudget,
  SOCKET_LIMITS,
  answerServerError,
  clientAddress,
  describeError,
  guarded,
  messageBytes,
  trustedProxyHops,
} from './server-guard.js';

test('the frame limit fits the largest state the relay accepts, and little more', () => {
  // The relay counts characters; the socket counts bytes, and "€" takes three.
  const widest = { text: '€'.repeat(65_536 - '{"text":""}'.length) };
  assert.equal(isRelayPayload(widest), true, 'this is the largest payload the relay lets through');
  const frame = JSON.stringify({ type: 'gameState', state: widest, to: 4 });
  assert.ok(Buffer.byteLength(frame) <= SOCKET_LIMITS.maxPayloadBytes, 'a legitimate state must never be cut off');
  assert.ok(SOCKET_LIMITS.maxPayloadBytes < 256 * 1024, 'far below the 100 MB default');
});

test('the message limit leaves real play alone', () => {
  // Three held controls repeating every 35 ms plus a host sending state every 33 ms.
  const realPeakPerSecond = 3 * (1_000 / 35) + 1_000 / 33;
  assert.ok(SOCKET_LIMITS.messagesPerSecond > realPeakPerSecond * 1.5);
  // A backlog from a stall just short of the heartbeat cutting the socket, at one stream's rate.
  assert.ok(SOCKET_LIMITS.messageBurst >= (SOCKET_LIMITS.heartbeatMs / 1_000) * (1_000 / 33));
});

test('a socket may send a burst, then only its steady rate', () => {
  const budget = new MessageBudget(10, 20, 0);
  for (let sent = 0; sent < 20; sent++) assert.equal(budget.allow(0), true, `message ${sent + 1} of the burst`);
  assert.equal(budget.allow(0), false, 'the burst is used up');
  // 100 ms at 10 a second earns exactly one more.
  assert.equal(budget.allow(100), true);
  assert.equal(budget.allow(100), false);
});

test('a steady sender under the rate is never refused', () => {
  const budget = new MessageBudget(SOCKET_LIMITS.messagesPerSecond, SOCKET_LIMITS.messageBurst, 0);
  // Ten minutes of the busiest real client: 120 messages a second.
  for (let now = 0; now < 600_000; now += 1_000 / 120) assert.equal(budget.allow(now), true);
});

test('a flood is refused once the burst is spent', () => {
  const budget = new MessageBudget(SOCKET_LIMITS.messagesPerSecond, SOCKET_LIMITS.messageBurst, 0);
  let allowed = 0;
  // 50,000 messages within one second.
  for (let sent = 0; sent < 50_000; sent++) if (budget.allow(sent / 50)) allowed++;
  // The burst, plus what one second refills.
  assert.ok(allowed >= SOCKET_LIMITS.messageBurst, `${allowed} allowed`);
  assert.ok(allowed <= SOCKET_LIMITS.messageBurst + SOCKET_LIMITS.messagesPerSecond, `${allowed} allowed`);
});

test('an idle socket saves up no more than one burst', () => {
  const budget = new MessageBudget(10, 20, 0);
  let allowed = 0;
  for (let sent = 0; sent < 100; sent++) if (budget.allow(3_600_000)) allowed++;
  assert.equal(allowed, 20);
});

test('a clock that steps backwards neither refills nor empties the budget', () => {
  const budget = new MessageBudget(10, 2, 1_000);
  assert.equal(budget.allow(1_000), true);
  assert.equal(budget.allow(500), true);
  assert.equal(budget.allow(500), false);
  assert.equal(budget.allow(600), true, 'time counts again from the new clock');
});

test('the byte limit leaves real play alone and still means something', () => {
  // Measured on 2026-11-13: a Blocks host, the busiest client, sends about 74 KB a second.
  const busiestRealClient = 74_000;
  assert.ok(SOCKET_LIMITS.bytesPerSecond >= busiestRealClient * 10);
  // A 30-second backlog from that client, sent at once after a stall, still fits.
  assert.ok(SOCKET_LIMITS.byteBurst >= busiestRealClient * 30);
  // A few full-size frames are always affordable, or the frame limit would be a lie.
  assert.ok(SOCKET_LIMITS.byteBurst >= SOCKET_LIMITS.maxPayloadBytes * 4);
  // Far below what the message limit alone would let through.
  assert.ok(SOCKET_LIMITS.bytesPerSecond * 10 < SOCKET_LIMITS.messagesPerSecond * SOCKET_LIMITS.maxPayloadBytes);
});

test('a budget can count bytes: each frame costs its size', () => {
  const budget = new MessageBudget(1_000, 5_000, 0);
  assert.equal(budget.allow(0, 3_000), true);
  assert.equal(budget.allow(0, 2_000), true);
  assert.equal(budget.allow(0, 1), false, 'the burst is spent');
  // Half a second at 1,000 a second earns 500.
  assert.equal(budget.allow(500, 501), false, 'a frame the budget cannot cover is refused whole');
  assert.equal(budget.allow(500, 500), true);
});

test('a real host under the byte rate is never refused', () => {
  const budget = new MessageBudget(SOCKET_LIMITS.bytesPerSecond, SOCKET_LIMITS.byteBurst, 0);
  // Ten minutes of 2.5 KB states, 60 a second: twice the busiest client measured.
  for (let now = 0; now < 600_000; now += 1_000 / 60) assert.equal(budget.allow(now, 2_500), true);
});

test('full-size frames in a row run out of byte budget', () => {
  const budget = new MessageBudget(SOCKET_LIMITS.bytesPerSecond, SOCKET_LIMITS.byteBurst, 0);
  let allowed = 0;
  // 200 full frames within one second: what the message limit alone allowed.
  for (let sent = 0; sent < 200; sent++) if (budget.allow(sent * 5, SOCKET_LIMITS.maxPayloadBytes)) allowed++;
  assert.ok(allowed >= 40 && allowed <= 48, `${allowed} allowed`);
});

test('a frame is measured in bytes in every shape ws delivers it', () => {
  assert.equal(messageBytes(Buffer.from('€€')), 6);
  assert.equal(messageBytes(new ArrayBuffer(10)), 10);
  assert.equal(messageBytes([Buffer.alloc(3), Buffer.alloc(4)]), 7);
});

test('an address may hold only so many sockets at once', () => {
  const sockets = new ConnectionCounter(3);
  for (let opened = 0; opened < 3; opened++) {
    assert.equal(sockets.hasRoom('198.51.100.7'), true, `socket ${opened + 1}`);
    sockets.add('198.51.100.7');
  }
  assert.equal(sockets.hasRoom('198.51.100.7'), false);
  assert.equal(sockets.hasRoom('198.51.100.8'), true, 'another address is not affected');
});

test('closing a socket makes room for another, and an idle address is forgotten', () => {
  const sockets = new ConnectionCounter(1);
  sockets.add('198.51.100.7');
  assert.equal(sockets.hasRoom('198.51.100.7'), false);
  sockets.remove('198.51.100.7');
  assert.equal(sockets.hasRoom('198.51.100.7'), true);
  assert.equal(sockets.count('198.51.100.7'), 0);
  // A close that was never counted must not leave a negative balance behind.
  sockets.remove('198.51.100.7');
  sockets.add('198.51.100.7');
  assert.equal(sockets.hasRoom('198.51.100.7'), false);
});

test('the socket limit fits a room full of players behind one address', () => {
  assert.ok(SOCKET_LIMITS.socketsPerAddress >= 20);
  assert.ok(SOCKET_LIMITS.socketsPerAddress <= 100);
});

test('a socket that answers every ping is kept', () => {
  const heartbeat = new Heartbeat<string>();
  heartbeat.add('phone');
  for (let round = 0; round < 5; round++) {
    assert.deepEqual(heartbeat.sweep(), { ping: ['phone'], silent: [] });
    heartbeat.heard('phone');
  }
});

test('a socket that misses a pong is dropped at the next sweep', () => {
  const heartbeat = new Heartbeat<string>();
  heartbeat.add('phone');
  heartbeat.add('laptop');
  assert.deepEqual(heartbeat.sweep(), { ping: ['phone', 'laptop'], silent: [] });
  heartbeat.heard('laptop');
  assert.deepEqual(heartbeat.sweep(), { ping: ['laptop'], silent: ['phone'] });
  heartbeat.heard('laptop');
  // The dropped socket is forgotten, not reported again.
  assert.deepEqual(heartbeat.sweep(), { ping: ['laptop'], silent: [] });
});

test('a closed socket is no longer pinged, and a late pong does not bring it back', () => {
  const heartbeat = new Heartbeat<string>();
  heartbeat.add('phone');
  heartbeat.remove('phone');
  heartbeat.heard('phone');
  assert.deepEqual(heartbeat.sweep(), { ping: [], silent: [] });
});

test('TRUST_PROXY is a count of proxies, and anything else trusts none', () => {
  assert.equal(trustedProxyHops('1'), 1);
  assert.equal(trustedProxyHops('2'), 2);
  for (const setting of [undefined, '', '0', '-1', '1.5', 'true', 'yes']) {
    assert.equal(trustedProxyHops(setting), 0, `TRUST_PROXY=${setting}`);
  }
});

test('without a trusted proxy the header is ignored', () => {
  assert.equal(clientAddress('203.0.113.9', '198.51.100.1', 0), '203.0.113.9');
  assert.equal(clientAddress(undefined, '198.51.100.1', 0), 'unknown');
});

test('behind one proxy the client is the last entry, which the proxy wrote', () => {
  assert.equal(clientAddress('10.0.0.1', '198.51.100.7', 1), '198.51.100.7');
  // Whatever the client put in front cannot move it to another bucket.
  assert.equal(clientAddress('10.0.0.1', '1.1.1.1, 198.51.100.7', 1), '198.51.100.7');
  assert.equal(clientAddress('10.0.0.1', 'anything at all,2.2.2.2 ,  198.51.100.7 ', 1), '198.51.100.7');
});

test('behind two proxies the client is the entry before the last', () => {
  assert.equal(clientAddress('10.0.0.1', '9.9.9.9, 198.51.100.7, 172.16.0.5', 2), '198.51.100.7');
  // One proxy was skipped: the entry that is there is still proxy-written.
  assert.equal(clientAddress('10.0.0.1', '172.16.0.5', 2), '172.16.0.5');
});

test('a repeated or empty header still gives a usable address', () => {
  assert.equal(clientAddress('10.0.0.1', ['1.1.1.1', '198.51.100.7'], 1), '198.51.100.7');
  assert.equal(clientAddress('10.0.0.1', undefined, 1), '10.0.0.1');
  assert.equal(clientAddress('10.0.0.1', ' , ', 1), '10.0.0.1');
  assert.equal(clientAddress('10.0.0.1', 'x'.repeat(5_000), 1).length, 64);
});

test('a guarded handler runs normally when nothing goes wrong', () => {
  const seen: string[] = [];
  const handler = guarded((word: string) => { seen.push(word); }, () => { seen.push('recovered'); });
  handler('hello');
  assert.deepEqual(seen, ['hello']);
});

test('a throw in a guarded handler goes to recovery with the same arguments', () => {
  const failure = new Error('boom');
  const recovered: unknown[] = [];
  const handler = guarded((_word: string, _count: number) => { throw failure; }, (error, word, count) => { recovered.push(error, word, count); });
  assert.doesNotThrow(() => handler('hello', 2));
  assert.deepEqual(recovered, [failure, 'hello', 2]);
});

test('a throw during recovery stays contained too', () => {
  const handler = guarded(() => { throw new Error('first'); }, () => { throw new Error('second'); });
  assert.doesNotThrow(() => handler());
});

function fakeResponse(headersSent: boolean): { headersSent: boolean; calls: unknown[][]; writeHead(...args: unknown[]): void; end(...args: unknown[]): void; destroy(): void } {
  const calls: unknown[][] = [];
  return {
    headersSent,
    calls,
    writeHead: (...args) => { calls.push(['writeHead', ...args]); },
    end: (...args) => { calls.push(['end', ...args]); },
    destroy: () => { calls.push(['destroy']); },
  };
}

test('a failed request is answered with 500 when nothing was sent yet', () => {
  const response = fakeResponse(false);
  answerServerError(response);
  assert.equal(response.calls[0][0], 'writeHead');
  assert.equal(response.calls[0][1], 500);
  assert.deepEqual(response.calls[1], ['end', 'Server error']);
});

test('a failed request that already started its reply is cut off instead', () => {
  const response = fakeResponse(true);
  answerServerError(response);
  assert.deepEqual(response.calls, [['destroy']]);
});

test('logged errors keep their stack', () => {
  assert.match(describeError(new Error('boom')), /Error: boom\n\s+at /);
  assert.equal(describeError('plain'), 'plain');
});
