const CACHE_NAME = 'blast-arcade-prime-2048-2026-09-26';
const APP_SHELL = [
  '/',
  '/index.html',
  '/public/manifest.webmanifest',
  '/public/app-icon-192.png',
  '/public/app-icon-512.png',
  '/public/apple-touch-icon.png',
  '/public/og-v4.jpg',
  '/dist/index.js',
  '/public/arcade-ux.css',
  '/dist/dialogs.js',
  '/dist/session-state.js',
  '/dist/navigation.js',
  '/dist/hub-layout.js',
  '/dist/game-metadata.js',
  '/dist/game-previews.js',
  '/dist/invite.js',
  '/dist/leaderboard.js',
  '/dist/matchmaking.js',
  '/dist/blocks.js',
  '/dist/twenty48.js',
  '/dist/sudoku.js',
  '/dist/catalog.js',
  '/dist/circuit.js',
  '/dist/game-room.js',
  '/dist/game-experience.js',
  '/dist/feedback.js',
  '/dist/i18n.js',
  '/dist/multiplayer.js',
  '/dist/paddle.js',
  '/dist/pwa.js',
  '/dist/quick-play.js',
  '/dist/racing.js',
  '/dist/relay.js',
  '/dist/septica.js',
  '/dist/settings.js',
  '/dist/session-control.js',
  '/dist/snake.js',
  '/dist/star.js',
  '/dist/stats.js',
  '/dist/survival.js',
  '/dist/tanks.js',
  '/dist/tintar.js',
  '/dist/touch-controls.js',
  '/dist/seo.js',
  '/dist/bomberman-skin.js',
  '/dist/mobile-fullscreen.js',
  '/dist/levels.js',
  '/dist/cycles.js',
  '/dist/fourrow.js',
  '/dist/bricks.js',
  '/dist/mines.js',
  '/dist/hockey.js',
  '/dist/reversi.js',
  '/dist/solitaire.js',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname === '/service-worker.js') return;
  // Each route returns its own metadata, so navigations cache under their own
  // path and fall back to the hub shell when that exact page was never visited.
  const isNavigation = request.mode === 'navigate';
  const cacheKey = isNavigation ? url.pathname : request;
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok) {
          const copy = response.clone();
          void caches.open(CACHE_NAME).then(cache => cache.put(cacheKey, copy));
        }
        return response;
      })
      .catch(() => caches.match(cacheKey)
        .then(response => response || (isNavigation ? caches.match('/') : undefined))
        .then(response => response || Response.error())),
  );
});
