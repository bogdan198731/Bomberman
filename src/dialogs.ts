/** One visible modal, including when a pause is pending behind another dialog. */
export class DialogOrder {
  private entries = new Map<string, number>();
  open(id: string, priority: number): void { this.entries.set(id, priority); }
  close(id: string): void { this.entries.delete(id); }
  has(id: string): boolean { return this.entries.has(id); }
  get active(): string | null {
    return [...this.entries].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }
}

export function nextDialogFocus<T>(items: readonly T[], current: T | null, backwards: boolean): T | null {
  if (!items.length) return null;
  const index = current === null ? -1 : items.indexOf(current);
  if (index < 0) return backwards ? items[items.length - 1] : items[0];
  return items[(index + (backwards ? -1 : 1) + items.length) % items.length];
}

interface DialogOptions {
  id: string;
  overlay: HTMLElement;
  priority: number;
  dismiss(): void;
  initialFocus?: () => HTMLElement | null;
}
const order = new DialogOrder();
const dialogs = new Map<string, DialogOptions>();
const previousInert = new Map<HTMLElement, boolean>();
let returnFocus: HTMLElement | null = null;
let activeId: string | null = null;
let listening = false;

export function isDialogOpen(id: string): boolean { return order.has(id); }
export function activeArcadeDialog(): string | null { return order.active; }

function focusables(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]'))
    .filter(element => !element.matches(':disabled, [tabindex="-1"]') && !element.closest('[hidden], [inert]') && element.getClientRects().length > 0);
}

function render(): void {
  const next = order.active;
  const changed = next !== activeId;
  const previous = activeId;
  activeId = next;
  previousInert.forEach((value, element) => { element.inert = value; });
  previousInert.clear();
  dialogs.forEach(dialog => { dialog.overlay.hidden = dialog.id !== next; });
  const active = next ? dialogs.get(next) : undefined;
  document.body.classList.toggle('arcade-dialog-open', Boolean(active));
  if (active) {
    Array.from(document.body.children).forEach(element => {
      if (!(element instanceof HTMLElement) || element === active.overlay || element.contains(active.overlay)) return;
      previousInert.set(element, element.inert);
      element.inert = true;
    });
    if (changed) {
      const panel = active.overlay.querySelector<HTMLElement>('[role="dialog"]') ?? active.overlay;
      panel.tabIndex = -1;
      (active.initialFocus?.() ?? focusables(panel)[0] ?? panel).focus({ preventScroll: true });
    }
  } else if (changed && returnFocus?.isConnected && !returnFocus.closest('[hidden], .view-hidden')) {
    returnFocus.focus({ preventScroll: true });
  }
  window.dispatchEvent(new CustomEvent('arcade-dialog-change', { detail: { active: next, previous } }));
}

export function openArcadeDialog(id: string): void {
  const dialog = dialogs.get(id);
  if (!dialog || order.has(id)) return;
  if (!order.active) returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  order.open(id, dialog.priority);
  render();
}

export function closeArcadeDialog(id: string): void {
  if (!order.has(id)) return;
  order.close(id);
  render();
}

export function dismissArcadeDialogs(except?: string): void {
  [...dialogs.values()].filter(dialog => dialog.id !== except && order.has(dialog.id)).forEach(dialog => dialog.dismiss());
}

export function registerArcadeDialog(options: DialogOptions): void {
  dialogs.set(options.id, options);
  options.overlay.hidden = true;
  if (listening) return;
  listening = true;
  // Bubble on document: controls keep their native keyboard behavior, but the
  // games' window listeners never receive input intended for an open modal.
  document.addEventListener('keydown', event => {
    const active = order.active ? dialogs.get(order.active) : undefined;
    if (!active) return;
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); active.dismiss(); return; }
    if (event.key !== 'Tab') return;
    const panel = active.overlay.querySelector<HTMLElement>('[role="dialog"]') ?? active.overlay;
    event.preventDefault();
    (nextDialogFocus(focusables(panel), document.activeElement as HTMLElement, event.shiftKey) ?? panel).focus();
  });
  document.addEventListener('keyup', event => { if (order.active) event.stopPropagation(); });
  document.addEventListener('focusin', event => {
    const active = order.active ? dialogs.get(order.active) : undefined;
    if (!active || active.overlay.contains(event.target as Node)) return;
    const panel = active.overlay.querySelector<HTMLElement>('[role="dialog"]') ?? active.overlay;
    (focusables(panel)[0] ?? panel).focus();
  });
}
