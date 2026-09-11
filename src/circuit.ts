import { ARCADE_GAME_IDS, GAME_META } from './stats.js';
import type { ArcadeGameId, ArcadeOutcome, ArcadeResult } from './stats.js';

export const CIRCUIT_STORAGE_KEY = 'blast-arcade-circuit-v1';
export const CIRCUIT_LENGTH = 3;
export const CIRCUIT_SCORE_CAP = 500;
export type CircuitMode = 'solo' | 'friends';

export const CIRCUIT_ELIGIBLE_GAMES: Record<CircuitMode, readonly ArcadeGameId[]> = {
  solo: ['bomberman', 'tintar', 'paddle', 'snake', 'tanks', 'septica', 'survival', 'star', 'racing', 'blocks', 'twenty48', 'sudoku'],
  friends: ['bomberman', 'tintar', 'paddle', 'snake', 'tanks', 'septica', 'survival', 'star', 'racing', 'blocks'],
};

const SCORE_TARGETS: Record<ArcadeGameId, number> = {
  bomberman: 3, tintar: 9, paddle: 7, snake: 30, tanks: 5, septica: 4,
  survival: 3_000, star: 4_000, racing: 3, blocks: 6_000, twenty48: 2_048, sudoku: 10_000,
};
const OUTCOME_BONUS: Record<ArcadeOutcome, number> = { win: 500, complete: 500, draw: 250, loss: 100 };

export interface CircuitStageResult {
  gameId: ArcadeGameId; outcome: ArcadeOutcome; score: number; points: number;
  performancePercent: number; playedAt: number;
}
export interface ArcadeCircuit {
  version: 2; mode: CircuitMode; rulesId: string; lineup: ArcadeGameId[];
  results: CircuitStageResult[]; startedAt: number; completedAt: number;
}
export interface ArcadeCircuitProgress {
  version: 2; current: ArcadeCircuit | null; bestScore: number; completedRuns: number; records: Record<string, number>;
}
export interface CircuitStorage { getItem(key: string): string | null; setItem(key: string, value: string): void; }

function nonNegativeInteger(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}
function isOutcome(value: unknown): value is ArcadeOutcome {
  return value === 'win' || value === 'loss' || value === 'draw' || value === 'complete';
}
function dateKey(now: number): string {
  const date = new Date(now);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function seededRandom(seedText: string): () => number {
  let seed = 2_166_136_261;
  for (const character of seedText) { seed ^= character.charCodeAt(0); seed = Math.imul(seed, 16_777_619); }
  return () => {
    seed += 0x6d2b79f5;
    let value = seed;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4_294_967_296;
  };
}

export function circuitPerformancePercent(gameId: ArcadeGameId, score: number): number {
  return Math.min(100, Math.round(nonNegativeInteger(score) / SCORE_TARGETS[gameId] * 100));
}
export function circuitStagePoints(result: ArcadeResult, gameId: ArcadeGameId = 'blocks'): number {
  return Math.min(1_000, OUTCOME_BONUS[result.outcome] + Math.round(circuitPerformancePercent(gameId, result.score ?? 0) * 5));
}
export function createDefaultCircuitProgress(): ArcadeCircuitProgress {
  return { version: 2, current: null, bestScore: 0, completedRuns: 0, records: {} };
}

export function normalizeCircuitProgress(value: unknown): ArcadeCircuitProgress {
  const progress = createDefaultCircuitProgress();
  if (!value || typeof value !== 'object') return progress;
  const candidate = value as Partial<ArcadeCircuitProgress>;
  progress.bestScore = nonNegativeInteger(candidate.bestScore);
  progress.completedRuns = nonNegativeInteger(candidate.completedRuns);
  if (candidate.records && typeof candidate.records === 'object') {
    Object.entries(candidate.records).forEach(([key, score]) => { if (key.length <= 80) progress.records[key] = nonNegativeInteger(score); });
  }
  if (!candidate.current || typeof candidate.current !== 'object') return progress;
  const source = candidate.current as Partial<ArcadeCircuit>;
  const mode: CircuitMode = source.mode === 'friends' ? 'friends' : 'solo';
  const eligible = CIRCUIT_ELIGIBLE_GAMES[mode];
  const lineupValues = Array.isArray(source.lineup) ? source.lineup : [];
  const lineup = lineupValues.flatMap((gameId, index) => (
    eligible.includes(gameId as ArcadeGameId) && lineupValues.indexOf(gameId) === index ? [gameId as ArcadeGameId] : []
  )).slice(0, CIRCUIT_LENGTH);
  if (lineup.length !== CIRCUIT_LENGTH) return progress;
  const rulesId = typeof source.rulesId === 'string' && source.rulesId.length <= 80 ? source.rulesId : `legacy:${mode}:${lineup.join('-')}`;
  const resultValues = Array.isArray(source.results) ? source.results : [];
  const results: CircuitStageResult[] = [];
  for (let index = 0; index < Math.min(resultValues.length, CIRCUIT_LENGTH); index += 1) {
    const result = resultValues[index];
    if (!result || typeof result !== 'object') break;
    const stage = result as Partial<CircuitStageResult>;
    if (stage.gameId !== lineup[index] || !isOutcome(stage.outcome)) break;
    const score = nonNegativeInteger(stage.score);
    results.push({ gameId: stage.gameId, outcome: stage.outcome, score,
      points: circuitStagePoints({ outcome: stage.outcome, score }, stage.gameId),
      performancePercent: circuitPerformancePercent(stage.gameId, score), playedAt: nonNegativeInteger(stage.playedAt) });
  }
  const completed = results.length === CIRCUIT_LENGTH;
  progress.current = { version: 2, mode, rulesId, lineup, results, startedAt: nonNegativeInteger(source.startedAt),
    completedAt: completed ? nonNegativeInteger(source.completedAt) || results.at(-1)!.playedAt : 0 };
  return progress;
}

export function createArcadeCircuit(mode: CircuitMode = 'solo', random: (() => number) | undefined = undefined, now: number = Date.now()): ArcadeCircuit {
  const rulesId = `${dateKey(now)}:${mode}:standard-v2`;
  const lineup = [...CIRCUIT_ELIGIBLE_GAMES[mode]];
  const draw = random ?? seededRandom(rulesId);
  for (let index = lineup.length - 1; index > 0; index -= 1) {
    const randomValue = Math.min(0.999999, Math.max(0, draw()));
    const swapIndex = Math.floor(randomValue * (index + 1));
    [lineup[index], lineup[swapIndex]] = [lineup[swapIndex], lineup[index]];
  }
  return { version: 2, mode, rulesId, lineup: lineup.slice(0, CIRCUIT_LENGTH), results: [], startedAt: nonNegativeInteger(now), completedAt: 0 };
}
export function startArcadeCircuit(value: ArcadeCircuitProgress, mode: CircuitMode = 'solo', random?: () => number, now: number = Date.now()): ArcadeCircuitProgress {
  const progress = normalizeCircuitProgress(value); progress.current = createArcadeCircuit(mode, random, now); return progress;
}
export function circuitTotalPoints(circuit: ArcadeCircuit): number { return circuit.results.reduce((total, result) => total + result.points, 0); }
export function circuitWins(circuit: ArcadeCircuit): number { return circuit.results.filter(result => result.outcome === 'win').length; }
export function circuitIsComplete(circuit: ArcadeCircuit): boolean { return circuit.results.length >= circuit.lineup.length; }
export function circuitCurrentGame(circuit: ArcadeCircuit): ArcadeGameId | null { return circuitIsComplete(circuit) ? null : circuit.lineup[circuit.results.length] ?? null; }
export function applyCircuitResult(value: ArcadeCircuitProgress, gameId: ArcadeGameId, result: ArcadeResult, now: number = Date.now()): { progress: ArcadeCircuitProgress; accepted: boolean; completed: boolean } {
  const progress = normalizeCircuitProgress(value); const circuit = progress.current;
  if (!circuit || circuitCurrentGame(circuit) !== gameId) return { progress, accepted: false, completed: false };
  const score = nonNegativeInteger(result.score);
  circuit.results.push({ gameId, outcome: result.outcome, score, points: circuitStagePoints({ outcome: result.outcome, score }, gameId),
    performancePercent: circuitPerformancePercent(gameId, score), playedAt: nonNegativeInteger(now) });
  const completed = circuitIsComplete(circuit);
  if (completed) {
    circuit.completedAt = nonNegativeInteger(now); const total = circuitTotalPoints(circuit);
    progress.records[circuit.rulesId] = Math.max(progress.records[circuit.rulesId] ?? 0, total);
    progress.bestScore = Math.max(progress.bestScore, total); progress.completedRuns += 1;
  }
  return { progress, accepted: true, completed };
}

function browserStorage(): CircuitStorage | undefined { try { return typeof localStorage === 'undefined' ? undefined : localStorage; } catch { return undefined; } }
export function loadCircuitProgress(storage: CircuitStorage | undefined = browserStorage()): ArcadeCircuitProgress {
  if (!storage) return createDefaultCircuitProgress();
  try { const encoded = storage.getItem(CIRCUIT_STORAGE_KEY); return encoded ? normalizeCircuitProgress(JSON.parse(encoded)) : createDefaultCircuitProgress(); }
  catch { return createDefaultCircuitProgress(); }
}
export function saveCircuitProgress(value: ArcadeCircuitProgress, storage: CircuitStorage | undefined = browserStorage()): ArcadeCircuitProgress {
  const progress = normalizeCircuitProgress(value); try { storage?.setItem(CIRCUIT_STORAGE_KEY, JSON.stringify(progress)); } catch { /* Storage optional. */ } return progress;
}
function outcomeLabel(outcome: ArcadeOutcome): string { if (outcome === 'win') return 'Victory'; if (outcome === 'draw') return 'Draw'; if (outcome === 'complete') return 'Run complete'; return 'Finished'; }

export function initArcadeCircuit(): void {
  if (typeof document === 'undefined') return;
  const panel = document.getElementById('circuitPanel'); const focusButton = document.getElementById('hubCircuitChip');
  const lineup = document.getElementById('circuitLineup'); const status = document.getElementById('circuitStatus');
  const total = document.getElementById('circuitTotal'); const wins = document.getElementById('circuitWins');
  const best = document.getElementById('circuitBest'); const completedRuns = document.getElementById('circuitRuns');
  const launchButton = document.getElementById('circuitLaunchButton') as HTMLButtonElement | null;
  const shuffleButton = document.getElementById('circuitShuffleButton') as HTMLButtonElement | null;
  const modeButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-circuit-mode]'));
  const toast = document.getElementById('circuitToast'); if (!lineup || !launchButton) return;
  const activeLineup = lineup;
  const activeLaunchButton = launchButton;
  let selectedMode: CircuitMode = 'solo'; let toastTimer = 0;
  function render(value: ArcadeCircuitProgress = loadCircuitProgress()): void {
    const progress = normalizeCircuitProgress(value); const circuit = progress.current; if (circuit) selectedMode = circuit.mode;
    const complete = circuit ? circuitIsComplete(circuit) : false; const currentGame = circuit ? circuitCurrentGame(circuit) : null;
    modeButtons.forEach(button => { const active = button.dataset.circuitMode === selectedMode; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
    if (total) total.textContent = circuit ? circuitTotalPoints(circuit).toLocaleString() : '0';
    if (wins) wins.textContent = circuit ? String(circuitWins(circuit)) : '0';
    if (best) best.textContent = String(circuit ? progress.records[circuit.rulesId] ?? 0 : progress.bestScore);
    if (completedRuns) completedRuns.textContent = String(progress.completedRuns);
    if (status) status.textContent = !circuit ? `Ready for a ${selectedMode === 'solo' ? 'Solo' : 'Friends'} three-game run`
      : complete ? `Circuit complete · ${circuitTotalPoints(circuit).toLocaleString()} points`
        : `Stage ${circuit.results.length + 1} of ${CIRCUIT_LENGTH} · ${GAME_META[currentGame!].name} is next`;
    if (!circuit) {
      activeLineup.replaceChildren(...Array.from({ length: CIRCUIT_LENGTH }, (_, index) => {
        const stage = document.createElement('div'); stage.className = 'circuit-stage pending';
        stage.innerHTML = `<span class="circuit-stage-number">${index + 1}</span><span class="circuit-stage-icon">?</span><div><strong>Mystery game</strong><small>Shared daily lineup</small></div>`; return stage;
      }));
    } else {
      activeLineup.replaceChildren(...circuit.lineup.map((gameId, index) => {
        const result = circuit.results[index]; const current = index === circuit.results.length && !complete;
        const stage = document.createElement('div'); stage.className = `circuit-stage ${result ? 'complete' : current ? 'current' : 'pending'}`;
        stage.innerHTML = `<span class="circuit-stage-number">${result ? '✓' : index + 1}</span><span class="circuit-stage-icon">${GAME_META[gameId].icon}</span><div><strong>${GAME_META[gameId].name}</strong><small>${result ? `${outcomeLabel(result.outcome)} · ${result.performancePercent}% · +${result.points}` : current ? 'Up next' : 'Locked'}</small></div>`;
        return stage;
      }));
    }
    activeLaunchButton.textContent = !circuit || complete ? 'Start a new circuit' : `Play stage ${circuit.results.length + 1} · ${GAME_META[currentGame!].name}`;
    activeLaunchButton.dataset.launchGame = currentGame ?? 'bomberman'; activeLaunchButton.dataset.launchMode = selectedMode === 'solo' ? 'solo' : 'local';
    if (shuffleButton) shuffleButton.hidden = !circuit || complete;
  }
  const begin = (): ArcadeCircuitProgress => saveCircuitProgress(startArcadeCircuit(loadCircuitProgress(), selectedMode));
  modeButtons.forEach(button => button.addEventListener('click', () => {
    const mode = button.dataset.circuitMode; if (mode !== 'solo' && mode !== 'friends') return;
    selectedMode = mode; const progress = loadCircuitProgress(); progress.current = null; render(saveCircuitProgress(progress));
  }));
  launchButton.addEventListener('click', () => { const progress = loadCircuitProgress(); if (!progress.current || circuitIsComplete(progress.current)) render(begin()); });
  shuffleButton?.addEventListener('click', () => render(begin())); focusButton?.addEventListener('click', () => panel?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  window.addEventListener('arcade-game-result', event => {
    const detail = (event as CustomEvent<{ gameId: ArcadeGameId; result: ArcadeResult }>).detail;
    if (!detail || !ARCADE_GAME_IDS.includes(detail.gameId)) return;
    const update = applyCircuitResult(loadCircuitProgress(), detail.gameId, detail.result); if (!update.accepted) return;
    render(saveCircuitProgress(update.progress));
    if (toast) {
      const circuit = update.progress.current!; const stage = circuit.results.at(-1)!;
      toast.textContent = update.completed ? `Circuit complete · ${circuitTotalPoints(circuit).toLocaleString()} points!`
        : `Stage complete · ${stage.performancePercent}% performance · +${stage.points}. Choose Next stage.`;
      toast.hidden = false; window.clearTimeout(toastTimer); toastTimer = window.setTimeout(() => { toast.hidden = true; }, 6_000);
    }
  });
  window.addEventListener('storage', event => { if (event.key === CIRCUIT_STORAGE_KEY) render(); }); render();
}
