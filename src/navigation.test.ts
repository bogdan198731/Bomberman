import test from 'node:test';
import assert from 'node:assert/strict';
import { arcadeRouteUrl, createArcadeNavigation, readArcadeRoute, type NavigationState } from './navigation.js';
import { createArcadeInviteUrl } from './invite.js';
import { ARCADE_GAME_IDS, GAME_META, supportedLaunchMode } from './game-metadata.js';
import { gamesForQuickPlay } from './quick-play.js';
import { matchesCatalogGame } from './catalog.js';

test('all game routes and hub sections survive URL serialization and reload', () => {
  for (const view of ARCADE_GAME_IDS) {
    const route = { view, section: 'games' as const };
    assert.deepEqual(readArcadeRoute(arcadeRouteUrl('http://localhost/?theme=dark#games', route)), route);
  }
  for (const section of ['games', 'challenges', 'profile'] as const) {
    const route = { view: 'hub' as const, section };
    assert.deepEqual(readArcadeRoute(arcadeRouteUrl('http://localhost/', route)), route);
  }
  assert.equal(readArcadeRoute('http://localhost/#play/not-a-game').view, 'hub');
});
test('games live at crawlable /play paths while legacy hash links still resolve', () => {
  for (const view of ARCADE_GAME_IDS) {
    const url = new URL(arcadeRouteUrl('http://localhost/#games', { view, section: 'games' }));
    assert.equal(url.pathname, `/play/${view}`, 'game routes use a real path, not a fragment');
    assert.equal(url.hash, '', 'no leftover fragment for crawlers to ignore');
    assert.equal(readArcadeRoute(`http://localhost/#play/${view}`).view, view, 'old shared links keep working');
  }
  assert.equal(new URL(arcadeRouteUrl('http://localhost/play/snake', { view: 'hub', section: 'profile' })).pathname, '/');
  assert.equal(readArcadeRoute('http://localhost/play/not-a-game').view, 'hub');
});
test('invite route wins over stale hashes; leaving removes only invite parameters', () => {
  const invite = createArcadeInviteUrl('http://localhost/?theme=dark#games', 'racing', 'ABCDE');
  assert.equal(readArcadeRoute(invite + '#profile').view, 'racing');
  const hubUrl = new URL(arcadeRouteUrl(invite, { view: 'hub', section: 'games' }));
  assert.equal(hubUrl.searchParams.get('theme'), 'dark');
  assert.equal(hubUrl.searchParams.has('room'), false);
  assert.equal(hubUrl.hash, '#games');
});
test('catalog and Quick Play agree on every supported mode, including solo Paddle', () => {
  for (const id of ARCADE_GAME_IDS) {
    for (const mode of ['solo', 'local', 'online'] as const) {
      const game = { id, title: GAME_META[id].name, description: '', modes: GAME_META[id].modes };
      assert.equal(matchesCatalogGame(game, '', mode, []), gamesForQuickPlay(mode).some(item => item.id === id));
      assert.equal(Boolean(supportedLaunchMode(id, mode)), GAME_META[id].modes.includes(mode));
    }
  }
  assert.ok(gamesForQuickPlay('solo').some(game => game.id === 'paddle'));
  assert.equal(supportedLaunchMode('sudoku', 'online'), undefined);
});

test('Back/Forward and reload retain edited library state and emit cleanup before leaving games', () => {
  const original = new Map<string, PropertyDescriptor | undefined>();
  const url = new URL('http://localhost/#games');
  const search = { value: '' };
  const filter = { dataset: { catalogFilter: 'all' } };
  const body = { dataset: { view: 'hub', hubSection: 'games' } };
  const win = Object.assign(new EventTarget(), {
    scrollY: 0,
    scrollTo({ top }: { top: number }) { this.scrollY = top; },
  });
  let cursor = 0;
  const entries: { href: string; state: NavigationState | null }[] = [{ href: url.href, state: null }];
  const historyMock = {
    scrollRestoration: 'auto',
    get state() { return entries[cursor].state; },
    replaceState(state: NavigationState, _title: string, href: string) {
      entries[cursor] = { state: structuredClone(state), href }; url.href = href;
    },
    pushState(state: NavigationState, _title: string, href: string) {
      entries.splice(++cursor); entries.push({ state: structuredClone(state), href }); url.href = href;
    },
  };
  const frames: FrameRequestCallback[] = [];
  const flush = (): void => { frames.splice(0).forEach(callback => callback(0)); };
  const go = (step: number): void => {
    cursor += step; url.href = entries[cursor].href;
    const event = Object.assign(new Event('popstate'), { state: historyMock.state });
    win.dispatchEvent(event); flush();
  };
  // Navigation now rewrites <head> metadata, so the mock answers those queries too.
  const metaTags = new Map<string, { attributes: Record<string, string>; textContent: string | null }>();
  const queryMock = (selector: string): unknown => {
    if (selector.startsWith('[data-catalog-filter]')) return filter;
    if (!metaTags.has(selector)) metaTags.set(selector, { attributes: {}, textContent: null });
    const tag = metaTags.get(selector)!;
    return {
      setAttribute(name: string, value: string) { tag.attributes[name] = value; },
      set textContent(value: string | null) { tag.textContent = value; },
      get textContent() { return tag.textContent; },
    };
  };
  const globals = {
    window: win, history: historyMock, location: url,
    document: { body, title: '', getElementById: () => search, querySelector: queryMock },
    requestAnimationFrame: (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; },
  };
  for (const [key, value] of Object.entries(globals)) {
    original.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, configurable: true });
  }
  try {
    const cleanup: string[] = [];
    win.addEventListener('arcade-view-leaving', event => {
      const view = (event as CustomEvent<{ view: string }>).detail.view;
      assert.equal(body.dataset.view, view, 'cleanup sees the departing game'); cleanup.push(view);
    });
    win.addEventListener('arcade-catalog-restore', event => {
      const saved = (event as CustomEvent<NavigationState['hub']>).detail;
      search.value = saved.query; filter.dataset.catalogFilter = saved.filter;
      win.dispatchEvent(new Event('arcade-catalog-change'));
    });
    const navigation = createArcadeNavigation(view => { body.dataset.view = view; });
    navigation.start(); flush();
    search.value = 'Paddle'; filter.dataset.catalogFilter = 'solo'; win.scrollY = 417;
    win.dispatchEvent(new Event('arcade-catalog-change'));
    navigation.open('paddle'); flush();
    go(-1);
    assert.deepEqual([body.dataset.view, search.value, filter.dataset.catalogFilter, win.scrollY], ['hub', 'Paddle', 'solo', 417]);
    search.value = 'Snake'; win.scrollY = 210; win.dispatchEvent(new Event('arcade-catalog-change'));
    go(1); assert.equal(body.dataset.view, 'paddle');
    go(-1); assert.equal(search.value, 'Snake'); assert.equal(win.scrollY, 210);
    win.dispatchEvent(new Event('pagehide'));
    assert.equal(historyMock.state?.hub.query, 'Snake');
    assert.deepEqual(cleanup, ['paddle', 'paddle']);
    navigation.open('hub', 'challenges'); flush();
    assert.equal(url.hash, '#challenges'); assert.equal(win.scrollY, 0);
    go(-1); assert.equal(url.hash, '#games'); assert.equal(win.scrollY, 210);
  } finally {
    for (const [key, descriptor] of original) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
