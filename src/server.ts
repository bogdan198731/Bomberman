import { execFileSync, execSync } from 'node:child_process';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  OnlineRoom,
  isPlayerAction,
  type BotDifficulty,
  type PlayerId,
} from './multiplayer.js';
import { InviteRoom, isOnlineGameId, isRelayPayload, isRelaySeat, roomSize, type OnlineGameId, type RelaySeat } from './relay.js';
import { MatchmakingQueue } from './matchmaking.js';
import { buildRobotsTxt, buildSitemapXml, gameFromPath, parseSeoPath } from './seo.js';
import { renderPageForView } from './page-render.js';
import { contentValidators, fileValidators, isNotModified, legacyHostRedirect, type Validators } from './server-http.js';
import { pageDates, parseGitFileDates } from './sitemap-dates.js';
import type { ArcadeLanguage } from './i18n.js';
import type { SeoView } from './seo.js';
import { BUG_REPORT_ENDPOINT, BUG_REPORT_LIMITS, validateBugReport } from './bug-report.js';
import { ReportRateLimiter, createReportId, forwardReport, storeReport, storeScreenshot, type StoredReport } from './report-intake.js';
import { TesterRegistry } from './testers.js';
import { SCOREBOARD_ENDPOINT, validateScoreSubmission } from './scoreboard.js';
import { Scoreboard, createScoreStore } from './score-store.js';
import { isArcadeGameId } from './game-metadata.js';
import { DEFAULT_REPORT_SENDER, buildReportEmail, sendReportEmail } from './report-email.js';

const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '0.0.0.0';
const root = process.cwd();
const rooms = new Map<string, OnlineRoom>();
const inviteRooms = new Map<string, InviteRoom>();
// Invite games queue by size too ("septica:4"), so a Quick Match only pairs rooms of the same size.
const matchmaking = new MatchmakingQueue<string>();
type ClientSession =
  | { kind: 'bomberman'; roomCode: string; playerId: PlayerId }
  | { kind: 'invite'; roomCode: string; playerId: RelaySeat; game: OnlineGameId };
const clients = new Map<WebSocket, ClientSession>();

const mimeTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const indexPath = join(root, 'index.html');
// The report dialog's screenshot library, served from its package so there is no copy to keep in sync.
const screenshotLibraryPath = join(root, 'node_modules', 'modern-screenshot', 'dist', 'index.mjs');
let indexCache: { mtimeMs: number; html: string } | undefined;

/** index.html rarely changes, so parse it once per deploy rather than per request. */
function readIndexHtml(): string {
  const { mtimeMs } = statSync(indexPath);
  if (!indexCache || indexCache.mtimeMs !== mtimeMs) {
    indexCache = { mtimeMs, html: readFileSync(indexPath, 'utf8') };
  }
  return indexCache.html;
}

const REPORTS_DIR = process.env.REPORTS_DIR || join(root, 'reports');
const REPORT_WEBHOOK_URL = process.env.REPORT_WEBHOOK_URL;
const REPORT_WEBHOOK_SECRET = process.env.REPORT_WEBHOOK_SECRET;
// On hosts without a lasting disk (Render), email is where reports survive.
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const REPORT_EMAIL_TO = process.env.REPORT_EMAIL_TO;
const REPORT_EMAIL_FROM = process.env.REPORT_EMAIL_FROM || DEFAULT_REPORT_SENDER;
// Only trust X-Forwarded-For when a reverse proxy we control sets it.
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const reportsPerClient = new ReportRateLimiter(5, 10 * 60_000);
const reportsOverall = new ReportRateLimiter(100, 60 * 60_000);
const reportsPerTester = new ReportRateLimiter(5, 24 * 60 * 60_000);
const scoreStore = createScoreStore(process.env, join(root, 'scores'));
const scoreboard = new Scoreboard(scoreStore);
// A finished game sends one score; this is generous for real play and stops floods.
const scoresPerClient = new ReportRateLimiter(30, 10 * 60_000);
const scoresOverall = new ReportRateLimiter(600, 60 * 60_000);
const testers = new TesterRegistry(process.env.TESTERS_FILE || join(root, 'testers.json'));
const deployedCommit = (() => {
  if (process.env.COMMIT_SHA) return process.env.COMMIT_SHA;
  try { return execSync('git rev-parse --short HEAD', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); }
  catch { return 'unknown'; }
})();

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  response.writeHead(status, {
    'Content-Type': mimeTypes['.json'],
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(json),
  });
  response.end(json);
}

function clientAddress(request: IncomingMessage): string {
  const forwarded = request.headers['x-forwarded-for'];
  if (TRUST_PROXY && typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return request.socket.remoteAddress ?? 'unknown';
}

function handleBugReport(request: IncomingMessage, response: ServerResponse): void {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    sendJson(response, 405, { error: 'Use POST.' });
    return;
  }
  if (!String(request.headers['content-type']).startsWith('application/json')) {
    sendJson(response, 415, { error: 'Send JSON.' });
    return;
  }
  const chunks: Buffer[] = [];
  let size = 0;
  let aborted = false;
  request.on('data', (chunk: Buffer) => {
    if (aborted) return;
    size += chunk.length;
    if (size > BUG_REPORT_LIMITS.bodyBytes) {
      aborted = true;
      sendJson(response, 413, { error: 'That report is too large.' });
      request.resume();
      return;
    }
    chunks.push(chunk);
  });
  request.on('end', () => {
    if (aborted) return;
    let body: unknown;
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { sendJson(response, 400, { error: 'Invalid report.' }); return; }
    const checked = validateBugReport(body);
    if (!checked.ok) { sendJson(response, 400, { error: checked.error }); return; }
    // A wrong code is an error, not a quiet downgrade: the tester must know their
    // report will not take the trusted path.
    const authorization = request.headers.authorization;
    const testerCheck = authorization?.startsWith('Bearer ') ? testers.check(authorization.slice(7).trim()) : undefined;
    if (testerCheck && !testerCheck.ok) {
      const error = testerCheck.reason === 'expired' ? 'Your tester code has expired.'
        : testerCheck.reason === 'revoked' ? 'Your tester code was revoked.'
        : 'Tester code not recognized.';
      sendJson(response, 401, { error });
      return;
    }
    const tester = testerCheck?.ok ? testerCheck.tester : undefined;
    // Counted after validation so a typo does not use up someone's allowance.
    const withinLimits = tester
      ? reportsPerTester.allow(tester.name, Date.now(), tester.dailyLimit)
      : reportsPerClient.allow(clientAddress(request));
    if (!withinLimits || !reportsOverall.allow('all')) {
      sendJson(response, 429, {
        error: tester ? 'You reached your daily tester report limit.' : 'Too many reports right now. Please try again later.',
      });
      return;
    }
    const stored: StoredReport = {
      id: createReportId(),
      receivedAt: new Date().toISOString(),
      game: gameFromPath(checked.report.path) ?? 'hub',
      commit: deployedCommit,
      trust: tester ? 'tester' : 'public',
      ...(tester ? { tester: tester.name } : {}),
      report: checked.report,
    };
    const saved = checked.screenshot
      ? storeScreenshot(REPORTS_DIR, stored.id, checked.screenshot).then(name => { stored.screenshot = name; })
      : Promise.resolve();
    saved.then(() => storeReport(REPORTS_DIR, stored))
      .then(() => {
        sendJson(response, 202, { id: stored.id, trust: stored.trust });
        console.log(`Bug report ${stored.id} (${stored.report.kind}, ${stored.game}, ${stored.tester ?? 'public'}) queued`);
        if (RESEND_API_KEY && REPORT_EMAIL_TO) {
          sendReportEmail(RESEND_API_KEY, buildReportEmail(stored, REPORT_EMAIL_TO, REPORT_EMAIL_FROM, checked.screenshot))
            .then(() => console.log(`Bug report ${stored.id} emailed`))
            .catch(error => console.error(`Bug report ${stored.id} email failed: ${(error as Error).message}`));
        }
        if (REPORT_WEBHOOK_URL) {
          forwardReport(REPORT_WEBHOOK_URL, stored, REPORT_WEBHOOK_SECRET)
            .catch(error => console.error(`Bug report ${stored.id} webhook failed: ${(error as Error).message}`));
        }
      })
      .catch(error => {
        console.error(`Bug report ${stored.id} could not be saved: ${(error as Error).message}`);
        sendJson(response, 500, { error: 'The report could not be saved. Try again later.' });
      });
  });
}

/** GET /api/scores?game=snake reads one board; POST adds a finished game's score. */
function handleScores(request: IncomingMessage, response: ServerResponse): void {
  if (request.method === 'GET') {
    const game = new URL(request.url || '/', 'http://local').searchParams.get('game');
    if (!isArcadeGameId(game)) { sendJson(response, 400, { error: 'Unknown game.' }); return; }
    scoreboard.top(game)
      .then(entries => sendJson(response, 200, { game, entries }))
      .catch(error => {
        console.error(`Scoreboard read failed: ${(error as Error).message}`);
        sendJson(response, 503, { error: 'The scoreboard is unavailable right now.' });
      });
    return;
  }
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'GET, POST');
    sendJson(response, 405, { error: 'Use GET or POST.' });
    return;
  }
  if (!String(request.headers['content-type']).startsWith('application/json')) {
    sendJson(response, 415, { error: 'Send JSON.' });
    return;
  }
  const chunks: Buffer[] = [];
  let size = 0;
  let aborted = false;
  request.on('data', (chunk: Buffer) => {
    if (aborted) return;
    size += chunk.length;
    if (size > 1_024) {
      aborted = true;
      sendJson(response, 413, { error: 'Too large.' });
      request.resume();
      return;
    }
    chunks.push(chunk);
  });
  request.on('end', () => {
    if (aborted) return;
    let body: unknown;
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { sendJson(response, 400, { error: 'Invalid score.' }); return; }
    const checked = validateScoreSubmission(body);
    if (!checked.ok) { sendJson(response, 400, { error: checked.error }); return; }
    if (!scoresPerClient.allow(clientAddress(request)) || !scoresOverall.allow('all')) {
      sendJson(response, 429, { error: 'Too many scores right now. Please try again later.' });
      return;
    }
    const { game, alias, score, outcome } = checked;
    scoreboard.submit(game, { alias, score, outcome, playedAt: Date.now() })
      .then(({ entries, rank }) => sendJson(response, 201, { game, rank, entries }))
      .catch(error => {
        console.error(`Scoreboard write failed: ${(error as Error).message}`);
        sendJson(response, 503, { error: 'The scoreboard is unavailable right now.' });
      });
  });
}

let sitemapDateCache: Record<SeoView, string> | undefined;

/** Each page's last change, read once from git history; a copy without .git dates everything from index.html. */
function sitemapDates(): Record<SeoView, string> {
  if (sitemapDateCache) return sitemapDateCache;
  const fallback = new Date(statSync(indexPath).mtimeMs).toISOString().slice(0, 10);
  let log = '';
  try {
    log = execFileSync('git', ['log', '--format=%x00%cs', '--name-only', '--no-renames'], { cwd: root, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 32 * 1024 * 1024 }).toString();
  } catch { /* No git history here: every page gets the fallback date. */ }
  sitemapDateCache = pageDates(parseGitFileDates(log), fallback);
  return sitemapDateCache;
}

const pageCache = new Map<string, { body: string; validators: Validators }>();

/** Pages only change when index.html does, so each language and route renders once per deploy. */
function renderedPage(view: SeoView, language: ArcadeLanguage): { body: string; validators: Validators } {
  const html = readIndexHtml();
  const key = `${indexCache?.mtimeMs}:${view}:${language}`;
  let page = pageCache.get(key);
  if (!page) {
    if (pageCache.size > 200) pageCache.clear();
    const body = renderPageForView(html, view, undefined, language);
    page = { body, validators: contentValidators(body) };
    pageCache.set(key, page);
  }
  return page;
}

function validatorHeaders(validators: Validators): Record<string, string> {
  return validators.lastModified ? { ETag: validators.etag, 'Last-Modified': validators.lastModified } : { ETag: validators.etag };
}

/** Answers 304 when the browser already has this version; true if it did. */
function sendNotModified(request: IncomingMessage, response: ServerResponse, validators: Validators, cacheControl: string): boolean {
  if (!isNotModified(request.headers, validators)) return false;
  response.writeHead(304, { 'Cache-Control': cacheControl, ...validatorHeaders(validators) });
  response.end();
  return true;
}

function sendText(response: ServerResponse, body: string, type: string, cacheControl: string, validators?: Validators): void {
  response.writeHead(200, {
    'Content-Type': type,
    'Cache-Control': cacheControl,
    'Content-Length': Buffer.byteLength(body),
    ...(validators ? validatorHeaders(validators) : {}),
  });
  response.end(body);
}

/** Assets are unhashed, so they revalidate; only the stable images get cached hard. */
function cacheControlFor(publicPath: string): string {
  if (publicPath.startsWith('public/') && /\.(png|jpg|webp|svg|ico)$/.test(publicPath)) {
    return 'public, max-age=604800';
  }
  return 'no-cache';
}

const server = createServer((request, response) => {
  // The old Render address moves for good to blastarcade.ro, so links to it count for the real site.
  const redirect = legacyHostRedirect(request.headers.host, request.method, request.url);
  if (redirect) {
    response.writeHead(301, { Location: redirect, 'Cache-Control': 'public, max-age=86400' });
    response.end();
    return;
  }
  const requestPath = new URL(request.url || '/', `http://${request.headers.host}`).pathname;

  if (requestPath === SCOREBOARD_ENDPOINT) {
    handleScores(request, response);
    return;
  }
  if (requestPath === BUG_REPORT_ENDPOINT) {
    handleBugReport(request, response);
    return;
  }
  if (requestPath === '/vendor/modern-screenshot.js' && existsSync(screenshotLibraryPath)) {
    response.writeHead(200, { 'Content-Type': mimeTypes['.js'], 'Cache-Control': 'public, max-age=86400' });
    createReadStream(screenshotLibraryPath).pipe(response);
    return;
  }
  if (requestPath === '/robots.txt') {
    sendText(response, buildRobotsTxt(), mimeTypes['.txt'], 'public, max-age=86400');
    return;
  }
  if (requestPath === '/sitemap.xml') {
    sendText(response, buildSitemapXml(sitemapDates()), mimeTypes['.xml'], 'public, max-age=86400');
    return;
  }

  // The hub and every game page, in English (/play/<game>) and Romanian (/ro/joc/<game>),
  // render the same shell with route-specific metadata and text, so crawlers see real
  // titles, canonicals and content without running JavaScript.
  if (requestPath === '/ro') {
    response.writeHead(301, { Location: '/ro/' });
    response.end();
    return;
  }
  const route = parseSeoPath(requestPath);
  if (route) {
    const page = renderedPage(route.view, route.language);
    if (sendNotModified(request, response, page.validators, 'no-cache')) return;
    sendText(response, page.body, mimeTypes['.html'], 'no-cache', page.validators);
    return;
  }

  // An unknown /play/<something> is a genuine 404, not the hub in disguise.
  const safePath = normalize(requestPath.slice(1)).replace(/^(\.\.[/\\])+/, '');
  const publicPath = safePath.replace(/\\/g, '/');
  const filePath = join(root, safePath);
  const isPublicFile =
    publicPath === 'service-worker.js' ||
    publicPath.startsWith('dist/') ||
    publicPath.startsWith('public/');

  if (
    !isPublicFile ||
    !filePath.startsWith(root) ||
    !existsSync(filePath) ||
    statSync(filePath).isDirectory()
  ) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }

  // Revalidation used to re-download every file: there was nothing to compare against.
  const { size, mtimeMs } = statSync(filePath);
  const validators = fileValidators(size, mtimeMs);
  const cacheControl = cacheControlFor(publicPath);
  if (sendNotModified(request, response, validators, cacheControl)) return;
  response.writeHead(200, {
    'Content-Type': mimeTypes[extname(filePath)] || 'application/octet-stream',
    'Cache-Control': cacheControl,
    'Content-Length': size,
    ...validatorHeaders(validators),
  });
  createReadStream(filePath).pipe(response);
});

const webSocketServer = new WebSocketServer({ server });

function createRoomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  do {
    code = Array.from({ length: 5 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
  } while (rooms.has(code) || inviteRooms.has(code));
  return code;
}

function send(socket: WebSocket, message: unknown): void {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
}

function broadcastRoom(roomCode: string): void {
  const room = rooms.get(roomCode);
  if (!room) return;
  const message = JSON.stringify({ type: 'state', state: room.snapshot() });
  for (const [socket, client] of clients) {
    if (client.kind === 'bomberman' && client.roomCode === roomCode && socket.readyState === socket.OPEN) socket.send(message);
  }
}

function joinRoom(socket: WebSocket, roomCode: string, create: boolean, quickMatch: boolean = false): void {
  const code = roomCode.toUpperCase();
  const room = rooms.get(code);
  if (!room) {
    send(socket, { type: 'error', message: 'Room not found. Check the code and try again.' });
    return;
  }
  if (room.connectedPlayers.size >= 2) {
    send(socket, { type: 'error', message: 'That room is already full.' });
    return;
  }

  const playerId: PlayerId = room.connectedPlayers.has(1) ? 2 : 1;
  clients.set(socket, { kind: 'bomberman', roomCode: code, playerId });
  room.connectPlayer(playerId);
  if (room.connectedPlayers.size === 2) matchmaking.remove(code);
  send(socket, { type: 'joined', roomCode: code, playerId, created: create, quickMatch });
  broadcastRoom(code);
}

function broadcastInviteStatus(roomCode: string): void {
  const room = inviteRooms.get(roomCode);
  if (!room) return;
  const message = JSON.stringify({ type: 'gameRoomStatus', ...room.snapshot() });
  for (const [socket, client] of clients) {
    if (client.kind === 'invite' && client.roomCode === roomCode && socket.readyState === socket.OPEN) socket.send(message);
  }
}

function sendToInviteRoom(roomCode: string, message: unknown, exclude?: WebSocket): void {
  const encoded = JSON.stringify(message);
  for (const [socket, client] of clients) {
    if (socket !== exclude && client.kind === 'invite' && client.roomCode === roomCode && socket.readyState === socket.OPEN) {
      socket.send(encoded);
    }
  }
}

function sendToInviteSeat(roomCode: string, seat: RelaySeat, message: unknown): void {
  const payload = JSON.stringify(message);
  for (const [socket, client] of clients) {
    if (client.kind === 'invite' && client.roomCode === roomCode && client.playerId === seat && socket.readyState === socket.OPEN) socket.send(payload);
  }
}

function joinInviteRoom(socket: WebSocket, roomCode: string, game: OnlineGameId, created: boolean, quickMatch: boolean = false): void {
  const code = roomCode.toUpperCase();
  const room = inviteRooms.get(code);
  if (!room || room.game !== game) {
    send(socket, { type: 'gameRoomError', message: 'Room not found for this game. Check the code and try again.' });
    return;
  }
  const playerId = room.join();
  if (!playerId) {
    send(socket, { type: 'gameRoomError', message: 'That room is already full.' });
    return;
  }
  clients.set(socket, { kind: 'invite', roomCode: code, playerId, game });
  if (room.isFull()) matchmaking.remove(code);
  send(socket, { type: 'gameRoomJoined', roomCode: code, game, playerId, created, quickMatch, capacity: room.capacity });
  broadcastInviteStatus(code);
}

webSocketServer.on('connection', socket => {
  socket.on('message', raw => {
    let message: unknown;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      send(socket, { type: 'error', message: 'Invalid message.' });
      return;
    }

    if (!message || typeof message !== 'object') return;
    const data = message as Record<string, unknown>;
    if (data.type === 'create') {
      if (clients.has(socket)) return;
      const code = createRoomCode();
      // The creator picks the map; OnlineRoom rejects anything out of range.
      rooms.set(code, new OnlineRoom(code, Number(data.level)));
      joinRoom(socket, code, true);
      return;
    }
    if (data.type === 'quickMatch') {
      if (clients.has(socket)) return;
      const waitingCode = matchmaking.claim('bomberman', code => {
        const room = rooms.get(code);
        return Boolean(room && !room.botDifficulty && room.connectedPlayers.size === 1);
      });
      if (waitingCode) {
        joinRoom(socket, waitingCode, false, true);
      } else {
        const code = createRoomCode();
        rooms.set(code, new OnlineRoom(code));
        matchmaking.enqueue('bomberman', code);
        joinRoom(socket, code, true, true);
      }
      return;
    }
    if (
      data.type === 'createBot' &&
      (data.difficulty === 'easy' || data.difficulty === 'normal' || data.difficulty === 'hard')
    ) {
      if (clients.has(socket)) return;
      const difficulty = data.difficulty as BotDifficulty;
      const code = createRoomCode();
      const room = new OnlineRoom(code, Number(data.level));
      rooms.set(code, room);
      clients.set(socket, { kind: 'bomberman', roomCode: code, playerId: 1 });
      room.connectPlayer(1);
      room.connectBot(difficulty);
      send(socket, { type: 'joined', roomCode: code, playerId: 1, botDifficulty: difficulty });
      broadcastRoom(code);
      return;
    }
    if (data.type === 'join' && typeof data.roomCode === 'string') {
      if (clients.has(socket)) return;
      joinRoom(socket, data.roomCode.trim(), false);
      return;
    }
    if (data.type === 'createGameRoom' && isOnlineGameId(data.game)) {
      if (clients.has(socket)) return;
      const code = createRoomCode();
      inviteRooms.set(code, new InviteRoom(code, data.game, roomSize(data.game, data.players)));
      joinInviteRoom(socket, code, data.game, true);
      return;
    }
    if (data.type === 'quickMatchGameRoom' && isOnlineGameId(data.game)) {
      if (clients.has(socket)) return;
      const game = data.game;
      const capacity = roomSize(game, data.players);
      const queue = `${game}:${capacity}`;
      const waitingCode = matchmaking.claim(queue, code => {
        const room = inviteRooms.get(code);
        return Boolean(room && room.game === game && room.capacity === capacity && room.connectedPlayers.size > 0 && !room.isFull());
      });
      if (waitingCode) {
        joinInviteRoom(socket, waitingCode, game, false, true);
        // A bigger room keeps looking until every seat is taken.
        if (!inviteRooms.get(waitingCode)?.isFull()) matchmaking.enqueue(queue, waitingCode);
      } else {
        const code = createRoomCode();
        inviteRooms.set(code, new InviteRoom(code, game, capacity));
        matchmaking.enqueue(queue, code);
        joinInviteRoom(socket, code, game, true, true);
      }
      return;
    }
    if (data.type === 'joinGameRoom' && isOnlineGameId(data.game) && typeof data.roomCode === 'string') {
      if (clients.has(socket)) return;
      joinInviteRoom(socket, data.roomCode.trim(), data.game, false);
      return;
    }
    if (data.type === 'fillGameRoomWithBots') {
      const client = clients.get(socket);
      // Only the host decides, since the host's device plays the bots.
      if (!client || client.kind !== 'invite' || client.playerId !== 1) return;
      const room = inviteRooms.get(client.roomCode);
      if (!room || !room.fillWithBots().length) return;
      matchmaking.remove(client.roomCode);
      broadcastInviteStatus(client.roomCode);
      return;
    }
    if (data.type === 'gameAction' && isRelayPayload(data.action, 16_384)) {
      const client = clients.get(socket);
      if (!client || client.kind !== 'invite') return;
      sendToInviteRoom(client.roomCode, {
        type: 'gameAction', game: client.game, roomCode: client.roomCode, from: client.playerId, action: data.action,
      }, socket);
      return;
    }
    if (data.type === 'gameState' && isRelayPayload(data.state)) {
      const client = clients.get(socket);
      if (!client || client.kind !== 'invite' || client.playerId !== 1) return;
      const message = { type: 'gameState', game: client.game, roomCode: client.roomCode, state: data.state };
      // Card games send each seat its own view, so no one receives another player's hand.
      if (isRelaySeat(data.to)) sendToInviteSeat(client.roomCode, data.to, message);
      else sendToInviteRoom(client.roomCode, message, socket);
      return;
    }
    if (data.type === 'action' && isPlayerAction(data.action)) {
      const client = clients.get(socket);
      if (!client || client.kind !== 'bomberman') return;
      rooms.get(client.roomCode)?.handleAction(client.playerId, data.action);
      broadcastRoom(client.roomCode);
    }
  });

  socket.on('close', () => {
    const client = clients.get(socket);
    if (!client) return;
    clients.delete(socket);
    if (client.kind === 'bomberman') {
      const room = rooms.get(client.roomCode);
      room?.disconnectPlayer(client.playerId);
      const hasHumanClients = [...clients.values()].some(other => other.kind === 'bomberman' && other.roomCode === client.roomCode);
      if (!hasHumanClients) {
        rooms.delete(client.roomCode);
        matchmaking.remove(client.roomCode);
      }
      else broadcastRoom(client.roomCode);
    } else {
      const room = inviteRooms.get(client.roomCode);
      room?.leave(client.playerId);
      if (!room?.connectedPlayers.size) {
        inviteRooms.delete(client.roomCode);
        matchmaking.remove(client.roomCode);
      }
      else broadcastInviteStatus(client.roomCode);
    }
  });
});

setInterval(() => {
  reportsPerClient.prune();
  scoresPerClient.prune();
  scoresOverall.prune();
  reportsPerTester.prune();
  reportsOverall.prune();
}, 10 * 60_000).unref();

setInterval(() => {
  for (const [code, room] of rooms) {
    room.update();
    broadcastRoom(code);
  }
}, 50);

server.listen(PORT, HOST, () => {
  console.log(`Blast Arcade online server: http://localhost:${PORT}`);
  console.log(`Scoreboard storage: ${scoreStore.kind === 'upstash' ? 'Upstash Redis' : 'files (reset on each deploy unless on a persistent disk)'}`);
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses || []) {
      if (address.family === 'IPv4' && !address.internal) {
        console.log(`LAN invitation URL: http://${address.address}:${PORT}`);
      }
    }
  }
});
