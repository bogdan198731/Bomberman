import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SCREENSHOT_PREFIX, validateBugReport } from './bug-report.js';
import type { StoredReport } from './report-intake.js';
import type { ReportExport } from './report-email.js';

/**
 * Turns a report file saved from an email back into a queued report. The file
 * passed through a mailbox, so everything is validated again as if new.
 */
export function parseReportExport(text: string): { stored: StoredReport; screenshot?: string } {
  let data: ReportExport;
  try { data = JSON.parse(text) as ReportExport; }
  catch { throw new Error('Not a report file: it is not JSON.'); }
  if (!/^\d{8}T\d{6}Z-[0-9a-f]{6}$/.test(String(data.id))) throw new Error('Not a report file: missing or odd report id.');
  const checked = validateBugReport({ ...data.report, screenshot: data.screenshotData ? `${SCREENSHOT_PREFIX}${data.screenshotData}` : undefined });
  if (!checked.ok) throw new Error(`The report inside is invalid: ${checked.error}`);
  const text60 = (value: unknown) => (typeof value === 'string' ? value.slice(0, 60) : '');
  const stored: StoredReport = {
    id: data.id,
    receivedAt: text60(data.receivedAt),
    game: /^[a-z0-9-]{1,32}$/.test(String(data.game)) ? data.game : 'hub',
    commit: /^[0-9a-f]{4,40}$|^unknown$/.test(String(data.commit)) ? data.commit : 'unknown',
    trust: data.trust === 'tester' ? 'tester' : 'public',
    ...(data.trust === 'tester' && /^[a-z0-9][a-z0-9_-]{0,31}$/i.test(String(data.tester)) ? { tester: data.tester } : {}),
    report: checked.report,
  };
  if (stored.trust === 'tester' && !stored.tester) stored.trust = 'public';
  return { stored, ...(checked.screenshot ? { screenshot: checked.screenshot } : {}) };
}

async function main(): Promise<void> {
  const files = process.argv.slice(2);
  if (!files.length) {
    console.log('Usage: npm run import-report -- <report-….json> [more files]');
    process.exitCode = 1;
    return;
  }
  const reportsDir = process.env.REPORTS_DIR || join(process.cwd(), 'reports');
  for (const file of files) {
    try {
      const { stored, screenshot } = parseReportExport(await readFile(file, 'utf8'));
      const queued = join(reportsDir, 'queue', `${stored.id}.json`);
      if (['queue', 'triaging', 'triaged', 'failed'].some(dir => existsSync(join(reportsDir, dir, `${stored.id}.json`)))) {
        console.log(`${stored.id}: already imported, skipped.`);
        continue;
      }
      if (screenshot) {
        await mkdir(join(reportsDir, 'screenshots'), { recursive: true });
        await writeFile(join(reportsDir, 'screenshots', `${stored.id}.jpg`), Buffer.from(screenshot, 'base64'));
        stored.screenshot = `${stored.id}.jpg`;
      }
      await mkdir(join(reportsDir, 'queue'), { recursive: true });
      await writeFile(queued, `${JSON.stringify(stored, null, 2)}\n`, 'utf8');
      console.log(`${stored.id}: queued (${stored.report.kind} in ${stored.game}, ${stored.trust}${screenshot ? ', with screenshot' : ''}). Run npm.cmd run triage next.`);
    } catch (error) {
      console.error(`${file}: ${(error as Error).message}`);
      process.exitCode = 1;
    }
  }
}

// Only when run as a command, so tests can import the parser.
if (process.argv[1]?.replace(/\\/g, '/').endsWith('/import-report.js')) void main();
