export const ARCADE_GAME_IDS = ['bomberman', 'tintar', 'paddle', 'snake', 'tanks', 'septica', 'survival', 'star', 'racing', 'blocks'] as const;
export type ArcadeGameId = typeof ARCADE_GAME_IDS[number];
export type ArcadeOutcome = 'win' | 'loss' | 'draw' | 'complete';

export const PROFILE_STORAGE_KEY = 'blast-arcade-profile-v1';
export const XP_PER_LEVEL = 250;

export interface ArcadeResult {
  outcome: ArcadeOutcome;
  score?: number;
}

export interface GameStatistics {
  plays: number;
  wins: number;
  draws: number;
  bestScore: number;
  totalScore: number;
  lastPlayed: number;
}

export interface ArcadeProfile {
  version: 1;
  name: string;
  xp: number;
  totalPlays: number;
  totalWins: number;
  totalDraws: number;
  totalScore: number;
  games: Partial<Record<ArcadeGameId, GameStatistics>>;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const GAME_META: Record<ArcadeGameId, { name: string; icon: string }> = {
  bomberman: { name: 'Blast Buddies', icon: '💣' },
  tintar: { name: 'Țintar', icon: '◎' },
  paddle: { name: 'Paddle Clash', icon: '⚡' },
  snake: { name: 'Neon Snake', icon: '〰' },
  tanks: { name: 'Mini Tanks', icon: '▰' },
  septica: { name: 'Șeptică', icon: '7♥' },
  survival: { name: 'Survival Arena', icon: '✦' },
  star: { name: 'Star Defender', icon: '▲' },
  racing: { name: 'Micro Racers', icon: '🏁' },
  blocks: { name: 'Block Drop', icon: '▦' },
};

function nonNegativeInteger(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export function sanitizeProfileName(value: unknown): string {
  if (typeof value !== 'string') return 'Arcade Player';
  const cleaned = value.trim().replace(/\s+/g, ' ').slice(0, 24);
  return cleaned || 'Arcade Player';
}

export function createDefaultProfile(): ArcadeProfile {
  return {
    version: 1,
    name: 'Arcade Player',
    xp: 0,
    totalPlays: 0,
    totalWins: 0,
    totalDraws: 0,
    totalScore: 0,
    games: {},
  };
}

export function normalizeArcadeProfile(value: unknown): ArcadeProfile {
  if (!value || typeof value !== 'object') return createDefaultProfile();
  const candidate = value as Partial<ArcadeProfile>;
  const profile = createDefaultProfile();
  profile.name = sanitizeProfileName(candidate.name);
  profile.xp = nonNegativeInteger(candidate.xp);
  profile.totalPlays = nonNegativeInteger(candidate.totalPlays);
  profile.totalWins = nonNegativeInteger(candidate.totalWins);
  profile.totalDraws = nonNegativeInteger(candidate.totalDraws);
  profile.totalScore = nonNegativeInteger(candidate.totalScore);
  const sourceGames = candidate.games && typeof candidate.games === 'object' ? candidate.games : {};
  for (const gameId of ARCADE_GAME_IDS) {
    const source = (sourceGames as Partial<Record<ArcadeGameId, Partial<GameStatistics>>>)[gameId];
    if (!source || typeof source !== 'object') continue;
    profile.games[gameId] = {
      plays: nonNegativeInteger(source.plays),
      wins: nonNegativeInteger(source.wins),
      draws: nonNegativeInteger(source.draws),
      bestScore: nonNegativeInteger(source.bestScore),
      totalScore: nonNegativeInteger(source.totalScore),
      lastPlayed: nonNegativeInteger(source.lastPlayed),
    };
  }
  return profile;
}

export function applyArcadeResult(profileValue: ArcadeProfile, gameId: ArcadeGameId, result: ArcadeResult, now: number = Date.now()): ArcadeProfile {
  const profile = normalizeArcadeProfile(profileValue);
  const score = nonNegativeInteger(result.score);
  const previous = profile.games[gameId] ?? { plays: 0, wins: 0, draws: 0, bestScore: 0, totalScore: 0, lastPlayed: 0 };
  const won = result.outcome === 'win';
  const drawn = result.outcome === 'draw';
  profile.games[gameId] = {
    plays: previous.plays + 1,
    wins: previous.wins + (won ? 1 : 0),
    draws: previous.draws + (drawn ? 1 : 0),
    bestScore: Math.max(previous.bestScore, score),
    totalScore: previous.totalScore + score,
    lastPlayed: Math.max(0, Math.floor(now)),
  };
  profile.totalPlays += 1;
  profile.totalWins += won ? 1 : 0;
  profile.totalDraws += drawn ? 1 : 0;
  profile.totalScore += score;
  const outcomeXp = won ? 120 : drawn ? 70 : result.outcome === 'complete' ? 55 : 35;
  profile.xp += outcomeXp + Math.min(50, Math.floor(score / 100));
  return profile;
}

export function profileLevel(profile: ArcadeProfile): number {
  return Math.floor(nonNegativeInteger(profile.xp) / XP_PER_LEVEL) + 1;
}

export function profileLevelProgress(profile: ArcadeProfile): number {
  return (nonNegativeInteger(profile.xp) % XP_PER_LEVEL) / XP_PER_LEVEL;
}

function browserStorage(): StorageLike | undefined {
  try { return typeof localStorage === 'undefined' ? undefined : localStorage; }
  catch { return undefined; }
}

export function loadArcadeProfile(storage: StorageLike | undefined = browserStorage()): ArcadeProfile {
  if (!storage) return createDefaultProfile();
  try {
    const encoded = storage.getItem(PROFILE_STORAGE_KEY);
    return encoded ? normalizeArcadeProfile(JSON.parse(encoded)) : createDefaultProfile();
  } catch {
    return createDefaultProfile();
  }
}

export function saveArcadeProfile(profileValue: ArcadeProfile, storage: StorageLike | undefined = browserStorage()): ArcadeProfile {
  const profile = normalizeArcadeProfile(profileValue);
  try { storage?.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile)); }
  catch { /* Storage can be unavailable in privacy mode; keep the in-memory result. */ }
  return profile;
}

export function recordArcadeResult(gameId: ArcadeGameId, result: ArcadeResult): ArcadeProfile {
  const profile = saveArcadeProfile(applyArcadeResult(loadArcadeProfile(), gameId, result));
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('arcade-profile-updated', { detail: profile }));
  return profile;
}

export class ArcadeResultReporter {
  private finished = false;
  private gameId: ArcadeGameId;
  private recorder: (gameId: ArcadeGameId, result: ArcadeResult) => unknown;

  constructor(gameId: ArcadeGameId, recorder: (gameId: ArcadeGameId, result: ArcadeResult) => unknown = recordArcadeResult) {
    this.gameId = gameId;
    this.recorder = recorder;
  }

  report(isFinished: boolean, result?: ArcadeResult): boolean {
    if (!isFinished) {
      this.finished = false;
      return false;
    }
    if (this.finished || !result) return false;
    this.finished = true;
    this.recorder(this.gameId, result);
    return true;
  }
}

export function initArcadeProfile(): void {
  if (typeof document === 'undefined') return;
  const panel = document.getElementById('profilePanel');
  const nameInput = document.getElementById('profileNameInput') as HTMLInputElement | null;
  const saveButton = document.getElementById('profileSaveButton') as HTMLButtonElement | null;
  const focusButton = document.getElementById('hubProfileChip') as HTMLButtonElement | null;
  const avatar = document.getElementById('profileAvatar');
  const level = document.getElementById('profileLevel');
  const chipName = document.getElementById('profileChipName');
  const games = document.getElementById('profileGamesPlayed');
  const wins = document.getElementById('profileWins');
  const score = document.getElementById('profileTotalScore');
  const progress = document.getElementById('profileXpProgress');
  const gameStats = document.getElementById('profileGameStats');
  if (!panel || !nameInput || !gameStats) return;
  const activeNameInput = nameInput;
  const activeGameStats = gameStats;

  function initials(name: string): string {
    return name.split(' ').slice(0, 2).map(part => part[0]?.toUpperCase() ?? '').join('') || 'AP';
  }

  function render(profileValue: ArcadeProfile = loadArcadeProfile()): void {
    const profile = normalizeArcadeProfile(profileValue);
    const currentLevel = profileLevel(profile);
    if (document.activeElement !== activeNameInput) activeNameInput.value = profile.name;
    if (avatar) avatar.textContent = initials(profile.name);
    if (level) level.textContent = `Level ${currentLevel}`;
    if (chipName) chipName.textContent = profile.name;
    if (games) games.textContent = String(profile.totalPlays);
    if (wins) wins.textContent = String(profile.totalWins);
    if (score) score.textContent = profile.totalScore.toLocaleString();
    if (progress) {
      const percent = Math.round(profileLevelProgress(profile) * 100);
      progress.style.width = `${percent}%`;
      progress.parentElement?.setAttribute('aria-valuenow', String(percent));
    }
    activeGameStats.replaceChildren(...ARCADE_GAME_IDS.map(gameId => {
      const stats = profile.games[gameId];
      const row = document.createElement('div');
      row.className = `profile-game-row ${stats?.plays ? '' : 'unplayed'}`;
      const icon = document.createElement('span');
      icon.className = 'profile-game-icon';
      icon.textContent = GAME_META[gameId].icon;
      const copy = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = GAME_META[gameId].name;
      const detail = document.createElement('span');
      detail.textContent = stats?.plays
        ? `${stats.plays} played · ${stats.wins} won${stats.bestScore ? ` · best ${stats.bestScore.toLocaleString()}` : ''}`
        : 'No result yet';
      copy.append(title, detail);
      row.append(icon, copy);
      return row;
    }));
  }

  function saveName(): void {
    const profile = loadArcadeProfile();
    profile.name = sanitizeProfileName(activeNameInput.value);
    render(saveArcadeProfile(profile));
  }

  saveButton?.addEventListener('click', saveName);
  activeNameInput.addEventListener('keydown', event => { if (event.key === 'Enter') saveName(); });
  focusButton?.addEventListener('click', () => {
    panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => activeNameInput.focus(), 350);
  });
  window.addEventListener('arcade-profile-updated', event => render((event as CustomEvent<ArcadeProfile>).detail));
  window.addEventListener('storage', event => { if (event.key === PROFILE_STORAGE_KEY) render(); });
  render();
}
