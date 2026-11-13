import assert from 'node:assert/strict';
import test from 'node:test';
import { isRelayPayload } from './relay.js';
import {
  Heartbeat,
  MessageBudget,
  SOCKET_LIMITS,
  answerServerError,
  clientAddress,
  describeError,
  guarded,
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
