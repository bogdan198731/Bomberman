import {
  ARCADE_GAME_IDS,
  loadArcadeProfile,
  type ArcadeGameId,
  type ArcadeMatchRecord,
  type ArcadeProfile,
} from './stats.js';

export type QuickPlayMode = 'all' | 'solo' | 'local' | 'online';
type GameMode = Exclude<QuickPlayMode, 'all'>;

export interface QuickPlayGame {
  id: ArcadeGameId;
  title: string;
  icon: string;
  modes: readonly GameMode[];
}

export const QUICK_PLAY_GAMES: readonly QuickPlayGame[] = [
  { id: 'bomberman', title: 'Blast Buddies', icon: '💣', modes: ['solo', 'local', 'online'] },
  { id: 'tintar', title: 'Țintar', icon: '◎', modes: ['local', 'online'] },
  { id: 'paddle', title: 'Paddle Clash', icon: '⚡', modes: ['local', 'online'] },
  { id: 'snake', title: 'Neon Snake Arena', icon: '〰', modes: ['solo', 'local', 'online'] },
  { id: 'tanks', title: 'Mini Tanks', icon: '▰', modes: ['solo', 'local', 'online'] },
  { id: 'septica', title: 'Șeptică', icon: '7♥', modes: ['solo', 'local', 'online'] },
  { id: 'survival', title: 'Survival Arena', icon: '✦', modes: ['solo', 'local', 'online'] },
  { id: 'star', title: 'Star Defender', icon: '▲', modes: ['solo', 'local'] },
  { id: 'racing', title: 'Micro Racers', icon: '🏁', modes: ['solo', 'local', 'online'] },
  { id: 'blocks', title: 'Block Drop Duel', icon: '▦', modes: ['solo', 'local', 'online'] },
];

export function gamesForQuickPlay(mode: QuickPlayMode): QuickPlayGame[] {
  return QUICK_PLAY_GAMES.filter(game => mode === 'all' || game.modes.includes(mode));
}

export function recommendQuickPlay(
  gameIds: readonly ArcadeGameId[],
  recentMatches: readonly ArcadeMatchRecord[],
  avoidGame: ArcadeGameId | null = null,
  randomValue: number = Math.random(),
): ArcadeGameId | null {
  const normalized = ARCADE_GAME_IDS.filter(gameId => gameIds.includes(gameId));
  if (!normalized.length) return null;
  const candidates = normalized.length > 1 && avoidGame
    ? normalized.filter(gameId => gameId !== avoidGame)
    : normalized;
  const recentPosition = new Map<ArcadeGameId, number>();
  recentMatches.forEach((match, index) => {
    if (!recentPosition.has(match.gameId)) recentPosition.set(match.gameId, index);
  });
  const unseen = candidates.filter(gameId => !recentPosition.has(gameId));
  const rotation = unseen.length
    ? unseen
    : [...candidates].sort((first, second) => (recentPosition.get(second) ?? 0) - (recentPosition.get(first) ?? 0));
  const shortlist = rotation.slice(0, Math.min(3, rotation.length));
  const safeRandom = Number.isFinite(randomValue) ? Math.min(0.999999, Math.max(0, randomValue)) : 0;
  return shortlist[Math.floor(safeRandom * shortlist.length)] ?? shortlist[0] ?? null;
}

export function quickPlayReason(game: QuickPlayGame, profile: ArcadeProfile): string {
  const stats = profile.games[game.id];
  const recent = profile.recentMatches.find(match => match.gameId === game.id);
  if (!stats?.plays) return 'A fresh cabinet pick — no recorded rounds yet.';
  if (!recent) return `Back in rotation after ${stats.plays} recorded round${stats.plays === 1 ? '' : 's'}.`;
  if (recent.outcome === 'loss') return 'A comeback pick after your last match.';
  if (recent.outcome === 'win') return 'Return to a game where you earned a recent win.';
  return `A change of pace from your recent rotation · best ${stats.bestScore.toLocaleString()}.`;
}

export function initQuickPlay(): void {
  if (typeof document === 'undefined') return;
  const panel = document.getElementById('quickPlayPanel');
  const icon = document.getElementById('quickPlayIcon');
  const title = document.getElementById('quickPlayTitle');
  const reason = document.getElementById('quickPlayReason');
  const modes = document.getElementById('quickPlayModes');
  const count = document.getElementById('quickPlayCount');
  const launch = document.getElementById('quickPlayLaunch') as HTMLButtonElement | null;
  const shuffle = document.getElementById('quickPlayShuffle') as HTMLButtonElement | null;
  const modeButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-quick-play-mode]'));
  if (!panel || !launch || !title) return;
  const activePanel = panel;
  const activeLaunch = launch;
  const activeTitle = title;

  let activeMode: QuickPlayMode = 'all';
  let selectedGame: ArcadeGameId | null = null;
  let profile = loadArcadeProfile();

  function choose(avoidCurrent: boolean = true): void {
    const available = gamesForQuickPlay(activeMode);
    selectedGame = recommendQuickPlay(
      available.map(game => game.id),
      profile.recentMatches,
      avoidCurrent ? selectedGame : null,
    );
    const game = QUICK_PLAY_GAMES.find(item => item.id === selectedGame);
    if (!game) return;
    activePanel.dataset.quickPlayGame = game.id;
    if (icon) icon.textContent = game.icon;
    activeTitle.textContent = game.title;
    if (reason) reason.textContent = quickPlayReason(game, profile);
    if (modes) modes.textContent = game.modes.map(mode => mode === 'local' ? 'Local 2P' : mode[0].toUpperCase() + mode.slice(1)).join(' · ');
    if (count) count.textContent = `${available.length} available`;
    activeLaunch.dataset.launchGame = game.id;
    activeLaunch.textContent = `Play ${game.title}`;
  }

  modeButtons.forEach(button => button.addEventListener('click', () => {
    const mode = button.dataset.quickPlayMode as QuickPlayMode;
    if (!['all', 'solo', 'local', 'online'].includes(mode)) return;
    activeMode = mode;
    modeButtons.forEach(item => {
      const active = item.dataset.quickPlayMode === activeMode;
      item.classList.toggle('active', active);
      item.setAttribute('aria-pressed', String(active));
    });
    choose(false);
  }));
  shuffle?.addEventListener('click', () => choose());
  window.addEventListener('arcade-profile-updated', event => {
    profile = (event as CustomEvent<ArcadeProfile>).detail;
    choose();
  });
  choose(false);
}
