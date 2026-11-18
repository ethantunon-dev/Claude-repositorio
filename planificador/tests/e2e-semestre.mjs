// Flujo de semestre nuevo, importar PDF de la UTP, pegar semestrales e historial (Chromium + Playwright).
// Uso: node planificador/tests/e2e-semestre.mjs <pdf-del-horario> <carpeta-node_modules-con-pdfjs-dist> <capturas>
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');
const [PDF, NM, OUT = '/tmp/capturas'] = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const srv = spawn('python3', ['-m', 'http.server', '8768', '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 800));
const BASE = 'http://127.0.0.1:8768/planificador/';
let fallos = 0;
const ok = (c, msg) => { console.log((c ? 'ok   ' : 'FALLA') + ' ' + msg); if (!c) fallos++; };
const SEM = `Calendario de Exámenes Semestrales - II SEMESTRE del 2026
CODASIG\tASIGNATURA\tCODHORA\tGRUPO\tAULA\tFECHA\tHORA\tDOCENTE
8020\tHIDRAULICA\t8900\t1IC133\t1-107\t07/12/2026\t12:50 PM - 02:50 PM\tMUÑOZ, LUIS
8029\tINTERPRETACION DE PLANOS Y ESPEC.\t8901\t1IC133\t1-107\t09/12/2026\t12:50 PM - 02:50 PM\tHERRERA, ALFREDO
8018\tESTRUCTURAS II\t8898\t1IC133\t1-107\t11/12/2026\t12:50 PM - 02:50 PM\tGUIZADO, OBDULIA DE
8019\tHORMIGON I\t8899\t1IC133\t1-107\t14/12/2026\t12:50 PM - 02:50 PM\tSALADO, JUAN
0074\tINST. ELÉCTRICAS Y MEC. EN OBRAS CIVILES\t8903\t1IC133\t1-107\t16/12/2026\t12:50 PM - 02:50 PM\tATENCIO, PACIFICO
8329\tELEMENTOS DE GEOMATICA\t8902\t1IC133\t1-107\t18/12/2026\t12:50 PM - 02:50 PM\tMANZANE, MEHIDYS`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'America/Panama', serviceWorkers: 'block' });
// pdf.js desde node_modules en vez de la CDN (este entorno no tiene internet)
await ctx.route('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/**', r => {
  const rel = new URL(r.request().url()).pathname.replace('/npm/pdfjs-dist@4.10.38/', '');
  const f = path.join(NM, 'pdfjs-dist', rel);
  fs.existsSync(f) ? r.fulfill({ path: f, contentType: f.endsWith('.mjs') || f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream', headers: { 'access-control-allow-origin': '*' } }) : r.fulfill({ status: 404 });
});
const page = await ctx.newPage();
const errores = [];
page.on('pageerror', e => errores.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errores.push('console: ' + m.text()); });
const estado = () => page.evaluate(() => JSON.parse(localStorage.getItem('cronograma.v1')));
const importar = async () => {
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#sheetBody [data-accion=importar-pdf], #v-horario [data-accion=importar-pdf]')]);
  await fc.setFiles(PDF);
  await page.waitForSelector('#usarHorario', { timeout: 20000 });
};

try {
  await page.goto(BASE + '?ahora=2026-11-17T22:00#horario');
  await page.waitForSelector('.hz-top');
  ok((await page.textContent('.hz-top')).includes('II semestre 2026'), 'horario muestra el semestre');

  // 1) Semestre nuevo
  await page.click('.hz-top [data-accion=semestre]');
  await page.click('#sheetBody [data-accion=nuevo-semestre]');
  ok(await page.inputValue('#fn-nombre') === 'I semestre 2027', 'nombre sugerido: I semestre 2027');
  await page.click('#fNuevo [type=submit]');
  await page.waitForSelector('.hoja-h h2:has-text("I semestre 2027")');
  let S = await estado();
  ok(S.semestre === 'I semestre 2027' && S.materias.length === 0 && S.evals.length === 0, 'semestre nuevo vacío');
  ok(S.historial.length === 1 && S.historial[0].nombre === 'II semestre 2026' && S.historial[0].evals.length === 9, 'el anterior quedó en el historial con sus 9 evaluaciones');
  await page.click('[data-cerrar]');
  ok(await page.isVisible('#v-horario .vacio-g'), 'horario vacío invita a importar');

  // 2) Importar el PDF
  await importar();
  ok((await page.textContent('.hoja-h h2')).includes('6 materias y 13 clases'), 'vista previa: 6 materias y 13 clases');
  await page.screenshot({ path: `${OUT}/s1-vista-pdf.png` });
  await page.click('#usarHorario');
  await page.waitForSelector('#v-horario .hz-b');
  S = await estado();
  ok(S.materias.length === 6 && S.clases.length === 13, 'importado: 6 materias, 13 clases');
  ok(S.semestre === 'II semestre 2026', 'nombre del semestre tomado del PDF');
  ok(await page.locator('#v-horario .hz-b').count() === 13, 'horario dibuja 13 bloques');
  ok(new Set(S.materias.map(m => m.color)).size === 6, 'cada materia con su color');
  await page.screenshot({ path: `${OUT}/s2-horario-importado.png`, fullPage: true });

  // 3) Pegar semestrales
  await page.click('.hz-top [data-accion=semestre]');
  await page.click('#sheetBody [data-accion=semestrales]');
  await page.fill('#txtSem', SEM);
  await page.click('#leerSem');
  await page.waitForSelector('#guardarSem');
  const sel = await page.$$eval('[data-fila]', l => l.map(x => x.options[x.selectedIndex].text));
  ok(JSON.stringify(sel) === JSON.stringify(['Hidráulica', 'Interp. Planos', 'Estructuras II', 'Hormigón I', 'Inst. Eléctr.', 'Elem. Geom.']), 'cada semestral encontró su materia: ' + sel.join(', '));
  await page.screenshot({ path: `${OUT}/s3-semestrales.png` });
  await page.click('#guardarSem');
  await page.waitForTimeout(200);
  S = await estado();
  const sems = S.evals.filter(e => e.tipo === 'semestral');
  ok(sems.length === 6 && sems.every(e => e.ini === '12:50' && e.fin === '14:50' && e.aula === '1-107'), '6 semestrales a las 12:50 en el 1-107');
  const geo = S.materias.find(m => m.codigo === '8329');
  ok(geo && geo.nombre === 'Elementos de Geomática' && geo.corto === 'Elem. Geom.' && geo.docente === 'Mehidys Manzane', `materia completada: ${geo?.nombre} / ${geo?.corto} / ${geo?.docente}`);
  ok(sems.find(e => e.materiaId === geo.id).fecha === '2026-12-18', 'fecha del semestral de Geomática: 18 dic');
  await page.click('.tabbar [data-vista=hoy]');
  ok((await page.textContent('.hero-t')).includes('Semestral de Hidráulica'), 'Hoy: cuenta regresiva al Semestral de Hidráulica');
  // a mano: cambiar una fecha
  await page.click('.tabbar [data-vista=materias]');
  await page.click('#v-materias [data-accion=semestre]');
  await page.click('#sheetBody [data-accion=semestrales]');
  await page.fill(`[data-sem="${geo.id}"]`, '2026-12-19');
  await page.click('#fSemMan [type=submit]');
  await page.waitForTimeout(150);
  S = await estado();
  ok(S.evals.filter(e => e.tipo === 'semestral').length === 6 && S.evals.find(e => e.tipo === 'semestral' && e.materiaId === geo.id).fecha === '2026-12-19', 'a mano: se actualiza sin duplicar');

  // 4) Volver al semestre guardado
  await page.click('#v-agenda .ev'); await page.click('[data-cerrar]');
  await page.click('.tabbar [data-vista=horario]');
  await page.click('.hz-top [data-accion=semestre]');
  await page.click('[data-volver]');
  await page.click('[data-si]');
  await page.waitForTimeout(150);
  S = await estado();
  ok(S.evals.length === 9 && S.evals.some(e => e.id === 'p-hid') && S.historial.length === 1 && S.historial[0].evals.length === 6, 'volver: datos originales de vuelta y el otro al historial');

  // 5) Reimportar sobre un semestre con datos: se conservan materias y notas
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('cronograma.v1')); s.evals.find(e => e.id === 'p-hor').nota = '88'; localStorage.setItem('cronograma.v1', JSON.stringify(s)); });
  await page.reload(); await page.waitForSelector('.hz-top');
  await page.click('.hz-top [data-accion=semestre]');
  await importar();
  const pre = await page.$$eval('[data-imp]', l => l.map(x => x.value));
  ok(JSON.stringify(pre) === JSON.stringify(['est', 'ins', 'hid', 'hor', 'geo', 'pla']), 'reimportar: cada materia del PDF va a la existente');
  ok((await page.textContent('#sheetBody')).includes('Se reemplazan las 13 clases'), 'avisa que reemplaza las clases');
  await page.click('#usarHorario');
  await page.waitForTimeout(150);
  S = await estado();
  ok(S.materias.length === 6 && S.clases.length === 13 && S.evals.find(e => e.id === 'p-hor').nota === '88', 'reimportar: mismas materias, notas intactas');
  ok(S.materias.find(m => m.id === 'pla').nombre === 'Interpretación de Planos y Especificaciones', 'no cambia los nombres que ya estaban completos');

  // 6) Archivo que no es un horario
  const falso = path.join(OUT, 'no-es-horario.pdf');
  fs.writeFileSync(falso, 'esto no es un pdf');
  await page.click('.hz-top [data-accion=semestre]');
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#sheetBody [data-accion=importar-pdf]')]);
  await fc.setFiles(falso);
  await page.waitForSelector('.hoja-h h2:has-text("No se pudo importar")', { timeout: 15000 });
  ok((await page.textContent('#sheetBody')).includes('No se pudo abrir ese archivo como PDF'), 'archivo inválido: mensaje claro');
  const anchos = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  ok(anchos, 'sin desbordes');
  ok(errores.filter(e => !/Invalid PDF|Failed to load resource/.test(e)).length === 0, 'sin errores de consola: ' + errores.join(' | '));
} catch (e) {
  console.log('FALLA excepción: ' + e.stack); fallos++;
} finally {
  await browser.close(); srv.kill();
}
console.log(fallos ? `\n${fallos} falla(s)` : '\nTodo bien');
process.exit(fallos ? 1 : 0);
