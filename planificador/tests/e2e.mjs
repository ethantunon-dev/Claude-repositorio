// Prueba de extremo a extremo en Chromium (Playwright).
// Uso: node planificador/tests/e2e.mjs <carpeta-capturas>   (sirve el repo en http://127.0.0.1:8765)
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');
const OUT = process.argv[2] || '/tmp/capturas';
fs.mkdirSync(OUT, { recursive: true });
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const srv = spawn('python3', ['-m', 'http.server', '8765', '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 800));
const BASE = 'http://127.0.0.1:8765/planificador/';
let fallos = 0;
const ok = (c, msg) => { console.log((c ? 'ok   ' : 'FALLA') + ' ' + msg); if (!c) fallos++; };

const browser = await chromium.launch();
async function nuevo(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, timezoneId: 'America/Panama', locale: 'es-PA', acceptDownloads: true, ...opts });
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', e => errores.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errores.push('console: ' + m.text()); });
  return { ctx, page, errores };
}
const sinScrollLateral = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

try {
  // 1) Arranque con fecha fija: martes 17 nov 2026, 10 p. m.
  let { ctx, page, errores } = await nuevo();
  await page.goto(BASE + '?ahora=2026-11-17T22:00');
  await page.waitForSelector('.hero');
  ok((await page.textContent('.hero-t')).includes('Parcial de Geomática'), 'héroe: próximo examen = Parcial de Geomática');
  const cuenta = (await page.textContent('#heroCuenta')).replace(/\s+/g, ' ').trim();
  ok(cuenta === '2 días 12 h', `cuenta regresiva "${cuenta}" (vie 10:20 − mar 22:00 = 2 d 12 h 20 min)`);
  ok(await page.locator('.hito-b').count() === 9, 'cronograma: 9 hitos');
  ok(await page.locator('.tramo').count() === 1, 'cronograma: tramo de semestrales');
  ok((await page.textContent('#v-hoy')).includes('Ya no tienes más clases hoy'), 'clases: a las 10 p. m. ya no hay más');
  ok(await sinScrollLateral(page), 'Hoy: sin scroll lateral');
  await page.screenshot({ path: `${OUT}/1-hoy.png`, fullPage: true });

  for (const v of ['agenda', 'horario', 'materias']) {
    await page.click(`.tabbar [data-vista=${v}]`);
    await page.waitForTimeout(150);
    ok(await page.isVisible(`#v-${v}`), `pestaña ${v} visible`);
    ok(await sinScrollLateral(page), `${v}: sin scroll lateral`);
    await page.screenshot({ path: `${OUT}/2-${v}.png`, fullPage: true });
  }
  ok(await page.locator('#v-horario .hz-b').count() === 13, 'horario: 13 bloques');
  ok(await page.locator('#v-materias .mat').count() === 6, 'materias: 6');
  ok(await page.locator('#v-agenda .ev').count() === 9, 'agenda: 9 pendientes');

  // 2) Agregar al calendario desde el héroe (descarga .ics)
  await page.click('.tabbar [data-vista=hoy]');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('.hero [data-ics]')]);
  const ics = fs.readFileSync(await dl.path(), 'utf8');
  ok(dl.suggestedFilename() === 'parcial-de-geomatica.ics', `nombre del archivo: ${dl.suggestedFilename()}`);
  ok(ics.includes('SUMMARY:Parcial de Geomática') && ics.includes('DTSTART;TZID=America/Panama:20261120T102000') && ics.includes('TRIGGER:-P1D'), '.ics del parcial correcto');
  ok((await page.textContent('.hero')).includes('Ya está en el calendario'), 'héroe marca "Ya está en el calendario"');

  // 3) Nueva evaluación con el botón +
  await page.click('#fab');
  await page.waitForSelector('#fEval');
  await page.selectOption('#fe-materia', 'est');
  await page.selectOption('#fe-tipo', 'taller');
  ok(await page.inputValue('#fe-fecha') === '2026-11-18', 'nueva: fecha = próxima clase de Estructuras II (mié 18)');
  ok(await page.inputValue('#fe-ini') === '12:50', 'nueva: hora = la de esa clase');
  ok(await page.isChecked('#fEval input[name=avisos][value="2880"]'), 'nueva: avisos del tipo Taller marcados');
  await page.fill('#fe-titulo', 'Taller 4: método de rigidez');
  await page.fill('#fe-peso', '10');
  // error: termina antes de empezar
  await page.fill('#fe-fin', '11:00');
  await page.click('#fEval [type=submit]');
  ok(await page.isVisible('#fe-err'), 'validación: hora de fin antes del inicio');
  await page.fill('#fe-fin', '');
  await page.click('#fEval [type=submit]');
  await page.waitForSelector('.hoja-h h2:has-text("Taller 4")');
  ok(true, 'evaluación agregada y abierta');
  await page.screenshot({ path: `${OUT}/3-detalle.png` });
  // editar
  await page.click('[data-editar]');
  await page.fill('#fe-fecha', '2026-11-28');
  await page.waitForTimeout(50);
  ok(await page.isVisible('#fe-fer'), 'formulario avisa que el 28 nov es feriado');
  await page.screenshot({ path: `${OUT}/4-formulario.png`, fullPage: false });
  await page.fill('#fe-fecha', '2026-11-25');
  await page.click('#fEval [type=submit]');
  await page.waitForSelector('[data-hecho]');
  ok((await page.textContent('.datos')).toLowerCase().includes('miércoles 25 de noviembre'), 'edición guardada');
  // marcar hecha
  await page.click('[data-hecho]');
  await page.waitForTimeout(100);
  ok((await page.textContent('[data-hecho]')).includes('Marcar como pendiente'), 'marcada como hecha');
  // eliminar con confirmación
  await page.click('[data-pedir-borrar]');
  await page.click('[data-borrar]');
  await page.waitForTimeout(100);
  ok(!(await page.evaluate(() => localStorage.getItem('cronograma.v1'))).includes('Taller 4'), 'eliminada');

  // 4) Notas en la hoja de materia
  await page.click('.tabbar [data-vista=materias]');
  await page.click('.mat[data-mat=hor]');
  await page.waitForSelector('#calif details.simple');
  await page.click('#calif details.simple summary');
  await page.fill('[data-ev-peso="p-hor"]', '30'); await page.dispatchEvent('[data-ev-peso="p-hor"]', 'change');
  await page.fill('[data-ev-nota="p-hor"]', '85'); await page.dispatchEvent('[data-ev-nota="p-hor"]', 'change');
  await page.fill('[data-ev-peso="s-hor"]', '35'); await page.dispatchEvent('[data-ev-peso="s-hor"]', 'change');
  const res = await page.textContent('[data-c-res]');
  const suma = await page.textContent('[data-c-suma]');
  ok(res.includes('Promedio 85 (B) con 30% evaluado') && res.includes('Necesitas un promedio de 65') && suma.includes('suman 65%'), `notas por evaluación (sin rubros): "${res}" / "${suma}"`);
  await page.screenshot({ path: `${OUT}/5-materia.png`, fullPage: false });
  await page.click('[data-cerrar]');

  // 5) Ajustes: tema oscuro
  await page.click('#btnAjustes');
  await page.click('#fAj label:has(input[name=tema][value=oscuro]) span');
  await page.click('#fAj [type=submit]');
  ok(await page.evaluate(() => document.documentElement.dataset.theme) === 'dark', 'tema oscuro aplicado');
  await page.click('.tabbar [data-vista=hoy]');
  await page.screenshot({ path: `${OUT}/6-hoy-oscuro.png`, fullPage: true });
  await page.click('.tabbar [data-vista=horario]');
  await page.screenshot({ path: `${OUT}/7-horario-oscuro.png`, fullPage: true });

  // 6) Persistencia y sin conexión
  await page.waitForFunction(() => navigator.serviceWorker.controller || navigator.serviceWorker.ready, null, { timeout: 5000 });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); await page.waitForSelector('.tabbar');
  ok(await page.evaluate(() => document.documentElement.dataset.theme) === 'dark', 'ajustes persisten al recargar');
  await ctx.setOffline(true);
  await page.goto(BASE + '?ahora=2026-11-17T22:00#hoy');
  await page.waitForSelector('.hero', { timeout: 5000 });
  ok(true, 'funciona sin conexión');
  await ctx.setOffline(false);
  ok(errores.length === 0, 'sin errores de consola: ' + errores.join(' | '));
  await ctx.close();

  // 7) Avisos: jueves 19 nov 10:30 (1 día antes del parcial de Geomática) con notificaciones permitidas
  ({ ctx, page, errores } = await nuevo({ permissions: ['notifications'] }));
  await page.goto(BASE + '?ahora=2026-11-19T10:30');
  await page.waitForSelector('.aviso');
  ok((await page.textContent('.aviso')).includes('Parcial de Geomática'), 'aviso en pantalla: Parcial de Geomática mañana');
  ok((await page.textContent('#v-hoy')).includes('Hoy no tienes clases'), 'jueves: sin clases');
  await page.waitForTimeout(800);
  const mostrados = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('cronograma.v1')).mostrados));
  ok(mostrados.some(k => k.startsWith('p-geo|') && k.endsWith('|1440')), 'aviso de 1 día notificado una sola vez');
  await page.click('[data-visto]');
  ok(await page.locator('.aviso:not(.info)').count() === 0, 'aviso cerrado');
  await page.screenshot({ path: `${OUT}/8-jueves.png`, fullPage: true });
  ok(errores.length === 0, 'sin errores de consola (avisos): ' + errores.join(' | '));
  await ctx.close();

  // 8) Tema oscuro del sistema, viernes 20 a las 11:00 (en pleno parcial) y 25 nov (ya pasó)
  ({ ctx, page, errores } = await nuevo({ colorScheme: 'dark' }));
  await page.goto(BASE + '?ahora=2026-11-20T11:00');
  await page.waitForSelector('.hero');
  ok((await page.textContent('.hero')).includes('En curso'), 'viernes 11:00: parcial en curso');
  ok((await page.textContent('#v-hoy')).includes('Ahora'), 'clase de ahora marcada');
  await page.screenshot({ path: `${OUT}/9-viernes-oscuro.png`, fullPage: true });
  await page.goto(BASE + '?ahora=2026-11-25T09:00#agenda');
  await page.waitForSelector('#v-agenda .ev');
  ok((await page.textContent('#v-agenda')).includes('Ya pasaron'), 'agenda: grupo "Ya pasaron"');
  ok(errores.length === 0, 'sin errores de consola (oscuro): ' + errores.join(' | '));
  await ctx.close();

  // 9) Pantallas angostas (y letra agrandada): nada se sale por los lados
  for (const w of [320, 360, 412]) {
    ({ ctx, page, errores } = await nuevo({ viewport: { width: w, height: 760 } }));
    await page.goto(BASE + '?ahora=2026-11-17T22:00');
    await page.waitForSelector('.hero');
    for (const v of ['hoy', 'agenda', 'horario', 'materias']) {
      await page.click(`.tabbar [data-vista=${v}]`); await page.waitForTimeout(80);
      const anchos = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, vw: innerWidth,
        fuera: [...document.querySelectorAll('main *, .top *')].filter(el => { const r = el.getBoundingClientRect(); return r.width && (r.right > innerWidth + 1 || r.left < -1); }).slice(0, 3).map(el => el.className || el.tagName) }));
      ok(anchos.doc <= anchos.vw && !anchos.fuera.length, `${w}px ${v}: sin desbordes ${anchos.fuera.join(', ')}`);
    }
    for (const abrir of [() => page.click('#btnAjustes'), () => page.click('#fab'), () => page.click('#btnInstalar')]) {
      await abrir(); await page.waitForTimeout(300);
      const fuera = await page.evaluate(() => [...document.querySelectorAll('#sheetBody *')].filter(el => { const r = el.getBoundingClientRect(); return r.width && r.right > innerWidth + 1; }).slice(0, 3).map(el => el.className || el.tagName));
      ok(!fuera.length, `${w}px hoja ${await page.textContent('.hoja-h h2')}: sin desbordes ${fuera.join(', ')}`);
      await page.click('[data-cerrar]');
    }
    if (w === 360) await page.screenshot({ path: `${OUT}/10-hoy-360.png`, fullPage: true });
    ok(errores.length === 0, `${w}px sin errores: ` + errores.join(' | '));
    await ctx.close();
  }

  // 10) Botón Instalar
  ({ ctx, page, errores } = await nuevo());
  await page.goto(BASE);
  ok(await page.isVisible('#btnInstalar'), 'botón Instalar visible en el navegador');
  await page.click('#btnInstalar');
  await page.waitForSelector('.hoja-h h2:has-text("Instalar Cronograma")');
  ok((await page.textContent('#sheetBody')).includes('Instalar app'), 'hoja con los pasos para instalar');
  await page.screenshot({ path: `${OUT}/11-instalar.png` });
  await ctx.close();

  // 11) Convivencia con Escáner Libre en el mismo sitio
  ({ ctx, page, errores } = await nuevo());
  // el Escáner intenta bajar librerías de la CDN (bloqueada en este entorno): se reintenta la carga
  const irRaiz = async () => { for (let i = 0; i < 3; i++) { try { await page.goto('http://127.0.0.1:8765/', { waitUntil: 'domcontentloaded' }); return; } catch (e) { if (i === 2) throw e; } } };
  await irRaiz();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.goto(BASE);
  await page.waitForSelector('#tituloVista', { timeout: 5000 });
  ok(await page.title() === 'Cronograma', 'con Escáner instalado, /planificador/ abre Cronograma');
  await irRaiz();
  ok((await page.title()) !== 'Cronograma', 'Escáner sigue abriendo en la raíz');
  await ctx.close();
} catch (e) {
  console.log('FALLA excepción: ' + e.stack); fallos++;
} finally {
  await browser.close(); srv.kill();
}
console.log(fallos ? `\n${fallos} falla(s)` : '\nTodo bien');
process.exit(fallos ? 1 : 0);
