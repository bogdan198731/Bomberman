/**
 * Limits that keep one client, or one bug, from taking the online server down
 * for everyone. Pure logic only: server.ts wires it to real sockets.
 */

export const SOCKET_LIMITS = {
  /**
   * The biggest frame a client may send. A relayed game state is at most 65,536
   * characters (isRelayPayload in relay.ts), each up to 3 bytes in UTF-8, plus
   * a small envelope. The ws default is 100 MB.
   */
  maxPayloadBytes: 3 * 65_536 + 1_024,
  /**
   * Real play sends about 30 messages a second per stream (held inputs repeat
   * every 35 ms, hosts send state every 33 ms), so around 100 with several
   * controls held at once.
   */
  messagesPerSecond: 200,
  /** Ten seconds' worth, so a phone that sends a backlog after a stall is not cut off. */
  messageBurst: 2_000,
  /**
   * The busiest real client measured, a Blocks host, sends about 74 KB a second
   * in frames under 2.5 KB. Without this a socket at the message limit could
   * still send 200 full-size frames, about 39 MB, every second.
   */
  bytesPerSecond: 1_048_576,
  /** Eight seconds' worth: far more than a real backlog, and room for a few full-size frames. */
  byteBurst: 8 * 1_048_576,
  /**
   * Open sockets from one address. A player holds one at a time, so this is a
   * classroom or a café behind one address. Behind a proxy it only works with
   * TRUST_PROXY set right: otherwise every player counts as the proxy.
   */
  socketsPerAddress: 30,
  /** A socket that does not answer one ping before the next is gone. */
  heartbeatMs: 30_000,
} as const;

/**
 * Token bucket, one per socket: `perSecond` sustained, up to `burst` at once.
 * Counts messages by default, or bytes when each call passes a frame's size as its cost.
 */
export class MessageBudget {
  private tokens: number;
  private last: number;

  constructor(private readonly perSecond: number, private readonly burst: number, now: number = Date.now()) {
    this.tokens = burst;
    this.last = now;
  }

  /** Counts one message, or `cost` units; false once the socket has sent more than its share. */
  allow(now: number = Date.now(), cost: number = 1): boolean {
    // A clock that steps backwards must not hand out tokens or take any away.
    const elapsed = Math.max(0, now - this.last);
    this.tokens = Math.min(this.burst, this.tokens + elapsed * this.perSecond / 1_000);
    this.last = now;
    if (this.tokens < cost) return false;
    this.tokens -= cost;
    return true;
  }
}

/** The size of a received frame, in whichever shape ws hands it over. */
export function messageBytes(raw: Buffer | ArrayBuffer | Buffer[]): number {
  if (Array.isArray(raw)) return raw.reduce((total, part) => total + part.byteLength, 0);
  return raw.byteLength;
}

/** Open sockets per client address, so one address cannot hold thousands of them. */
export class ConnectionCounter {
  private readonly open = new Map<string, number>();
  constructor(private readonly limit: number) {}

  /** Whether this address may open one more socket. */
  hasRoom(address: string): boolean {
    return (this.open.get(address) ?? 0) < this.limit;
  }

  add(address: string): void {
    this.open.set(address, (this.open.get(address) ?? 0) + 1);
  }

  /** Forgets an address once its last socket closes, so the map cannot grow forever. */
  remove(address: string): void {
    const left = (this.open.get(address) ?? 0) - 1;
    if (left > 0) this.open.set(address, left);
    else this.open.delete(address);
  }

  count(address: string): number {
    return this.open.get(address) ?? 0;
  }
}

/**
 * Finds sockets whose other end has vanished without closing (a phone that
 * lost signal), which would otherwise hold a room or a matchmaking place forever.
 */
export class Heartbeat<Socket> {
  private readonly answered = new Map<Socket, boolean>();

  add(socket: Socket): void {
    this.answered.set(socket, true);
  }

  /** The socket answered a ping. */
  heard(socket: Socket): void {
    if (this.answered.has(socket)) this.answered.set(socket, true);
  }

  remove(socket: Socket): void {
    this.answered.delete(socket);
  }

  /**
   * Run once per interval. `silent` never answered the last ping and should be
   * terminated; `ping` are the rest, which must answer before the next sweep.
   */
  sweep(): { ping: Socket[]; silent: Socket[] } {
    const ping: Socket[] = [];
    const silent: Socket[] = [];
    for (const [socket, answered] of this.answered) {
      if (answered) {
        this.answered.set(socket, false);
        ping.push(socket);
      } else {
        this.answered.delete(socket);
        silent.push(socket);
      }
    }
    return { ping, silent };
  }
}

/**
 * TRUST_PROXY is the number of reverse proxies in front of the server that
 * append to X-Forwarded-For. Unset, 0 or anything else trusts none.
 */
export function trustedProxyHops(setting: string | undefined): number {
  const hops = Number(setting);
  return Number.isInteger(hops) && hops > 0 ? hops : 0;
}

/**
 * The address to rate-limit a request by. Each trusted proxy appends the
 * address it received the request from, so the client is `trustedHops` entries
 * from the end of X-Forwarded-For. Everything further left was sent by the
 * client and can say anything, which is why the first entry is never used.
 */
export function clientAddress(remoteAddress: string | undefined, forwardedFor: string | string[] | undefined, trustedHops: number): string {
  const direct = remoteAddress ?? 'unknown';
  if (trustedHops < 1 || !forwardedFor) return direct;
  const chain = (Array.isArray(forwardedFor) ? forwardedFor.join(',') : forwardedFor)
    .split(',').map(entry => entry.trim()).filter(Boolean);
  // A shorter chain than expected means a proxy was skipped: the leftmost entry is the furthest one known.
  const address = chain[Math.max(0, chain.length - trustedHops)];
  // An address is at most 45 characters; the cap keeps a wrong hop count from storing long junk as a key.
  return address ? address.slice(0, 64) : direct;
}

/**
 * Wraps an event handler so a throw goes to `recover` instead of ending the
 * process, and every live room with it.
 */
export function guarded<Args extends unknown[]>(
  handler: (...args: Args) => void,
  recover: (error: unknown, ...args: Args) => void,
): (...args: Args) => void {
  return (...args: Args): void => {
    try {
      handler(...args);
    } catch (error) {
      // Recovery runs on a half-finished request or socket; it must not throw either.
      try { recover(error, ...args); } catch { /* Nothing left to try. */ }
    }
  };
}

interface FailableResponse {
  readonly headersSent: boolean;
  writeHead(status: number, headers: Record<string, string>): unknown;
  end(body: string): unknown;
  destroy(): unknown;
}

/** Answers 500 when nothing was sent yet; a half-sent reply can only be cut off. */
export function answerServerError(response: FailableResponse): void {
  if (response.headersSent) {
    response.destroy();
    return;
  }
  response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end('Server error');
}

/** What to log for a caught error: the stack when there is one. */
export function describeError(error: unknown): string {
  return error instanceof Error ? error.stack ?? error.message : String(error);
}
