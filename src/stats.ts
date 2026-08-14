export const ARCADE_GAME_IDS = ['bomberman', 'tintar', 'paddle', 'snake', 'tanks', 'septica', 'survival', 'star', 'racing', 'blocks'] as const;
export type ArcadeGameId = typeof ARCADE_GAME_IDS[number];
export type ArcadeOutcome = 'win' | 'loss' | 'draw' | 'complete';

export const PROFILE_STORAGE_KEY = 'blast-arcade-profile-v1';
export const XP_PER_LEVEL = 250;
export const DAILY_CHALLENGE_TARGET = 2;
export const DAILY_CHALLENGE_XP = 100;
export const ACHIEVEMENT_XP = 75;
export const MAX_MATCH_HISTORY = 30;
export const WEEKLY_QUEST_XP = 125;

export const ACHIEVEMENT_IDS = [
  'first-round', 'first-win', 'arcade-regular', 'champion', 'score-chaser', 'world-tour', 'level-five',
] as const;
export type AchievementId = typeof ACHIEVEMENT_IDS[number];

export const WEEKLY_QUEST_IDS = ['weekly-player', 'weekly-winner', 'weekly-explorer'] as const;
export type WeeklyQuestId = typeof WEEKLY_QUEST_IDS[number];

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

export interface WeeklyQuestState {
  week: string;
  plays: number;
  wins: number;
  games: ArcadeGameId[];
  completed: WeeklyQuestId[];
}

export interface WeeklyQuestDefinition {
  id: WeeklyQuestId;
  name: string;
  description: string;
  icon: string;
  target: number;
  metric: 'plays' | 'wins' | 'games';
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

export interface ArcadeMatchRecord {
  gameId: ArcadeGameId;
  outcome: ArcadeOutcome;
  score: number;
  playedAt: number;
}

export interface ArcadeInsights {
  winRate: number;
  mostPlayedGame: ArcadeGameId | null;
  bestGame: ArcadeGameId | null;
  bestScore: number;
  winStreak: number;
}

export interface ArcadeProfile {
  version: 4;
  name: string;
  xp: number;
  totalPlays: number;
  totalWins: number;
  totalDraws: number;
  totalScore: number;
  games: Partial<Record<ArcadeGameId, GameStatistics>>;
  recentMatches: ArcadeMatchRecord[];
  unlockedAchievements: AchievementId[];
  dailyChallenge: DailyChallenge | null;
  weeklyQuests: WeeklyQuestState | null;
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

export const WEEKLY_QUESTS: ReadonlyArray<WeeklyQuestDefinition> = [
  { id: 'weekly-player', name: 'Arcade Workout', description: 'Finish 8 matches this week.', icon: '8', target: 8, metric: 'plays' },
  { id: 'weekly-winner', name: 'Victory Circuit', description: 'Win 3 competitive matches.', icon: '♛', target: 3, metric: 'wins' },
  { id: 'weekly-explorer', name: 'Cabinet Tour', description: 'Play 4 different games.', icon: '4', target: 4, metric: 'games' },
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
    version: 4,
    name: 'Arcade Player',
    xp: 0,
    totalPlays: 0,
    totalWins: 0,
    totalDraws: 0,
    totalScore: 0,
    games: {},
    recentMatches: [],
    unlockedAchievements: [],
    dailyChallenge: null,
    weeklyQuests: null,
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
  const recentMatches = Array.isArray(candidate.recentMatches) ? candidate.recentMatches : [];
  profile.recentMatches = recentMatches.flatMap(record => {
    if (!record || typeof record !== 'object') return [];
    const source = record as Partial<ArcadeMatchRecord>;
    if (!ARCADE_GAME_IDS.includes(source.gameId as ArcadeGameId)
      || !['win', 'loss', 'draw', 'complete'].includes(source.outcome as ArcadeOutcome)) return [];
    return [{
      gameId: source.gameId as ArcadeGameId,
      outcome: source.outcome as ArcadeOutcome,
      score: nonNegativeInteger(source.score),
      playedAt: nonNegativeInteger(source.playedAt),
    }];
  }).slice(0, MAX_MATCH_HISTORY);
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
  const weekly = candidate.weeklyQuests;
  if (weekly && typeof weekly === 'object' && /^\d{4}-\d{2}-\d{2}$/.test(weekly.week ?? '')) {
    const weeklyGames = Array.isArray(weekly.games) ? weekly.games : [];
    const weeklyCompleted = Array.isArray(weekly.completed) ? weekly.completed : [];
    profile.weeklyQuests = {
      week: weekly.week as string,
      plays: nonNegativeInteger(weekly.plays),
      wins: nonNegativeInteger(weekly.wins),
      games: ARCADE_GAME_IDS.filter(gameId => weeklyGames.includes(gameId)),
      completed: WEEKLY_QUEST_IDS.filter(id => weeklyCompleted.includes(id)),
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

export function localWeekKey(timestamp: number = Date.now()): string {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  const daysSinceMonday = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - daysSinceMonday);
  return localDateKey(date.getTime());
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

export function ensureWeeklyQuests(profileValue: ArcadeProfile, week: string = localWeekKey()): ArcadeProfile {
  const profile = normalizeArcadeProfile(profileValue);
  if (profile.weeklyQuests?.week === week) return profile;
  profile.weeklyQuests = { week, plays: 0, wins: 0, games: [], completed: [] };
  return profile;
}

export function weeklyQuestProgress(state: WeeklyQuestState, quest: WeeklyQuestDefinition): number {
  return quest.metric === 'games' ? state.games.length : state[quest.metric];
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
  profile.recentMatches = [{
    gameId,
    outcome: result.outcome,
    score,
    playedAt: Math.max(0, Math.floor(now)),
  }, ...profile.recentMatches].slice(0, MAX_MATCH_HISTORY);
  const outcomeXp = won ? 120 : drawn ? 70 : result.outcome === 'complete' ? 55 : 35;
  profile.xp += outcomeXp + Math.min(50, Math.floor(score / 100));
  return profile;
}

export function profileInsights(profileValue: ArcadeProfile): ArcadeInsights {
  const profile = normalizeArcadeProfile(profileValue);
  const competitiveMatches = profile.recentMatches.filter(match => match.outcome !== 'complete');
  const recentWins = competitiveMatches.filter(match => match.outcome === 'win').length;
  let mostPlayedGame: ArcadeGameId | null = null;
  let bestGame: ArcadeGameId | null = null;
  let mostPlays = 0;
  let bestScore = 0;
  for (const gameId of ARCADE_GAME_IDS) {
    const stats = profile.games[gameId];
    if ((stats?.plays ?? 0) > mostPlays) {
      mostPlays = stats!.plays;
      mostPlayedGame = gameId;
    }
    if ((stats?.bestScore ?? 0) > bestScore) {
      bestScore = stats!.bestScore;
      bestGame = gameId;
    }
  }
  let winStreak = 0;
  for (const match of profile.recentMatches) {
    if (match.outcome === 'complete') continue;
    if (match.outcome !== 'win') break;
    winStreak += 1;
  }
  return {
    winRate: competitiveMatches.length ? Math.round(recentWins / competitiveMatches.length * 100) : 0,
    mostPlayedGame,
    bestGame,
    bestScore,
    winStreak,
  };
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
): { profile: ArcadeProfile; achievements: AchievementId[]; dailyCompleted: boolean; weeklyCompleted: WeeklyQuestId[] } {
  let profile = applyArcadeResult(ensureWeeklyQuests(ensureDailyChallenge(profileValue, date), localWeekKey(now)), gameId, result, now);
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
  const weekly = profile.weeklyQuests!;
  weekly.plays += 1;
  weekly.wins += result.outcome === 'win' ? 1 : 0;
  if (!weekly.games.includes(gameId)) weekly.games.push(gameId);
  const weeklyCompleted: WeeklyQuestId[] = [];
  for (const quest of WEEKLY_QUESTS) {
    if (weekly.completed.includes(quest.id) || weeklyQuestProgress(weekly, quest) < quest.target) continue;
    weekly.completed.push(quest.id);
    profile.xp += WEEKLY_QUEST_XP;
    weeklyCompleted.push(quest.id);
  }
  const achievements = unlockEligibleAchievements(profile);
  profile = achievements.profile;
  return { profile, achievements: achievements.unlocked, dailyCompleted, weeklyCompleted };
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
    window.dispatchEvent(new CustomEvent('arcade-game-result', { detail: { gameId, result } }));
    window.dispatchEvent(new CustomEvent('arcade-profile-updated', { detail: profile }));
    if (progression.achievements.length || progression.dailyCompleted || progression.weeklyCompleted.length) {
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
  const weeklyQuestReset = document.getElementById('weeklyQuestReset');
  const weeklyQuestCount = document.getElementById('weeklyQuestCount');
  const weeklyQuestList = document.getElementById('weeklyQuestList');
  const achievementCount = document.getElementById('achievementCount');
  const achievementGrid = document.getElementById('achievementGrid');
  const activityWinRate = document.getElementById('activityWinRate');
  const activityMostPlayed = document.getElementById('activityMostPlayed');
  const activityBestScore = document.getElementById('activityBestScore');
  const activityWinStreak = document.getElementById('activityWinStreak');
  const recentActivityList = document.getElementById('recentActivityList');
  const recentActivityCount = document.getElementById('recentActivityCount');
  const rewardToast = document.getElementById('progressionToast');
  if (!panel || !nameInput || !gameStats) return;
  const activeNameInput = nameInput;
  const activeGameStats = gameStats;
  let rewardTimer = 0;

  function initials(name: string): string {
    return name.split(' ').slice(0, 2).map(part => part[0]?.toUpperCase() ?? '').join('') || 'AP';
  }

  function render(profileValue: ArcadeProfile = loadArcadeProfile()): void {
    const profile = ensureWeeklyQuests(ensureDailyChallenge(normalizeArcadeProfile(profileValue)));
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
    const weekly = profile.weeklyQuests!;
    if (weeklyQuestCount) weeklyQuestCount.textContent = `${weekly.completed.length}/${WEEKLY_QUESTS.length} complete`;
    if (weeklyQuestReset) {
      const weekEnd = new Date(`${weekly.week}T00:00:00`);
      weekEnd.setDate(weekEnd.getDate() + 6);
      weeklyQuestReset.textContent = `Ends ${weekEnd.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
    }
    weeklyQuestList?.replaceChildren(...WEEKLY_QUESTS.map(quest => {
      const progressValue = Math.min(quest.target, weeklyQuestProgress(weekly, quest));
      const complete = weekly.completed.includes(quest.id);
      const item = document.createElement('div');
      item.className = `weekly-quest-item ${complete ? 'complete' : ''}`;
      const icon = document.createElement('span');
      icon.className = 'weekly-quest-icon';
      icon.textContent = complete ? '✓' : quest.icon;
      const copy = document.createElement('div');
      copy.className = 'weekly-quest-copy';
      const title = document.createElement('strong');
      title.textContent = quest.name;
      const description = document.createElement('span');
      description.textContent = quest.description;
      const bar = document.createElement('div');
      bar.className = 'weekly-quest-bar';
      bar.setAttribute('role', 'progressbar');
      bar.setAttribute('aria-label', `${quest.name} progress`);
      bar.setAttribute('aria-valuemin', '0');
      bar.setAttribute('aria-valuemax', String(quest.target));
      bar.setAttribute('aria-valuenow', String(progressValue));
      const fill = document.createElement('i');
      fill.style.width = `${Math.round(progressValue / quest.target * 100)}%`;
      bar.append(fill);
      copy.append(title, description, bar);
      const state = document.createElement('small');
      state.textContent = complete ? `+${WEEKLY_QUEST_XP} XP` : `${progressValue}/${quest.target}`;
      item.append(icon, copy, state);
      return item;
    }));
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
    const insights = profileInsights(profile);
    if (activityWinRate) activityWinRate.textContent = `${insights.winRate}%`;
    if (activityMostPlayed) activityMostPlayed.textContent = insights.mostPlayedGame ? GAME_META[insights.mostPlayedGame].name : '—';
    if (activityBestScore) {
      activityBestScore.textContent = insights.bestGame
        ? `${insights.bestScore.toLocaleString()} · ${GAME_META[insights.bestGame].name}`
        : '—';
    }
    if (activityWinStreak) activityWinStreak.textContent = `${insights.winStreak}×`;
    if (recentActivityCount) recentActivityCount.textContent = `${profile.recentMatches.length} saved`;
    if (recentActivityList) {
      const visibleMatches = profile.recentMatches.slice(0, 6);
      if (!visibleMatches.length) {
        const empty = document.createElement('div');
        empty.className = 'activity-empty';
        empty.textContent = 'Finish a match to start your activity feed.';
        recentActivityList.replaceChildren(empty);
      } else {
        const outcomeLabels: Record<ArcadeOutcome, string> = {
          win: 'Win', loss: 'Loss', draw: 'Draw', complete: 'Completed',
        };
        recentActivityList.replaceChildren(...visibleMatches.map(match => {
          const item = document.createElement('div');
          item.className = `activity-row ${match.outcome}`;
          const icon = document.createElement('span');
          icon.className = 'activity-game-icon';
          icon.textContent = GAME_META[match.gameId].icon;
          const copy = document.createElement('div');
          copy.className = 'activity-copy';
          const title = document.createElement('strong');
          title.textContent = GAME_META[match.gameId].name;
          const detail = document.createElement('span');
          const date = new Date(match.playedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
          detail.textContent = match.score ? `${date} · ${match.score.toLocaleString()} points` : date;
          copy.append(title, detail);
          const outcome = document.createElement('span');
          outcome.className = 'activity-outcome';
          outcome.textContent = outcomeLabels[match.outcome];
          item.append(icon, copy, outcome);
          return item;
        }));
      }
    }
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
    const detail = (event as CustomEvent<{ achievements: AchievementId[]; dailyCompleted: boolean; weeklyCompleted: WeeklyQuestId[] }>).detail;
    const achievementNames = detail.achievements.map(id => ACHIEVEMENTS.find(item => item.id === id)?.name).filter(Boolean);
    const weeklyNames = detail.weeklyCompleted.map(id => WEEKLY_QUESTS.find(item => item.id === id)?.name).filter(Boolean);
    const messages = [
      detail.dailyCompleted ? `Daily challenge complete · +${DAILY_CHALLENGE_XP} XP` : '',
      weeklyNames.length ? `Weekly quest complete: ${weeklyNames.join(', ')} · +${WEEKLY_QUEST_XP} XP each` : '',
      achievementNames.length ? `Achievement unlocked: ${achievementNames.join(', ')}` : '',
    ].filter(Boolean);
    rewardToast.textContent = messages.join(' · ');
    rewardToast.hidden = false;
    window.clearTimeout(rewardTimer);
    rewardTimer = window.setTimeout(() => { rewardToast.hidden = true; }, 5_000);
  });
  window.addEventListener('storage', event => { if (event.key === PROFILE_STORAGE_KEY) render(); });
  const initial = unlockEligibleAchievements(ensureWeeklyQuests(ensureDailyChallenge(loadArcadeProfile()))).profile;
  render(saveArcadeProfile(initial));
}
