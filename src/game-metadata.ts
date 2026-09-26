export const ARCADE_GAME_IDS = ['bomberman', 'tintar', 'paddle', 'snake', 'tanks', 'septica', 'survival', 'star', 'racing', 'blocks', 'twenty48', 'sudoku', 'cycles', 'fourrow', 'bricks', 'mines', 'hockey', 'reversi', 'solitaire'] as const;
export type ArcadeGameId = typeof ARCADE_GAME_IDS[number];
export type GameMode = 'solo' | 'local' | 'online';
export interface GameDefinition { id: ArcadeGameId; name: string; icon: string; modes: readonly GameMode[] }
const competitive: readonly GameMode[] = ['solo', 'local', 'online'];
export const GAME_META: Record<ArcadeGameId, GameDefinition> = {
  bomberman: { id: 'bomberman', name: 'Blast Buddies', icon: '💣', modes: competitive },
  tintar: { id: 'tintar', name: 'Țintar', icon: '◎', modes: competitive },
  paddle: { id: 'paddle', name: 'Paddle Clash', icon: '⚡', modes: competitive },
  snake: { id: 'snake', name: 'Neon Snake Arena', icon: '〰', modes: competitive },
  tanks: { id: 'tanks', name: 'Mini Tanks', icon: '▰', modes: competitive },
  septica: { id: 'septica', name: 'Șeptică', icon: '7♥', modes: competitive },
  survival: { id: 'survival', name: 'Survival Arena', icon: '✦', modes: competitive },
  star: { id: 'star', name: 'Star Defender', icon: '▲', modes: ['solo', 'local'] },
  racing: { id: 'racing', name: 'Micro Racers', icon: '🏁', modes: competitive },
  blocks: { id: 'blocks', name: 'Block Drop Duel', icon: '▦', modes: competitive },
  twenty48: { id: 'twenty48', name: '2048', icon: '2048', modes: ['solo'] },
  sudoku: { id: 'sudoku', name: 'Sudoku', icon: '9×9', modes: ['solo'] },
  cycles: { id: 'cycles', name: 'Light Cycles', icon: '⟫', modes: ['solo', 'local', 'online'] },
  fourrow: { id: 'fourrow', name: 'Four in a Row', icon: '◉', modes: ['solo', 'local', 'online'] },
  bricks: { id: 'bricks', name: 'Brick Breaker', icon: '▤', modes: ['solo'] },
  mines: { id: 'mines', name: 'Minesweeper', icon: '⚑', modes: ['solo'] },
  hockey: { id: 'hockey', name: 'Air Hockey', icon: '⊙', modes: ['solo', 'local', 'online'] },
  reversi: { id: 'reversi', name: 'Reversi', icon: '◐', modes: ['solo', 'local', 'online'] },
  solitaire: { id: 'solitaire', name: 'Solitaire', icon: '♠', modes: ['solo'] },
};
export const MODE_LABELS: Record<GameMode, string> = { solo: 'Solo', local: 'Same device', online: 'Online' };
export function isArcadeGameId(value: unknown): value is ArcadeGameId {
  return typeof value === 'string' && ARCADE_GAME_IDS.includes(value as ArcadeGameId);
}
export function supportedLaunchMode(gameId: ArcadeGameId, requested: unknown): GameMode | undefined {
  return GAME_META[gameId].modes.includes(requested as GameMode) ? requested as GameMode : undefined;
}
