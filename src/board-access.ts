/**
 * Makes a canvas board usable without seeing it. Every square or card the
 * player can act on gets a real button laid exactly over its spot on the
 * canvas: screen readers read its label, keyboard players see a focus ring
 * on the board itself, and the arrow keys move between spots. The buttons are
 * transparent and let pointer input fall through, so the canvas still draws
 * and handles taps exactly as before.
 */

/** One place on the board, in canvas pixels. */
export interface BoardSpot {
  key: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  /** Marks a spot as chosen (a picked-up card), for aria-pressed. */
  pressed?: boolean;
}

export type BoardDirection = 'up' | 'down' | 'left' | 'right';

const DIRECTIONS: Record<string, BoardDirection> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

/**
 * The spot an arrow key moves to: the nearest one whose centre lies that way,
 * preferring spots in line with the current one. Works for regular grids and
 * for irregular layouts like a solitaire table alike.
 */
export function nextSpot(spots: readonly BoardSpot[], fromKey: string | null, direction: BoardDirection): BoardSpot | null {
  const from = spots.find(spot => spot.key === fromKey);
  if (!from) return spots[0] ?? null;
  const fx = from.x + from.width / 2;
  const fy = from.y + from.height / 2;
  let best: BoardSpot | null = null;
  let bestScore = Infinity;
  for (const spot of spots) {
    if (spot === from) continue;
    const dx = spot.x + spot.width / 2 - fx;
    const dy = spot.y + spot.height / 2 - fy;
    const along = direction === 'left' ? -dx : direction === 'right' ? dx : direction === 'up' ? -dy : dy;
    const across = direction === 'left' || direction === 'right' ? Math.abs(dy) : Math.abs(dx);
    // Must actually lie that way, and more that way than sideways.
    if (along <= 0.5 || across > along * 2) continue;
    const score = along + across * 3;
    if (score < bestScore) { bestScore = score; best = spot; }
  }
  return best;
}

export interface AccessibleBoardOptions {
  canvas: HTMLCanvasElement;
  /** Names the board as a whole, e.g. "Minesweeper field". */
  label: string;
  /** Enter, Space, or a screen reader's click on a spot. */
  activate(key: string): void;
  /** Extra keys on a focused spot, e.g. F to flag. Return true when handled. */
  onKey?(key: string, event: KeyboardEvent): boolean;
  /** Told whenever focus lands on a spot, so the canvas can follow. */
  onFocus?(key: string): void;
}

export class AccessibleBoard {
  readonly group: HTMLElement;
  private readonly live: HTMLElement;
  private readonly buttons = new Map<string, HTMLButtonElement>();
  private spots: BoardSpot[] = [];
  private current: string | null = null;
  private announceTimer = 0;

  constructor(private readonly options: AccessibleBoardOptions) {
    const { canvas } = options;
    const host = canvas.parentElement!;
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    this.group = document.createElement('div');
    this.group.className = 'board-access';
    this.group.setAttribute('role', 'group');
    this.group.setAttribute('aria-label', options.label);
    this.live = document.createElement('p');
    this.live.className = 'board-access-live';
    this.live.setAttribute('aria-live', 'polite');
    this.live.setAttribute('role', 'status');
    canvas.after(this.group, this.live);
    // The buttons below describe the board; the canvas itself is only the picture of it.
    canvas.setAttribute('aria-hidden', 'true');
    if (canvas.tabIndex >= 0) canvas.tabIndex = -1;

    this.group.addEventListener('keydown', event => this.keydown(event));
    this.group.addEventListener('click', event => {
      const key = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-spot]')?.dataset.spot;
      if (!key) return;
      event.stopPropagation();
      this.current = key;
      options.activate(key);
    });
    this.group.addEventListener('focusin', event => {
      const key = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-spot]')?.dataset.spot;
      if (!key) return;
      this.current = key;
      this.roving();
      options.onFocus?.(key);
    });
    // The canvas scales with the page, so the layer follows its box.
    const place = (): void => this.place();
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(place).observe(canvas);
    window.addEventListener('resize', place);
  }

  /** The spot that has (or last had) keyboard focus. */
  get focusedKey(): string | null { return this.current; }

  /** Lays out the spots, reusing buttons so focus stays where the player is. */
  update(spots: BoardSpot[]): void {
    const { canvas } = this.options;
    const previous = this.spots.find(spot => spot.key === this.current);
    const hadFocus = this.group.contains(document.activeElement);
    this.spots = spots;
    const keep = new Set(spots.map(spot => spot.key));
    for (const [key, button] of this.buttons) {
      if (!keep.has(key)) { button.remove(); this.buttons.delete(key); }
    }
    spots.forEach(spot => {
      let button = this.buttons.get(spot.key);
      if (!button) {
        button = document.createElement('button');
        button.type = 'button';
        button.className = 'board-access-spot';
        button.dataset.spot = spot.key;
        button.tabIndex = -1;
        this.buttons.set(spot.key, button);
      }
      const style = button.style;
      style.left = `${(spot.x / canvas.width) * 100}%`;
      style.top = `${(spot.y / canvas.height) * 100}%`;
      style.width = `${(spot.width / canvas.width) * 100}%`;
      style.height = `${(spot.height / canvas.height) * 100}%`;
      if (button.getAttribute('aria-label') !== spot.label) button.setAttribute('aria-label', spot.label);
      if (spot.pressed === undefined) button.removeAttribute('aria-pressed');
      else button.setAttribute('aria-pressed', String(spot.pressed));
    });
    // Kept in the order given (reading order). Only reordered when it changed:
    // moving a node in the page drops its focus.
    const ordered = spots.map(spot => this.buttons.get(spot.key)!);
    const children = this.group.children;
    if (ordered.length !== children.length || ordered.some((button, index) => children[index] !== button)) {
      const focused = hadFocus ? document.activeElement : null;
      this.group.replaceChildren(...ordered);
      if (focused instanceof HTMLElement && focused.isConnected) focused.focus({ preventScroll: true });
    }
    if (!this.current || !keep.has(this.current)) {
      // The focused card moved away (played, or the deal changed): stay close to where it was.
      const near = previous ? this.closestTo(previous) : spots[0];
      this.current = near?.key ?? null;
      if (hadFocus && this.current) this.buttons.get(this.current)?.focus({ preventScroll: true });
    }
    this.roving();
    this.place();
  }

  /** Reads a short message out once, e.g. the bot's move or the result. */
  announce(text: string): void {
    window.clearTimeout(this.announceTimer);
    // Cleared first so the same words twice in a row are still read.
    this.live.textContent = '';
    this.announceTimer = window.setTimeout(() => { this.live.textContent = text; }, 60);
  }

  focus(key: string): void {
    this.current = key;
    this.roving();
    this.buttons.get(key)?.focus({ preventScroll: true });
  }

  private closestTo(target: BoardSpot): BoardSpot | undefined {
    let best: BoardSpot | undefined;
    let bestDistance = Infinity;
    for (const spot of this.spots) {
      const distance = Math.hypot(spot.x - target.x, spot.y - target.y);
      if (distance < bestDistance) { bestDistance = distance; best = spot; }
    }
    return best;
  }

  /** One tab stop for the whole board: the current spot. */
  private roving(): void {
    const active = this.current && this.buttons.has(this.current) ? this.current : this.spots[0]?.key;
    this.buttons.forEach((button, key) => { button.tabIndex = key === active ? 0 : -1; });
  }

  private place(): void {
    const { canvas } = this.options;
    const style = this.group.style;
    style.left = `${canvas.offsetLeft}px`;
    style.top = `${canvas.offsetTop}px`;
    style.width = `${canvas.offsetWidth}px`;
    style.height = `${canvas.offsetHeight}px`;
  }

  private keydown(event: KeyboardEvent): void {
    const key = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-spot]')?.dataset.spot;
    if (!key || event.ctrlKey || event.metaKey || event.altKey) return;
    const direction = DIRECTIONS[event.key];
    let handled = true;
    if (direction) {
      const next = nextSpot(this.spots, key, direction);
      if (next) this.focus(next.key);
    } else if (event.key === 'Home' || event.key === 'End') {
      const target = event.key === 'Home' ? this.spots[0] : this.spots[this.spots.length - 1];
      if (target) this.focus(target.key);
    } else if (event.key === 'Enter' || event.key === ' ') {
      if (!event.repeat) this.options.activate(key);
    } else {
      handled = this.options.onKey?.(key, event) ?? false;
    }
    if (!handled) return;
    // The game's own window-wide shortcuts must not act on the same key twice.
    event.preventDefault();
    event.stopPropagation();
  }
}
