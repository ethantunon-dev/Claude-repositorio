// Service worker de Cronograma: la app funciona sin conexión y abre la evaluación al tocar un aviso.
const VERSION = 'v1.0.0';
const CACHE = 'cronograma-' + VERSION;
const FILES = [
  './', './index.html', './manifest.webmanifest', './css/styles.css', './fonts/archivo.woff2',
  './js/app.js', './js/logic.js', './js/seed.js',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(FILES.map(u => new Request(u, { cache: 'reload' })));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('cronograma-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(caches.match('./index.html', { cacheName: CACHE }).then(r => r || fetch(req)));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(r => r || fetch(req)));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const ev = e.notification.data && e.notification.data.ev;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if (new URL(w.url).pathname.startsWith(new URL(self.registration.scope).pathname)) {
        await w.focus();
        if (ev) w.postMessage({ ev });
        return;
      }
    }
    await self.clients.openWindow(ev ? `./?ev=${encodeURIComponent(ev)}` : './');
  })());
});
