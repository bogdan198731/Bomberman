import { ARCADE_GAME_IDS, type ArcadeGameId } from './game-metadata.js';
import type { SeoView } from './seo.js';

/**
 * When each page last changed, for the sitemap's <lastmod>. Search engines
 * ignore a lastmod that is always "today", so each game page dates from the
 * last commit to its own game code or to the SEO text every page shares.
 */

/** The files whose changes a player or search engine would notice on a game's page. */
export function gameSourceFiles(gameId: ArcadeGameId): string[] {
  return gameId === 'bomberman' ? ['src/index.ts', 'src/multiplayer.ts', 'src/bomberman-skin.ts'] : [`src/${gameId}.ts`];
}

/** The page text every game page shares: titles, descriptions and the article. */
export const SHARED_PAGE_FILES = ['src/seo.ts', 'src/seo-content.ts'];

/**
 * Reads `git log --format=%x00%cs --name-only` (newest first) into the date
 * each file last changed. Merge commits list no files and are skipped.
 */
export function parseGitFileDates(log: string): Map<string, string> {
  const dates = new Map<string, string>();
  for (const commit of log.split('\0').slice(1)) {
    const [date, ...files] = commit.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) continue;
    for (const file of files) if (!dates.has(file)) dates.set(file, date);
  }
  return dates;
}

const latest = (dates: (string | undefined)[], fallback: string): string =>
  dates.filter((date): date is string => Boolean(date)).sort().reverse()[0] ?? fallback;

/**
 * A date for every page. The hub lists every game, so it is as new as the
 * newest page or the shell itself. Without git history (a copy without .git)
 * every page falls back to the given date.
 */
export function pageDates(fileDates: Map<string, string>, fallback: string): Record<SeoView, string> {
  const shared = SHARED_PAGE_FILES.map(file => fileDates.get(file));
  const games = Object.fromEntries(ARCADE_GAME_IDS.map(gameId =>
    [gameId, latest([...gameSourceFiles(gameId).map(file => fileDates.get(file)), ...shared], fallback)])) as Record<ArcadeGameId, string>;
  const hub = latest([...Object.values(games), fileDates.get('index.html')], fallback);
  return { hub, ...games };
}
