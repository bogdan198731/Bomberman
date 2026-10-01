import { createHash } from 'node:crypto';
import { SITE_ORIGIN } from './seo.js';

/** Hosts that serve the same site under another name; search engines should only know SITE_ORIGIN. */
const LEGACY_HOST = /\.onrender\.com$/i;

/**
 * Where a request to an old address should go, or undefined to serve it here.
 * Only page and file reads move: score posts, bug reports and WebSockets on the
 * old address keep working for anyone with it still open.
 */
export function legacyHostRedirect(host: string | undefined, method: string | undefined, url: string | undefined, origin: string = SITE_ORIGIN): string | undefined {
  const hostname = (host ?? '').replace(/:\d+$/, '');
  if (!LEGACY_HOST.test(hostname) || (method !== 'GET' && method !== 'HEAD')) return undefined;
  return `${origin}${url && url.startsWith('/') ? url : '/'}`;
}

export interface Validators { etag: string; lastModified?: string }

/** Files change only on deploy, so size and modification time identify a version. */
export function fileValidators(size: number, mtimeMs: number): Validators {
  return { etag: `W/"${size.toString(36)}-${Math.floor(mtimeMs).toString(36)}"`, lastModified: new Date(mtimeMs).toUTCString() };
}

/** Rendered pages are identified by their content. */
export function contentValidators(body: string): Validators {
  return { etag: `W/"${createHash('sha1').update(body).digest('base64url').slice(0, 22)}"` };
}

/**
 * Whether the browser's copy is still current. ETags compare weakly: proxies that
 * compress (Cloudflare on Render) turn strong ETags weak, which must still match.
 */
export function isNotModified(headers: { 'if-none-match'?: string; 'if-modified-since'?: string }, validators: Validators): boolean {
  const weak = (tag: string): string => tag.trim().replace(/^W\//, '');
  const noneMatch = headers['if-none-match'];
  if (noneMatch) return noneMatch.split(',').some(tag => tag.trim() === '*' || weak(tag) === weak(validators.etag));
  const since = headers['if-modified-since'];
  if (since && validators.lastModified) {
    const sinceMs = Date.parse(since);
    return Number.isFinite(sinceMs) && Date.parse(validators.lastModified) <= sinceMs;
  }
  return false;
}
