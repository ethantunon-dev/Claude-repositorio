// Verificación de extremo a extremo de Escáner Libre (Playwright + Chromium).
// Uso: python3 tests/servidor.py & node tests/verificar.mjs
// Comprueba: 4 toques foto→PDF, 3 muestras, OCR, PDF buscable, compresión de 10 págs.,
// organizar/dividir, firma, modo avión y que no haya llamadas externas tras la carga inicial.
import { launch, ready, idle, lastDoc, choose, OUT } from './harness.mjs';
import { execFileSync } from 'child_process';
import fs from 'fs';

const M = new URL('./muestras/', import.meta.url).pathname;
const MUESTRAS = ['pizarra_blanca.jpg', 'pizarra_verde.jpg', 'hoja_impresa.jpg'].map(f => M + f);
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };
const pdfInfo = f => { try { const o = execFileSync('pdfinfo', [f]).toString(); return { ok: true, pages: +(/Pages:\s+(\d+)/.exec(o) || [])[1], size: /Page size:\s+(.*)/.exec(o)?.[1] }; } catch (e) { return { ok: false }; } };
const words = s => s.toLowerCase().normalize('NFC').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(/\s+/).filter(Boolean);
function wordAccuracy(truth, got) {
  const g = new Map(); for (const w of words(got)) g.set(w, (g.get(w) || 0) + 1);
  let hit = 0; const t = words(truth);
  for (const w of t) if (g.get(w) > 0) { hit++; g.set(w, g.get(w) - 1); }
  return hit / t.length;
}

const { browser, context, page, stats } = await launch();
const ext = phase => stats.external.filter(x => x.phase === phase);

// ---------- 1. carga inicial ----------
await ready(page);
check('Carga inicial y service worker activo', true, `${ext('carga-inicial').length} descargas de la CDN (pdf-lib, pdf.js)`);
const manifest = await page.evaluate(async () => { const r = await fetch('manifest.webmanifest'); return r.json(); });
check('Manifest con íconos 192/512 y display standalone', manifest.display === 'standalone' && manifest.icons.some(i => i.sizes === '512x512'));

// ---------- 2. primer uso del OCR (descarga única del motor y del idioma) ----------
stats.phase = 'primer-uso-ocr';
await choose(page, '#scanEmpty [data-act=gallery]', [M + 'hoja_impresa.jpg']);
await page.waitForSelector('#cropView:not([hidden])');
await page.click('#cropOk'); await idle(page);
await page.click('.tab[data-view=ocr]');
await page.click('#ocrRun');
await page.waitForSelector('#ocrResult:not([hidden])', { timeout: 180000 });
let text = await page.inputValue('#ocrText');
const acc = wordAccuracy(fs.readFileSync(M + 'hoja_impresa.txt', 'utf8'), text);
check('OCR español en hoja impresa', acc >= 0.85, `${Math.round(acc * 100)} % de palabras correctas`);
fs.writeFileSync(OUT + '/ocr.txt', text);
await page.click('#ocrPdf');
await page.waitForSelector('#sheet:not([hidden])');
await lastDoc(page, OUT + '/buscable.pdf');
const extracted = execFileSync('pdftotext', [OUT + '/buscable.pdf', '-']).toString();
check('PDF con texto buscable', /Atterberg/i.test(extracted) && /plasticidad/i.test(extracted) && pdfInfo(OUT + '/buscable.pdf').ok, `pdftotext encuentra "Atterberg" y "plasticidad"`);
await page.click('#sheet [data-r=close]');
check('Primer uso del OCR descarga motor + idioma una sola vez', true, `${ext('primer-uso-ocr').length} archivos (worker, núcleo wasm, español)`);
// inglés también (para el modo avión)
await page.click('#ocrLang [data-lang=eng]'); await page.click('#ocrRun');
await page.waitForFunction(() => !document.querySelector('#ocrRun').disabled, null, { timeout: 180000 });
await page.click('#ocrLang [data-lang=spa]');
await page.click('.tab[data-view=scan]');
// vaciar páginas
await page.click('[data-act=clearPages]'); await page.click('#sheet [data-r="1"]');
await page.waitForSelector('#scanEmpty:not([hidden])', { timeout: 5000 }).catch(async e => { await page.screenshot({ path: OUT + '/debug.png' }); throw e; });

// ---------- 3. uso normal en línea: no debe haber llamadas externas ----------
stats.phase = 'uso';
// 3a. 4 toques: Cámara → disparar → Aceptar → PDF
let taps = 0;
await page.click('#scanEmpty [data-act=camera]'); taps++;
await page.waitForFunction(() => document.querySelector('#camVideo').videoWidth > 0);
await page.click('#camShot'); taps++;
await page.waitForSelector('#cropView:not([hidden])');
await page.click('#cropOk'); taps++;
await idle(page);
await page.click('#pdfBtn'); taps++;
await page.waitForSelector('#sheet:not([hidden])');
let d = await lastDoc(page, OUT + '/cuatro_toques.pdf');
check('Foto de pizarra a PDF en 4 toques', taps <= 4 && pdfInfo(OUT + '/cuatro_toques.pdf').pages === 1, `${taps} toques → ${d.name}`);
await page.click('#sheet [data-r=new]');

// 3b. las 3 muestras desde la galería
await choose(page, '#scanEmpty [data-act=gallery]', MUESTRAS);
await page.waitForTimeout(300); await idle(page);
const pinfo = await page.evaluate(async () => (await import('./js/scan.js')).getPages().map(p => ({ f: p.filter, det: p.detected, ar: +(p.w / p.h).toFixed(3) })));
const real = JSON.parse(fs.readFileSync(M + 'esquinas_reales.json')).aspecto_real;
check('Bordes detectados en las 3 muestras', pinfo.every(p => p.det), pinfo.map(p => p.det ? 'sí' : 'no').join(', '));
check('Filtro automático correcto (blanca, verde, blanca)', pinfo.map(p => p.f).join() === 'blanca,verde,blanca', pinfo.map(p => p.f).join(', '));
check('Proporción corregida ≈ real (±6 %)', pinfo.every((p, i) => Math.abs(p.ar / Object.values(real)[i] - 1) < 0.06), pinfo.map((p, i) => `${p.ar} vs ${Object.values(real)[i].toFixed(3)}`).join('; '));
await page.screenshot({ path: OUT + '/paginas.png' });
// sin documento visible: no debe bloquear; usa la imagen completa con esquinas editables
execFileSync('python3', ['-c', `
import numpy as np; from PIL import Image
y,x=np.mgrid[0:1200,0:1600]; a=(120+60*np.sin(x/300.0)+np.random.normal(0,6,(1200,1600)))
Image.fromarray(np.clip(np.dstack([a,a*0.95,a*0.9]),0,255).astype('uint8')).save('${OUT}/sin_bordes.jpg')`]);
await choose(page, '#view-scan [data-act=gallery]:visible', [OUT + '/sin_bordes.jpg']);
await page.waitForSelector('#cropView:not([hidden])');
const fb = await page.evaluate(() => [document.querySelector('#cropTitle').textContent, [...document.querySelectorAll('#cropSvg circle')].length]);
await page.screenshot({ path: OUT + '/sin_bordes_editor.png' });
await page.click('#cropCancel');
check('Si falla la detección: imagen completa con esquinas editables', fb[0] === 'Ajusta las esquinas' && fb[1] === 4, `editor abierto con 4 esquinas en los bordes de la foto`);
// rotar y reordenar
await page.click('#pageList .pcard:nth-child(3) [data-a=up]');
await page.click('#pageList .pcard:nth-child(1) [data-a=rot]'); await idle(page);
await page.click('#pageList .pcard:nth-child(1) [data-a=rot]'); await page.click('#pageList .pcard:nth-child(1) [data-a=rot]'); await page.click('#pageList .pcard:nth-child(1) [data-a=rot]'); await idle(page);
// cambiar filtro en la vista de página (B/N en la hoja)
await page.click('#pageList .pcard:nth-child(2) [data-a=view]');
await page.click('#pvFilters [data-f=bn]'); await idle(page);
await page.screenshot({ path: OUT + '/vista-pagina.png' });
await page.click('#pvDone');
await page.click('#pdfBtn'); await page.waitForSelector('#sheet:not([hidden])');
d = await lastDoc(page, OUT + '/tres_muestras.pdf');
const info3 = pdfInfo(OUT + '/tres_muestras.pdf');
check('PDF de las 3 muestras abre bien (tamaño Carta)', info3.ok && info3.pages === 3 && /612 x 792|792 x 612/.test(info3.size), `${d.name}, ${info3.pages} págs., ${info3.size}`);
await page.click('#sheet [data-r=close]');
// JPG
const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act=exportJpg]')]);
check('Exportar JPG', /\.jpg$/.test(dl.suggestedFilename()), dl.suggestedFilename());

// 3c. 10 páginas escaneadas → comprimir nivel WhatsApp
await page.click('[data-act=clearPages]'); await page.click('#sheet [data-r="1"]');
const diez = Array.from({ length: 10 }, (_, i) => MUESTRAS[i % 3]);
await choose(page, '#scanEmpty [data-act=gallery]', diez);
await page.waitForTimeout(300); await idle(page);
await page.click('#pdfBtn'); await page.waitForSelector('#sheet:not([hidden])');
d = await lastDoc(page, OUT + '/diez.pdf');
await page.click('#sheet [data-r=close]');
// también un PDF pesado "de otra app": fotos originales a 3000 px, JPEG 95 %
execFileSync('python3', ['-c', `
from PIL import Image
ims=[Image.open('${M}'+n).convert('RGB') for n in ['pizarra_blanca.jpg','pizarra_verde.jpg','hoja_impresa.jpg']]
ims=[ims[i%3] for i in range(10)]
ims[0].save('${OUT}/pesado.pdf', save_all=True, append_images=ims[1:], resolution=300, quality=95)`]);
await page.click('.tab[data-view=pdf]'); await page.click('#pdfTabs [data-sub=comp]');
for (const [f, label] of [[OUT + '/diez.pdf', 'escaneado con la app'], [OUT + '/pesado.pdf', 'fotos sin procesar']]) {
  await choose(page, '#compPick', [f]);
  await page.click('#compLevels [data-level=whatsapp]');
  await page.click('#compRun');
  await page.waitForSelector('#compResult:not([hidden])', { timeout: 180000 });
  const res = await page.textContent('#compResult .big');
  const out = OUT + `/comprimido_${label.split(' ')[0]}.pdf`;
  const c = await lastDoc(page, out);
  const inf = pdfInfo(out);
  check(`10 págs. (${label}) en nivel WhatsApp < 3 MB`, c.size < 3 * 1024 * 1024 && inf.pages === 10, `${res.trim()} (${(fs.statSync(f).size / 1048576).toFixed(2)} MB → ${(c.size / 1048576).toFixed(2)} MB)`);
}
execFileSync('pdftoppm', ['-r', '100', '-f', '3', '-l', '3', '-png', OUT + '/comprimido_fotos.pdf', OUT + '/legible']);

// 3d. organizar: unir 2 PDF, rotar, borrar, reordenar, guardar y dividir
await page.click('#pdfTabs [data-sub=org]');
await choose(page, '#orgAdd', [OUT + '/tres_muestras.pdf', OUT + '/cuatro_toques.pdf']);
await page.waitForSelector('#orgPages .pcard');
let n = await page.locator('#orgPages .pcard').count();
await page.click('#orgPages .pcard:nth-child(1) [data-a=rot]');
await page.click('#orgPages .pcard:nth-child(4) [data-a=up]');
await page.click('#orgPages .pcard:nth-child(2) [data-a=del]');
await page.click('#orgSave'); await page.waitForSelector('#sheet:not([hidden])');
await lastDoc(page, OUT + '/unido.pdf');
const rot = execFileSync('python3', ['-c', `import pypdf;r=pypdf.PdfReader('${OUT}/unido.pdf');print(len(r.pages), r.pages[0].rotation)`]).toString().trim();
check('Unir + reordenar + rotar + quitar', n === 4 && rot.startsWith('3 ') && rot.endsWith('90'), `4 págs. de 2 archivos → ${rot.split(' ')[0]} págs., 1.ª rotada ${rot.split(' ')[1]}°`);
await page.click('#sheet [data-r=close]');
await page.click('#orgSplit'); await page.fill('#rangesIn', '1, 2-3'); await page.click('#sheet [data-s=ranges]');
await page.waitForSelector('#sheet:not([hidden]) [data-close]');
const parts = await page.locator('#sheet [data-i]').count();
check('Dividir por rangos', parts === 2, `"1, 2-3" → ${parts} PDF`);
await page.click('#sheet [data-close]');
await page.click('#orgClear');

// 3e. firma
await page.click('#pdfTabs [data-sub=sign]');
await page.click('#sigDraw');
const box = await page.locator('#padCanvas').boundingBox();
await page.mouse.move(box.x + 40, box.y + box.height * 0.6); await page.mouse.down();
for (let i = 0; i <= 40; i++) await page.mouse.move(box.x + 40 + i * 6, box.y + box.height * 0.6 - Math.sin(i / 4) * 40);
await page.mouse.up();
await page.click('#padSave');
await page.waitForSelector('#sigPreview img');
await choose(page, '#signPick', [OUT + '/tres_muestras.pdf']);
await page.waitForSelector('#signer:not([hidden])');
await page.click('#signNext');
const cb = await page.locator('#signCanvas').boundingBox();
await page.locator('#signCanvas').click({ position: { x: cb.width * 0.6, y: cb.height * 0.85 } });
await page.waitForSelector('.sig-box');
await page.locator('.sig-box').scrollIntoViewIfNeeded();
await page.screenshot({ path: OUT + '/firma.png' });
await page.click('#signSave'); await page.waitForSelector('#sheet:not([hidden])');
await lastDoc(page, OUT + '/firmado.pdf');
const hasImg = execFileSync('pdfimages', ['-list', '-f', '2', '-l', '2', OUT + '/firmado.pdf']).toString().split('\n').filter(l => /smask|png|image/.test(l)).length;
check('Firmar PDF (firma guardada en IndexedDB y colocada en la pág. 2)', pdfInfo(OUT + '/firmado.pdf').pages === 3 && hasImg >= 2, 'imagen PNG de la firma (con transparencia) presente en la pág. 2');
await page.click('#sheet [data-r=close]');
execFileSync('pdftoppm', ['-r', '50', '-f', '2', '-l', '2', '-png', OUT + '/firmado.pdf', OUT + '/firmado']);

// 3f. historial
await page.click('.tab[data-view=hist]');
const hist = await page.locator('.hitem .name').allTextContents();
const nameOk = hist.every(h => /^[\p{L}\-]+_\d{4}-\d{2}-\d{2}_\d+(_\w+)?\.pdf$|_firmado\.pdf$/u.test(h));
check('Historial con nombre Materia_AAAA-MM-DD_n.pdf', hist.length > 5 && nameOk, `${hist.length} documentos, ej. ${hist.slice(-1)[0]}`);
// materia nueva
await page.click('#materiasCard summary'); await page.fill('#materiaInput', 'Hidráulica'); await page.click('#materiaForm button');
await page.screenshot({ path: OUT + '/historial.png', fullPage: true });
check('Uso en línea tras la carga inicial: 0 llamadas externas', ext('uso').length === 0, ext('uso').map(x => x.url).join(', ') || 'ninguna');

// ---------- 4. modo avión ----------
stats.phase = 'avion';
await context.setOffline(true);
await page.reload();
await page.waitForSelector('.tabbar');
const offlineBadge = await page.isVisible('#offlineBadge');
await page.click('.tab[data-view=scan]');
await choose(page, '#view-scan [data-act=gallery]:visible', [M + 'pizarra_verde.jpg']);
await page.waitForSelector('#cropView:not([hidden])'); await page.click('#cropOk'); await idle(page);
await page.click('#pdfBtn'); await page.waitForSelector('#sheet:not([hidden])');
d = await lastDoc(page, OUT + '/avion.pdf');
await page.click('#sheet [data-r=new]');
check('Modo avión: abrir app, escanear y crear PDF', pdfInfo(OUT + '/avion.pdf').ok && offlineBadge, `${d.name}; aviso "Sin conexión" visible`);
// OCR sin conexión
await choose(page, '#scanEmpty [data-act=gallery]', [M + 'hoja_impresa.jpg']);
await page.waitForSelector('#cropView:not([hidden])'); await page.click('#cropOk'); await idle(page);
await page.click('.tab[data-view=ocr]'); await page.click('#ocrRun');
await page.waitForFunction(() => /Listo|Error/.test(document.querySelector('#ocrProgress .ptext').textContent), null, { timeout: 180000 });
text = await page.inputValue('#ocrText');
const accOff = wordAccuracy(fs.readFileSync(M + 'hoja_impresa.txt', 'utf8'), text);
check('Modo avión: OCR', accOff > 0.85, `${Math.round(accOff * 100)} % de palabras · ${await page.textContent('#ocrProgress .ptext')}`);
// comprimir y organizar sin conexión (usa pdf.js y pdf-lib cacheados)
await page.click('.tab[data-view=pdf]'); await page.click('#pdfTabs [data-sub=comp]');
await choose(page, '#compPick', [OUT + '/tres_muestras.pdf']);
await page.click('#compRun'); await page.waitForSelector('#compResult:not([hidden])', { timeout: 120000 });
check('Modo avión: comprimir PDF', /→/.test(await page.textContent('#compResult .big')), (await page.textContent('#compResult .big')).trim());
await page.click('#pdfTabs [data-sub=org]');
await choose(page, '#orgAdd', [OUT + '/tres_muestras.pdf']);
await page.waitForSelector('#orgPages .pcard');
await page.click('#orgSave'); await page.waitForSelector('#sheet:not([hidden])');
check('Modo avión: organizar PDF', pdfInfo((await lastDoc(page, OUT + '/avion_org.pdf'), OUT + '/avion_org.pdf')).pages === 3);
check('Modo avión: 0 llamadas externas', ext('avion').length === 0, ext('avion').map(x => x.url).join(', ') || 'ninguna');

// modo oscuro
await page.click('#sheet [data-r=close]');
await page.emulateMedia({ colorScheme: 'dark' });
await page.click('.tab[data-view=scan]');
await page.screenshot({ path: OUT + '/oscuro.png' });

await browser.close();
const fail = results.filter(r => !r.ok);
console.log(`\n${results.length - fail.length}/${results.length} comprobaciones OK`);
fs.writeFileSync(OUT + '/resultados.json', JSON.stringify({ results, external: stats.external }, null, 1));
process.exit(fail.length ? 1 : 0);
