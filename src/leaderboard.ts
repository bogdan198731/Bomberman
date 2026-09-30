import {
  ARCADE_GAME_IDS,
  GAME_META,
  loadArcadeProfile,
  sanitizeProfileName,
} from './stats.js';
import type { ArcadeGameId, ArcadeOutcome, ArcadeResult } from './stats.js';
import { SCOREBOARD_ENDPOINT, UNKNOWN_ALIAS, normalizeScoreEntries, sanitizeAlias, type ScoreEntry } from './scoreboard.js';

export const LEADERBOARD_STORAGE_KEY = 'blast-arcade-leaderboards-v1';
export const MAX_LEADERBOARD_ENTRIES = 5;

export interface LeaderboardEntry {
  name: string;
  score: number;
  outcome: ArcadeOutcome;
  playedAt: number;
}

export interface ArcadeLeaderboards {
  version: 1;
  games: Partial<Record<ArcadeGameId, LeaderboardEntry[]>>;
}

export interface LeaderboardStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const OUTCOME_RANK: Record<ArcadeOutcome, number> = {
  win: 4,
  complete: 3,
  draw: 2,
  loss: 1,
};

function nonNegativeInteger(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function isOutcome(value: unknown): value is ArcadeOutcome {
  return value === 'win' || value === 'loss' || value === 'draw' || value === 'complete';
}

function compareEntries(left: LeaderboardEntry, right: LeaderboardEntry): number {
  return right.score - left.score
    || OUTCOME_RANK[right.outcome] - OUTCOME_RANK[left.outcome]
    || left.playedAt - right.playedAt
    || left.name.localeCompare(right.name);
}

export function createEmptyLeaderboards(): ArcadeLeaderboards {
  return { version: 1, games: {} };
}

export function normalizeArcadeLeaderboards(value: unknown): ArcadeLeaderboards {
  const leaderboards = createEmptyLeaderboards();
  if (!value || typeof value !== 'object') return leaderboards;
  const games = (value as Partial<ArcadeLeaderboards>).games;
  if (!games || typeof games !== 'object') return leaderboards;

  for (const gameId of ARCADE_GAME_IDS) {
    const source = games[gameId];
    if (!Array.isArray(source)) continue;
    const entries = source.flatMap(value => {
      if (!value || typeof value !== 'object') return [];
      const candidate = value as Partial<LeaderboardEntry>;
      if (!isOutcome(candidate.outcome)) return [];
      return [{
        name: sanitizeProfileName(candidate.name),
        score: nonNegativeInteger(candidate.score),
        outcome: candidate.outcome,
        playedAt: nonNegativeInteger(candidate.playedAt),
      }];
    }).sort(compareEntries);
    const names = new Set<string>();
    leaderboards.games[gameId] = entries.filter(entry => {
      const key = entry.name.toLocaleLowerCase();
      if (names.has(key)) return false;
      names.add(key);
      return true;
    }).slice(0, MAX_LEADERBOARD_ENTRIES);
  }
  return leaderboards;
}

export function applyLeaderboardResult(
  value: ArcadeLeaderboards,
  gameId: ArcadeGameId,
  playerName: string,
  result: ArcadeResult,
  now: number = Date.now(),
): ArcadeLeaderboards {
  const leaderboards = normalizeArcadeLeaderboards(value);
  const entries = [...(leaderboards.games[gameId] ?? [])];
  const candidate: LeaderboardEntry = {
    name: sanitizeProfileName(playerName),
    score: nonNegativeInteger(result.score),
    outcome: result.outcome,
    playedAt: nonNegativeInteger(now),
  };
  const nameKey = candidate.name.toLocaleLowerCase();
  const previousIndex = entries.findIndex(entry => entry.name.toLocaleLowerCase() === nameKey);
  if (previousIndex >= 0) {
    if (compareEntries(candidate, entries[previousIndex]) >= 0) return leaderboards;
    entries.splice(previousIndex, 1);
  }
  entries.push(candidate);
  leaderboards.games[gameId] = entries.sort(compareEntries).slice(0, MAX_LEADERBOARD_ENTRIES);
  return leaderboards;
}

function browserStorage(): LeaderboardStorage | undefined {
  try { return typeof localStorage === 'undefined' ? undefined : localStorage; }
  catch { return undefined; }
}

export function loadArcadeLeaderboards(storage: LeaderboardStorage | undefined = browserStorage()): ArcadeLeaderboards {
  if (!storage) return createEmptyLeaderboards();
  try {
    const encoded = storage.getItem(LEADERBOARD_STORAGE_KEY);
    return encoded ? normalizeArcadeLeaderboards(JSON.parse(encoded)) : createEmptyLeaderboards();
  } catch {
    return createEmptyLeaderboards();
  }
}

export function saveArcadeLeaderboards(
  value: ArcadeLeaderboards,
  storage: LeaderboardStorage | undefined = browserStorage(),
): ArcadeLeaderboards {
  const leaderboards = normalizeArcadeLeaderboards(value);
  try { storage?.setItem(LEADERBOARD_STORAGE_KEY, JSON.stringify(leaderboards)); }
  catch { /* Local storage can be unavailable in privacy mode. */ }
  return leaderboards;
}

export function recordLeaderboardResult(
  gameId: ArcadeGameId,
  playerName: string,
  result: ArcadeResult,
  now: number = Date.now(),
): ArcadeLeaderboards {
  const leaderboards = saveArcadeLeaderboards(
    applyLeaderboardResult(loadArcadeLeaderboards(), gameId, playerName, result, now),
  );
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('arcade-leaderboard-updated', { detail: { gameId, leaderboards } }));
  }
  return leaderboards;
}

export const SCOREBOARD_ALIAS_STORAGE_KEY = 'blast-arcade-scoreboard-alias-v1';
const SCOREBOARD_SCOPE_STORAGE_KEY = 'blast-arcade-scoreboard-scope-v1';

/** The alias as typed; empty means the player stays Unknown on the Everyone board. */
export function loadScoreboardAlias(storage: LeaderboardStorage | undefined = browserStorage()): string {
  try { return storage?.getItem(SCOREBOARD_ALIAS_STORAGE_KEY) ?? ''; } catch { return ''; }
}

/**
 * Sends a finished game's score to the Everyone board. Scores of zero stay
 * off it, and being offline only means the score is not shared.
 */
export async function submitEveryoneScore(gameId: ArcadeGameId, result: ArcadeResult, alias: string = loadScoreboardAlias()): Promise<ScoreEntry[] | null> {
  const score = Math.floor(result.score ?? 0);
  if (score <= 0 || typeof fetch === 'undefined') return null;
  try {
    const response = await fetch(SCOREBOARD_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game: gameId, score, outcome: result.outcome, alias: sanitizeAlias(alias) }),
    });
    if (!response.ok) return null;
    return normalizeScoreEntries(((await response.json()) as { entries?: unknown }).entries);
  } catch {
    return null;
  }
}

function initials(name: string): string {
  return name.split(' ').slice(0, 2).map(part => part[0]?.toUpperCase() ?? '').join('') || 'AP';
}

export function initArcadeLeaderboard(): void {
  if (typeof document === 'undefined') return;
  const tabs = document.getElementById('leaderboardGameTabs');
  const list = document.getElementById('leaderboardList');
  const caption = document.getElementById('leaderboardCaption');
  const boardTitle = document.getElementById('leaderboardBoardTitle');
  const focusButton = document.getElementById('hubLeaderboardChip');
  const panel = document.getElementById('leaderboardPanel');
  const aliasRow = document.getElementById('leaderboardAliasRow');
  const aliasInput = document.getElementById('leaderboardAlias') as HTMLInputElement | null;
  const scopeButtons = document.querySelectorAll<HTMLButtonElement>('[data-leaderboard-scope]');
  if (!tabs || !list) return;
  const activeTabs = tabs;
  const activeList = list;

  const initialBoards = loadArcadeLeaderboards();
  let activeGameId = ARCADE_GAME_IDS.find(gameId => initialBoards.games[gameId]?.length) ?? 'bomberman';
  let scope: 'device' | 'everyone' = 'device';
  try { if (localStorage.getItem(SCOREBOARD_SCOPE_STORAGE_KEY) === 'everyone') scope = 'everyone'; } catch { /* This device */ }
  // Everyone boards as last fetched, so switching tabs does not refetch every time.
  const everyone = new Map<ArcadeGameId, { entries: ScoreEntry[]; at: number }>();
  const failed = new Set<ArcadeGameId>();
  const outcomeLabels: Record<ArcadeOutcome, string> = {
    win: 'Victory', loss: 'Finished', draw: 'Draw', complete: 'Run complete',
  };

  function message(text: string): void {
    const empty = document.createElement('div');
    empty.className = 'leaderboard-empty';
    empty.textContent = text;
    activeList.replaceChildren(empty);
  }

  function rows(entries: readonly { name: string; score: number; outcome: ArcadeOutcome; playedAt: number }[]): void {
    activeList.replaceChildren(...entries.map((entry, index) => {
      const row = document.createElement('div');
      row.className = `leaderboard-row rank-${index + 1}`;
      row.setAttribute('role', 'listitem');
      const rank = document.createElement('strong');
      rank.className = 'leaderboard-rank';
      rank.textContent = `#${index + 1}`;
      const avatar = document.createElement('span');
      avatar.className = 'leaderboard-avatar';
      avatar.textContent = entry.name === UNKNOWN_ALIAS ? '?' : initials(entry.name);
      const identity = document.createElement('div');
      identity.className = 'leaderboard-player';
      const name = document.createElement('strong');
      name.textContent = entry.name;
      const detail = document.createElement('span');
      const date = new Date(entry.playedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      detail.textContent = `${outcomeLabels[entry.outcome]} · ${date}`;
      identity.append(name, detail);
      const score = document.createElement('div');
      score.className = 'leaderboard-score';
      const value = document.createElement('strong');
      value.textContent = entry.score.toLocaleString();
      const label = document.createElement('span');
      label.textContent = 'points';
      score.append(value, label);
      row.append(rank, avatar, identity, score);
      return row;
    }));
  }

  async function loadEveryone(gameId: ArcadeGameId): Promise<void> {
    try {
      const response = await fetch(`${SCOREBOARD_ENDPOINT}?game=${gameId}`);
      if (!response.ok) throw new Error(String(response.status));
      everyone.set(gameId, { entries: normalizeScoreEntries(((await response.json()) as { entries?: unknown }).entries), at: Date.now() });
      failed.delete(gameId);
    } catch {
      failed.add(gameId);
    }
    if (scope === 'everyone' && activeGameId === gameId) render();
  }

  function render(value: ArcadeLeaderboards = loadArcadeLeaderboards()): void {
    activeTabs.querySelectorAll<HTMLButtonElement>('[data-leaderboard-game]').forEach(button => {
      const selected = button.dataset.leaderboardGame === activeGameId;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    scopeButtons.forEach(button => {
      const selected = button.dataset.leaderboardScope === scope;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    if (aliasRow) aliasRow.hidden = scope !== 'everyone';
    if (boardTitle) boardTitle.textContent = scope === 'everyone' ? 'Everyone · top ten' : 'Local top five';

    if (scope === 'everyone') {
      const board = everyone.get(activeGameId);
      if (!board || Date.now() - board.at > 60_000) void loadEveryone(activeGameId);
      if (!board) {
        if (caption) caption.textContent = failed.has(activeGameId) ? 'Offline' : 'Loading…';
        message(failed.has(activeGameId)
          ? 'The Everyone board is offline right now. Your scores still count on this device.'
          : 'Loading the Everyone board…');
        return;
      }
      if (caption) caption.textContent = board.entries.length ? `Top ${board.entries.length} · all players` : 'No scores yet · all players';
      if (!board.entries.length) { message(`No scores yet. Finish a ${GAME_META[activeGameId].name} game to take first place.`); return; }
      rows(board.entries.map(entry => ({ ...entry, name: entry.alias })));
      return;
    }

    const leaderboards = normalizeArcadeLeaderboards(value);
    const entries = leaderboards.games[activeGameId] ?? [];
    if (caption) {
      caption.textContent = entries.length
        ? `Top ${entries.length} · saved on this device`
        : 'Waiting for the first result · saved on this device';
    }
    if (!entries.length) {
      message(`Finish a ${GAME_META[activeGameId].name} match to claim the first spot.`);
      return;
    }
    rows(entries);
  }

  activeTabs.replaceChildren(...ARCADE_GAME_IDS.map(gameId => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'leaderboard-tab';
    button.dataset.leaderboardGame = gameId;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', 'leaderboardList');
    button.innerHTML = `<span aria-hidden="true">${GAME_META[gameId].icon}</span>${GAME_META[gameId].name}`;
    button.addEventListener('click', () => {
      activeGameId = gameId;
      render();
    });
    button.addEventListener('keydown', event => {
      const currentIndex = ARCADE_GAME_IDS.indexOf(gameId);
      let nextIndex = currentIndex;
      if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % ARCADE_GAME_IDS.length;
      else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + ARCADE_GAME_IDS.length) % ARCADE_GAME_IDS.length;
      else if (event.key === 'Home') nextIndex = 0;
      else if (event.key === 'End') nextIndex = ARCADE_GAME_IDS.length - 1;
      else return;
      event.preventDefault();
      activeGameId = ARCADE_GAME_IDS[nextIndex];
      render();
      activeTabs.querySelector<HTMLButtonElement>(`[data-leaderboard-game="${activeGameId}"]`)?.focus();
    });
    return button;
  }));

  scopeButtons.forEach(button => button.addEventListener('click', () => {
    scope = button.dataset.leaderboardScope === 'everyone' ? 'everyone' : 'device';
    try { localStorage.setItem(SCOREBOARD_SCOPE_STORAGE_KEY, scope); } catch { /* per visit only */ }
    render();
  }));
  if (aliasInput) {
    aliasInput.value = loadScoreboardAlias();
    aliasInput.addEventListener('change', () => {
      const alias = sanitizeAlias(aliasInput.value);
      aliasInput.value = alias === UNKNOWN_ALIAS ? '' : alias;
      try { localStorage.setItem(SCOREBOARD_ALIAS_STORAGE_KEY, aliasInput.value); } catch { /* this visit only */ }
    });
  }

  window.addEventListener('arcade-game-result', event => {
    const detail = (event as CustomEvent<{ gameId: ArcadeGameId; result: ArcadeResult }>).detail;
    if (!detail || !ARCADE_GAME_IDS.includes(detail.gameId)) return;
    activeGameId = detail.gameId;
    recordLeaderboardResult(detail.gameId, loadArcadeProfile().name, detail.result);
    void submitEveryoneScore(detail.gameId, detail.result).then(entries => {
      if (!entries) return;
      everyone.set(detail.gameId, { entries, at: Date.now() });
      if (scope === 'everyone' && activeGameId === detail.gameId) render();
    });
  });
  window.addEventListener('arcade-leaderboard-updated', event => {
    const detail = (event as CustomEvent<{ gameId: ArcadeGameId; leaderboards: ArcadeLeaderboards }>).detail;
    if (detail) render(detail.leaderboards);
  });
  window.addEventListener('storage', event => {
    if (event.key === LEADERBOARD_STORAGE_KEY) render();
  });
  focusButton?.addEventListener('click', () => panel?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  render(initialBoards);
}
