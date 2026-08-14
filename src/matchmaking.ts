export class MatchmakingQueue<GameId extends string> {
  private waiting = new Map<GameId, string[]>();
  private queuedGames = new Map<string, GameId>();

  enqueue(game: GameId, roomCode: string): boolean {
    const code = roomCode.toUpperCase();
    if (this.queuedGames.has(code)) return false;
    const rooms = this.waiting.get(game) ?? [];
    rooms.push(code);
    this.waiting.set(game, rooms);
    this.queuedGames.set(code, game);
    return true;
  }

  claim(game: GameId, isAvailable: (roomCode: string) => boolean): string | null {
    const rooms = this.waiting.get(game) ?? [];
    while (rooms.length) {
      const code = rooms.shift()!;
      this.queuedGames.delete(code);
      if (isAvailable(code)) return code;
    }
    this.waiting.delete(game);
    return null;
  }

  remove(roomCode: string): boolean {
    const code = roomCode.toUpperCase();
    const game = this.queuedGames.get(code);
    if (!game) return false;
    this.queuedGames.delete(code);
    const rooms = this.waiting.get(game);
    if (!rooms) return true;
    const remaining = rooms.filter(room => room !== code);
    if (remaining.length) this.waiting.set(game, remaining);
    else this.waiting.delete(game);
    return true;
  }

  has(roomCode: string): boolean {
    return this.queuedGames.has(roomCode.toUpperCase());
  }

  waitingCount(game: GameId): number {
    return this.waiting.get(game)?.length ?? 0;
  }
}
