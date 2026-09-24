export type SessionMode = 'solo' | 'local' | 'online';
export type Interruption = 'settings' | 'help' | 'result' | 'focus' | 'visibility' | 'manual';

/** Closing an interruption never implicitly resumes an offline session. */
export class SessionState {
  readonly blockers = new Set<Exclude<Interruption, 'manual'>>();
  pausedGame: string | null = null;

  interrupt(gameId: string, mode: SessionMode, active: boolean): void {
    if (active && mode !== 'online') this.pausedGame = gameId;
  }
  block(reason: Exclude<Interruption, 'manual'>, active: boolean): void {
    if (active) this.blockers.add(reason); else this.blockers.delete(reason);
  }
  resume(gameId: string): boolean {
    if (this.pausedGame !== gameId || this.blockers.size) return false;
    this.pausedGame = null;
    return true;
  }
  reset(): void { this.pausedGame = null; }
}

/** Wall-clock engines must not count time spent paused or outside their view. */
export class ActiveClock {
  private previous: number;
  value: number;
  constructor(now: number) { this.previous = now; this.value = now; }
  tick(now: number, active: boolean): number {
    if (active) this.value += Math.max(0, now - this.previous);
    this.previous = now;
    return this.value;
  }
}
