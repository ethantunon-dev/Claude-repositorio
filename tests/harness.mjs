// Arnés de pruebas con Playwright: sirve la app local, redirige la CDN a copias locales
// de las MISMAS versiones fijas (npm) y cuenta cada llamada que sale hacia servidores externos.
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'fs';
import path from 'path';

export const LIBS = process.env.LIBS || new URL('./node_modules', import.meta.url).pathname;
export const APP = process.env.APP_URL || 'http://127.0.0.1:8080/';
export const OUT = process.env.OUT || new URL('./salida', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });

const TYPES = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.gz': 'application/octet-stream', '.json': 'application/json', '.bcmap': 'application/octet-stream', '.pfb': 'application/octet-stream', '.ttf': 'font/ttf' };

// https://cdn.jsdelivr.net/npm/<pkg>@<ver>/<file> → LIBS/<pkg>/<file>
function cdnToLocal(url) {
  const u = new URL(url);
  const m = u.pathname.match(/^\/npm\/((?:@[^/]+\/)?[^@/]+)@[^/]+\/(.*)$/);
  if (!m) return null;
  return path.join(LIBS, m[1], m[2]);
}

export async function launch({ camera = new URL('./muestras/camara.y4m', import.meta.url).pathname } = {}) {
  const browser = await chromium.launch({
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${camera}`],
  });
  const context = await browser.newContext({ viewport: { width: 375, height: 760 }, deviceScaleFactor: 1, permissions: ['camera', 'clipboard-read', 'clipboard-write'], acceptDownloads: true });
  const stats = { external: [], phase: 'carga-inicial' };
  // Cualquier petición a un host que no sea el de la app pasa por aquí (también las del service worker).
  await context.route(url => !url.href.startsWith(APP), async route => {
    const url = route.request().url();
    stats.external.push({ phase: stats.phase, url });
    const file = url.startsWith('https://cdn.jsdelivr.net/') ? cdnToLocal(url) : null;
    if (!file || !fs.existsSync(file)) { console.log('  ✗ externo no resuelto:', url); return route.abort(); }
    await route.fulfill({ status: 200, body: fs.readFileSync(file), headers: { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'access-control-allow-origin': '*' } });
  });
  const page = await context.newPage();
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log(`  [${m.type()}]`, m.text().slice(0, 300)); });
  page.on('pageerror', e => console.log('  [pageerror]', e.message));
  return { browser, context, page, stats };
}

export async function ready(page) {
  await page.goto(APP);
  await page.evaluate(() => navigator.serviceWorker.ready);
  if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) { await page.reload(); await page.evaluate(() => navigator.serviceWorker.ready); }
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
}

// Elige archivos en un <input type=file> que la app abre con click()
export async function choose(page, clickSel, files) {
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click(clickSel)]);
  await fc.setFiles(files);
}

export async function idle(page) {
  await page.waitForFunction(() => document.querySelector('#busy').hidden && !document.querySelector('.busy-dot'), null, { timeout: 120000 });
}

// Lee el último documento del historial y lo guarda en disco
export async function lastDoc(page, file) {
  const r = await page.evaluate(async () => {
    const db = await new Promise((res, rej) => { const q = indexedDB.open('escaner-libre'); q.onsuccess = () => res(q.result); q.onerror = rej; });
    const all = await new Promise(res => { const q = db.transaction('docs').objectStore('docs').getAll(); q.onsuccess = () => res(q.result); });
    all.sort((a, b) => b.created - a.created);
    const d = all[0];
    const buf = new Uint8Array(await d.blob.arrayBuffer());
    let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return { name: d.name, size: d.size, pages: d.pages, b64: btoa(s), count: all.length };
  });
  fs.writeFileSync(file, Buffer.from(r.b64, 'base64'));
  return { name: r.name, size: r.size, pages: r.pages, count: r.count };
}
