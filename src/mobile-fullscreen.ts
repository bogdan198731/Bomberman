/**
 * Immersive play on phones: while a game is open, take over the whole screen
 * so the status bar, clock, battery, and browser chrome get out of the way.
 *
 * The Fullscreen API needs a user gesture, and games are always opened by a
 * tap, so the request rides on that tap. Where the API is missing or refuses
 * (iPhone Safari exposes it but rejects non-video elements) we fall back to a
 * CSS layout that reclaims everything the page is allowed to reclaim.
 */

export const IMMERSIVE_STORAGE_KEY = 'blast-arcade-immersive-v1';
export const IMMERSIVE_BODY_CLASS = 'immersive-play';
export const IMMERSIVE_FALLBACK_CLASS = 'immersive-fallback';
/**
 * Announced immediately before a fullscreen request or exit. Mobile browsers
 * blur the window across that transition, and the pause logic must not read
 * that as the player leaving.
 */
export const FULLSCREEN_TRANSITION_EVENT = 'arcade-fullscreen-transition';

function announceTransition(): void {
  window.dispatchEvent(new CustomEvent(FULLSCREEN_TRANSITION_EVENT));
}

interface ImmersiveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function browserStorage(): ImmersiveStorage | undefined {
  try { return typeof localStorage === 'undefined' ? undefined : localStorage; }
  catch { return undefined; }
}

export function normalizeImmersivePreference(value: unknown): boolean {
  // Anything other than an explicit opt-out leaves immersive play enabled.
  return value !== 'off' && value !== false;
}

export function loadImmersivePreference(
  storage: ImmersiveStorage | undefined = browserStorage(),
): boolean {
  try { return normalizeImmersivePreference(storage?.getItem(IMMERSIVE_STORAGE_KEY)); }
  catch { return true; }
}

export function saveImmersivePreference(
  enabled: boolean,
  storage: ImmersiveStorage | undefined = browserStorage(),
): boolean {
  try { storage?.setItem(IMMERSIVE_STORAGE_KEY, enabled ? 'on' : 'off'); }
  catch { /* Immersive play still applies for this session. */ }
  return enabled;
}

/**
 * Only phones and tablets benefit. On a desktop the browser chrome is not in
 * the way and hijacking the whole screen would be obnoxious.
 */
export function shouldGoImmersive(matches: (query: string) => boolean): boolean {
  return matches('(pointer: coarse)') || matches('(max-width: 760px)');
}

/** A game view, as opposed to the hub, is what triggers immersive mode. */
export function isPlayableView(view: unknown): boolean {
  return typeof view === 'string' && view !== 'hub' && view.length > 0;
}

export interface ImmersiveController {
  /** Applies or releases immersive mode for the given view. */
  update(view: string): void;
  enabled(): boolean;
  setEnabled(enabled: boolean): void;
  stop(): void;
}

export function initMobileImmersiveMode(): ImmersiveController | undefined {
  if (typeof document === 'undefined' || typeof window === 'undefined') return undefined;

  const root = document.documentElement;
  let enabled = loadImmersivePreference();
  let currentView = 'hub';
  let requesting = false;

  const mobile = (): boolean =>
    shouldGoImmersive(query => {
      try { return window.matchMedia(query).matches; }
      catch { return false; }
    });

  const inNativeFullscreen = (): boolean => Boolean(document.fullscreenElement);

  const applyClasses = (active: boolean, fallback: boolean): void => {
    document.body.classList.toggle(IMMERSIVE_BODY_CLASS, active);
    document.body.classList.toggle(IMMERSIVE_FALLBACK_CLASS, active && fallback);
  };

  const release = (): void => {
    applyClasses(false, false);
    if (inNativeFullscreen() && typeof document.exitFullscreen === 'function') {
      announceTransition();
      void document.exitFullscreen().catch(() => undefined);
    }
  };

  const engage = async (): Promise<void> => {
    if (requesting) return;
    requesting = true;
    try {
      // Show the immersive layout immediately; the API call may still fail.
      applyClasses(true, true);
      if (inNativeFullscreen()) {
        applyClasses(true, false);
        return;
      }
      if (typeof root.requestFullscreen !== 'function') return;
      announceTransition();
      try {
        await root.requestFullscreen({ navigationUI: 'hide' } as FullscreenOptions);
        applyClasses(true, false);
      } catch {
        // Kept on the CSS fallback: iPhone Safari and embedded webviews refuse.
      }
    } finally {
      requesting = false;
    }
  };

  const update = (view: string): void => {
    currentView = view;
    if (!enabled || !mobile() || !isPlayableView(view)) {
      release();
      return;
    }
    void engage();
  };

  const onViewChanged = (event: Event): void => {
    update(String((event as CustomEvent<{ view: string }>).detail?.view ?? 'hub'));
  };
  const onFullscreenChange = (): void => {
    // Leaving fullscreen with the system gesture should not strand the layout.
    if (!inNativeFullscreen() && document.body.classList.contains(IMMERSIVE_BODY_CLASS)) {
      applyClasses(true, true);
    }
  };

  window.addEventListener('arcade-view-changed', onViewChanged);
  document.addEventListener('fullscreenchange', onFullscreenChange);

  // The module owns the preference, so it owns its settings control too.
  const toggle = document.getElementById('settingsImmersive') as HTMLInputElement | null;
  const onToggle = (): void => { if (toggle) controller.setEnabled(toggle.checked); };
  if (toggle) {
    toggle.checked = enabled;
    toggle.addEventListener('change', onToggle);
  }

  const controller: ImmersiveController = {
    update,
    enabled: () => enabled,
    setEnabled(next: boolean) {
      enabled = saveImmersivePreference(next);
      if (toggle) toggle.checked = enabled;
      update(currentView);
    },
    stop() {
      release();
      window.removeEventListener('arcade-view-changed', onViewChanged);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      toggle?.removeEventListener('change', onToggle);
    },
  };

  return controller;
}
