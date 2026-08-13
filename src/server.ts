import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  OnlineRoom,
  isPlayerAction,
  type BotDifficulty,
  type PlayerId,
} from './multiplayer.js';

const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '0.0.0.0';
const root = process.cwd();
const rooms = new Map<string, OnlineRoom>();
const clients = new Map<WebSocket, { roomCode: string; playerId: PlayerId }>();

const mimeTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

const server = createServer((request, response) => {
  const requestPath = new URL(request.url || '/', `http://${request.headers.host}`).pathname;
  const relativePath = requestPath === '/' ? 'index.html' : requestPath.slice(1);
  const safePath = normalize(relativePath).replace(/^(\.\.[/\\])+/, '');
  const publicPath = safePath.replace(/\\/g, '/');
  const filePath = join(root, safePath);
  const isPublicFile = publicPath === 'index.html' || publicPath.startsWith('dist/');

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

  response.writeHead(200, {
    'Content-Type': mimeTypes[extname(filePath)] || 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  createReadStream(filePath).pipe(response);
});

const webSocketServer = new WebSocketServer({ server });

function createRoomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  do {
    code = Array.from({ length: 5 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
  } while (rooms.has(code));
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
    if (client.roomCode === roomCode && socket.readyState === socket.OPEN) socket.send(message);
  }
}

function joinRoom(socket: WebSocket, roomCode: string, create: boolean): void {
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
  clients.set(socket, { roomCode: code, playerId });
  room.connectPlayer(playerId);
  send(socket, { type: 'joined', roomCode: code, playerId, created: create });
  broadcastRoom(code);
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
      rooms.set(code, new OnlineRoom(code));
      joinRoom(socket, code, true);
      return;
    }
    if (
      data.type === 'createBot' &&
      (data.difficulty === 'easy' || data.difficulty === 'normal' || data.difficulty === 'hard')
    ) {
      if (clients.has(socket)) return;
      const difficulty = data.difficulty as BotDifficulty;
      const code = createRoomCode();
      const room = new OnlineRoom(code);
      rooms.set(code, room);
      clients.set(socket, { roomCode: code, playerId: 1 });
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
    if (data.type === 'action' && isPlayerAction(data.action)) {
      const client = clients.get(socket);
      if (!client) return;
      rooms.get(client.roomCode)?.handleAction(client.playerId, data.action);
      broadcastRoom(client.roomCode);
    }
  });

  socket.on('close', () => {
    const client = clients.get(socket);
    if (!client) return;
    clients.delete(socket);
    const room = rooms.get(client.roomCode);
    room?.disconnectPlayer(client.playerId);
    const hasHumanClients = [...clients.values()].some(other => other.roomCode === client.roomCode);
    if (!hasHumanClients) rooms.delete(client.roomCode);
    else broadcastRoom(client.roomCode);
  });
});

setInterval(() => {
  for (const [code, room] of rooms) {
    room.update();
    broadcastRoom(code);
  }
}, 50);

server.listen(PORT, HOST, () => {
  console.log(`Blast Buddies online server: http://localhost:${PORT}`);
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses || []) {
      if (address.family === 'IPv4' && !address.internal) {
        console.log(`LAN invitation URL: http://${address.address}:${PORT}`);
      }
    }
  }
});
