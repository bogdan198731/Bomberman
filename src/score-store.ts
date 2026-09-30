import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ArcadeGameId } from './game-metadata.js';
import { addScore, normalizeScoreEntries, type ScoreEntry } from './scoreboard.js';

/** Where the Everyone scoreboard lives. Server-only. */
export interface ScoreStore {
  readonly kind: 'upstash' | 'file';
  read(game: ArcadeGameId): Promise<ScoreEntry[]>;
  write(game: ArcadeGameId, entries: ScoreEntry[]): Promise<void>;
}

/**
 * Upstash Redis over its REST API: plain HTTPS with fetch, so no extra
 * package. Render's disk is wiped on every deploy, so this is what keeps the
 * board in production. Each game's board is one JSON value.
 */
export class UpstashScoreStore implements ScoreStore {
  readonly kind = 'upstash';
  constructor(
    private readonly url: string,
    private readonly token: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async command(args: string[]): Promise<unknown> {
    const response = await this.fetchImpl(this.url.replace(/\/$/, ''), {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    if (!response.ok) throw new Error(`Upstash answered ${response.status}`);
    return ((await response.json()) as { result?: unknown }).result;
  }

  async read(game: ArcadeGameId): Promise<ScoreEntry[]> {
    const raw = await this.command(['GET', `blast-arcade:scores:${game}`]);
    if (typeof raw !== 'string') return [];
    try { return normalizeScoreEntries(JSON.parse(raw)); } catch { return []; }
  }

  async write(game: ArcadeGameId, entries: ScoreEntry[]): Promise<void> {
    await this.command(['SET', `blast-arcade:scores:${game}`, JSON.stringify(entries)]);
  }
}

/** One JSON file per game: for local development, or a Render persistent disk. */
export class FileScoreStore implements ScoreStore {
  readonly kind = 'file';
  constructor(private readonly dir: string) {}

  async read(game: ArcadeGameId): Promise<ScoreEntry[]> {
    try { return normalizeScoreEntries(JSON.parse(await readFile(join(this.dir, `${game}.json`), 'utf8'))); }
    catch { return []; }
  }

  async write(game: ArcadeGameId, entries: ScoreEntry[]): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await writeFile(join(this.dir, `${game}.json`), `${JSON.stringify(entries, null, 2)}\n`, 'utf8');
  }
}

export function createScoreStore(env: NodeJS.ProcessEnv, fallbackDir: string): ScoreStore {
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? new UpstashScoreStore(url, token) : new FileScoreStore(env.SCORES_DIR || fallbackDir);
}

/**
 * The server keeps each board in memory once read, so looking at the board
 * costs nothing and the store only sees one read per game per start plus a
 * write when a score makes the top ten. Submissions for a game run one at a
 * time, so two results arriving together cannot overwrite each other.
 */
export class Scoreboard {
  private boards = new Map<ArcadeGameId, Promise<ScoreEntry[]>>();

  constructor(private readonly store: ScoreStore) {}

  top(game: ArcadeGameId): Promise<ScoreEntry[]> {
    let board = this.boards.get(game);
    if (!board) {
      board = this.store.read(game);
      // A failed read is retried next time rather than remembered as empty.
      board.catch(() => this.boards.delete(game));
      this.boards.set(game, board);
    }
    return board;
  }

  submit(game: ArcadeGameId, entry: ScoreEntry): Promise<{ entries: ScoreEntry[]; rank: number | null }> {
    const before = this.top(game);
    const result = before.then(async entries => {
      const added = addScore(entries, entry);
      if (added.rank !== null) await this.store.write(game, added.entries);
      return added;
    });
    // The next submission waits for this one; if saving fails the board stays as it was.
    this.boards.set(game, result.then(added => added.entries, () => before));
    return result;
  }
}
