import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { baseClaudeArgs, parseClaudeResult, runClaude } from './claude-cli.js';
import {
  FIX_SCHEMA, FIX_SYSTEM_PROMPT, PROTECTED_MODULES, REPRODUCE_SCHEMA, REPRODUCE_SYSTEM_PROMPT,
  buildFixPrompt, buildReproducePrompt, checkFixPaths, checkReproducePaths, clip, fixEligibility,
  linesFromNumstat, typeErrorsOutsideTests,
} from './fix-policy.js';
import type { TriagedReport } from './triage.js';

const root = process.cwd();
const reportsDir = process.env.REPORTS_DIR || join(root, 'reports');
const dirs = { triaged: join(reportsDir, 'triaged'), fixed: join(reportsDir, 'fixed'), fixFailed: join(reportsDir, 'fix-failed') };
const BASE = process.env.FIX_BASE || 'HEAD';
const MODEL = process.env.FIX_MODEL;
const MAX_USD = process.env.FIX_MAX_USD || '2.00';
const ATTEMPTS = 2;
/** Rounds of reproduce-then-fix; a new round starts only when the fixer rejects the test. */
const ROUNDS = 2;
const CLAUDE_TIMEOUT_MS = 10 * 60_000;
const TEST_TIMEOUT_MS = 60_000;
const tsc = join(root, 'node_modules', 'typescript', 'lib', 'tsc.js');
const worktreesRoot = join(tmpdir(), 'bomberman-fix');

/** Recursive deletes only ever happen inside the scratch area for worktrees. */
async function removeScratch(path: string): Promise<void> {
  const inside = relative(worktreesRoot, path);
  if (!inside || inside.startsWith('..') || inside.includes(':')) throw new Error(`Refusing to delete ${path}`);
  await rm(path, { recursive: true, force: true });
}

interface Run { code: number; output: string }

function run(command: string, args: string[], options: { cwd: string; env?: NodeJS.ProcessEnv; timeoutMs?: number }): Promise<Run> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: options.cwd, env: options.env ?? process.env, shell: false });
    let output = '';
    const timer = setTimeout(() => child.kill(), options.timeoutMs ?? 120_000);
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => { clearTimeout(timer); resolve({ code: code ?? 1, output }); });
  });
}

async function git(cwd: string, ...args: string[]): Promise<string> {
  const result = await run('git', args, { cwd });
  if (result.code !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.output.trim()}`);
  return result.output;
}

function build(worktree: string): Promise<Run> {
  return run(process.execPath, [tsc, '-p', worktree], { cwd: worktree });
}

/**
 * Tests are model-written code, so each file runs under Node's permission model:
 * it may read only the worktree (dependencies included), write only a scratch folder,
 * and start no processes. The environment is emptied so there are no secrets
 * to read even if a test reaches the network.
 */
async function runTestFile(worktree: string, file: string): Promise<Run> {
  // Outside the worktree, so scratch files never end up in a commit.
  const scratch = `${worktree}-tmp`;
  await mkdir(scratch, { recursive: true });
  return run(process.execPath, [
    '--permission',
    `--allow-fs-read=${worktree}`,
    `--allow-fs-read=${scratch}`,
    `--allow-fs-write=${scratch}`,
    file,
  ], {
    cwd: worktree,
    env: { TEMP: scratch, TMP: scratch, TMPDIR: scratch, SystemRoot: process.env.SystemRoot, PATH: '' },
    timeoutMs: TEST_TIMEOUT_MS,
  });
}

async function runSuite(worktree: string, only?: readonly string[]): Promise<{ ok: boolean; failures: string[] }> {
  const files = only ?? (await readdir(join(worktree, 'dist'))).filter(name => name.endsWith('.test.js')).sort().map(name => `dist/${name}`);
  const failures: string[] = [];
  for (const file of files) {
    const result = await runTestFile(worktree, file);
    if (result.code !== 0) failures.push(`${file}:\n${clip(result.output, 3000)}`);
  }
  return { ok: failures.length === 0, failures };
}

async function changedPaths(worktree: string): Promise<string[]> {
  await git(worktree, 'add', '-A');
  return (await git(worktree, 'diff', '--cached', '--name-only')).split('\n').map(line => line.trim()).filter(Boolean);
}

async function discard(worktree: string): Promise<void> {
  await git(worktree, 'reset', '-q', '--hard', 'HEAD');
  await git(worktree, 'clean', '-q', '-fd');
}

function claudeArgs(phase: 'reproduce' | 'fix'): string[] {
  const protectedFiles = [...PROTECTED_MODULES].flatMap(file => [file, file.replace(/\.ts$/, '.test.ts')]);
  const deny = (files: string[]) => files.flatMap(file => [`Edit(${file})`, `Write(${file})`]);
  return phase === 'reproduce'
    ? [
      ...baseClaudeArgs({ schema: REPRODUCE_SCHEMA, systemPrompt: REPRODUCE_SYSTEM_PROMPT, maxUsd: MAX_USD, model: MODEL }),
      '--tools', 'Read,Grep,Glob,Edit,Write',
      '--allowedTools', 'Edit(src/*.test.ts)', 'Write(src/*.test.ts)',
      '--disallowedTools', ...deny(protectedFiles),
    ]
    : [
      ...baseClaudeArgs({ schema: FIX_SCHEMA, systemPrompt: FIX_SYSTEM_PROMPT, maxUsd: MAX_USD, model: MODEL }),
      '--tools', 'Read,Grep,Glob,Edit,Write',
      '--allowedTools', 'Edit(src/*.ts)', 'Write(src/*.ts)',
      '--disallowedTools', ...deny(['src/*.test.ts', ...protectedFiles]),
    ];
}

interface FixRecord {
  id: string;
  title: string;
  outcome: 'fixed' | 'not-reproduced' | 'reproduced-not-fixed' | 'error';
  branch?: string;
  commits: string[];
  testFile?: string;
  testName?: string;
  explanation?: string;
  summary?: string;
  diffLines?: number;
  /** Why the harness rejected the last attempt, for a person to diagnose. */
  lastFeedback?: string;
  error?: string;
  costUsd: number;
  finishedAt: string;
}

async function fixReport(report: TriagedReport): Promise<FixRecord> {
  const record: FixRecord = { id: report.id, title: report.triage.title, outcome: 'error', commits: [], costUsd: 0, finishedAt: '' };
  const branch = `fix/${report.id}`;
  const worktree = join(worktreesRoot, report.id);
  let keepBranch = false;
  const log = (message: string) => console.log(`  ${message}`);

  await removeScratch(worktree);
  await git(root, 'worktree', 'prune');
  await git(root, 'worktree', 'add', '-q', '-b', branch, worktree, BASE);
  try {
    // A real copy, never a link: removing the worktree recursively on Windows
    // follows junctions and would empty the main checkout's node_modules.
    await cp(join(root, 'node_modules'), join(worktree, 'node_modules'), { recursive: true });

    log('baseline: building and running the suite');
    const baseBuild = await build(worktree);
    if (baseBuild.code !== 0) throw new Error(`The base does not build:\n${clip(baseBuild.output)}`);
    if (!(await runSuite(worktree)).ok) throw new Error('The base test suite already fails; fix that first.');

    const base = (await git(worktree, 'rev-parse', 'HEAD')).trim();
    let reproduceFeedback: string | undefined;
    for (let round = 1; round <= ROUNDS; round++) {
      // Step 1: a test that fails for the reported reason.
      let feedback = reproduceFeedback;
      let failure = '';
      record.testFile = undefined;
      for (let attempt = 1; attempt <= ATTEMPTS && !record.testFile; attempt++) {
        log(`reproduce, attempt ${attempt}${round > 1 ? ` (round ${round})` : ''}`);
        const result = parseClaudeResult(await runClaude({ cwd: worktree, args: claudeArgs('reproduce'), prompt: buildReproducePrompt(report, feedback), timeoutMs: CLAUDE_TIMEOUT_MS }));
        record.costUsd += result.costUsd;
        const answer = result.output as { status: string; testFile: string; testName: string; explanation: string };
        record.explanation = answer.explanation;
        if (answer.status === 'cannot-reproduce') {
          await discard(worktree);
          record.outcome = 'not-reproduced';
          return record;
        }
        const changed = await changedPaths(worktree);
        const paths = checkReproducePaths(changed);
        const built = paths.ok ? await build(worktree) : undefined;
        const strayErrors = built ? typeErrorsOutsideTests(built.output, changed) : [];
        const tests = paths.ok && !strayErrors.length ? await runSuite(worktree, changed.map(file => file.replace(/^src\/(.+)\.ts$/, 'dist/$1.js'))) : undefined;
        if (!paths.ok) feedback = paths.error;
        else if (strayErrors.length) feedback = `Your test broke the build outside the test files:\n${clip(built!.output)}`;
        else if (tests!.ok) feedback = 'Your test passes against the current code, so it does not reproduce the problem.';
        else if (!tests!.failures.join('\n').includes(answer.testName)) feedback = `The failure did not come from "${answer.testName}":\n${clip(tests!.failures.join('\n'))}`;
        else {
          failure = clip(tests!.failures.join('\n'));
          record.testFile = answer.testFile;
          record.testName = answer.testName;
          await git(worktree, 'commit', '-q', '-m', `test: reproduce ${report.triage.title}\n\nReport: ${report.id}\n\nCo-Authored-By: Claude <noreply@anthropic.com>`);
          record.commits = [(await git(worktree, 'rev-parse', '--short', 'HEAD')).trim()];
          keepBranch = true;
          log(`reproduced with "${answer.testName}"`);
          break;
        }
        log(`rejected: ${feedback.split('\n')[0]}`);
        record.lastFeedback = feedback;
        await discard(worktree);
      }
      if (!record.testFile) {
        record.outcome = 'error';
        record.error = `Could not produce a valid failing test. Last feedback: ${feedback}`;
        return record;
      }

      // Step 2: production change that makes it pass without touching tests.
      record.outcome = 'reproduced-not-fixed';
      feedback = undefined;
      let testRejected = false;
      for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
        log(`fix, attempt ${attempt}`);
        const result = parseClaudeResult(await runClaude({ cwd: worktree, args: claudeArgs('fix'), prompt: buildFixPrompt(report, record.testFile, record.testName!, failure, feedback), timeoutMs: CLAUDE_TIMEOUT_MS }));
        record.costUsd += result.costUsd;
        const answer = result.output as { status: string; summary: string };
        record.summary = answer.summary;
        if (answer.status === 'gave-up') { await discard(worktree); break; }
        if (answer.status === 'test-is-wrong') {
          // The fixer reviews the test; a flawed one goes back to step 1 with its reasons.
          log(`test rejected by the fixer: ${answer.summary.split('\n')[0].slice(0, 160)}`);
          reproduceFeedback = `A reviewer who tried to fix the code found your previous test is wrong, so it was discarded:\n${answer.summary}`;
          record.lastFeedback = reproduceFeedback;
          await git(worktree, 'reset', '-q', '--hard', base);
          await git(worktree, 'clean', '-q', '-fd');
          record.commits = [];
          keepBranch = false;
          testRejected = true;
          break;
        }
        const changed = await changedPaths(worktree);
        const lines = linesFromNumstat(await git(worktree, 'diff', '--cached', '--numstat'));
        const paths = checkFixPaths(changed, lines);
        const built = paths.ok ? await build(worktree) : undefined;
        const tests = built?.code === 0 ? await runSuite(worktree) : undefined;
        if (!paths.ok) feedback = paths.error;
        else if (built!.code !== 0) feedback = `The build fails:\n${clip(built!.output)}`;
        else if (!tests!.ok) feedback = `Tests still fail:\n${clip(tests!.failures.join('\n'))}`;
        else {
          await git(worktree, 'commit', '-q', '-m', `fix: ${report.triage.title}\n\n${answer.summary}\n\nReport: ${report.id}\n\nCo-Authored-By: Claude <noreply@anthropic.com>`);
          record.commits.push((await git(worktree, 'rev-parse', '--short', 'HEAD')).trim());
          record.diffLines = lines;
          record.outcome = 'fixed';
          log(`fixed (${lines} lines in ${changed.join(', ')})`);
          return record;
        }
        log(`rejected: ${feedback.split('\n')[0]}`);
        record.lastFeedback = feedback;
        await discard(worktree);
      }
      if (!testRejected) return record;
    }
    record.outcome = 'error';
    record.error = 'The reproducing test was rejected in every round.';
    return record;
  } catch (error) {
    record.outcome = 'error';
    record.error = (error as Error).message;
    return record;
  } finally {
    record.finishedAt = new Date().toISOString();
    if (keepBranch) record.branch = branch;
    await git(root, 'worktree', 'remove', '--force', worktree).catch(() => removeScratch(worktree));
    await removeScratch(`${worktree}-tmp`);
    // A branch holding a reproducing test is useful even without a fix; an empty one is not.
    if (!keepBranch) await git(root, 'branch', '-D', branch).catch(() => undefined);
  }
}

async function main(): Promise<void> {
  if (!existsSync(tsc)) throw new Error('TypeScript is missing; run npm install first.');
  await Promise.all(Object.values(dirs).map(dir => mkdir(dir, { recursive: true })));
  const requested = process.argv.slice(2).filter(arg => !arg.startsWith('-'));
  const names = requested.length ? requested.map(id => `${id}.json`) : (await readdir(dirs.triaged)).filter(name => name.endsWith('.json')).sort();
  let attempted = 0;
  for (const name of names) {
    const file = join(dirs.triaged, name);
    if (!existsSync(file)) { console.error(`${name}: no triaged report with that id.`); continue; }
    const done = existsSync(join(dirs.fixed, name)) || existsSync(join(dirs.fixFailed, name));
    if (done && !requested.length) continue;
    const report = JSON.parse(await readFile(file, 'utf8')) as TriagedReport;
    const eligible = fixEligibility(report, requested.length > 0);
    if (!eligible.ok) {
      if (requested.length) console.error(`${report.id}: skipped, ${eligible.reason}.`);
      continue;
    }
    attempted++;
    console.log(`${report.id}: ${report.triage.title}`);
    const record = await fixReport(report);
    await rm(join(record.outcome === 'fixed' ? dirs.fixFailed : dirs.fixed, name), { force: true });
    await writeFile(join(record.outcome === 'fixed' ? dirs.fixed : dirs.fixFailed, name), `${JSON.stringify(record, null, 2)}\n`, 'utf8');
    console.log(`  -> ${record.outcome}${record.branch ? ` on ${record.branch}` : ''}${record.error ? `: ${record.error.split('\n')[0]}` : ''}  $${record.costUsd.toFixed(2)}`);
  }
  if (!attempted) console.log('Nothing to fix.');
}

main().catch(error => {
  console.error((error as Error).message);
  process.exitCode = 1;
});
