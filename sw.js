// Service worker : tout le site est pré-caché, l'app fonctionne hors ligne.
importScripts('sw-assets.js');
const CACHE = `pause-logique-${self.APP_VERSION}`;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(self.APP_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('pause-logique-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(
      (hit) => hit || fetch(req).catch(() => (req.mode === 'navigate' ? caches.match('./') : Response.error())),
    ),
  );
});
