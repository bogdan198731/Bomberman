import { PICKED_STATE_KEYS, PICKED_STYLE_KEYS, SCREENSHOT_PREFIX, type PickedElement } from './bug-report.js';

/**
 * Evidence a player can attach to a report: the element they point at, and a
 * screenshot of the view they were looking at. Browser only.
 */

interface ScreenshotLibrary {
  domToCanvas(node: Node, options?: { scale?: number; backgroundColor?: string }): Promise<HTMLCanvasElement>;
}

/** Served by the server from node_modules; loaded only when someone reports. */
const LIBRARY_URL = '/vendor/modern-screenshot.js';
const MAX_WIDTH = 720;

export interface ViewShot {
  canvas: HTMLCanvasElement;
  /** Maps a viewport point to a point on the canvas. */
  toCanvas(x: number, y: number): { x: number; y: number };
}

function activeView(): HTMLElement | undefined {
  return Array.from(document.querySelectorAll<HTMLElement>('body > main'))
    .find(view => !view.classList.contains('view-hidden') && view.getClientRects().length > 0);
}

/** What is on screen of the current view, without any dialog on top of it. */
export async function captureView(): Promise<ViewShot | undefined> {
  const view = activeView();
  if (!view) return undefined;
  const library = await import(LIBRARY_URL as string) as ScreenshotLibrary;
  const scale = Math.min(1, MAX_WIDTH / window.innerWidth);
  const rect = view.getBoundingClientRect();
  const full = await library.domToCanvas(view, { scale, backgroundColor: getComputedStyle(document.body).backgroundColor });
  // Keep only the part of the view that was inside the viewport.
  const left = Math.max(rect.left, 0);
  const top = Math.max(rect.top, 0);
  const right = Math.min(rect.right, window.innerWidth);
  const bottom = Math.min(rect.bottom, window.innerHeight);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round((right - left) * scale));
  canvas.height = Math.max(1, Math.round((bottom - top) * scale));
  const context = canvas.getContext('2d')!;
  context.drawImage(full, (left - rect.left) * scale, (top - rect.top) * scale, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
  // The library leaves game canvases blank, and their pixels are exactly what
  // the player sees anyway, so paint each visible one over its own spot.
  for (const game of Array.from(view.querySelectorAll('canvas'))) {
    const box = game.getBoundingClientRect();
    if (!box.width || !box.height || box.bottom < top || box.top > bottom || game.width === 0) continue;
    try {
      context.drawImage(game, (box.left + game.clientLeft - left) * scale, (box.top + game.clientTop - top) * scale, game.clientWidth * scale, game.clientHeight * scale);
    } catch { /* A tainted canvas cannot be copied; leave the library's version. */ }
  }
  return { canvas, toCanvas: (x, y) => ({ x: (x - left) * scale, y: (y - top) * scale }) };
}

/** The screenshot as sent: the picked element outlined, as a compressed JPEG. */
export function screenshotDataUrl(shot: ViewShot, picked?: PickedElement): string {
  const canvas = document.createElement('canvas');
  canvas.width = shot.canvas.width;
  canvas.height = shot.canvas.height;
  const context = canvas.getContext('2d')!;
  context.drawImage(shot.canvas, 0, 0);
  if (picked) {
    const start = shot.toCanvas(picked.box.x, picked.box.y);
    const end = shot.toCanvas(picked.box.x + picked.box.width, picked.box.y + picked.box.height);
    context.strokeStyle = '#ff6b6b';
    context.lineWidth = 3;
    context.strokeRect(start.x - 3, start.y - 3, end.x - start.x + 6, end.y - start.y + 6);
  }
  const url = canvas.toDataURL('image/jpeg', 0.72);
  return url.startsWith(SCREENSHOT_PREFIX) ? url : '';
}

function selectorFor(element: Element): string {
  const parts: string[] = [];
  let node: Element | null = element;
  while (node && node !== document.body && parts.length < 6) {
    if (node.id) { parts.unshift(`#${CSS.escape(node.id)}`); break; }
    const parent: Element | null = node.parentElement;
    if (!parent) break;
    const tag = node.tagName;
    const siblings = Array.from(parent.children).filter(child => child.tagName === tag);
    parts.unshift(siblings.length > 1 ? `${tag.toLowerCase()}:nth-of-type(${siblings.indexOf(node) + 1})` : tag.toLowerCase());
    node = parent;
  }
  return parts.join(' > ');
}

export function describeElement(element: Element): PickedElement {
  const rect = element.getBoundingClientRect();
  const computed = getComputedStyle(element);
  const styles: Record<string, string> = {};
  for (const key of PICKED_STYLE_KEYS) styles[key] = computed.getPropertyValue(key);
  const state: Record<string, string> = {};
  for (const key of PICKED_STATE_KEYS) {
    const value = element.getAttribute(key);
    if (value !== null) state[key] = value || 'true';
  }
  return {
    selector: selectorFor(element),
    tag: element.tagName.toLowerCase(),
    text: ((element as HTMLElement).innerText ?? element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 120),
    box: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    styles,
    state,
  };
}

/**
 * Lets the player tap the element that looks wrong. Dialogs stay open but are
 * hidden, so a paused game stays paused exactly as the player saw it. Open
 * dialogs make the page inert, which also hides it from hit testing, so inert
 * is lifted while pointing and restored afterwards.
 */
export function pickElement(): Promise<Element | undefined> {
  return new Promise(resolve => {
    const layer = document.createElement('div');
    layer.className = 'bug-picker';
    layer.innerHTML = '<div class="bug-picker-bar"><span>Tap the part that looks wrong</span><button type="button">Cancel</button></div><div class="bug-picker-highlight" hidden></div>';
    const highlight = layer.querySelector<HTMLElement>('.bug-picker-highlight')!;
    const bar = layer.querySelector<HTMLElement>('.bug-picker-bar')!;
    const inert = new Map<HTMLElement, boolean>();
    Array.from(document.body.children).forEach(child => {
      if (child instanceof HTMLElement) { inert.set(child, child.inert); child.inert = false; }
    });
    document.body.classList.add('bug-picking');
    document.body.append(layer);

    const under = (x: number, y: number): Element | undefined => {
      layer.style.pointerEvents = 'none';
      const found = document.elementFromPoint(x, y);
      layer.style.pointerEvents = '';
      return found && found !== document.body && found !== document.documentElement && !bar.contains(found) ? found : undefined;
    };
    const finish = (picked?: Element) => {
      layer.remove();
      document.body.classList.remove('bug-picking');
      inert.forEach((value, element) => { element.inert = value; });
      window.removeEventListener('keydown', onKey, true);
      resolve(picked);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // Before the dialogs' own Escape handling, which would close the report.
      event.stopImmediatePropagation();
      event.preventDefault();
      finish();
    };
    layer.addEventListener('pointermove', event => {
      const target = under(event.clientX, event.clientY);
      highlight.hidden = !target;
      if (!target) return;
      const rect = target.getBoundingClientRect();
      Object.assign(highlight.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    });
    layer.addEventListener('click', event => {
      if (bar.contains(event.target as Node)) return;
      event.preventDefault();
      finish(under(event.clientX, event.clientY));
    });
    bar.querySelector('button')!.addEventListener('click', () => finish());
    window.addEventListener('keydown', onKey, true);
  });
}
