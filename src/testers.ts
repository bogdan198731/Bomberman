import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';

export const TESTER_TOKEN_PREFIX = 'tst_';
export const DEFAULT_TESTER_DAYS = 90;
export const DEFAULT_TESTER_DAILY_LIMIT = 5;

export interface TesterEntry {
  name: string;
  /** SHA-256 of the token; the token itself is shown once and never stored. */
  hash: string;
  createdAt: string;
  expiresAt: string;
  dailyLimit: number;
  revokedAt?: string;
}

export interface TesterFile { testers: TesterEntry[] }

export type TesterCheck =
  | { ok: true; tester: TesterEntry }
  | { ok: false; reason: 'malformed' | 'unknown' | 'expired' | 'revoked' };

export function hashTesterToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createTesterToken(): string {
  return `${TESTER_TOKEN_PREFIX}${randomBytes(24).toString('base64url')}`;
}

export function isTesterName(name: string): boolean {
  return /^[a-z0-9][a-z0-9_-]{0,31}$/i.test(name);
}

export function addTester(
  file: TesterFile,
  name: string,
  options: { days?: number; dailyLimit?: number; now?: Date } = {},
): { file: TesterFile; token: string } {
  if (!isTesterName(name)) throw new Error('Use 1-32 letters, digits, "-" or "_" for the tester name.');
  if (file.testers.some(tester => tester.name === name && !tester.revokedAt)) {
    throw new Error(`Tester "${name}" already has an active code. Revoke it first.`);
  }
  const now = options.now ?? new Date();
  const days = options.days ?? DEFAULT_TESTER_DAYS;
  const token = createTesterToken();
  const entry: TesterEntry = {
    name,
    hash: hashTesterToken(token),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + days * 86_400_000).toISOString(),
    dailyLimit: options.dailyLimit ?? DEFAULT_TESTER_DAILY_LIMIT,
  };
  return { file: { testers: [...file.testers, entry] }, token };
}

export function revokeTester(file: TesterFile, name: string, now: Date = new Date()): TesterFile {
  if (!file.testers.some(tester => tester.name === name && !tester.revokedAt)) {
    throw new Error(`No active code for tester "${name}".`);
  }
  return {
    testers: file.testers.map(tester => tester.name === name && !tester.revokedAt
      ? { ...tester, revokedAt: now.toISOString() }
      : tester),
  };
}

export function checkTesterToken(file: TesterFile, token: string, now: Date = new Date()): TesterCheck {
  if (!token.startsWith(TESTER_TOKEN_PREFIX) || token.length > 100) return { ok: false, reason: 'malformed' };
  const hash = Buffer.from(hashTesterToken(token), 'hex');
  // Compare against every entry in constant time rather than a map lookup.
  const tester = file.testers.find(entry => {
    const candidate = Buffer.from(entry.hash, 'hex');
    return candidate.length === hash.length && timingSafeEqual(candidate, hash);
  });
  if (!tester) return { ok: false, reason: 'unknown' };
  if (tester.revokedAt) return { ok: false, reason: 'revoked' };
  if (Date.parse(tester.expiresAt) <= now.getTime()) return { ok: false, reason: 'expired' };
  return { ok: true, tester };
}

/** Whether the named tester currently holds a live code - checked again at merge time, not just at report time. */
export function isTesterActive(file: TesterFile, name: string, now: Date = new Date()): boolean {
  return file.testers.some(tester => tester.name === name && !tester.revokedAt && Date.parse(tester.expiresAt) > now.getTime());
}

export function parseTesterFile(text: string): TesterFile {
  const data = JSON.parse(text) as Partial<TesterFile>;
  if (!Array.isArray(data.testers)) throw new Error('Tester file needs a "testers" array.');
  return { testers: data.testers };
}

export function readTesterFile(path: string): TesterFile {
  return existsSync(path) ? parseTesterFile(readFileSync(path, 'utf8')) : { testers: [] };
}

export function writeTesterFile(path: string, file: TesterFile): void {
  writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`, 'utf8');
}

/** Re-reads the file when it changes, so a revoke takes effect without restarting the server. */
export class TesterRegistry {
  private cache: { mtimeMs: number; file: TesterFile } | undefined;
  constructor(private readonly path: string) {}

  current(): TesterFile {
    if (!existsSync(this.path)) return { testers: [] };
    const { mtimeMs } = statSync(this.path);
    if (!this.cache || this.cache.mtimeMs !== mtimeMs) {
      try {
        this.cache = { mtimeMs, file: readTesterFile(this.path) };
      } catch (error) {
        // A half-written or broken file must not grant or crash anything.
        console.error(`Tester file unreadable, trusting nobody: ${(error as Error).message}`);
        return { testers: [] };
      }
    }
    return this.cache.file;
  }

  check(token: string, now?: Date): TesterCheck {
    return checkTesterToken(this.current(), token, now);
  }
}
