export const ONLINE_GAME_IDS = ['tintar', 'paddle', 'snake', 'tanks', 'survival'] as const;
export type OnlineGameId = typeof ONLINE_GAME_IDS[number];
export type RelayPlayerId = 1 | 2;

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
  readonly connectedPlayers = new Set<RelayPlayerId>();

  constructor(code: string, game: OnlineGameId) {
    this.code = code.toUpperCase();
    this.game = game;
  }

  join(): RelayPlayerId | null {
    const player: RelayPlayerId | null = !this.connectedPlayers.has(1)
      ? 1
      : !this.connectedPlayers.has(2)
        ? 2
        : null;
    if (player) this.connectedPlayers.add(player);
    return player;
  }

  leave(player: RelayPlayerId): void {
    this.connectedPlayers.delete(player);
  }

  snapshot(): { roomCode: string; game: OnlineGameId; connectedPlayers: RelayPlayerId[] } {
    return {
      roomCode: this.code,
      game: this.game,
      connectedPlayers: [...this.connectedPlayers].sort(),
    };
  }
}
