import { closeArcadeDialog, openArcadeDialog, registerArcadeDialog } from './dialogs.js';

export type BugReportKind = 'bug' | 'idea';

export const BUG_REPORT_ENDPOINT = '/api/report';
export const TESTER_CODE_STORAGE_KEY = 'blast-arcade-tester-code-v1';
export const BUG_REPORT_LIMITS = {
  descriptionMin: 10,
  descriptionMax: 2000,
  errors: 20,
  errorLength: 500,
  userAgent: 300,
  path: 200,
  bodyBytes: 16_384,
} as const;

export interface BugReport {
  kind: BugReportKind;
  description: string;
  path: string;
  viewport: string;
  language: string;
  userAgent: string;
  errors: string[];
}

export type BugReportValidation = { ok: true; report: BugReport } | { ok: false; error: string };

function clip(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

/**
 * Shared by the dialog and the server. Everything except the description is
 * best-effort context, so malformed extras are dropped rather than rejected.
 */
export function validateBugReport(value: unknown): BugReportValidation {
  if (!value || typeof value !== 'object') return { ok: false, error: 'Invalid report.' };
  const data = value as Record<string, unknown>;
  // Hidden field that people never see; form-filling bots usually do.
  if (typeof data.website === 'string' && data.website !== '') return { ok: false, error: 'Invalid report.' };
  if (data.kind !== 'bug' && data.kind !== 'idea') return { ok: false, error: 'Choose bug or idea.' };
  const description = typeof data.description === 'string' ? data.description.trim() : '';
  if (description.length < BUG_REPORT_LIMITS.descriptionMin) {
    return { ok: false, error: `Please describe it in at least ${BUG_REPORT_LIMITS.descriptionMin} characters.` };
  }
  if (description.length > BUG_REPORT_LIMITS.descriptionMax) {
    return { ok: false, error: `Please keep it under ${BUG_REPORT_LIMITS.descriptionMax} characters.` };
  }
  const path = clip(data.path, BUG_REPORT_LIMITS.path);
  const viewport = clip(data.viewport, 20);
  const language = clip(data.language, 10);
  return {
    ok: true,
    report: {
      kind: data.kind,
      description,
      path: path.startsWith('/') ? path : '/',
      viewport: /^\d{1,5}x\d{1,5}$/.test(viewport) ? viewport : '',
      language: /^[a-z]{2}(-[A-Za-z]{2})?$/.test(language) ? language : '',
      userAgent: clip(data.userAgent, BUG_REPORT_LIMITS.userAgent),
      errors: Array.isArray(data.errors)
        ? data.errors.filter((error): error is string => typeof error === 'string')
          .slice(-BUG_REPORT_LIMITS.errors)
          .map(error => error.slice(0, BUG_REPORT_LIMITS.errorLength))
        : [],
    },
  };
}

/** Keeps the latest runtime errors so a report shows what broke just before it was sent. */
export class RecentErrors {
  private items: string[] = [];
  constructor(private readonly limit: number = BUG_REPORT_LIMITS.errors) {}
  push(message: string): void {
    this.items.push(message.slice(0, BUG_REPORT_LIMITS.errorLength));
    if (this.items.length > this.limit) this.items.shift();
  }
  list(): string[] { return [...this.items]; }
}

const recentErrors = new RecentErrors();

function readTesterCode(): string {
  try { return localStorage.getItem(TESTER_CODE_STORAGE_KEY) ?? ''; }
  catch { return ''; }
}

function rememberTesterCode(code: string): void {
  try {
    if (code) localStorage.setItem(TESTER_CODE_STORAGE_KEY, code);
    else localStorage.removeItem(TESTER_CODE_STORAGE_KEY);
  } catch { /* The code still works for this report; it just is not remembered. */ }
}

function describeError(error: unknown): string {
  // V8 stacks already start with "Name: message"; other engines' stacks do not.
  if (error instanceof Error) {
    const heading = `${error.name}: ${error.message}`;
    return error.stack?.startsWith(heading) ? error.stack : `${heading}${error.stack ? `\n${error.stack}` : ''}`;
  }
  return String(error);
}

export function initBugReport(): void {
  if (typeof document === 'undefined') return;
  window.addEventListener('error', event => {
    recentErrors.push(event.error ? describeError(event.error) : `${event.message} (${event.filename}:${event.lineno})`);
  });
  window.addEventListener('unhandledrejection', event => recentErrors.push(`Unhandled rejection: ${describeError(event.reason)}`));

  const overlay = document.getElementById('bugReportOverlay');
  const form = document.getElementById('bugReportForm') as HTMLFormElement | null;
  const description = document.getElementById('bugReportDescription') as HTMLTextAreaElement | null;
  const status = document.getElementById('bugReportStatus');
  const submit = document.getElementById('bugReportSubmit') as HTMLButtonElement | null;
  const closeButton = document.getElementById('bugReportCloseButton') as HTMLButtonElement | null;
  const testerDetails = document.getElementById('bugReportTester') as HTMLDetailsElement | null;
  const testerInput = document.getElementById('bugReportTesterCode') as HTMLInputElement | null;
  const openButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-open-bug-report]'));
  if (!overlay || !form || !description || !status || !submit || !openButtons.length) return;
  const activeOverlay = overlay;
  const activeForm = form;
  const activeDescription = description;
  const activeStatus = status;
  const activeSubmit = submit;

  function setStatus(message: string, tone: 'info' | 'error' | 'success'): void {
    activeStatus.textContent = message;
    activeStatus.dataset.tone = tone;
    activeStatus.hidden = !message;
  }

  function close(): void { closeArcadeDialog('bug-report'); }

  registerArcadeDialog({ id: 'bug-report', overlay: activeOverlay, priority: 90, dismiss: close, initialFocus: () => activeDescription });
  openButtons.forEach(button => button.addEventListener('click', () => {
    setStatus('', 'info');
    activeSubmit.disabled = false;
    if (testerInput && testerDetails) {
      testerInput.value = readTesterCode();
      testerDetails.open = Boolean(testerInput.value);
    }
    openArcadeDialog('bug-report');
  }));
  closeButton?.addEventListener('click', close);
  activeOverlay.addEventListener('click', event => { if (event.target === activeOverlay) close(); });

  activeForm.addEventListener('submit', event => {
    event.preventDefault();
    const fields = new FormData(activeForm);
    const payload = {
      kind: fields.get('kind'),
      description: fields.get('description'),
      website: fields.get('website'),
      path: location.pathname,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      language: document.documentElement.lang,
      userAgent: navigator.userAgent,
      errors: recentErrors.list(),
    };
    const checked = validateBugReport(payload);
    if (!checked.ok) { setStatus(checked.error, 'error'); return; }
    // Sent as a header so the code never ends up inside the stored report.
    const testerCode = testerInput?.value.trim() ?? '';
    activeSubmit.disabled = true;
    setStatus('Sending…', 'info');
    fetch(BUG_REPORT_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(testerCode ? { Authorization: `Bearer ${testerCode}` } : {}),
      },
      body: JSON.stringify(payload),
    })
      .then(async response => {
        if (response.ok) {
          const body = await response.json().catch(() => ({})) as { trust?: string };
          rememberTesterCode(testerCode);
          activeForm.reset();
          if (testerInput) testerInput.value = testerCode;
          setStatus(body.trust === 'tester' ? 'Thanks! Your tester report was sent.' : 'Thanks! Your report was sent.', 'success');
          return;
        }
        const body = await response.json().catch(() => ({})) as { error?: string };
        setStatus(body.error ?? 'The report could not be sent. Try again later.', 'error');
        activeSubmit.disabled = false;
      })
      .catch(() => {
        setStatus('You seem to be offline. Try again when you are connected.', 'error');
        activeSubmit.disabled = false;
      });
  });
}
