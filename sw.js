// Service worker de Escáner Libre: todo desde caché para funcionar sin conexión.
const VERSION = 'v1.2.0';
const SHELL = 'escaner-shell-' + VERSION;
const CDN = 'escaner-cdn-v1'; // URLs con versión fija: inmutables, se conservan entre versiones

const SHELL_FILES = [
  './', './index.html', './manifest.webmanifest', './css/styles.css', './fonts/archivo.woff2',
  './js/app.js', './js/ui.js', './js/db.js', './js/libs.js', './js/edges.js', './js/imaging.js',
  './js/scan.js', './js/ocr.js', './js/pdftools.js', './js/signature.js', './js/history.js',
  './js/pdfjs-worker.mjs', './js/ocr-worker.js',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png',
];
// Librerías del núcleo (PDF). Tesseract (OCR) se descarga y guarda la primera vez que se usa.
const CDN_PRECACHE = [
  'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js',
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/legacy/build/pdf.min.mjs',
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/legacy/build/pdf.worker.min.mjs',
];
const CDN_HOSTS = ['cdn.jsdelivr.net'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const shell = await caches.open(SHELL);
    await shell.addAll(SHELL_FILES.map(u => new Request(u, { cache: 'reload' })));
    const cdn = await caches.open(CDN);
    await Promise.all(CDN_PRECACHE.map(async u => {
      if (await cdn.match(u)) return;
      try { const r = await fetch(u, { mode: 'cors', credentials: 'omit' }); if (r.ok) await cdn.put(u, r); } catch { }
    }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('escaner-shell-') && k !== SHELL) await caches.delete(k);
    await self.clients.claim();
    for (const c of await self.clients.matchAll()) c.postMessage({ type: 'ready-offline' });
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === location.origin) {
    if (req.mode === 'navigate') {
      e.respondWith(caches.match('./index.html', { cacheName: SHELL }).then(r => r || fetch(req)));
      return;
    }
    e.respondWith(caches.match(req, { ignoreSearch: true }).then(r => r || fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(SHELL).then(c => c.put(req, copy)); }
      return res;
    })));
    return;
  }

  if (CDN_HOSTS.includes(url.hostname)) {
    e.respondWith((async () => {
      const cache = await caches.open(CDN);
      const hit = await cache.match(req.url);
      if (hit) return hit;
      // siempre en modo CORS para guardar una respuesta legible (sirve también a importScripts)
      const res = await fetch(req.url, { mode: 'cors', credentials: 'omit' });
      if (res.ok) await cache.put(req.url, res.clone());
      return res;
    })());
  }
});
