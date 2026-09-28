import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  isBrowserSpec, isStyleFile, isTestFile, linesFromNumstat, styleOnlyChange, unsafeCssAdditions, type FixRecord,
} from './fix-policy.js';
import {
  DEFAULT_DAILY_AUTO_MERGES, PR_LABELS, autoMergeChecks, parseGitHubRemote, prBody, prTitle, withinDailyCap,
  type AutoMergeInput,
} from './pr-policy.js';
import { isTesterActive, readTesterFile } from './testers.js';
import type { TriagedReport } from './triage.js';

const root = process.cwd();
const reportsDir = process.env.REPORTS_DIR || join(root, 'reports');
const dirs = { triaged: join(reportsDir, 'triaged'), fixed: join(reportsDir, 'fixed') };
const mergeLog = join(reportsDir, 'auto-merges.json');
const PR_BASE = process.env.PR_BASE || 'main';
// Off unless switched on: a person decides when the pipeline may merge by itself.
const AUTO_MERGE = process.env.AUTO_MERGE === '1';
const DAILY_CAP = Number(process.env.AUTO_MERGE_DAILY || DEFAULT_DAILY_AUTO_MERGES);
const TOKEN = process.env.GITHUB_TOKEN;
const dryRun = process.argv.includes('--dry-run');

function git(...args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd: root, shell: false });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    child.on('error', reject);
    child.on('close', code => (code === 0 ? resolve(output) : reject(new Error(`git ${args.join(' ')} failed: ${output.trim()}`))));
  });
}

class GitHub {
  constructor(private readonly token: string, readonly owner: string, readonly repo: string) {}

  private async call<T>(method: string, path: string, body?: unknown): Promise<{ status: number; data: T }> {
    const response = await fetch(`https://api.github.com${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'blast-arcade-report-pipeline',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => ({})) as T;
    return { status: response.status, data };
  }

  private async ok<T>(method: string, path: string, body?: unknown): Promise<T> {
    const { status, data } = await this.call<T & { message?: string }>(method, path, body);
    if (status >= 300) throw new Error(`GitHub ${method} ${path} -> ${status}: ${data.message ?? 'unknown error'}`);
    return data;
  }

  async openPull(branch: string): Promise<PullRequest | undefined> {
    const pulls = await this.ok<PullRequest[]>('GET', `/repos/${this.owner}/${this.repo}/pulls?state=open&head=${this.owner}:${encodeURIComponent(branch)}`);
    return pulls[0];
  }

  createPull(branch: string, title: string, body: string): Promise<PullRequest> {
    return this.ok<PullRequest>('POST', `/repos/${this.owner}/${this.repo}/pulls`, { head: branch, base: PR_BASE, title, body });
  }

  async ensureLabel(label: { name: string; color: string; description: string }): Promise<void> {
    const { status } = await this.call('POST', `/repos/${this.owner}/${this.repo}/labels`, label);
    // 422 means the label already exists.
    if (status >= 300 && status !== 422) throw new Error(`Could not create label ${label.name} (${status}).`);
  }

  async addLabels(number: number, names: string[]): Promise<void> {
    await this.ok('POST', `/repos/${this.owner}/${this.repo}/issues/${number}/labels`, { labels: names });
  }

  /**
   * Asks GitHub to merge once required checks pass. Deliberately never falls
   * back to merging directly: without branch protection there is nothing to wait for.
   */
  async enableAutoMerge(nodeId: string): Promise<void> {
    const result = await this.ok<{ errors?: { message: string }[] }>('POST', '/graphql', {
      query: 'mutation($id: ID!) { enablePullRequestAutoMerge(input: { pullRequestId: $id, mergeMethod: SQUASH }) { pullRequest { number } } }',
      variables: { id: nodeId },
    });
    if (result.errors?.length) throw new Error(result.errors.map(error => error.message).join('; '));
  }
}

interface PullRequest { number: number; html_url: string; node_id: string }

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, 'utf8')) as T;
}

async function branchFacts(fix: FixRecord): Promise<{ changedFiles: string[]; diffLines: number; htmlStyleOnly: boolean; unsafeCss: string[] }> {
  const range = `${fix.base}..${fix.branch}`;
  const changedFiles = (await git('diff', '--name-only', range)).split('\n').map(line => line.trim()).filter(Boolean);
  // Size limits apply to production code; the test is allowed to be thorough.
  const codeNumstat = (await git('diff', '--numstat', range)).split('\n').filter(line => {
    const path = line.split('\t')[2];
    return path && !isTestFile(path) && !isBrowserSpec(path);
  }).join('\n');
  // Re-checked from git, not taken from the fix record.
  const htmlStyleOnly = !changedFiles.includes('index.html')
    || styleOnlyChange(await git('show', `${fix.base}:index.html`), await git('show', `${fix.branch}:index.html`));
  const styleFiles = changedFiles.filter(isStyleFile);
  const unsafeCss = styleFiles.length ? unsafeCssAdditions(await git('diff', '-U0', range, '--', ...styleFiles)) : [];
  return { changedFiles, diffLines: linesFromNumstat(codeNumstat), htmlStyleOnly, unsafeCss };
}

async function main(): Promise<void> {
  if (!dryRun && !TOKEN) throw new Error('Set GITHUB_TOKEN (contents and pull requests: read and write), or pass --dry-run.');
  const remote = parseGitHubRemote(await git('remote', 'get-url', 'origin'));
  if (!remote) throw new Error('origin is not a GitHub repository.');
  const github = TOKEN ? new GitHub(TOKEN, remote.owner, remote.repo) : undefined;
  const testers = readTesterFile(process.env.TESTERS_FILE || join(root, 'testers.json'));
  const merges: string[] = existsSync(mergeLog) ? await readJson<string[]>(mergeLog) : [];
  const names = existsSync(dirs.fixed) ? (await readdir(dirs.fixed)).filter(name => name.endsWith('.json')).sort() : [];
  let handled = 0;
  let labelsReady = false;

  for (const name of names) {
    const fix = await readJson<FixRecord>(join(dirs.fixed, name));
    if (fix.outcome !== 'fixed' || !fix.branch || fix.prNumber) continue;
    handled++;
    try {
      const triaged = await readJson<TriagedReport>(join(dirs.triaged, name));
      await git('rev-parse', '--verify', '--quiet', fix.branch);
      const input: AutoMergeInput = {
        triaged, fix, ...(await branchFacts(fix)),
        testerActive: Boolean(triaged.tester) && isTesterActive(testers, triaged.tester!),
      };
      const { eligible, checks } = autoMergeChecks(input);
      const withinCap = withinDailyCap(merges, new Date(), DAILY_CAP);
      const autoMerge = eligible && AUTO_MERGE && withinCap;
      fix.autoMerge = !eligible ? 'not-eligible' : !AUTO_MERGE ? 'switched-off' : !withinCap ? 'daily-cap' : 'enabled';
      fix.autoMergeReasons = checks.filter(check => !check.ok).map(check => check.label);
      const title = prTitle(fix.title);
      const labels = [PR_LABELS.report.name, ...(triaged.trust === 'tester' ? [PR_LABELS.tester.name] : []), ...(autoMerge ? [PR_LABELS.autoMerge.name] : [])];

      console.log(`${fix.id}: ${title}`);
      console.log(`  labels: ${labels.join(', ')} | auto-merge: ${fix.autoMerge}${fix.autoMergeReasons.length ? ` (missing: ${fix.autoMergeReasons.join('; ')})` : ''}`);
      if (dryRun || !github) { console.log(`  dry run - would push ${fix.branch} and open a PR into ${PR_BASE}`); continue; }

      // Never forced: if the remote branch moved, a person should look.
      await git('push', '--quiet', 'origin', `${fix.branch}:${fix.branch}`);
      const pull = (await github.openPull(fix.branch)) ?? await github.createPull(fix.branch, title, prBody(input, autoMerge));
      fix.prNumber = pull.number;
      fix.prUrl = pull.html_url;
      // Labels are for people scanning the PR list; the merge gates live in code,
      // so a token without Issues permission must not block the PR itself.
      try {
        if (!labelsReady) {
          for (const label of Object.values(PR_LABELS)) await github.ensureLabel(label);
          labelsReady = true;
        }
        await github.addLabels(pull.number, labels);
      } catch (error) {
        console.warn(`  labels skipped: ${(error as Error).message} (give the token Issues: read and write to enable them)`);
      }
      if (autoMerge) {
        try {
          await github.enableAutoMerge(pull.node_id);
          merges.push(new Date().toISOString());
          await writeFile(mergeLog, `${JSON.stringify(merges, null, 2)}\n`, 'utf8');
        } catch (error) {
          fix.autoMerge = 'failed';
          fix.autoMergeReasons = [`GitHub refused auto-merge: ${(error as Error).message}. Enable "Allow auto-merge" and protect ${PR_BASE} with the "test" check required.`];
        }
      }
      console.log(`  -> ${pull.html_url} (auto-merge ${fix.autoMerge})`);
    } catch (error) {
      console.error(`  ${fix.id} failed: ${(error as Error).message}`);
    }
    await writeFile(join(dirs.fixed, name), `${JSON.stringify(fix, null, 2)}\n`, 'utf8');
  }
  if (!handled) console.log('No fixed branches waiting for a PR.');
}

main().catch(error => {
  console.error((error as Error).message);
  process.exitCode = 1;
});
