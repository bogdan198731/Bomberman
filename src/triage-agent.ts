import { spawn } from 'node:child_process';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { StoredReport } from './report-intake.js';
import {
  TRIAGE_SCHEMA, TRIAGE_SYSTEM_PROMPT, buildTriagePrompt, parseClaudeResult, parseTriage,
  type PriorReport, type TriagedReport,
} from './triage.js';

const root = process.cwd();
const reportsDir = process.env.REPORTS_DIR || join(root, 'reports');
const dirs = {
  queue: join(reportsDir, 'queue'),
  triaging: join(reportsDir, 'triaging'),
  triaged: join(reportsDir, 'triaged'),
  failed: join(reportsDir, 'failed'),
};
const CLAUDE = process.env.CLAUDE_BIN || 'claude';
const MODEL = process.env.TRIAGE_MODEL;
const MAX_USD = process.env.TRIAGE_MAX_USD || '0.50';
const TIMEOUT_MS = 5 * 60_000;
const POLL_MS = Number(process.env.TRIAGE_POLL_SECONDS || 30) * 1000;

/**
 * The agent reads code and nothing else: no shell, no edits, no web, no MCP
 * servers, and none of the user's own settings, hooks or plugins. Reports and
 * tester hashes are also git-ignored, which keeps them out of Grep and Glob.
 */
function claudeArgs(): string[] {
  return [
    '-p',
    '--restricted',
    '--tools', 'Read,Grep,Glob',
    '--disallowedTools', 'Read(./reports/**)', 'Read(./testers.json)', 'Read(./.env*)',
    '--strict-mcp-config',
    '--permission-mode', 'dontAsk',
    '--no-session-persistence',
    '--max-budget-usd', MAX_USD,
    '--output-format', 'json',
    '--json-schema', JSON.stringify(TRIAGE_SCHEMA),
    '--append-system-prompt', TRIAGE_SYSTEM_PROMPT,
    ...(MODEL ? ['--model', MODEL] : []),
  ];
}

function runClaude(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // The prompt goes through stdin so report text is never parsed as arguments.
    const child = spawn(CLAUDE, claudeArgs(), { cwd: root, stdio: ['pipe', 'pipe', 'pipe'], shell: false });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('Claude timed out.')); }, TIMEOUT_MS);
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code === 0 || stdout.trim()) resolve(stdout);
      else reject(new Error(`Claude exited with ${code}: ${stderr.trim().slice(0, 300)}`));
    });
    child.stdin.end(prompt);
  });
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, 'utf8')) as T;
}

async function jsonFiles(dir: string): Promise<string[]> {
  return (await readdir(dir)).filter(name => name.endsWith('.json')).sort();
}

async function priorReports(): Promise<PriorReport[]> {
  const names = (await jsonFiles(dirs.triaged)).slice(-40);
  const prior = await Promise.all(names.map(async name => {
    try {
      const item = await readJson<TriagedReport>(join(dirs.triaged, name));
      return { id: item.id, game: item.game, verdict: item.triage.verdict, title: item.triage.title };
    } catch { return undefined; }
  }));
  return prior.filter((item): item is PriorReport => Boolean(item));
}

async function triageOne(name: string): Promise<void> {
  const claimed = join(dirs.triaging, name);
  // Renaming claims the report, so two runners never triage the same one.
  try { await rename(join(dirs.queue, name), claimed); }
  catch { return; }
  let stored: StoredReport | undefined;
  try {
    stored = await readJson<StoredReport>(claimed);
    const prior = await priorReports();
    const started = Date.now();
    const result = parseClaudeResult(await runClaude(buildTriagePrompt(stored, prior)));
    const triage = parseTriage(result.output, new Set(prior.map(item => item.id)));
    if (!triage) throw new Error('Claude answered, but not with a usable triage.');
    const triaged: TriagedReport = {
      ...stored,
      triage,
      triagedAt: new Date().toISOString(),
      triageModel: result.model,
      triageCostUsd: result.costUsd,
    };
    await writeFile(join(dirs.triaged, name), `${JSON.stringify(triaged, null, 2)}\n`, 'utf8');
    const flags = [triage.autoFixCandidate && 'auto-fix candidate', triage.injectionSuspected && 'INJECTION SUSPECTED'].filter(Boolean);
    console.log(`${stored.id} -> ${triage.verdict} (${triage.confidence}) ${triage.title}${flags.length ? ` [${flags.join(', ')}]` : ''}  $${result.costUsd.toFixed(3)}, ${((Date.now() - started) / 1000).toFixed(0)}s`);
  } catch (error) {
    const message = (error as Error).message;
    await writeFile(join(dirs.failed, name), `${JSON.stringify({ ...(stored ?? {}), error: message, failedAt: new Date().toISOString() }, null, 2)}\n`, 'utf8');
    console.error(`${name} failed: ${message} (moved to reports/failed; move it back to reports/queue to retry)`);
  } finally {
    // The outcome now lives in triaged/ or failed/.
    await rm(claimed, { force: true });
  }
}

async function drainQueue(): Promise<number> {
  const names = await jsonFiles(dirs.queue);
  // One at a time: each run already fans out over the code, and the budget is per report.
  for (const name of names) await triageOne(name);
  return names.length;
}

async function main(): Promise<void> {
  await Promise.all(Object.values(dirs).map(dir => mkdir(dir, { recursive: true })));
  // Anything left in triaging/ was interrupted mid-run; put it back in line.
  for (const name of await jsonFiles(dirs.triaging)) await rename(join(dirs.triaging, name), join(dirs.queue, name));
  const watch = process.argv.includes('--watch');
  const count = await drainQueue();
  if (!watch) {
    console.log(count ? `Triaged ${count} report(s).` : 'Queue is empty.');
    return;
  }
  console.log(`Watching ${dirs.queue} every ${POLL_MS / 1000}s. Ctrl+C to stop.`);
  for (;;) {
    await new Promise(resolve => setTimeout(resolve, POLL_MS));
    await drainQueue();
  }
}

main().catch(error => {
  console.error((error as Error).message);
  process.exitCode = 1;
});
