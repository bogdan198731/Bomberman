import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { baseClaudeArgs, parseClaudeResult, runClaude } from './claude-cli.js';
import {
  BROWSER_FIX_SYSTEM_PROMPT, BROWSER_REPRODUCE_SYSTEM_PROMPT, FIX_SCHEMA, FIX_SYSTEM_PROMPT, PROTECTED_MODULES,
  REPRODUCE_SCHEMA, REPRODUCE_SYSTEM_PROMPT, buildFixPrompt, buildReproducePrompt, checkFixPaths, checkReproducePaths,
  clip, firstNonStyleChange, fixEligibility, fixKindFor, linesFromNumstat, lintBrowserSpec, typeErrorsOutsideTests, unsafeCssAdditions,
  type FixKind, type FixRecord,
} from './fix-policy.js';
import type { TriagedReport } from './triage.js';

const root = process.cwd();
const reportsDir = process.env.REPORTS_DIR || join(root, 'reports');
const dirs = { triaged: join(reportsDir, 'triaged'), fixed: join(reportsDir, 'fixed'), fixFailed: join(reportsDir, 'fix-failed') };
/** Before/after screenshots per report, taken by the browser helpers; the PR step uploads them. */
const evidenceRoot = join(reportsDir, 'evidence');
// Fix branches start from what PRs merge into.
const BASE = process.env.FIX_BASE || 'main';
const MODEL = process.env.FIX_MODEL;
const MAX_USD = process.env.FIX_MAX_USD || '2.00';
const ATTEMPTS = 2;
/** Rounds of reproduce-then-fix; a new round starts only when the fixer rejects the test. */
const ROUNDS = 2;
const CLAUDE_TIMEOUT_MS = 10 * 60_000;
const TEST_TIMEOUT_MS = 60_000;
const VISUAL_TIMEOUT_MS = 5 * 60_000;
const tsc = join(root, 'node_modules', 'typescript', 'lib', 'tsc.js');
const playwrightCli = join('node_modules', '@playwright', 'test', 'cli.js');
const browsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH
  || (process.platform === 'win32' ? join(process.env.LOCALAPPDATA ?? homedir(), 'ms-playwright') : join(homedir(), '.cache', 'ms-playwright'));
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

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
  });
}

/**
 * Browser tests need to start Chromium, so Node's permission model cannot wrap
 * them; lintBrowserSpec restricts what a generated spec may contain instead.
 * The environment is still emptied apart from what Playwright needs to run.
 */
async function runVisual(worktree: string, only?: readonly string[], evidenceDir?: string): Promise<{ ok: boolean; output: string }> {
  const scratch = `${worktree}-tmp`;
  await mkdir(scratch, { recursive: true });
  const result = await run(process.execPath, [playwrightCli, 'test', ...(only ?? []), '--pass-with-no-tests'], {
    cwd: worktree,
    env: {
      // Playwright starts the game server through the system shell.
      PATH: [dirname(process.execPath), ...(process.env.SystemRoot ? [join(process.env.SystemRoot, 'System32')] : ['/usr/bin', '/bin'])].join(process.platform === 'win32' ? ';' : ':'),
      ComSpec: process.env.ComSpec, SystemRoot: process.env.SystemRoot, TEMP: scratch, TMP: scratch, TMPDIR: scratch,
      PLAYWRIGHT_BROWSERS_PATH: browsersPath, VISUAL_PORT: String(await freePort()), CI: '1',
      ...(evidenceDir ? { VISUAL_EVIDENCE_DIR: evidenceDir } : {}),
    },
    timeoutMs: VISUAL_TIMEOUT_MS,
  });
  return { ok: result.code === 0, output: result.output };
}

async function changedPaths(worktree: string): Promise<string[]> {
  await git(worktree, 'add', '-A');
  return (await git(worktree, 'diff', '--cached', '--name-only')).split('\n').map(line => line.trim()).filter(Boolean);
}

async function discard(worktree: string): Promise<void> {
  await git(worktree, 'reset', '-q', '--hard', 'HEAD');
  await git(worktree, 'clean', '-q', '-fd');
}

function claudeArgs(phase: 'reproduce' | 'fix', kind: FixKind): string[] {
  const protectedFiles = [...PROTECTED_MODULES].flatMap(file => [file, file.replace(/\.ts$/, '.test.ts')]);
  const deny = (files: string[]) => files.flatMap(file => [`Edit(${file})`, `Write(${file})`]);
  // Commit messages are hints, not evidence; the agents judge the code alone.
  const hideHistory = 'Read(./.git/**)';
  if (kind === 'browser') {
    return phase === 'reproduce'
      ? [
        ...baseClaudeArgs({ schema: REPRODUCE_SCHEMA, systemPrompt: BROWSER_REPRODUCE_SYSTEM_PROMPT, maxUsd: MAX_USD, model: MODEL }),
        '--tools', 'Read,Grep,Glob,Edit,Write',
        '--allowedTools', 'Write(tests/visual/*.spec.ts)', 'Edit(tests/visual/*.spec.ts)',
        '--disallowedTools', hideHistory, ...deny(['tests/visual/helpers.ts', 'playwright.config.ts']),
      ]
      : [
        ...baseClaudeArgs({ schema: FIX_SCHEMA, systemPrompt: BROWSER_FIX_SYSTEM_PROMPT, maxUsd: MAX_USD, model: MODEL }),
        '--tools', 'Read,Grep,Glob,Edit,Write',
        '--allowedTools', 'Edit(index.html)', 'Edit(public/*.css)', 'Write(public/*.css)',
        '--disallowedTools', hideHistory, ...deny(['tests/**', 'src/**', 'playwright.config.ts']),
      ];
  }
  return phase === 'reproduce'
    ? [
      ...baseClaudeArgs({ schema: REPRODUCE_SCHEMA, systemPrompt: REPRODUCE_SYSTEM_PROMPT, maxUsd: MAX_USD, model: MODEL }),
      '--tools', 'Read,Grep,Glob,Edit,Write',
      '--allowedTools', 'Edit(src/*.test.ts)', 'Write(src/*.test.ts)',
      '--disallowedTools', hideHistory, ...deny(protectedFiles),
    ]
    : [
      ...baseClaudeArgs({ schema: FIX_SCHEMA, systemPrompt: FIX_SYSTEM_PROMPT, maxUsd: MAX_USD, model: MODEL }),
      '--tools', 'Read,Grep,Glob,Edit,Write',
      '--allowedTools', 'Edit(src/*.ts)', 'Write(src/*.ts)',
      '--disallowedTools', hideHistory, ...deny(['src/*.test.ts', ...protectedFiles]),
    ];
}

async function fixReport(report: TriagedReport, forced: boolean): Promise<FixRecord> {
  const kind = fixKindFor(report);
  const record: FixRecord = { id: report.id, title: report.triage.title, kind, outcome: 'error', forced, base: '', commits: [], costUsd: 0, finishedAt: '' };
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
    const baseVisual = await runVisual(worktree);
    if (!baseVisual.ok) throw new Error(`The base browser tests already fail; fix that first.\n${clip(baseVisual.output)}`);

    const base = (await git(worktree, 'rev-parse', 'HEAD')).trim();
    record.base = base;
    let reproduceFeedback: string | undefined;
    for (let round = 1; round <= ROUNDS; round++) {
      // Step 1: a test that fails for the reported reason.
      let feedback = reproduceFeedback;
      let failure = '';
      record.testFile = undefined;
      for (let attempt = 1; attempt <= ATTEMPTS && !record.testFile; attempt++) {
        log(`reproduce (${kind}), attempt ${attempt}${round > 1 ? ` (round ${round})` : ''}`);
        const result = parseClaudeResult(await runClaude({ cwd: worktree, args: claudeArgs('reproduce', kind), prompt: buildReproducePrompt(report, feedback), timeoutMs: CLAUDE_TIMEOUT_MS }));
        record.costUsd += result.costUsd;
        const answer = result.output as { status: string; testFile: string; testName: string; explanation: string };
        record.explanation = answer.explanation;
        if (answer.status === 'cannot-reproduce') {
          await discard(worktree);
          record.outcome = 'not-reproduced';
          return record;
        }
        const changed = await changedPaths(worktree);
        const paths = checkReproducePaths(changed, kind);
        const lint = kind === 'browser' && paths.ok
          ? (await Promise.all(changed.map(async file => lintBrowserSpec(await readFile(join(worktree, file), 'utf8')).map(problem => `${file}: ${problem}`)))).flat()
          : [];
        const built = paths.ok && !lint.length ? await build(worktree) : undefined;
        const strayErrors = built && kind === 'unit' ? typeErrorsOutsideTests(built.output, changed) : [];
        let tests: { ok: boolean; failures: string[] } | undefined;
        if (built && !strayErrors.length) {
          if (kind === 'browser') {
            // Screenshots of the failing states; replaced on every attempt so only the accepted test's remain.
            await rm(join(evidenceRoot, report.id), { recursive: true, force: true });
            const visual = await runVisual(worktree, changed, join(evidenceRoot, report.id, 'before'));
            tests = { ok: visual.ok, failures: visual.ok ? [] : [clip(visual.output, 6000)] };
          } else {
            tests = await runSuite(worktree, changed.map(file => file.replace(/^src\/(.+)\.ts$/, 'dist/$1.js')));
          }
        }
        if (!paths.ok) feedback = paths.error;
        else if (lint.length) feedback = `Your spec uses things browser tests may not use:\n${lint.join('\n')}`;
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
        log(`fix (${kind}), attempt ${attempt}`);
        const result = parseClaudeResult(await runClaude({ cwd: worktree, args: claudeArgs('fix', kind), prompt: buildFixPrompt(report, record.testFile, record.testName!, failure, feedback), timeoutMs: CLAUDE_TIMEOUT_MS }));
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
        const outsideStyle = changed.includes('index.html')
          ? firstNonStyleChange(await git(worktree, 'show', 'HEAD:index.html'), await readFile(join(worktree, 'index.html'), 'utf8'))
          : undefined;
        const htmlStyleOnly = outsideStyle === undefined;
        const paths = checkFixPaths(changed, lines, kind, htmlStyleOnly);
        const unsafeCss = kind === 'browser' ? unsafeCssAdditions(await git(worktree, 'diff', '--cached', '-U0')) : [];
        const built = paths.ok && !unsafeCss.length ? await build(worktree) : undefined;
        const tests = built?.code === 0 ? await runSuite(worktree) : undefined;
        // Every browser test, not just the new one: a style change can reach other screens.
        const visual = tests?.ok ? await runVisual(worktree) : undefined;
        if (!paths.ok) feedback = `${paths.error}${outsideStyle ? ` First changed line outside a style block: ${outsideStyle}` : ''}`;
        else if (unsafeCss.length) feedback = `Visual fixes may not load anything (url(), @import): ${unsafeCss.join(' | ')}`;
        else if (built!.code !== 0) feedback = `The build fails:\n${clip(built!.output)}`;
        else if (!tests!.ok) feedback = `Tests still fail:\n${clip(tests!.failures.join('\n'))}`;
        else if (!visual!.ok) feedback = `Browser tests still fail:\n${clip(visual!.output)}`;
        else {
          await git(worktree, 'commit', '-q', '-m', `fix: ${report.triage.title}\n\n${answer.summary}\n\nReport: ${report.id}\n\nCo-Authored-By: Claude <noreply@anthropic.com>`);
          record.commits.push((await git(worktree, 'rev-parse', '--short', 'HEAD')).trim());
          record.diffLines = lines;
          record.outcome = 'fixed';
          if (kind === 'browser') {
            // The same spec on the fixed code gives matching names for the after shots.
            const after = await runVisual(worktree, [record.testFile!], join(evidenceRoot, report.id, 'after'));
            if (after.ok) record.evidenceDir = join(evidenceRoot, report.id);
            else log('after screenshots failed; the PR will have none');
          }
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
    const record = await fixReport(report, requested.length > 0);
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
