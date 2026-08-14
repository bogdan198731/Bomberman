import { GameRoomClient } from './game-room.js';

export type BlockPlayer = 1 | 2;
export type BlockMode = 'bot' | 'duel';
export type BlockPhase = 'ready' | 'playing' | 'finished';
export type BlockAction = 'left' | 'right' | 'rotate' | 'down' | 'drop';
export type TetrominoType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';
export type BlockCell = TetrominoType | 'G' | null;
export type BlockBoard = BlockCell[][];

export const BLOCK_BOARD_WIDTH = 10;
export const BLOCK_BOARD_HEIGHT = 20;
export const BLOCK_TYPES: TetrominoType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

const BASE_CELLS: Record<TetrominoType, ReadonlyArray<readonly [number, number]>> = {
  I: [[0, 1], [1, 1], [2, 1], [3, 1]],
  O: [[1, 0], [2, 0], [1, 1], [2, 1]],
  T: [[1, 0], [0, 1], [1, 1], [2, 1]],
  S: [[1, 0], [2, 0], [0, 1], [1, 1]],
  Z: [[0, 0], [1, 0], [1, 1], [2, 1]],
  J: [[0, 0], [0, 1], [1, 1], [2, 1]],
  L: [[2, 0], [0, 1], [1, 1], [2, 1]],
};

const BLOCK_COLORS: Record<Exclude<BlockCell, null>, string> = {
  I: '#55d9ff', O: '#ffc857', T: '#a56bff', S: '#54e38e',
  Z: '#ff6b78', J: '#6d8cff', L: '#ff9b54', G: '#657184',
};

export interface FallingPiece {
  id: number;
  type: TetrominoType;
  rotation: number;
  x: number;
  y: number;
}

export interface BlockDropSnapshot {
  boards: Record<BlockPlayer, BlockBoard>;
  active: Record<BlockPlayer, FallingPiece>;
  scores: Record<BlockPlayer, number>;
  lines: Record<BlockPlayer, number>;
  pendingGarbage: Record<BlockPlayer, number>;
  mode: BlockMode;
  phase: BlockPhase;
  winner: BlockPlayer | null;
}

function otherPlayer(player: BlockPlayer): BlockPlayer { return player === 1 ? 2 : 1; }

export function createBlockBoard(): BlockBoard {
  return Array.from({ length: BLOCK_BOARD_HEIGHT }, () => Array<BlockCell>(BLOCK_BOARD_WIDTH).fill(null));
}

export function pieceCells(piece: Pick<FallingPiece, 'type' | 'rotation'>): Array<readonly [number, number]> {
  let cells = BASE_CELLS[piece.type].map(([x, y]) => [x, y] as [number, number]);
  const turns = ((piece.rotation % 4) + 4) % 4;
  for (let turn = 0; turn < turns; turn += 1) {
    cells = cells.map(([x, y]) => [-y, x]);
    const minX = Math.min(...cells.map(([x]) => x));
    const minY = Math.min(...cells.map(([, y]) => y));
    cells = cells.map(([x, y]) => [x - minX, y - minY]);
  }
  const minX = Math.min(...cells.map(([x]) => x));
  const minY = Math.min(...cells.map(([, y]) => y));
  return cells.map(([x, y]) => [x - minX, y - minY] as const);
}

export class BlockDropGame {
  boards: Record<BlockPlayer, BlockBoard> = { 1: createBlockBoard(), 2: createBlockBoard() };
  active: Record<BlockPlayer, FallingPiece> = {
    1: { id: 0, type: 'I', rotation: 0, x: 3, y: 0 },
    2: { id: 0, type: 'I', rotation: 0, x: 3, y: 0 },
  };
  scores: Record<BlockPlayer, number> = { 1: 0, 2: 0 };
  lines: Record<BlockPlayer, number> = { 1: 0, 2: 0 };
  pendingGarbage: Record<BlockPlayer, number> = { 1: 0, 2: 0 };
  mode: BlockMode = 'bot';
  phase: BlockPhase = 'ready';
  winner: BlockPlayer | null = null;
  private random: () => number;
  private pieceHistory: TetrominoType[] = [];
  private pieceIndexes: Record<BlockPlayer, number> = { 1: 0, 2: 0 };
  private gravityTimers: Record<BlockPlayer, number> = { 1: 0, 2: 0 };
  private nextPieceId = 1;
  private botTimer = .6;

  constructor(random: () => number = Math.random) {
    this.random = random;
    this.restart();
  }

  restart(mode: BlockMode = this.mode): void {
    this.mode = mode;
    this.boards = { 1: createBlockBoard(), 2: createBlockBoard() };
    this.scores = { 1: 0, 2: 0 };
    this.lines = { 1: 0, 2: 0 };
    this.pendingGarbage = { 1: 0, 2: 0 };
    this.pieceHistory = [];
    this.pieceIndexes = { 1: 0, 2: 0 };
    this.gravityTimers = { 1: 0, 2: 0 };
    this.nextPieceId = 1;
    this.botTimer = .6;
    this.phase = 'ready';
    this.winner = null;
    this.spawnPiece(1);
    this.spawnPiece(2);
  }

  start(): boolean {
    if (this.phase !== 'ready') return false;
    this.phase = 'playing';
    return true;
  }

  move(player: BlockPlayer, direction: -1 | 1): boolean {
    if (this.phase !== 'playing') return false;
    const piece = this.active[player];
    const next = { ...piece, x: piece.x + direction };
    if (!this.canPlace(player, next)) return false;
    this.active[player] = next;
    return true;
  }

  rotate(player: BlockPlayer): boolean {
    if (this.phase !== 'playing') return false;
    const piece = this.active[player];
    for (const kick of [0, -1, 1, -2, 2]) {
      const next = { ...piece, rotation: (piece.rotation + 1) % 4, x: piece.x + kick };
      if (!this.canPlace(player, next)) continue;
      this.active[player] = next;
      return true;
    }
    return false;
  }

  softDrop(player: BlockPlayer): boolean {
    return this.stepDown(player, true);
  }

  private stepDown(player: BlockPlayer, awardPoint: boolean): boolean {
    if (this.phase !== 'playing') return false;
    const piece = this.active[player];
    const next = { ...piece, y: piece.y + 1 };
    if (this.canPlace(player, next)) {
      this.active[player] = next;
      if (awardPoint) this.scores[player] += 1;
      return true;
    }
    this.lockPiece(player);
    return true;
  }

  hardDrop(player: BlockPlayer): boolean {
    if (this.phase !== 'playing') return false;
    const piece = { ...this.active[player] };
    let distance = 0;
    while (this.canPlace(player, { ...piece, y: piece.y + 1 })) {
      piece.y += 1;
      distance += 1;
    }
    this.active[player] = piece;
    this.scores[player] += distance * 2;
    this.lockPiece(player);
    return true;
  }

  perform(player: BlockPlayer, action: BlockAction): boolean {
    if (action === 'left') return this.move(player, -1);
    if (action === 'right') return this.move(player, 1);
    if (action === 'rotate') return this.rotate(player);
    if (action === 'down') return this.softDrop(player);
    return this.hardDrop(player);
  }

  update(seconds: number): void {
    if (this.phase !== 'playing') return;
    const elapsed = Math.max(0, Math.min(.25, seconds));
    if (this.mode === 'bot') this.updateBot(elapsed);
    for (const player of [1, 2] as BlockPlayer[]) {
      if (this.phase !== 'playing' || (this.mode === 'bot' && player === 2)) continue;
      this.gravityTimers[player] += elapsed;
      const interval = Math.max(.18, .72 - this.lines[player] * .012);
      if (this.gravityTimers[player] >= interval) {
        this.gravityTimers[player] -= interval;
        this.stepDown(player, false);
      }
    }
  }

  spawnPiece(player: BlockPlayer): boolean {
    const type = this.nextType(player);
    const width = Math.max(...pieceCells({ type, rotation: 0 }).map(([x]) => x)) + 1;
    const piece: FallingPiece = {
      id: this.nextPieceId++, type, rotation: 0,
      x: Math.floor((BLOCK_BOARD_WIDTH - width) / 2), y: 0,
    };
    this.active[player] = piece;
    if (this.canPlace(player, piece)) return true;
    this.finish(otherPlayer(player));
    return false;
  }

  ghostY(player: BlockPlayer): number {
    const piece = this.active[player];
    let y = piece.y;
    while (this.canPlace(player, { ...piece, y: y + 1 })) y += 1;
    return y;
  }

  statusText(): string {
    if (this.phase === 'ready') return this.mode === 'bot'
      ? 'Clear lines and bury the Coral bot under garbage blocks.'
      : 'Two boards are ready. Every cleared line attacks your rival.';
    if (this.phase === 'playing') return 'Build clean stacks, counter incoming garbage, and avoid topping out.';
    return `${this.winner === 1 ? 'Mint' : 'Coral'} wins the Block Drop duel!`;
  }

  private nextType(player: BlockPlayer): TetrominoType {
    const index = this.pieceIndexes[player]++;
    while (this.pieceHistory.length <= index) {
      const randomIndex = Math.min(BLOCK_TYPES.length - 1, Math.floor(this.random() * BLOCK_TYPES.length));
      this.pieceHistory.push(BLOCK_TYPES[randomIndex]);
    }
    return this.pieceHistory[index];
  }

  private canPlace(player: BlockPlayer, piece: FallingPiece): boolean {
    return this.canPlaceOn(this.boards[player], piece);
  }

  private canPlaceOn(board: BlockBoard, piece: FallingPiece): boolean {
    return pieceCells(piece).every(([cellX, cellY]) => {
      const x = piece.x + cellX;
      const y = piece.y + cellY;
      return x >= 0 && x < BLOCK_BOARD_WIDTH && y >= 0 && y < BLOCK_BOARD_HEIGHT && board[y][x] === null;
    });
  }

  private lockPiece(player: BlockPlayer): void {
    const piece = this.active[player];
    for (const [cellX, cellY] of pieceCells(piece)) {
      const x = piece.x + cellX;
      const y = piece.y + cellY;
      if (y < 0 || y >= BLOCK_BOARD_HEIGHT || x < 0 || x >= BLOCK_BOARD_WIDTH) {
        this.finish(otherPlayer(player));
        return;
      }
      this.boards[player][y][x] = piece.type;
    }

    const cleared = this.clearLines(player);
    this.lines[player] += cleared;
    this.scores[player] += [0, 100, 300, 500, 800][cleared] ?? cleared * 250;
    let attack = cleared;
    const cancelled = Math.min(attack, this.pendingGarbage[player]);
    attack -= cancelled;
    this.pendingGarbage[player] -= cancelled;
    if (attack > 0) this.pendingGarbage[otherPlayer(player)] += attack;

    if (!this.applyPendingGarbage(player)) return;
    this.gravityTimers[player] = 0;
    this.spawnPiece(player);
  }

  private clearLines(player: BlockPlayer): number {
    const board = this.boards[player];
    const survivors = board.filter(row => row.some(cell => cell === null));
    const cleared = BLOCK_BOARD_HEIGHT - survivors.length;
    while (survivors.length < BLOCK_BOARD_HEIGHT) survivors.unshift(Array<BlockCell>(BLOCK_BOARD_WIDTH).fill(null));
    this.boards[player] = survivors;
    return cleared;
  }

  private applyPendingGarbage(player: BlockPlayer): boolean {
    const count = this.pendingGarbage[player];
    this.pendingGarbage[player] = 0;
    for (let line = 0; line < count; line += 1) {
      const removed = this.boards[player].shift()!;
      if (removed.some(cell => cell !== null)) {
        this.finish(otherPlayer(player));
        return false;
      }
      const hole = Math.min(BLOCK_BOARD_WIDTH - 1, Math.floor(this.random() * BLOCK_BOARD_WIDTH));
      this.boards[player].push(Array.from({ length: BLOCK_BOARD_WIDTH }, (_, column) => column === hole ? null : 'G'));
    }
    return true;
  }

  private updateBot(elapsed: number): void {
    this.botTimer -= elapsed;
    if (this.botTimer > 0 || this.phase !== 'playing') return;
    this.botTimer = .62;
    const best = this.bestBotPlacement();
    if (best) this.active[2] = { ...this.active[2], rotation: best.rotation, x: best.x };
    this.hardDrop(2);
  }

  private bestBotPlacement(): { rotation: number; x: number } | null {
    const current = this.active[2];
    let best: { rotation: number; x: number; score: number } | null = null;
    for (let rotation = 0; rotation < 4; rotation += 1) {
      const cells = pieceCells({ type: current.type, rotation });
      const width = Math.max(...cells.map(([x]) => x)) + 1;
      for (let x = 0; x <= BLOCK_BOARD_WIDTH - width; x += 1) {
        const candidate = { ...current, rotation, x, y: 0 };
        if (!this.canPlaceOn(this.boards[2], candidate)) continue;
        while (this.canPlaceOn(this.boards[2], { ...candidate, y: candidate.y + 1 })) candidate.y += 1;
        const board = this.boards[2].map(row => [...row]);
        for (const [cellX, cellY] of pieceCells(candidate)) board[candidate.y + cellY][candidate.x + cellX] = candidate.type;
        const cleared = board.filter(row => row.every(cell => cell !== null)).length;
        const evaluatedBoard = board.filter(row => row.some(cell => cell === null));
        while (evaluatedBoard.length < BLOCK_BOARD_HEIGHT) evaluatedBoard.unshift(Array<BlockCell>(BLOCK_BOARD_WIDTH).fill(null));
        const heights: number[] = [];
        let holes = 0;
        for (let column = 0; column < BLOCK_BOARD_WIDTH; column += 1) {
          const top = evaluatedBoard.findIndex(row => row[column] !== null);
          heights.push(top < 0 ? 0 : BLOCK_BOARD_HEIGHT - top);
          if (top >= 0) {
            for (let row = top + 1; row < BLOCK_BOARD_HEIGHT; row += 1) if (evaluatedBoard[row][column] === null) holes += 1;
          }
        }
        const aggregateHeight = heights.reduce((total, height) => total + height, 0);
        const bumpiness = heights.slice(1).reduce((total, height, index) => total + Math.abs(height - heights[index]), 0);
        const score = cleared * 120 - aggregateHeight * .58 - holes * 8 - bumpiness * .42;
        if (!best || score > best.score) best = { rotation, x, score };
      }
    }
    return best;
  }

  private finish(winner: BlockPlayer): void {
    this.phase = 'finished';
    this.winner = winner;
  }
}

export function createBlockDropSnapshot(game: BlockDropGame): BlockDropSnapshot {
  return {
    boards: game.boards,
    active: game.active,
    scores: game.scores,
    lines: game.lines,
    pendingGarbage: game.pendingGarbage,
    mode: game.mode,
    phase: game.phase,
    winner: game.winner,
  };
}

export function applyBlockDropSnapshot(game: BlockDropGame, state: BlockDropSnapshot): void {
  game.boards = state.boards;
  game.active = state.active;
  game.scores = state.scores;
  game.lines = state.lines;
  game.pendingGarbage = state.pendingGarbage;
  game.mode = state.mode;
  game.phase = state.phase;
  game.winner = state.winner;
}

export function initBlockDrop(): void {
  if (typeof document === 'undefined') return;
  const canvasElement = document.getElementById('blocksCanvas') as HTMLCanvasElement | null;
  const contextValue = canvasElement?.getContext('2d');
  const viewElement = document.getElementById('blocksView');
  if (!canvasElement || !contextValue || !viewElement) return;
  const canvas = canvasElement;
  const ctx = contextValue;
  const view = viewElement;
  canvas.width = 900;
  canvas.height = 600;
  const game = new BlockDropGame();
  const status = document.getElementById('blocksStatus');
  const mintScore = document.getElementById('blocksMintScore');
  const coralScore = document.getElementById('blocksCoralScore');
  const mintLines = document.getElementById('blocksMintLines');
  const coralLines = document.getElementById('blocksCoralLines');
  const startButton = document.getElementById('blocksStartButton') as HTMLButtonElement | null;
  const modeButtons = document.querySelectorAll<HTMLButtonElement>('[data-blocks-mode]');
  const roomMount = document.querySelector<HTMLElement>('[data-game-room="blocks"]');
  let room: GameRoomClient | null = null;

  function snapshot(): Record<string, unknown> {
    return createBlockDropSnapshot(game) as unknown as Record<string, unknown>;
  }

  function restore(state: Record<string, unknown>): void {
    if (!state.boards || !state.active) return;
    applyBlockDropSnapshot(game, state as unknown as BlockDropSnapshot);
  }

  function visible(): boolean { return !view.classList.contains('view-hidden'); }

  function performAction(player: BlockPlayer, action: BlockAction): void {
    const session = room?.session();
    if (!session?.online) {
      if (game.mode === 'bot' && player === 2) return;
      game.perform(player, action);
    } else if (session.ready && room?.canControl(player)) {
      if (room.isGuest()) room.sendAction({ type: 'action', action });
      else game.perform(player, action);
    }
  }

  function startMatch(): void {
    const session = room?.session();
    if (session?.online && !session.ready) return;
    if (room?.isGuest()) room.sendAction({ type: 'start' });
    else {
      if (game.phase === 'finished') game.restart(game.mode);
      game.start();
      room?.broadcastState(snapshot(), true);
    }
    syncUi();
  }

  function syncUi(): void {
    if (status) status.textContent = game.statusText();
    if (mintScore) mintScore.textContent = String(game.scores[1]);
    if (coralScore) coralScore.textContent = String(game.scores[2]);
    if (mintLines) mintLines.textContent = `${game.lines[1]} lines`;
    if (coralLines) coralLines.textContent = `${game.lines[2]} lines`;
    if (startButton) {
      startButton.disabled = game.phase === 'playing' || Boolean(room?.session().online && !room.session().ready);
      startButton.textContent = game.phase === 'finished' ? 'New duel' : game.phase === 'ready' ? 'Start duel' : 'Battle live';
    }
    modeButtons.forEach(button => {
      button.classList.toggle('active', button.dataset.blocksMode === game.mode);
      button.disabled = Boolean(room?.session().online) || game.phase === 'playing';
    });
  }

  function drawCell(x: number, y: number, size: number, cell: Exclude<BlockCell, null>, alpha = 1): void {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = BLOCK_COLORS[cell];
    ctx.shadowColor = BLOCK_COLORS[cell];
    ctx.shadowBlur = cell === 'G' ? 0 : 9;
    ctx.fillRect(x + 2, y + 2, size - 4, size - 4);
    ctx.fillStyle = 'rgba(255,255,255,.2)';
    ctx.fillRect(x + 4, y + 4, size - 8, 3);
    ctx.strokeStyle = 'rgba(0,0,0,.32)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 2, y + 2, size - 4, size - 4);
    ctx.restore();
  }

  function drawBoard(player: BlockPlayer, originX: number): void {
    const originY = 76;
    const cellSize = 24;
    ctx.fillStyle = player === 1 ? 'rgba(84,227,142,.08)' : 'rgba(255,107,120,.08)';
    ctx.fillRect(originX - 10, originY - 10, BLOCK_BOARD_WIDTH * cellSize + 20, BLOCK_BOARD_HEIGHT * cellSize + 20);
    ctx.strokeStyle = player === 1 ? 'rgba(84,227,142,.45)' : 'rgba(255,107,120,.45)';
    ctx.lineWidth = 3;
    ctx.strokeRect(originX - 10, originY - 10, BLOCK_BOARD_WIDTH * cellSize + 20, BLOCK_BOARD_HEIGHT * cellSize + 20);
    const board = game.boards[player];
    for (let row = 0; row < BLOCK_BOARD_HEIGHT; row += 1) {
      for (let column = 0; column < BLOCK_BOARD_WIDTH; column += 1) {
        ctx.fillStyle = 'rgba(255,255,255,.025)';
        ctx.fillRect(originX + column * cellSize + 1, originY + row * cellSize + 1, cellSize - 2, cellSize - 2);
        const cell = board[row][column];
        if (cell) drawCell(originX + column * cellSize, originY + row * cellSize, cellSize, cell);
      }
    }
    if (game.phase !== 'finished') {
      const piece = game.active[player];
      const ghost = { ...piece, y: game.ghostY(player) };
      for (const [cellX, cellY] of pieceCells(ghost)) drawCell(originX + (ghost.x + cellX) * cellSize, originY + (ghost.y + cellY) * cellSize, cellSize, ghost.type, .2);
      for (const [cellX, cellY] of pieceCells(piece)) drawCell(originX + (piece.x + cellX) * cellSize, originY + (piece.y + cellY) * cellSize, cellSize, piece.type);
    }
  }

  function render(): void {
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#121a2a');
    gradient.addColorStop(1, '#080d16');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(255,255,255,.03)';
    for (let x = 0; x < canvas.width; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke(); }
    drawBoard(1, 75);
    drawBoard(2, 585);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#9aa8bd';
    ctx.font = '850 14px system-ui';
    ctx.fillText('GARBAGE QUEUE', 450, 205);
    ctx.fillStyle = '#54e38e';
    ctx.font = '950 42px system-ui';
    ctx.fillText(String(game.pendingGarbage[1]), 402, 260);
    ctx.fillStyle = '#657184';
    ctx.fillText('⇄', 450, 260);
    ctx.fillStyle = '#ff6b78';
    ctx.fillText(String(game.pendingGarbage[2]), 498, 260);
    ctx.fillStyle = '#ffc857';
    ctx.font = '900 13px system-ui';
    ctx.fillText('CLEAR LINES TO ATTACK', 450, 315);
    if (game.phase === 'ready') {
      ctx.fillStyle = 'rgba(7,10,16,.52)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#ffc857';
      ctx.font = '950 48px system-ui';
      ctx.fillText('BLOCK DROP DUEL', canvas.width / 2, canvas.height / 2);
    } else if (game.phase === 'finished') {
      ctx.fillStyle = 'rgba(7,10,16,.68)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = game.winner === 1 ? '#54e38e' : '#ff6b78';
      ctx.font = '950 54px system-ui';
      ctx.fillText(`${game.winner === 1 ? 'MINT' : 'CORAL'} WINS`, canvas.width / 2, canvas.height / 2);
    }
  }

  const commands: Record<string, readonly [BlockPlayer, BlockAction]> = {
    KeyA: [1, 'left'], KeyD: [1, 'right'], KeyW: [1, 'rotate'], KeyS: [1, 'down'], KeyF: [1, 'drop'],
    ArrowLeft: [2, 'left'], ArrowRight: [2, 'right'], ArrowUp: [2, 'rotate'], ArrowDown: [2, 'down'], Enter: [2, 'drop'],
  };
  window.addEventListener('keydown', event => {
    if (!visible()) return;
    const command = commands[event.code];
    if (command) {
      event.preventDefault();
      if (!event.repeat || command[1] === 'left' || command[1] === 'right' || command[1] === 'down') performAction(command[0], command[1]);
    } else if (event.code === 'Space' && !event.repeat) {
      event.preventDefault();
      startMatch();
    }
  });

  const repeatTimers = new Map<HTMLButtonElement, number>();
  document.querySelectorAll<HTMLButtonElement>('[data-blocks-player][data-blocks-action]').forEach(button => {
    const player = Number(button.dataset.blocksPlayer) as BlockPlayer;
    const action = button.dataset.blocksAction as BlockAction;
    const stop = (): void => {
      button.classList.remove('pressed');
      const timer = repeatTimers.get(button);
      if (timer) window.clearInterval(timer);
      repeatTimers.delete(button);
    };
    button.addEventListener('pointerdown', event => {
      event.preventDefault();
      button.setPointerCapture?.(event.pointerId);
      button.classList.add('pressed');
      performAction(player, action);
      if (action === 'left' || action === 'right' || action === 'down') {
        repeatTimers.set(button, window.setInterval(() => performAction(player, action), 115));
      }
    });
    button.addEventListener('pointerup', stop);
    button.addEventListener('pointercancel', stop);
    button.addEventListener('lostpointercapture', stop);
  });
  modeButtons.forEach(button => button.addEventListener('click', () => {
    if (room?.session().online) return;
    const mode = button.dataset.blocksMode;
    if (mode === 'bot' || mode === 'duel') { game.restart(mode); syncUi(); render(); }
  }));
  startButton?.addEventListener('click', startMatch);
  document.getElementById('blocksRestartButton')?.addEventListener('click', () => {
    if (room?.isGuest()) room.sendAction({ type: 'restart' });
    else {
      game.restart(game.mode);
      syncUi(); render();
      room?.broadcastState(snapshot(), true);
    }
  });

  if (roomMount) {
    room = new GameRoomClient({
      game: 'blocks',
      mount: roomMount,
      onPlayLocal: () => { game.restart('duel'); syncUi(); render(); },
      onSessionChange: session => {
        if (!session.online) game.restart('bot');
        else if (game.mode !== 'duel') game.restart('duel');
        if (session.ready && session.playerId === 1) {
          game.restart('duel');
          room?.broadcastState(snapshot(), true);
        }
        syncUi(); render();
      },
      onRemoteAction: (action, from) => {
        if (!room?.isHost() || from !== 2) return;
        if (action.type === 'action' && (action.action === 'left' || action.action === 'right' || action.action === 'rotate' || action.action === 'down' || action.action === 'drop')) {
          game.perform(2, action.action);
        } else if (action.type === 'start') {
          if (game.phase === 'finished') game.restart('duel');
          game.start();
        } else if (action.type === 'restart') game.restart('duel');
        room.broadcastState(snapshot(), true);
        syncUi();
      },
      onState: state => {
        if (!room?.isGuest()) return;
        restore(state);
        syncUi(); render();
      },
    });
  }

  let previous = performance.now();
  function loop(now: number): void {
    if (visible()) {
      if (!room?.isGuest()) {
        game.update((now - previous) / 1000);
        room?.broadcastState(snapshot());
      }
      render();
      syncUi();
    }
    previous = now;
    requestAnimationFrame(loop);
  }
  syncUi(); render(); requestAnimationFrame(loop);
}
