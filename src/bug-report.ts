import { closeArcadeDialog, openArcadeDialog, registerArcadeDialog } from './dialogs.js';
import { captureView, describeElement, pickElement, screenshotDataUrl, type ViewShot } from './report-capture.js';

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
  /** A screenshot is most of a report's size: ~720 px wide JPEG, well under this. */
  screenshotChars: 700_000,
  bodyBytes: 800_000,
} as const;

/** What a player points at with "Point at the problem". */
export interface PickedElement {
  /** CSS path from the nearest id, e.g. "#minesView > div:nth-of-type(2) > button". */
  selector: string;
  tag: string;
  text: string;
  box: { x: number; y: number; width: number; height: number };
  styles: Record<string, string>;
  state: Record<string, string>;
}

export const PICKED_STYLE_KEYS = [
  'color', 'background-color', 'background-image', 'border-color', 'opacity', 'font-size', 'font-weight', 'display', 'visibility',
] as const;
export const PICKED_STATE_KEYS = ['aria-pressed', 'aria-checked', 'aria-expanded', 'aria-selected', 'aria-disabled', 'disabled'] as const;
export const SCREENSHOT_PREFIX = 'data:image/jpeg;base64,';

export interface BugReport {
  kind: BugReportKind;
  description: string;
  path: string;
  viewport: string;
  language: string;
  userAgent: string;
  errors: string[];
  element?: PickedElement;
}

/** `screenshot` is base64 JPEG, kept apart from the report so it can be stored as its own file. */
export type BugReportValidation = { ok: true; report: BugReport; screenshot?: string } | { ok: false; error: string };

function clip(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

function plain(value: unknown, max: number): string {
  // No control characters: this text is shown to people and agents.
  return clip(value, max).replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
}

/** Keeps a picked element only if it is well formed; anything odd is dropped, never an error. */
export function validatePickedElement(value: unknown): PickedElement | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const data = value as Record<string, unknown>;
  const selector = plain(data.selector, 200);
  const tag = plain(data.tag, 20).toLowerCase();
  const box = data.box as Record<string, unknown> | undefined;
  const numbers = box && ['x', 'y', 'width', 'height'].map(key => Number(box[key]));
  if (!selector || !/^[a-z][a-z0-9-]*$/.test(tag) || !numbers || numbers.some(n => !Number.isFinite(n) || Math.abs(n) > 100_000)) return undefined;
  const pick = (source: unknown, keys: readonly string[], max: number) => {
    const out: Record<string, string> = {};
    if (source && typeof source === 'object') {
      for (const key of keys) {
        const text = plain((source as Record<string, unknown>)[key], max);
        if (text) out[key] = text;
      }
    }
    return out;
  };
  const [x, y, width, height] = numbers.map(n => Math.round(n));
  return {
    selector, tag, text: plain(data.text, 120),
    box: { x, y, width, height },
    styles: pick(data.styles, PICKED_STYLE_KEYS, 200),
    state: pick(data.state, PICKED_STATE_KEYS, 20),
  };
}

/** How agents see a picked element: what, where, and how it looked when reported. */
export function describePicked(element: PickedElement): string {
  const state = Object.entries(element.state).map(([key, value]) => `${key}=${value}`).join(', ');
  const styles = Object.entries(element.styles).map(([key, value]) => `${key}: ${value}`).join('; ');
  return [
    `Selector: ${element.selector} (${element.tag})`,
    `Text: ${element.text ? `"${element.text}"` : '(none)'}`,
    `State: ${state || '(none)'}`,
    `Computed styles when reported: ${styles || '(none)'}`,
    `On the player's screen: ${element.box.width}x${element.box.height} px at ${element.box.x},${element.box.y}`,
  ].join('\n');
}

/** A JPEG data URL within the size limit, returned as bare base64; anything else is dropped. */
export function validateScreenshot(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.startsWith(SCREENSHOT_PREFIX)) return undefined;
  const base64 = value.slice(SCREENSHOT_PREFIX.length);
  if (!base64 || base64.length > BUG_REPORT_LIMITS.screenshotChars || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return undefined;
  // JPEG files start with FF D8 FF, which is "/9j/" in base64.
  return base64.startsWith('/9j/') ? base64 : undefined;
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
  const element = validatePickedElement(data.element);
  const screenshot = validateScreenshot(data.screenshot);
  return {
    ok: true,
    ...(screenshot ? { screenshot } : {}),
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
      ...(element ? { element } : {}),
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
  const pickButton = document.getElementById('bugReportPick') as HTMLButtonElement | null;
  const pickedNote = document.getElementById('bugReportPicked');
  const shotRow = document.getElementById('bugReportShotRow');
  const shotToggle = document.getElementById('bugReportShotToggle') as HTMLInputElement | null;
  const shotImage = document.getElementById('bugReportShot') as HTMLImageElement | null;
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

  let shot: ViewShot | undefined;
  let picked: PickedElement | undefined;

  function renderEvidence(): void {
    if (pickedNote) {
      pickedNote.hidden = !picked;
      pickedNote.textContent = picked ? `Selected: ${picked.text ? `"${picked.text.slice(0, 40)}"` : picked.tag}` : '';
    }
    if (shotRow) shotRow.hidden = !shot;
    if (shot && shotImage) shotImage.src = screenshotDataUrl(shot, picked);
  }

  /** Taken as the dialog opens: the game is paused behind it, as the player saw it. */
  function captureEvidence(): void {
    shot = undefined;
    picked = undefined;
    renderEvidence();
    captureView()
      .then(result => { shot = result; renderEvidence(); })
      // A screenshot is a bonus; the report works without one.
      .catch(() => { shot = undefined; renderEvidence(); });
  }

  pickButton?.addEventListener('click', () => {
    void pickElement().then(element => {
      if (element) picked = describeElement(element);
      renderEvidence();
      activeDescription.focus({ preventScroll: true });
    });
  });

  registerArcadeDialog({ id: 'bug-report', overlay: activeOverlay, priority: 90, dismiss: close, initialFocus: () => activeDescription });
  openButtons.forEach(button => button.addEventListener('click', () => {
    setStatus('', 'info');
    activeSubmit.disabled = false;
    if (testerInput && testerDetails) {
      testerInput.value = readTesterCode();
      testerDetails.open = Boolean(testerInput.value);
    }
    captureEvidence();
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
      element: picked,
      screenshot: shot && shotToggle?.checked !== false ? screenshotDataUrl(shot, picked) : undefined,
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
          picked = undefined;
          renderEvidence();
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
