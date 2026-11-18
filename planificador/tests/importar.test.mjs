// Pruebas del importador. Ejecutar:  node --test planificador/tests/importar.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseHorarioUTP, parseSemestrales, emparejar, nombreBonito, docenteBonito, rangoHora, parecido } from '../js/importar.js';
import { datosIniciales } from '../js/seed.js';

const items = JSON.parse(fs.readFileSync(new URL('./muestras/horario-utp-items.json', import.meta.url)));
const D = datosIniciales();

test('PDF de la UTP: las 13 clases del II semestre 2026, iguales a las de los datos iniciales', () => {
  const r = parseHorarioUTP(items);
  assert.equal(r.semestre, 'II semestre 2026');
  assert.equal(r.materias.length, 6);
  assert.equal(r.clases.length, 13);
  const porMateria = Object.fromEntries(r.materias.map(m => [m.key, emparejar(m.nombre, D.materias)?.id]));
  assert.deepEqual(porMateria, { ESTRUCTURASII: 'est', INSTELECTR: 'ins', HIDRAULICA: 'hid', HORMIGONI: 'hor', ELEMGEOM: 'geo', INTERPPLANOS: 'pla' });
  const leidas = r.clases.map(c => `${porMateria[c.key]} ${c.dia} ${c.ini}-${c.fin} ${c.aula} ${c.tipo} ${c.grupo}`).sort();
  const esperadas = D.clases.map(c => `${c.materiaId} ${c.dia} ${c.ini}-${c.fin} ${c.aula} ${c.tipo} ${c.grupo}`).sort();
  assert.deepEqual(leidas, esperadas);
  assert.deepEqual(r.materias.map(m => m.nombre), ['Estructuras II', 'Inst. Eléctr.', 'Hidráulica', 'Hormigón I', 'Elem. Geom.', 'Interp. Planos']);
});

test('PDF sin horario: no inventa nada', () => {
  assert.deepEqual(parseHorarioUTP([{ str: 'Factura', x: 10, y: 10, w: 40 }]).clases, []);
  assert.deepEqual(parseHorarioUTP([]).clases, []);
});

test('horas, nombres y profesores', () => {
  assert.deepEqual(rangoHora('12:50-1:35P.M.'), { ini: 770, fin: 815 });
  assert.deepEqual(rangoHora('11:10-11:55A.M'), { ini: 670, fin: 715 });
  assert.deepEqual(rangoHora('11:40-12:25P.M.'), { ini: 700, fin: 745 });
  assert.equal(rangoHora('aula 1-104'), null);
  assert.equal(nombreBonito('ELEM.GEOM.'), 'Elem. Geom.');
  assert.equal(nombreBonito('INTERPRETACION DE PLANOS Y ESPEC.'), 'Interpretación de Planos y Espec.');
  assert.equal(nombreBonito('INST. ELÉCTRICAS Y MEC. EN OBRAS CIVILES'), 'Inst. Eléctricas y Mec. en Obras Civiles');
  assert.equal(docenteBonito('MUÑOZ, LUIS'), 'Luis Muñoz');
  assert.equal(docenteBonito('GUIZADO, OBDULIA DE'), 'Obdulia de Guizado');
  assert.equal(parecido('Hormigón I', 'HORMIGON II'), 0);
  assert.equal(parecido('Estructuras II', 'ESTRUCTURAS'), 0);
  assert.ok(parecido('Elem. Geom.', 'ELEMENTOS DE GEOMATICA') > 0);
  assert.equal(emparejar('Física', D.materias), null);
});

const FILAS = [
  ['8020', 'HIDRAULICA', '8900', '1IC133', '1-107', '07/12/2026', '12:50 PM - 02:50 PM', 'MUÑOZ, LUIS'],
  ['8029', 'INTERPRETACION DE PLANOS Y ESPEC.', '8901', '1IC133', '1-107', '09/12/2026', '12:50 PM - 02:50 PM', 'HERRERA, ALFREDO'],
  ['8018', 'ESTRUCTURAS II', '8898', '1IC133', '1-107', '11/12/2026', '12:50 PM - 02:50 PM', 'GUIZADO, OBDULIA DE'],
  ['8019', 'HORMIGON I', '8899', '1IC133', '1-107', '14/12/2026', '12:50 PM - 02:50 PM', 'SALADO, JUAN'],
  ['0074', 'INST. ELÉCTRICAS Y MEC. EN OBRAS CIVILES', '8903', '1IC133', '1-107', '16/12/2026', '12:50 PM - 02:50 PM', 'ATENCIO, PACIFICO'],
  ['8329', 'ELEMENTOS DE GEOMATICA', '8902', '1IC133', '1-107', '18/12/2026', '12:50 PM - 02:50 PM', 'MANZANE, MEHIDYS'],
];
const CAB = 'Calendario de Exámenes Semestrales - II SEMESTRE del 2026\nCODASIG\tASIGNATURA\tCODHORA\tGRUPO\tAULA\tFECHA\tHORA\tDOCENTE\n';
function revisar(r) {
  assert.equal(r.length, 6);
  assert.deepEqual(r.map(f => f.fecha), ['2026-12-07', '2026-12-09', '2026-12-11', '2026-12-14', '2026-12-16', '2026-12-18']);
  for (const f of r) { assert.equal(f.ini, '12:50'); assert.equal(f.fin, '14:50'); assert.equal(f.aula, '1-107'); }
  assert.deepEqual(r.map(f => f.codigo), ['8020', '8029', '8018', '8019', '0074', '8329']);
  assert.deepEqual(r.map(f => f.docente), ['Luis Muñoz', 'Alfredo Herrera', 'Obdulia de Guizado', 'Juan Salado', 'Pacifico Atencio', 'Mehidys Manzane']);
  assert.equal(r[4].nombre, 'INST. ELÉCTRICAS Y MEC. EN OBRAS CIVILES');
  // cada fila encuentra su materia (con los nombres cortos que saca el PDF)
  const delPDF = parseHorarioUTP(items).materias.map((m, i) => ({ id: 'm' + i, nombre: m.nombre }));
  const ids = r.map(f => emparejar(f.nombre, delPDF)?.nombre);
  assert.deepEqual(ids, ['Hidráulica', 'Interp. Planos', 'Estructuras II', 'Hormigón I', 'Inst. Eléctr.', 'Elem. Geom.']);
  assert.deepEqual(r.map(f => emparejar(f.nombre, D.materias)?.id), ['hid', 'pla', 'est', 'hor', 'ins', 'geo']);
}
test('semestrales pegados como tabla (tabuladores)', () => revisar(parseSemestrales(CAB + FILAS.map(f => f.join('\t')).join('\n') + '\n')));
test('semestrales pegados con una celda por línea', () => revisar(parseSemestrales(CAB.replace(/\t/g, '\n') + FILAS.map(f => f.join('\n')).join('\n'))));
test('semestrales: texto sin fechas no da filas', () => assert.deepEqual(parseSemestrales('hola mundo'), []));
