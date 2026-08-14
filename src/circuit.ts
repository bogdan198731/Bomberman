import { ARCADE_GAME_IDS, GAME_META } from './stats.js';
import type { ArcadeGameId, ArcadeOutcome, ArcadeResult } from './stats.js';

export const CIRCUIT_STORAGE_KEY = 'blast-arcade-circuit-v1';
export const CIRCUIT_LENGTH = 3;
export const CIRCUIT_SCORE_CAP = 500;

const OUTCOME_BONUS: Record<ArcadeOutcome, number> = {
  win: 500,
  complete: 300,
  draw: 250,
  loss: 100,
};

export interface CircuitStageResult {
  gameId: ArcadeGameId;
  outcome: ArcadeOutcome;
  score: number;
  points: number;
  playedAt: number;
}

export interface ArcadeCircuit {
  version: 1;
  lineup: ArcadeGameId[];
  results: CircuitStageResult[];
  startedAt: number;
  completedAt: number;
}

export interface ArcadeCircuitProgress {
  version: 1;
  current: ArcadeCircuit | null;
  bestScore: number;
  completedRuns: number;
}

export interface CircuitStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function nonNegativeInteger(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function isOutcome(value: unknown): value is ArcadeOutcome {
  return value === 'win' || value === 'loss' || value === 'draw' || value === 'complete';
}

export function circuitStagePoints(result: ArcadeResult): number {
  const score = Math.min(CIRCUIT_SCORE_CAP, nonNegativeInteger(result.score));
  return score + OUTCOME_BONUS[result.outcome];
}

export function createDefaultCircuitProgress(): ArcadeCircuitProgress {
  return { version: 1, current: null, bestScore: 0, completedRuns: 0 };
}

export function normalizeCircuitProgress(value: unknown): ArcadeCircuitProgress {
  const progress = createDefaultCircuitProgress();
  if (!value || typeof value !== 'object') return progress;
  const candidate = value as Partial<ArcadeCircuitProgress>;
  progress.bestScore = nonNegativeInteger(candidate.bestScore);
  progress.completedRuns = nonNegativeInteger(candidate.completedRuns);
  if (!candidate.current || typeof candidate.current !== 'object') return progress;

  const source = candidate.current as Partial<ArcadeCircuit>;
  const lineupValues = Array.isArray(source.lineup) ? source.lineup : [];
  const lineup = lineupValues.flatMap((gameId, index) => (
    ARCADE_GAME_IDS.includes(gameId as ArcadeGameId) && lineupValues.indexOf(gameId) === index
      ? [gameId as ArcadeGameId]
      : []
  )).slice(0, CIRCUIT_LENGTH);
  if (lineup.length !== CIRCUIT_LENGTH) return progress;

  const resultValues = Array.isArray(source.results) ? source.results : [];
  const results: CircuitStageResult[] = [];
  for (let index = 0; index < Math.min(resultValues.length, CIRCUIT_LENGTH); index += 1) {
    const result = resultValues[index];
    if (!result || typeof result !== 'object') break;
    const stage = result as Partial<CircuitStageResult>;
    if (stage.gameId !== lineup[index] || !isOutcome(stage.outcome)) break;
    const score = nonNegativeInteger(stage.score);
    results.push({
      gameId: stage.gameId,
      outcome: stage.outcome,
      score,
      points: circuitStagePoints({ outcome: stage.outcome, score }),
      playedAt: nonNegativeInteger(stage.playedAt),
    });
  }
  const completed = results.length === CIRCUIT_LENGTH;
  progress.current = {
    version: 1,
    lineup,
    results,
    startedAt: nonNegativeInteger(source.startedAt),
    completedAt: completed ? nonNegativeInteger(source.completedAt) || results.at(-1)!.playedAt : 0,
  };
  return progress;
}

export function createArcadeCircuit(random: () => number = Math.random, now: number = Date.now()): ArcadeCircuit {
  const lineup = [...ARCADE_GAME_IDS];
  for (let index = lineup.length - 1; index > 0; index -= 1) {
    const randomValue = Math.min(0.999999, Math.max(0, random()));
    const swapIndex = Math.floor(randomValue * (index + 1));
    [lineup[index], lineup[swapIndex]] = [lineup[swapIndex], lineup[index]];
  }
  return {
    version: 1,
    lineup: lineup.slice(0, CIRCUIT_LENGTH),
    results: [],
    startedAt: nonNegativeInteger(now),
    completedAt: 0,
  };
}

export function startArcadeCircuit(
  value: ArcadeCircuitProgress,
  random: () => number = Math.random,
  now: number = Date.now(),
): ArcadeCircuitProgress {
  const progress = normalizeCircuitProgress(value);
  progress.current = createArcadeCircuit(random, now);
  return progress;
}

export function circuitTotalPoints(circuit: ArcadeCircuit): number {
  return circuit.results.reduce((total, result) => total + result.points, 0);
}

export function circuitWins(circuit: ArcadeCircuit): number {
  return circuit.results.filter(result => result.outcome === 'win').length;
}

export function circuitIsComplete(circuit: ArcadeCircuit): boolean {
  return circuit.results.length >= circuit.lineup.length;
}

export function circuitCurrentGame(circuit: ArcadeCircuit): ArcadeGameId | null {
  return circuitIsComplete(circuit) ? null : circuit.lineup[circuit.results.length] ?? null;
}

export function applyCircuitResult(
  value: ArcadeCircuitProgress,
  gameId: ArcadeGameId,
  result: ArcadeResult,
  now: number = Date.now(),
): { progress: ArcadeCircuitProgress; accepted: boolean; completed: boolean } {
  const progress = normalizeCircuitProgress(value);
  const circuit = progress.current;
  if (!circuit || circuitCurrentGame(circuit) !== gameId) return { progress, accepted: false, completed: false };
  const score = nonNegativeInteger(result.score);
  circuit.results.push({
    gameId,
    outcome: result.outcome,
    score,
    points: circuitStagePoints({ outcome: result.outcome, score }),
    playedAt: nonNegativeInteger(now),
  });
  const completed = circuitIsComplete(circuit);
  if (completed) {
    circuit.completedAt = nonNegativeInteger(now);
    const total = circuitTotalPoints(circuit);
    progress.bestScore = Math.max(progress.bestScore, total);
    progress.completedRuns += 1;
  }
  return { progress, accepted: true, completed };
}

function browserStorage(): CircuitStorage | undefined {
  try { return typeof localStorage === 'undefined' ? undefined : localStorage; }
  catch { return undefined; }
}

export function loadCircuitProgress(storage: CircuitStorage | undefined = browserStorage()): ArcadeCircuitProgress {
  if (!storage) return createDefaultCircuitProgress();
  try {
    const encoded = storage.getItem(CIRCUIT_STORAGE_KEY);
    return encoded ? normalizeCircuitProgress(JSON.parse(encoded)) : createDefaultCircuitProgress();
  } catch {
    return createDefaultCircuitProgress();
  }
}

export function saveCircuitProgress(
  value: ArcadeCircuitProgress,
  storage: CircuitStorage | undefined = browserStorage(),
): ArcadeCircuitProgress {
  const progress = normalizeCircuitProgress(value);
  try { storage?.setItem(CIRCUIT_STORAGE_KEY, JSON.stringify(progress)); }
  catch { /* Local storage can be unavailable in privacy mode. */ }
  return progress;
}

function outcomeLabel(outcome: ArcadeOutcome): string {
  if (outcome === 'win') return 'Victory';
  if (outcome === 'draw') return 'Draw';
  if (outcome === 'complete') return 'Run complete';
  return 'Finished';
}

export function initArcadeCircuit(): void {
  if (typeof document === 'undefined') return;
  const panel = document.getElementById('circuitPanel');
  const focusButton = document.getElementById('hubCircuitChip');
  const lineup = document.getElementById('circuitLineup');
  const status = document.getElementById('circuitStatus');
  const total = document.getElementById('circuitTotal');
  const wins = document.getElementById('circuitWins');
  const best = document.getElementById('circuitBest');
  const completedRuns = document.getElementById('circuitRuns');
  const launchButton = document.getElementById('circuitLaunchButton') as HTMLButtonElement | null;
  const shuffleButton = document.getElementById('circuitShuffleButton') as HTMLButtonElement | null;
  const toast = document.getElementById('circuitToast');
  if (!lineup || !launchButton) return;
  const activeLineup = lineup;
  const activeLaunchButton = launchButton;
  let toastTimer = 0;

  function render(value: ArcadeCircuitProgress = loadCircuitProgress()): void {
    const progress = normalizeCircuitProgress(value);
    const circuit = progress.current;
    const isComplete = circuit ? circuitIsComplete(circuit) : false;
    const currentGame = circuit ? circuitCurrentGame(circuit) : null;
    if (total) total.textContent = circuit ? circuitTotalPoints(circuit).toLocaleString() : '0';
    if (wins) wins.textContent = circuit ? String(circuitWins(circuit)) : '0';
    if (best) best.textContent = progress.bestScore.toLocaleString();
    if (completedRuns) completedRuns.textContent = String(progress.completedRuns);
    if (status) {
      status.textContent = !circuit
        ? 'Ready for a new three-game run'
        : isComplete
          ? `Circuit complete · ${circuitTotalPoints(circuit).toLocaleString()} points`
          : `Stage ${circuit.results.length + 1} of ${CIRCUIT_LENGTH} · ${GAME_META[currentGame!].name} is next`;
    }
    if (!circuit) {
      activeLineup.replaceChildren(...Array.from({ length: CIRCUIT_LENGTH }, (_, index) => {
        const stage = document.createElement('div');
        stage.className = 'circuit-stage pending';
        stage.innerHTML = `<span class="circuit-stage-number">${index + 1}</span><span class="circuit-stage-icon">?</span><div><strong>Mystery game</strong><small>Revealed when you start</small></div>`;
        return stage;
      }));
    } else {
      activeLineup.replaceChildren(...circuit.lineup.map((gameId, index) => {
        const result = circuit.results[index];
        const isCurrent = index === circuit.results.length && !isComplete;
        const stage = document.createElement('div');
        stage.className = `circuit-stage ${result ? 'complete' : isCurrent ? 'current' : 'pending'}`;
        const number = document.createElement('span');
        number.className = 'circuit-stage-number';
        number.textContent = result ? '✓' : String(index + 1);
        const icon = document.createElement('span');
        icon.className = 'circuit-stage-icon';
        icon.textContent = GAME_META[gameId].icon;
        const copy = document.createElement('div');
        const name = document.createElement('strong');
        name.textContent = GAME_META[gameId].name;
        const detail = document.createElement('small');
        detail.textContent = result
          ? `${outcomeLabel(result.outcome)} · +${result.points.toLocaleString()}`
          : isCurrent ? 'Up next' : 'Locked';
        copy.append(name, detail);
        stage.append(number, icon, copy);
        return stage;
      }));
    }
    activeLaunchButton.textContent = !circuit || isComplete
      ? 'Start a new circuit'
      : `Play stage ${circuit.results.length + 1} · ${GAME_META[currentGame!].name}`;
    activeLaunchButton.dataset.launchGame = currentGame ?? 'bomberman';
    if (shuffleButton) shuffleButton.hidden = !circuit || isComplete;
  }

  function beginCircuit(): ArcadeCircuitProgress {
    return saveCircuitProgress(startArcadeCircuit(loadCircuitProgress()));
  }

  activeLaunchButton.addEventListener('click', () => {
    const progress = loadCircuitProgress();
    if (!progress.current || circuitIsComplete(progress.current)) render(beginCircuit());
  });
  shuffleButton?.addEventListener('click', () => render(beginCircuit()));
  focusButton?.addEventListener('click', () => panel?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  window.addEventListener('arcade-game-result', event => {
    const detail = (event as CustomEvent<{ gameId: ArcadeGameId; result: ArcadeResult }>).detail;
    if (!detail || !ARCADE_GAME_IDS.includes(detail.gameId)) return;
    const update = applyCircuitResult(loadCircuitProgress(), detail.gameId, detail.result);
    if (!update.accepted) return;
    render(saveCircuitProgress(update.progress));
    if (toast) {
      const circuit = update.progress.current!;
      const stage = circuit.results.at(-1)!;
      toast.textContent = update.completed
        ? `Circuit complete · ${circuitTotalPoints(circuit).toLocaleString()} points!`
        : `Circuit stage complete · +${stage.points.toLocaleString()} points. Return to the hub for stage ${circuit.results.length + 1}.`;
      toast.hidden = false;
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => { toast.hidden = true; }, 6_000);
    }
  });
  window.addEventListener('storage', event => {
    if (event.key === CIRCUIT_STORAGE_KEY) render();
  });
  render();
}
