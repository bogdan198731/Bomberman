import { isArcadeGameId, type ArcadeGameId } from './game-metadata.js';
import { clearArcadeInviteUrl, parseArcadeInvite } from './invite.js';

export type HubSection = 'games' | 'challenges' | 'profile';
export type ArcadeView = 'hub' | ArcadeGameId;
export interface ArcadeRoute { view: ArcadeView; section: HubSection }
export interface HubSnapshot { section: HubSection; scroll: number; query: string; filter: string }
export interface NavigationState { arcade: ArcadeRoute; hub: HubSnapshot }

export function readArcadeRoute(href: string): ArcadeRoute {
  const url = new URL(href);
  const invite = parseArcadeInvite(url.search);
  if (invite) return { view: invite.game, section: 'games' };
  const hash = url.hash.slice(1);
  const game = hash.startsWith('play/') ? hash.slice(5) : '';
  if (isArcadeGameId(game)) return { view: game, section: 'games' };
  return { view: 'hub', section: hash === 'challenges' || hash === 'circuitPanel' ? 'challenges'
    : hash === 'profile' || hash === 'profilePanel' || hash === 'leaderboardPanel' ? 'profile' : 'games' };
}

export function arcadeRouteUrl(href: string, route: ArcadeRoute): string {
  const url = new URL(clearArcadeInviteUrl(href));
  url.hash = route.view === 'hub' ? route.section : `play/${route.view}`;
  return url.toString();
}

export function createArcadeNavigation(showView: (view: ArcadeView) => void): {
  start(): void; open(view: ArcadeView, section?: HubSection): void;
} {
  let route = readArcadeRoute(location.href);
  let hub: HubSnapshot = { section: 'games', scroll: 0, query: '', filter: 'all' };
  let started = false;
  let restoreToken = 0;
  let restoring = false;
  history.scrollRestoration = 'manual';

  const snapshot = (): HubSnapshot => ({
    section: route.section, scroll: window.scrollY,
    query: (document.getElementById('catalogSearch') as HTMLInputElement | null)?.value ?? '',
    filter: document.querySelector<HTMLElement>('[data-catalog-filter][aria-pressed="true"]')?.dataset.catalogFilter ?? 'all',
  });
  const state = (): NavigationState => ({ arcade: route, hub });
  const apply = (next: ArcadeRoute): void => {
    const oldView = document.body.dataset.view;
    if (oldView && oldView !== next.view && oldView !== 'hub') {
      window.dispatchEvent(new CustomEvent('arcade-view-leaving', { detail: { view: oldView, destination: next.view } }));
    }
    route = next;
    showView(next.view);
    document.body.dataset.hubSection = next.section;
    window.dispatchEvent(new CustomEvent('arcade-hub-section', { detail: { section: next.section } }));
    const token = ++restoreToken;
    if (next.view === 'hub') {
      restoring = true;
      window.dispatchEvent(new CustomEvent('arcade-catalog-restore', { detail: hub }));
      restoring = false;
      requestAnimationFrame(() => {
        if (token === restoreToken) window.scrollTo({ top: hub.scroll, behavior: 'instant' });
      });
    }
  };
  const open = (view: ArcadeView, section: HubSection = hub.section): void => {
    if (!started) { showView(view); return; }
    if (view === route.view && (view !== 'hub' || section === route.section)) return;
    if (route.view === 'hub') { hub = snapshot(); history.replaceState(state(), '', location.href); }
    if (view === 'hub' && section !== hub.section) hub = { ...hub, section, scroll: 0 };
    const next: ArcadeRoute = { view, section };
    history.pushState({ arcade: next, hub }, '', arcadeRouteUrl(location.href, next));
    apply(next);
  };
  const saveHub = (): void => {
    if (!started || restoring || route.view !== 'hub') return;
    hub = snapshot();
    history.replaceState(state(), '', location.href);
  };
  window.addEventListener('pagehide', saveHub);
  window.addEventListener('arcade-catalog-change', saveHub);
  window.addEventListener('scroll', saveHub, { passive: true });
  window.addEventListener('popstate', event => {
    const saved = event.state as NavigationState | null;
    if (route.view === 'hub') hub = snapshot();
    const next = readArcadeRoute(location.href);
    if (saved?.hub) hub = saved.hub;
    else if (next.view === 'hub') hub = { ...hub, section: next.section, scroll: 0 };
    apply(next);
  });
  window.addEventListener('arcade-navigate-hub', event => {
    open('hub', (event as CustomEvent<{ section: HubSection }>).detail.section);
  });
  return {
    start() {
      started = true;
      const saved = history.state as NavigationState | null;
      if (saved?.hub) hub = saved.hub;
      route = readArcadeRoute(location.href);
      history.replaceState(state(), '', parseArcadeInvite(location.search) ? location.href : arcadeRouteUrl(location.href, route));
      apply(route);
    },
    open,
  };
}
