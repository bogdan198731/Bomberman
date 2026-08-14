export const ARCADE_GAME_IDS = ['bomberman', 'tintar', 'paddle', 'snake', 'tanks', 'septica', 'survival', 'star', 'racing', 'blocks'] as const;
export type ArcadeGameId = typeof ARCADE_GAME_IDS[number];
export type ArcadeOutcome = 'win' | 'loss' | 'draw' | 'complete';

export const PROFILE_STORAGE_KEY = 'blast-arcade-profile-v1';
export const XP_PER_LEVEL = 250;
export const DAILY_CHALLENGE_TARGET = 2;
export const DAILY_CHALLENGE_XP = 100;
export const ACHIEVEMENT_XP = 75;

export const ACHIEVEMENT_IDS = [
  'first-round', 'first-win', 'arcade-regular', 'champion', 'score-chaser', 'world-tour', 'level-five',
] as const;
export type AchievementId = typeof ACHIEVEMENT_IDS[number];

export interface ArcadeResult {
  outcome: ArcadeOutcome;
  score?: number;
}

export interface DailyChallenge {
  date: string;
  gameId: ArcadeGameId;
  progress: number;
  target: number;
  completed: boolean;
}

export interface AchievementDefinition {
  id: AchievementId;
  name: string;
  description: string;
  icon: string;
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
  version: 2;
  name: string;
  xp: number;
  totalPlays: number;
  totalWins: number;
  totalDraws: number;
  totalScore: number;
  games: Partial<Record<ArcadeGameId, GameStatistics>>;
  unlockedAchievements: AchievementId[];
  dailyChallenge: DailyChallenge | null;
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

export const ACHIEVEMENTS: ReadonlyArray<AchievementDefinition> = [
  { id: 'first-round', name: 'First Round', description: 'Finish your first arcade match.', icon: '★' },
  { id: 'first-win', name: 'First Victory', description: 'Win your first competitive match.', icon: '♛' },
  { id: 'arcade-regular', name: 'Arcade Regular', description: 'Finish 10 matches across the hub.', icon: '10' },
  { id: 'champion', name: 'Champion', description: 'Collect 10 competitive wins.', icon: '🏆' },
  { id: 'score-chaser', name: 'Score Chaser', description: 'Earn 5,000 total score.', icon: '5K' },
  { id: 'world-tour', name: 'World Tour', description: 'Finish a match in all 10 games.', icon: '◎' },
  { id: 'level-five', name: 'Level Five', description: 'Reach player level 5.', icon: 'V' },
];

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
    version: 2,
    name: 'Arcade Player',
    xp: 0,
    totalPlays: 0,
    totalWins: 0,
    totalDraws: 0,
    totalScore: 0,
    games: {},
    unlockedAchievements: [],
    dailyChallenge: null,
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
  const unlocked = Array.isArray(candidate.unlockedAchievements) ? candidate.unlockedAchievements : [];
  profile.unlockedAchievements = ACHIEVEMENT_IDS.filter(id => unlocked.includes(id));
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
  const daily = candidate.dailyChallenge;
  if (daily && typeof daily === 'object' && /^\d{4}-\d{2}-\d{2}$/.test(daily.date ?? '') && ARCADE_GAME_IDS.includes(daily.gameId as ArcadeGameId)) {
    const progress = Math.min(DAILY_CHALLENGE_TARGET, nonNegativeInteger(daily.progress));
    profile.dailyChallenge = {
      date: daily.date as string,
      gameId: daily.gameId as ArcadeGameId,
      progress,
      target: DAILY_CHALLENGE_TARGET,
      completed: progress >= DAILY_CHALLENGE_TARGET || daily.completed === true,
    };
  }
  return profile;
}

export function localDateKey(timestamp: number = Date.now()): string {
  const date = new Date(timestamp);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function dailyGameForDate(date: string): ArcadeGameId {
  const hash = [...date].reduce((total, character, index) => total + character.charCodeAt(0) * (index + 3), 0);
  return ARCADE_GAME_IDS[hash % ARCADE_GAME_IDS.length];
}

export function ensureDailyChallenge(profileValue: ArcadeProfile, date: string = localDateKey()): ArcadeProfile {
  const profile = normalizeArcadeProfile(profileValue);
  if (profile.dailyChallenge?.date === date) return profile;
  profile.dailyChallenge = {
    date,
    gameId: dailyGameForDate(date),
    progress: 0,
    target: DAILY_CHALLENGE_TARGET,
    completed: false,
  };
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

function achievementEligible(id: AchievementId, profile: ArcadeProfile): boolean {
  if (id === 'first-round') return profile.totalPlays >= 1;
  if (id === 'first-win') return profile.totalWins >= 1;
  if (id === 'arcade-regular') return profile.totalPlays >= 10;
  if (id === 'champion') return profile.totalWins >= 10;
  if (id === 'score-chaser') return profile.totalScore >= 5_000;
  if (id === 'world-tour') return ARCADE_GAME_IDS.every(gameId => (profile.games[gameId]?.plays ?? 0) >= 1);
  return profileLevel(profile) >= 5;
}

export function unlockEligibleAchievements(profileValue: ArcadeProfile): { profile: ArcadeProfile; unlocked: AchievementId[] } {
  const profile = normalizeArcadeProfile(profileValue);
  const unlocked: AchievementId[] = [];
  for (const achievement of ACHIEVEMENTS) {
    if (profile.unlockedAchievements.includes(achievement.id) || !achievementEligible(achievement.id, profile)) continue;
    profile.unlockedAchievements.push(achievement.id);
    profile.xp += ACHIEVEMENT_XP;
    unlocked.push(achievement.id);
  }
  return { profile, unlocked };
}

export function applyProgressionResult(
  profileValue: ArcadeProfile,
  gameId: ArcadeGameId,
  result: ArcadeResult,
  date: string = localDateKey(),
  now: number = Date.now(),
): { profile: ArcadeProfile; achievements: AchievementId[]; dailyCompleted: boolean } {
  let profile = applyArcadeResult(ensureDailyChallenge(profileValue, date), gameId, result, now);
  let dailyCompleted = false;
  const challenge = profile.dailyChallenge;
  if (challenge?.gameId === gameId && !challenge.completed) {
    challenge.progress = Math.min(challenge.target, challenge.progress + 1);
    if (challenge.progress >= challenge.target) {
      challenge.completed = true;
      profile.xp += DAILY_CHALLENGE_XP;
      dailyCompleted = true;
    }
  }
  const achievements = unlockEligibleAchievements(profile);
  profile = achievements.profile;
  return { profile, achievements: achievements.unlocked, dailyCompleted };
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
  const progression = applyProgressionResult(loadArcadeProfile(), gameId, result);
  const profile = saveArcadeProfile(progression.profile);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('arcade-profile-updated', { detail: profile }));
    if (progression.achievements.length || progression.dailyCompleted) {
      window.dispatchEvent(new CustomEvent('arcade-progression-rewarded', { detail: progression }));
    }
  }
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
  const dailyName = document.getElementById('dailyChallengeName');
  const dailyIcon = document.getElementById('dailyChallengeIcon');
  const dailyDescription = document.getElementById('dailyChallengeDescription');
  const dailyProgress = document.getElementById('dailyChallengeProgress');
  const dailyProgressBar = document.getElementById('dailyChallengeProgressBar');
  const dailyLaunchButton = document.getElementById('dailyChallengeLaunch') as HTMLButtonElement | null;
  const achievementCount = document.getElementById('achievementCount');
  const achievementGrid = document.getElementById('achievementGrid');
  const rewardToast = document.getElementById('progressionToast');
  if (!panel || !nameInput || !gameStats) return;
  const activeNameInput = nameInput;
  const activeGameStats = gameStats;
  let rewardTimer = 0;

  function initials(name: string): string {
    return name.split(' ').slice(0, 2).map(part => part[0]?.toUpperCase() ?? '').join('') || 'AP';
  }

  function render(profileValue: ArcadeProfile = loadArcadeProfile()): void {
    const profile = ensureDailyChallenge(normalizeArcadeProfile(profileValue));
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
    const challenge = profile.dailyChallenge!;
    const dailyMeta = GAME_META[challenge.gameId];
    if (dailyName) dailyName.textContent = dailyMeta.name;
    if (dailyIcon) dailyIcon.textContent = dailyMeta.icon;
    if (dailyDescription) dailyDescription.textContent = `Finish ${challenge.target} matches today to earn +${DAILY_CHALLENGE_XP} XP.`;
    if (dailyProgress) dailyProgress.textContent = challenge.completed ? 'Complete' : `${challenge.progress}/${challenge.target} matches`;
    if (dailyProgressBar) {
      const percent = Math.round(challenge.progress / challenge.target * 100);
      dailyProgressBar.style.width = `${percent}%`;
      dailyProgressBar.parentElement?.setAttribute('aria-valuenow', String(percent));
    }
    if (dailyLaunchButton) {
      dailyLaunchButton.dataset.launchGame = challenge.gameId;
      dailyLaunchButton.textContent = challenge.completed ? `Play ${dailyMeta.name} again` : `Play ${dailyMeta.name}`;
      dailyLaunchButton.classList.toggle('completed', challenge.completed);
    }
    const unlocked = new Set(profile.unlockedAchievements);
    if (achievementCount) achievementCount.textContent = `${unlocked.size}/${ACHIEVEMENTS.length} unlocked`;
    achievementGrid?.replaceChildren(...ACHIEVEMENTS.map(achievement => {
      const earned = unlocked.has(achievement.id);
      const item = document.createElement('div');
      item.className = `achievement-item ${earned ? 'unlocked' : 'locked'}`;
      const icon = document.createElement('span');
      icon.className = 'achievement-icon';
      icon.textContent = earned ? achievement.icon : '◆';
      const copy = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = achievement.name;
      const description = document.createElement('span');
      description.textContent = achievement.description;
      copy.append(title, description);
      const state = document.createElement('small');
      state.textContent = earned ? 'Unlocked' : `+${ACHIEVEMENT_XP} XP`;
      item.append(icon, copy, state);
      return item;
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
  window.addEventListener('arcade-progression-rewarded', event => {
    if (!rewardToast) return;
    const detail = (event as CustomEvent<{ achievements: AchievementId[]; dailyCompleted: boolean }>).detail;
    const achievementNames = detail.achievements.map(id => ACHIEVEMENTS.find(item => item.id === id)?.name).filter(Boolean);
    const messages = [detail.dailyCompleted ? `Daily challenge complete · +${DAILY_CHALLENGE_XP} XP` : '', achievementNames.length ? `Achievement unlocked: ${achievementNames.join(', ')}` : ''].filter(Boolean);
    rewardToast.textContent = messages.join(' · ');
    rewardToast.hidden = false;
    window.clearTimeout(rewardTimer);
    rewardTimer = window.setTimeout(() => { rewardToast.hidden = true; }, 5_000);
  });
  window.addEventListener('storage', event => { if (event.key === PROFILE_STORAGE_KEY) render(); });
  const initial = unlockEligibleAchievements(ensureDailyChallenge(loadArcadeProfile())).profile;
  render(saveArcadeProfile(initial));
}
