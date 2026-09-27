import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { BugReport } from './bug-report.js';

/** Sliding-window limit per key, e.g. per client IP, plus one shared key for the whole server. */
export class ReportRateLimiter {
  private hits = new Map<string, number[]>();
  constructor(private readonly limit: number, private readonly windowMs: number) {}

  allow(key: string, now: number = Date.now()): boolean {
    const recent = (this.hits.get(key) ?? []).filter(time => now - time < this.windowMs);
    if (recent.length >= this.limit) {
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
