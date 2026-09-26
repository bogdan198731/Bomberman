/**
 * Shared level plumbing for games with hand-built layouts. Each game owns its
 * level data (maps, walls, cover); this module owns picking and remembering.
 */

export type LevelGameId = 'bomberman' | 'snake' | 'tanks';

export interface LevelInfo {
  name: string;
  blurb: string;
}

export const LEVEL_STORAGE_KEY = 'blast-arcade-levels-v1';

interface LevelStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function browserStorage(): LevelStorage | undefined {
  try { return typeof localStorage === 'undefined' ? undefined : localStorage; }
  catch { return undefined; }
}

/** Levels are 1-based; anything unknown falls back to the first layout. */
export function normalizeLevel(value: unknown, count: number): number {
  const level = typeof value === 'string' ? Number(value) : value;
  return typeof level === 'number' && Number.isInteger(level) && level >= 1 && level <= count ? level : 1;
}

function readAll(storage: LevelStorage | undefined): Record<string, unknown> {
  try {
    const parsed = JSON.parse(storage?.getItem(LEVEL_STORAGE_KEY) ?? '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function loadLevel(game: LevelGameId, count: number, storage: LevelStorage | undefined = browserStorage()): number {
  return normalizeLevel(readAll(storage)[game], count);
}

export function saveLevel(
  game: LevelGameId,
  level: number,
  count: number,
  storage: LevelStorage | undefined = browserStorage(),
): number {
  const normalized = normalizeLevel(level, count);
  try { storage?.setItem(LEVEL_STORAGE_KEY, JSON.stringify({ ...readAll(storage), [game]: normalized })); }
  catch { /* The chosen level still applies this session. */ }
  return normalized;
}

export function levelLabel(level: number, info: LevelInfo): string {
  return `${level} · ${info.name}`;
}

/**
 * Fills a <select> with a game's levels, restores the saved one, and reports
 * changes. Returns the level to start on.
 */
export function bindLevelSelect(
  select: HTMLSelectElement | null,
  game: LevelGameId,
  levels: readonly LevelInfo[],
  onChange: (level: number) => void,
): number {
  const initial = loadLevel(game, levels.length);
  if (!select) return initial;
  select.replaceChildren(...levels.map((info, index) => {
    const option = document.createElement('option');
    option.value = String(index + 1);
    option.textContent = levelLabel(index + 1, info);
    option.title = info.blurb;
    return option;
  }));
  select.value = String(initial);
  select.addEventListener('change', () => {
    onChange(saveLevel(game, Number(select.value), levels.length));
  });
  return initial;
}
