import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyCircuitResult,
  CIRCUIT_LENGTH,
  CIRCUIT_STORAGE_KEY,
  circuitCurrentGame,
  circuitIsComplete,
  circuitStagePoints,
  circuitTotalPoints,
  circuitWins,
  createArcadeCircuit,
  createDefaultCircuitProgress,
  loadCircuitProgress,
  normalizeCircuitProgress,
  saveCircuitProgress,
  startArcadeCircuit,
} from './circuit.js';

test('circuit points balance outcomes and cap raw game scores', () => {
  assert.equal(circuitStagePoints({ outcome: 'win', score: 900 }), 1_000);
  assert.equal(circuitStagePoints({ outcome: 'complete', score: 240 }), 540);
  assert.equal(circuitStagePoints({ outcome: 'draw', score: 0 }), 250);
  assert.equal(circuitStagePoints({ outcome: 'loss', score: -20 }), 100);
});

test('a new circuit contains three different arcade games', () => {
  const circuit = createArcadeCircuit(() => 0.25, 123);
  assert.equal(circuit.lineup.length, CIRCUIT_LENGTH);
  assert.equal(new Set(circuit.lineup).size, CIRCUIT_LENGTH);
  assert.equal(circuit.startedAt, 123);
  assert.deepEqual(circuit.results, []);
});

test('only the current circuit game can advance a run', () => {
  let progress = startArcadeCircuit(createDefaultCircuitProgress(), () => 0, 10);
  const circuit = progress.current!;
  const ignored = applyCircuitResult(progress, circuit.lineup[1], { outcome: 'win', score: 100 }, 11);
  assert.equal(ignored.accepted, false);
  const accepted = applyCircuitResult(progress, circuit.lineup[0], { outcome: 'win', score: 100 }, 12);
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.completed, false);
  progress = accepted.progress;
  assert.equal(circuitCurrentGame(progress.current!), circuit.lineup[1]);
  assert.equal(circuitWins(progress.current!), 1);
});

test('finishing a circuit records its best score and completed-run count', () => {
  let progress = startArcadeCircuit(createDefaultCircuitProgress(), () => 0.6, 1);
  for (const gameId of progress.current!.lineup) {
    progress = applyCircuitResult(progress, gameId, { outcome: 'win', score: 500 }, 2).progress;
  }
  assert.equal(circuitIsComplete(progress.current!), true);
  assert.equal(circuitTotalPoints(progress.current!), 3_000);
  assert.equal(progress.bestScore, 3_000);
  assert.equal(progress.completedRuns, 1);
});

test('circuit state normalization repairs scores and stops invalid result sequences', () => {
  const normalized = normalizeCircuitProgress({
    bestScore: -2,
    completedRuns: 4.8,
    current: {
      lineup: ['snake', 'star', 'blocks'],
      results: [
        { gameId: 'snake', outcome: 'complete', score: 8.9, points: 9999, playedAt: 2.9 },
        { gameId: 'blocks', outcome: 'win', score: 400, playedAt: 3 },
      ],
      startedAt: 1.8,
    },
  });
  assert.equal(normalized.bestScore, 0);
  assert.equal(normalized.completedRuns, 4);
  assert.equal(normalized.current?.results.length, 1);
  assert.equal(normalized.current?.results[0].points, 308);
  assert.equal(normalized.current?.startedAt, 1);
});

test('circuit progress round-trips through browser-style storage', () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
  const progress = startArcadeCircuit(createDefaultCircuitProgress(), () => 0.4, 44);
  saveCircuitProgress(progress, storage);
  assert.ok(values.has(CIRCUIT_STORAGE_KEY));
  assert.deepEqual(loadCircuitProgress(storage), progress);
});
