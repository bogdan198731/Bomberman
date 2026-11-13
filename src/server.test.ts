import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { connect, createServer, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { SOCKET_LIMITS } from './server-guard.js';

/*
 * The real server on a spare local port, attacked the way the 2026-11-13 review
 * attacked it. Every test ends by checking the same process still answers.
 */
let server: ChildProcess;
let port = 0;
let exited = false;
let output = '';
const scratch = mkdtempSync(join(tmpdir(), 'blast-server-test-'));
const sockets: WebSocket[] = [];
// A server without these limits never closes the attacker, so a test would wait forever.
const patience = { timeout: 20_000 };

function sparePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      probe.close(() => (address && typeof address === 'object' ? resolve(address.port) : reject(new Error('no port'))));
    });
  });
}

before(async () => {
  port = await sparePort();
  server = spawn(process.execPath, [fileURLToPath(new URL('./server.js', import.meta.url))], {
    // The server reads index.html from where it runs.
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      TRUST_PROXY: '1',
      SCORES_DIR: join(scratch, 'scores'),
      REPORTS_DIR: join(scratch, 'reports'),
      // Never the real boards or mailbox, even if their settings are in the environment.
      UPSTASH_REDIS_REST_URL: '',
      UPSTASH_REDIS_REST_TOKEN: '',
      RESEND_API_KEY: '',
      REPORT_WEBHOOK_URL: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.once('exit', () => { exited = true; });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`server did not start:\n${output}`)), 20_000);
    const watch = (chunk: Buffer): void => {
      output += chunk.toString();
      if (output.includes('online server')) { clearTimeout(timer); resolve(); }
    };
    server.stdout?.on('data', watch);
    server.stderr?.on('data', watch);
    server.once('exit', () => { clearTimeout(timer); reject(new Error(`server stopped while starting:\n${output}`)); });
  });
});

after(() => {
  // A socket left open by a failed test would keep this process alive.
  for (const socket of sockets) socket.terminate();
  server?.kill();
  rmSync(scratch, { recursive: true, force: true });
});

async function assertStillServing(): Promise<void> {
  assert.equal(exited, false, `the server stopped:\n${output}`);
  const response = await fetch(`http://127.0.0.1:${port}/robots.txt`);
  assert.equal(response.status, 200);
}

function openSocket(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}`);
    sockets.push(socket);
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
  });
}

function closed(socket: WebSocket): Promise<{ code: number; reason: string }> {
  return new Promise(resolve => {
    // The server cutting a socket mid-send can surface as an error first; the close still follows.
    socket.on('error', () => {});
    socket.once('close', (code, reason) => resolve({ code, reason: reason.toString() }));
  });
}

function nextMessage(socket: WebSocket): Promise<Record<string, unknown>> {
  return new Promise(resolve => socket.once('message', raw => resolve(JSON.parse(raw.toString()))));
}

async function createRoom(socket: WebSocket): Promise<Record<string, unknown>> {
  const reply = nextMessage(socket);
  socket.send(JSON.stringify({ type: 'create' }));
  return reply;
}

test('a frame over the limit closes that socket and nothing else', patience, async () => {
  const bystander = await openSocket();
  const attacker = await openSocket();
  const end = closed(attacker);
  attacker.send(JSON.stringify({ type: 'gameState', state: { junk: 'x'.repeat(SOCKET_LIMITS.maxPayloadBytes) } }));
  assert.equal((await end).code, 1009, 'message too big');
  assert.equal((await createRoom(bystander)).type, 'joined');
  bystander.close();
  await assertStillServing();
});

test('the largest legitimate frame is still accepted', patience, async () => {
  const socket = await openSocket();
  // Not in a room, so the server reads it and ignores it; the socket must stay usable.
  socket.send(JSON.stringify({ type: 'gameState', state: { text: '€'.repeat(65_000) } }));
  assert.equal((await createRoom(socket)).type, 'joined');
  socket.close();
  await assertStillServing();
});

test('a flood of messages closes that socket and nothing else', patience, async () => {
  const bystander = await openSocket();
  const attacker = await openSocket();
  const end = closed(attacker);
  const flood = SOCKET_LIMITS.messageBurst + SOCKET_LIMITS.messagesPerSecond * 5;
  for (let sent = 0; sent < flood; sent++) attacker.send('{"type":"action","action":{"type":"bomb"}}');
  assert.deepEqual(await end, { code: 1008, reason: 'Too many messages.' });
  assert.equal((await createRoom(bystander)).type, 'joined');
  bystander.close();
  await assertStillServing();
});

test('a steady player at a real pace is not cut off', patience, async () => {
  const socket = await openSocket();
  assert.equal((await createRoom(socket)).type, 'joined');
  let open = true;
  socket.once('close', () => { open = false; });
  // A held joystick: one move every 35 ms, here for two seconds.
  for (let sent = 0; sent < 57; sent++) {
    socket.send(JSON.stringify({ type: 'action', action: { type: 'move', dx: 1, dy: 0 } }));
    await new Promise(resolve => setTimeout(resolve, 35));
  }
  assert.equal(open, true);
  socket.close();
  await assertStillServing();
});

test('a frame that breaks the protocol closes that socket, not the server', patience, async () => {
  const socket = await openSocket();
  const end = closed(socket);
  // Opcode 3 is reserved: ws reports it as an 'error' event, which used to go unhandled.
  (socket as unknown as { _socket: Socket })._socket.write(Buffer.from([0x83, 0x80, 0, 0, 0, 0]));
  assert.equal((await end).code, 1002, 'protocol error');
  await assertStillServing();
});

test('a request the handler cannot read gets an error reply, not a dead server', patience, async () => {
  const reply = await new Promise<string>((resolve, reject) => {
    let text = '';
    const raw = connect(port, '127.0.0.1', () => raw.write('GET //[ HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n'));
    raw.on('data', chunk => { text += chunk.toString(); });
    raw.on('end', () => resolve(text));
    raw.on('error', reject);
  });
  // 500 from the safety net, or 400 once the path check from the malformed-request fix is in.
  assert.match(reply, /^HTTP\/1\.1 (400|500) /);
  await assertStillServing();
});

async function postScore(forwardedFor: string): Promise<number> {
  const response = await fetch(`http://127.0.0.1:${port}/api/scores`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': forwardedFor },
    body: JSON.stringify({ game: 'snake', score: 10, outcome: 'complete', alias: 'Guard test' }),
  });
  await response.arrayBuffer();
  return response.status;
}

test('a made-up first X-Forwarded-For entry does not buy a fresh rate limit', patience, async () => {
  // 30 scores per client per ten minutes; the proxy's own entry, the last one, names the client.
  for (let sent = 0; sent < 30; sent++) {
    assert.equal(await postScore(`10.9.${sent}.1, 198.51.100.7`), 201, `score ${sent + 1}`);
  }
  assert.equal(await postScore('10.9.99.1, 198.51.100.7'), 429, 'same client, new made-up address');
  assert.equal(await postScore('10.9.0.1, 198.51.100.8'), 201, 'another client has its own allowance');
  await assertStillServing();
});
