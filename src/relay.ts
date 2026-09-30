export const ONLINE_GAME_IDS = ['tintar', 'paddle', 'snake', 'tanks', 'septica', 'survival', 'racing', 'blocks', 'cycles', 'fourrow', 'hockey', 'reversi'] as const;
export type OnlineGameId = typeof ONLINE_GAME_IDS[number];
/** The seat in a two-player room, which is what almost every online game uses. */
export type RelayPlayerId = 1 | 2;
/** Any seat; only games listed in ROOM_SIZES seat more than two. */
export type RelaySeat = 1 | 2 | 3 | 4;

/** Games whose rooms can seat more than two; the first size is the default. */
export const ROOM_SIZES: Partial<Record<OnlineGameId, readonly number[]>> = { septica: [2, 3, 4] };

export function roomSize(game: OnlineGameId, requested: unknown): number {
  const sizes = ROOM_SIZES[game] ?? [2];
  return sizes.includes(requested as number) ? requested as number : sizes[0];
}

export const isRelaySeat = (value: unknown): value is RelaySeat => value === 1 || value === 2 || value === 3 || value === 4;

export function isOnlineGameId(value: unknown): value is OnlineGameId {
  return typeof value === 'string' && ONLINE_GAME_IDS.includes(value as OnlineGameId);
}

export function isRelayPayload(value: unknown, maxLength: number = 65_536): boolean {
  if (!value || typeof value !== 'object') return false;
  try {
    return JSON.stringify(value).length <= maxLength;
  } catch {
    return false;
  }
}

export class InviteRoom {
  readonly code: string;
  readonly game: OnlineGameId;
  readonly capacity: number;
  readonly connectedPlayers = new Set<RelaySeat>();

  constructor(code: string, game: OnlineGameId, capacity: number = 2) {
    this.code = code.toUpperCase();
    this.game = game;
    this.capacity = roomSize(game, capacity);
  }

  /** Takes the lowest free seat, so a player who drops can come back to theirs. */
  join(): RelaySeat | null {
    for (let seat = 1; seat <= this.capacity; seat++) {
      if (!this.connectedPlayers.has(seat as RelaySeat)) {
        this.connectedPlayers.add(seat as RelaySeat);
        return seat as RelaySeat;
      }
    }
    return null;
  }

  leave(player: RelaySeat): void {
    this.connectedPlayers.delete(player);
  }

  isFull(): boolean {
    return this.connectedPlayers.size >= this.capacity;
  }

  snapshot(): { roomCode: string; game: OnlineGameId; connectedPlayers: RelaySeat[]; capacity: number } {
    return {
      roomCode: this.code,
      game: this.game,
      connectedPlayers: [...this.connectedPlayers].sort(),
      capacity: this.capacity,
    };
  }
}
