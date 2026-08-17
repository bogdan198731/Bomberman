const CACHE_NAME = 'blast-arcade-shell-v7';
const APP_SHELL = [
  '/',
  '/index.html',
  '/public/manifest.webmanifest',
  '/public/app-icon-192.png',
  '/public/app-icon-512.png',
  '/public/apple-touch-icon.png',
  '/public/og-v3.png',
  '/dist/index.js',
  '/dist/invite.js',
  '/dist/leaderboard.js',
  '/dist/matchmaking.js',
  '/dist/blocks.js',
  '/dist/catalog.js',
  '/dist/circuit.js',
  '/dist/game-room.js',
  '/dist/multiplayer.js',
  '/dist/paddle.js',
  '/dist/pwa.js',
  '/dist/quick-play.js',
  '/dist/racing.js',
  '/dist/relay.js',
  '/dist/septica.js',
  '/dist/settings.js',
  '/dist/snake.js',
  '/dist/star.js',
  '/dist/stats.js',
  '/dist/survival.js',
  '/dist/tanks.js',
  '/dist/tintar.js',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
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

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          void caches.open(CACHE_NAME).then(cache => cache.put('/', copy));
          return response;
        })
        .catch(() => caches.match('/').then(response => response || Response.error())),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        void caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
      }
      return response;
    })),
  );
});
