import { describePicked } from './bug-report.js';
import type { StoredReport } from './report-intake.js';

/**
 * Sends each report to an inbox through Resend's HTTPS API: hosts like Render
 * block SMTP, and a mailbox is the simplest place for reports to outlive the
 * server's temporary disk.
 */

export const RESEND_ENDPOINT = 'https://api.resend.com/emails';
/** Resend's shared sender, allowed without a verified domain for mail to the account owner. */
export const DEFAULT_REPORT_SENDER = 'Blast Arcade <onboarding@resend.dev>';

export interface ReportEmail {
  from: string;
  to: string;
  subject: string;
  text: string;
  attachments: { filename: string; content: string; content_type: string }[];
}

/** The report file a person saves from the email and imports with `npm run import-report`. */
export interface ReportExport extends StoredReport {
  /** The screenshot as base64 JPEG, so one attachment carries everything. */
  screenshotData?: string;
}

function oneLine(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export function buildReportEmail(stored: StoredReport, to: string, from: string, screenshot?: string): ReportEmail {
  const { report } = stored;
  const who = stored.trust === 'tester' ? `trusted tester ${stored.tester}` : 'public';
  const exported: ReportExport = { ...stored, ...(screenshot ? { screenshotData: screenshot } : {}) };
  const lines = [
    `New ${report.kind} report ${stored.id} for ${stored.game}, from ${who}.`,
    `Page ${report.path} · screen ${report.viewport || '?'} · language ${report.language || '?'} · commit ${stored.commit}`,
    `Browser: ${report.userAgent || 'unknown'}`,
    '',
    'What the player wrote (untrusted):',
    report.description,
    ...(report.element ? ['', 'They pointed at:', describePicked(report.element)] : []),
    ...(report.errors.length ? ['', 'Recent errors in their browser:', ...report.errors.map(error => `- ${oneLine(error, 300)}`)] : []),
    '',
    screenshot ? 'Their screenshot is attached.' : 'No screenshot was sent.',
    '',
    `To send it through the fix pipeline, save report-${stored.id}.json and run:`,
    `  npm.cmd run import-report path\\to\\report-${stored.id}.json`,
  ];
  return {
    from,
    to,
    subject: `[Blast Arcade] ${report.kind} in ${stored.game}${stored.trust === 'tester' ? ` (tester ${stored.tester})` : ''}: ${oneLine(report.description, 60)}`,
    text: lines.join('\n'),
    attachments: [
      { filename: `report-${stored.id}.json`, content: Buffer.from(JSON.stringify(exported, null, 2)).toString('base64'), content_type: 'application/json' },
      ...(screenshot ? [{ filename: `screenshot-${stored.id}.jpg`, content: screenshot, content_type: 'image/jpeg' }] : []),
    ],
  };
}

export async function sendReportEmail(apiKey: string, email: ReportEmail): Promise<string> {
  const response = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(email),
    signal: AbortSignal.timeout(10_000),
  });
  const body = await response.json().catch(() => ({})) as { id?: string; message?: string };
  if (!response.ok) throw new Error(`Resend responded ${response.status}: ${body.message ?? 'unknown error'}`);
  return body.id ?? '';
}
