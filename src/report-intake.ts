import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { BugReport } from './bug-report.js';

/** Sliding-window limit per key, e.g. per client IP, plus one shared key for the whole server. */
export class ReportRateLimiter {
  private hits = new Map<string, number[]>();
  constructor(private readonly limit: number, private readonly windowMs: number) {}

  /** `limit` overrides the default for keys with their own allowance, like each tester's daily cap. */
  allow(key: string, now: number = Date.now(), limit: number = this.limit): boolean {
    const recent = (this.hits.get(key) ?? []).filter(time => now - time < this.windowMs);
    if (recent.length >= limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }

  /** Drops idle keys so a stream of one-off IPs cannot grow the map forever. */
  prune(now: number = Date.now()): void {
    for (const [key, times] of this.hits) {
      if (times.every(time => now - time >= this.windowMs)) this.hits.delete(key);
    }
  }
}

export interface StoredReport {
  id: string;
  receivedAt: string;
  game: string;
  commit: string;
  /** Set by the server from a verified tester code, never from the report body. */
  trust: 'public' | 'tester';
  tester?: string;
  /** File name of the player's screenshot in <reports>/screenshots, when one was sent. */
  screenshot?: string;
  report: BugReport;
}

export function createReportId(now: Date = new Date()): string {
  // Sortable by time so the queue folder reads oldest-first.
  return `${now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}-${randomBytes(3).toString('hex')}`;
}

/** Writes to <dir>/queue/<id>.json; a later agent picks reports up from there. */
export async function storeReport(dir: string, stored: StoredReport): Promise<string> {
  const queue = join(dir, 'queue');
  await mkdir(queue, { recursive: true });
  const file = join(queue, `${stored.id}.json`);
  await writeFile(file, `${JSON.stringify(stored, null, 2)}\n`, 'utf8');
  return file;
}

/** Saves a screenshot as <dir>/screenshots/<id>.jpg; the caller has validated the JPEG. */
export async function storeScreenshot(dir: string, id: string, base64: string): Promise<string> {
  const folder = join(dir, 'screenshots');
  await mkdir(folder, { recursive: true });
  const name = `${id}.jpg`;
  await writeFile(join(folder, name), Buffer.from(base64, 'base64'));
  return name;
}

/** Optional hand-off to another app (local agent runner, GitHub bridge, chat hook). */
export async function forwardReport(url: string, stored: StoredReport, secret?: string): Promise<void> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
    },
    body: JSON.stringify(stored),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`Webhook responded ${response.status}`);
}
