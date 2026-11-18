// Rubros y notas dentro de una materia (Chromium + Playwright). Uso: node planificador/tests/e2e-notas.mjs <capturas>
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');
const OUT = process.argv[2] || '/tmp/capturas';
fs.mkdirSync(OUT, { recursive: true });
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const srv = spawn('python3', ['-m', 'http.server', '8770', '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 800));
const BASE = 'http://127.0.0.1:8770/planificador/';
let fallos = 0;
const ok = (c, msg) => { console.log((c ? 'ok   ' : 'FALLA') + ' ' + msg); if (!c) fallos++; };
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'America/Panama', serviceWorkers: 'block' });
const page = await ctx.newPage();
const errores = [];
page.on('pageerror', e => errores.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errores.push('console: ' + m.text()); });
const estado = () => page.evaluate(() => JSON.parse(localStorage.getItem('cronograma.v1')));
const hor = s => s.materias.find(m => m.id === 'hor');
const cambiar = async (sel, v) => { await page.fill(sel, String(v)); await page.dispatchEvent(sel, 'change'); };
const abrirHor = async () => { await page.click('.tabbar [data-vista=materias]'); await page.click('.mat[data-mat=hor]'); await page.waitForSelector('#calif'); };

try {
  await page.goto(BASE + '?ahora=2026-11-17T22:00');
  await page.waitForSelector('.hero');
  await abrirHor();
  ok((await page.textContent('#calif')).includes('Arma cómo te evalúan'), 'materia sin rubros invita a armarlos');

  // Parciales 40 %
  await page.click('#calif [data-agregar-rubro="Parciales"]');
  let S = await estado();
  const rP = hor(S).rubros[0];
  ok(await page.evaluate(id => document.activeElement?.dataset.rbPeso === id, rP.id), 'al agregar un rubro queda listo para escribir su porcentaje');
  await page.keyboard.type('40'); await page.dispatchEvent(`[data-rb-peso="${rP.id}"]`, 'change');
  ok(await page.isVisible('[data-ev-nota="p-hor"]'), 'el parcial de la agenda entra solo en Parciales');
  // Laboratorio 30 %, serán 4, Lab 1 = 18 de 20
  await page.click('#calif [data-agregar-rubro="Laboratorio"]');
  S = await estado(); const rL = hor(S).rubros[1];
  await page.keyboard.type('30'); await page.dispatchEvent(`[data-rb-peso="${rL.id}"]`, 'change');
  await cambiar(`[data-rb-cant="${rL.id}"]`, 4);
  await page.click(`[data-agregar-nota="${rL.id}"]`);
  S = await estado(); const it = hor(S).rubros[1].items[0];
  ok(it.nombre === 'Lab 1', `nombre automático de la nota: ${it.nombre}`);
  ok(await page.evaluate(ref => document.activeElement?.dataset.itNota === ref, `${rL.id}|${it.id}`), 'la nota nueva queda lista para escribir');
  await page.keyboard.type('18'); await page.dispatchEvent(`[data-it-nota="${rL.id}|${it.id}"]`, 'change');
  await cambiar(`[data-it-max="${rL.id}|${it.id}"]`, 20);
  // Semestral 30 %
  await page.click('#calif [data-agregar-rubro="Semestral"]');
  S = await estado(); const rS = hor(S).rubros[2];
  await page.keyboard.type('30'); await page.dispatchEvent(`[data-rb-peso="${rS.id}"]`, 'change');
  ok(await page.isVisible('[data-ev-nota="s-hor"]'), 'el semestral entra solo en Semestral');
  // nota del parcial y paso al siguiente campo sin perder el foco
  await page.click('[data-ev-nota="p-hor"]'); await page.keyboard.type('85');
  await page.click(`[data-it-max="${rL.id}|${it.id}"]`);
  ok(await page.evaluate(ref => document.activeElement?.dataset.itMax === ref, `${rL.id}|${it.id}`), 'al pasar al siguiente campo no se pierde el foco (no se cierra el teclado)');
  const res = await page.textContent('[data-c-res]');
  ok(res.includes('Promedio 85.8 (B) con 47.5% evaluado') && res.includes('Necesitas un promedio de 57.6 en el 52.5% que falta'), `resumen: "${res}"`);
  ok(await page.isHidden('[data-c-suma]'), 'suma 100 %: sin aviso');
  ok((await page.textContent(`[data-rb-est="${rL.id}"]`)).includes('Promedio 90 · 1 de 4 notas · aporta 6.8 de 30 pts'), 'estado del rubro Laboratorio');
  const angostos = async () => page.evaluate(() => [...document.querySelectorAll('.nf-n, .nf-nom, .rb-nombre')].filter(el => el.getBoundingClientRect().width < 80).map(el => `${el.className} ${Math.round(el.getBoundingClientRect().width)}px`));
  let ang = await angostos();
  ok(!ang.length, 'nombres de notas y rubros con espacio (≥ 80 px) ' + ang.join(', '));
  ok(await page.$eval(`[data-it-nota="${rL.id}|${it.id}"]`, el => el.getBoundingClientRect().width < 90), 'campo de nota angosto');
  await page.screenshot({ path: `${OUT}/n1-rubros.png`, fullPage: false });
  // nota mayor que el máximo
  await cambiar(`[data-it-nota="${rL.id}|${it.id}"]`, 25);
  ok(await page.evaluate(ref => document.querySelector(`[data-it-nota="${ref}"]`).classList.contains('inv'), `${rL.id}|${it.id}`) && hor(await estado()).rubros[1].items[0].nota === '18', 'nota mayor que el máximo: se marca y no se guarda');
  await cambiar(`[data-it-nota="${rL.id}|${it.id}"]`, 18);
  // aviso de suma
  await cambiar(`[data-rb-peso="${rS.id}"]`, 20);
  ok((await page.textContent('[data-c-suma]')).includes('suman 90%'), 'aviso: los porcentajes suman 90 %');
  await cambiar(`[data-rb-peso="${rS.id}"]`, 30);

  // persistencia
  await page.reload(); await page.waitForSelector('.tabbar');
  await abrirHor();
  ok(await page.inputValue('[data-ev-nota="p-hor"]') === '85' && await page.inputValue(`[data-it-max="${rL.id}|${it.id}"]`) === '20', 'todo queda guardado al recargar');
  ok((await page.textContent('#v-materias .mat[data-mat=hor]')).includes('Promedio 85.8 (B)'), 'la tarjeta de la materia muestra el promedio');
  await page.click('[data-cerrar]');

  // formulario de la evaluación: rubro y nota sobre un máximo
  await page.click('.tabbar [data-vista=agenda]');
  await page.click('#v-agenda [data-ev="p-hor"]');
  await page.click('[data-editar]');
  ok(await page.$eval('#fe-rubro', s => s.options[s.selectedIndex].text) === 'Parciales (40%)', 'el formulario sabe que el parcial cuenta para Parciales');
  await page.fill('#fe-nota', '45'); await page.fill('#fe-max', '50');
  await page.click('#fEval [type=submit]');
  await page.waitForSelector('[data-hecho]');
  const datos = await page.textContent('.datos');
  ok(datos.includes('Cuenta paraParciales (40%)') && datos.includes('45 de 50 (90, B)'), 'detalle: rubro y nota 45 de 50 (90, B): ' + datos.replace(/\s+/g, ' '));
  // una evaluación nueva de un tipo sin rubro: no cuenta, y se puede asignar
  await page.click('[data-cerrar]');
  await page.click('#fab');
  await page.selectOption('#fe-materia', 'hor'); await page.selectOption('#fe-tipo', 'taller');
  ok(await page.$eval('#fe-rubro', s => s.value) === '', 'un taller sin rubro de talleres: "No cuenta para la nota"');
  await page.selectOption('#fe-rubro', rL.id);
  await page.click('#fEval [type=submit]');
  await page.waitForSelector('[data-hecho]');
  S = await estado();
  ok(S.evals.find(e => e.materiaId === 'hor' && e.tipo === 'taller').rubroId === rL.id, 'el rubro elegido a mano se guarda');
  await page.click('[data-cerrar]');

  // quitar un rubro con notas pide confirmación y suelta las evaluaciones
  await abrirHor();
  await page.click(`[data-quitar-rubro="${rL.id}"]`);
  ok((await page.textContent(`[data-rb-conf="${rL.id}"]`)).includes('Se borran sus notas'), 'quitar rubro con notas: pide confirmación');
  await page.click(`[data-rb-conf="${rL.id}"] [data-si]`);
  S = await estado();
  ok(hor(S).rubros.length === 2 && !S.evals.some(e => e.rubroId === rL.id), 'rubro quitado y sus evaluaciones sueltas');
  ok(await page.isVisible('#calif .sueltas'), 'el taller aparece como "no cuenta en ningún rubro"');

  // modo oscuro y pantalla angosta
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.screenshot({ path: `${OUT}/n2-rubros-oscuro.png` });
  await page.setViewportSize({ width: 320, height: 700 });
  await page.waitForTimeout(100);
  const fuera = await page.evaluate(() => [...document.querySelectorAll('#sheetBody *')].filter(el => { const r = el.getBoundingClientRect(); return r.width && r.right > innerWidth + 1; }).map(el => el.className || el.tagName).slice(0, 3));
  ok(!fuera.length, '320 px: nada se sale ' + fuera.join(', '));
  ang = await angostos();
  ok(!ang.length, '320 px: nombres con espacio ' + ang.join(', '));
  await page.evaluate(() => document.querySelector('#calif').scrollIntoView());
  await page.screenshot({ path: `${OUT}/n3-rubros-320.png` });
  ok(errores.length === 0, 'sin errores de consola: ' + errores.join(' | '));
} catch (e) {
  console.log('FALLA excepción: ' + e.stack); fallos++;
} finally {
  await browser.close(); srv.kill();
}
console.log(fallos ? `\n${fallos} falla(s)` : '\nTodo bien');
process.exit(fallos ? 1 : 0);
