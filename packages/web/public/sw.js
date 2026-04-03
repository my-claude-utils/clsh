// clsh service worker — caches app shell for offline/tunnel-down support
const CACHE = 'clsh-v1';

self.addEventListener('install', (e) => {
  // Cache the app shell immediately
  e.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll(['/', '/manifest.json', '/apple-touch-icon.png', '/icon-192.png', '/icon-512.png'])
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  // Clean old caches
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Skip WebSocket and API requests
  if (url.pathname.startsWith('/ws') || url.pathname.startsWith('/api/')) return;

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        // Cache successful navigation and asset responses
        if (res.ok && (e.request.mode === 'navigate' || url.pathname.match(/\.(js|css|png|svg|ico|woff2?)$/))) {
          const clone = res.clone();
          caches.open(CACHE).then((cache) => cache.put(e.request, clone));
        }
        return res;
      })
      .catch(() =>
        caches.match(e.request).then((cached) => {
          if (cached) return cached;
          // For navigation requests, serve the cached index (SPA)
          if (e.request.mode === 'navigate') return caches.match('/');
          return new Response('', { status: 503 });
        })
      )
  );
});
