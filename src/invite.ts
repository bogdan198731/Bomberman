import { ONLINE_GAME_IDS, isOnlineGameId, type OnlineGameId } from './relay.js';

export const INVITE_GAME_IDS = ['bomberman', ...ONLINE_GAME_IDS] as const;
export type InviteGameId = 'bomberman' | OnlineGameId;

export interface ArcadeInvite {
  game: InviteGameId;
  roomCode: string;
}

export interface ArcadeInviteShareData {
  title: string;
  text: string;
  url: string;
}

export type InviteDeliveryResult = 'shared' | 'copied' | 'cancelled' | 'unavailable';

const GAME_NAMES: Record<InviteGameId, string> = {
  bomberman: 'Blast Buddies',
  tintar: 'Țintar',
  paddle: 'Paddle Clash',
  snake: 'Neon Snake Arena',
  tanks: 'Mini Tanks',
  septica: 'Șeptică',
  survival: 'Survival Arena',
  racing: 'Micro Racers',
  blocks: 'Block Drop Duel',
};

export function normalizeInviteCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase();
  return /^[A-Z2-9]{5}$/.test(code) ? code : null;
}

export function parseArcadeInvite(search: string): ArcadeInvite | null {
  const params = new URLSearchParams(search);
  const roomCode = normalizeInviteCode(params.get('room'));
  if (!roomCode) return null;
  const requestedGame = params.get('game');
  if (!requestedGame) return { game: 'bomberman', roomCode };
  if (requestedGame === 'bomberman' || isOnlineGameId(requestedGame)) return { game: requestedGame, roomCode };
  return null;
}

export function createArcadeInviteUrl(baseUrl: string, game: InviteGameId, roomCodeValue: string): string {
  const roomCode = normalizeInviteCode(roomCodeValue);
  if (!roomCode) throw new Error('Invalid room code');
  const url = new URL(baseUrl);
  url.searchParams.set('game', game);
  url.searchParams.set('room', roomCode);
  url.hash = '';
  return url.toString();
}

export function clearArcadeInviteUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  url.searchParams.delete('game');
  url.searchParams.delete('room');
  return url.toString();
}

export function arcadeInviteShareData(baseUrl: string, game: InviteGameId, roomCode: string): ArcadeInviteShareData {
  const name = GAME_NAMES[game];
  const code = normalizeInviteCode(roomCode);
  if (!code) throw new Error('Invalid room code');
  return {
    title: `Join ${name} in Blast Arcade`,
    text: `Join my ${name} match in Blast Arcade. Room ${code}.`,
    url: createArcadeInviteUrl(baseUrl, game, code),
  };
}

export async function shareOrCopyInvite(
  data: ArcadeInviteShareData,
  delivery: {
    share?: (data: ArcadeInviteShareData) => Promise<void>;
    copy?: (text: string) => Promise<void>;
  },
): Promise<InviteDeliveryResult> {
  if (delivery.share) {
    try {
      await delivery.share(data);
      return 'shared';
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return 'cancelled';
    }
  }
  if (!delivery.copy) return 'unavailable';
  try {
    await delivery.copy(data.url);
    return 'copied';
  } catch {
    return 'unavailable';
  }
}
