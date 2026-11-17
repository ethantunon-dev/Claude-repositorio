// Pruebas de la lógica pura. Ejecutar:  TZ=America/Panama node --test planificador/tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as L from '../js/logic.js';
import { datosIniciales } from '../js/seed.js';

const D = datosIniciales();

test('datos iniciales: fechas y días de la semana coinciden con el calendario', () => {
  const dia = id => L.DIAS[L.parseYMD(D.evals.find(e => e.id === id).fecha).getDay()];
  assert.equal(dia('s-hid'), 'lunes');     // 07/12/2026
  assert.equal(dia('s-pla'), 'miércoles'); // 09/12/2026
  assert.equal(dia('s-est'), 'viernes');   // 11/12/2026
  assert.equal(dia('s-hor'), 'lunes');     // 14/12/2026
  assert.equal(dia('s-ins'), 'miércoles'); // 16/12/2026
  assert.equal(dia('s-geo'), 'viernes');   // 18/12/2026
  assert.equal(dia('p-geo'), 'viernes');   // "el viernes" = 20/11/2026
  assert.equal(dia('p-hor'), 'sábado');    // "este sábado" = 21/11/2026
  assert.equal(dia('p-hid'), 'martes');    // el 8/12/2026 NO es viernes → marcado por confirmar
  assert.ok(D.evals.find(e => e.id === 'p-hid').fechaTBD);
  for (const e of D.evals) assert.deepEqual(L.validarEval(e, D.materias), {}, e.id);
  for (const c of D.clases) assert.deepEqual(L.validarClase(c), {}, c.id);
  // cada clase de los parciales coincide con el horario de ese día
  assert.equal(D.clases.filter(c => c.materiaId === 'geo' && c.dia === 5)[0].ini, '10:20');
});

test('fechas: parseo estricto y utilidades', () => {
  assert.equal(L.parseYMD('2026-02-31'), null);
  assert.equal(L.parseYMD('hola'), null);
  assert.equal(L.ymd(L.parseYMD('2026-12-07')), '2026-12-07');
  assert.equal(L.hora12('12:50'), '12:50 p. m.');
  assert.equal(L.hora12('00:05'), '12:05 a. m.');
  assert.equal(L.hora12('10:20'), '10:20 a. m.');
  assert.equal(L.diaSemana(L.parseYMD('2026-11-22')), 7);
  assert.equal(L.diaSemana(L.parseYMD('2026-11-23')), 1);
  const now = new Date(2026, 10, 17, 22, 0);
  assert.equal(L.relativo(L.parseYMD('2026-11-18'), now), 'mañana');
  assert.equal(L.relativo(L.parseYMD('2026-11-20'), now), 'en 3 días');
  assert.equal(L.relativo(L.parseYMD('2026-11-16'), now), 'ayer');
  assert.deepEqual(L.cuentaRegresiva(2 * 864e5 + 3 * 3600e3 + 5 * 60e3), { d: 2, h: 3, m: 5, pasado: false });
  assert.equal(L.diasEntre(new Date(2026, 10, 17, 23, 59), new Date(2026, 11, 7, 0, 1)), 20);
});

test('feriados de Panamá', () => {
  assert.equal(L.feriado('2026-12-08'), 'Día de las Madres');
  assert.equal(L.feriado('2026-11-28'), 'Independencia de Panamá de España');
  assert.equal(L.feriado('2026-11-20'), null);
  assert.equal(L.feriado('2026-02-16'), 'Carnaval (lunes)');   // Pascua 2026 = 5 abr
  assert.equal(L.feriado('2026-04-03'), 'Viernes Santo');
  assert.equal(L.feriado('2027-02-09'), 'Carnaval (martes)');  // Pascua 2027 = 28 mar
  assert.equal(L.feriado('2027-03-26'), 'Viernes Santo');
  assert.equal(L.feriado('2027-01-11'), null);                  // 9 ene 2027 es sábado: no se traslada
  assert.match(L.feriado('2027-11-29'), /se pasa al lunes/);   // 28 nov 2027 es domingo → lunes 29
});

test('notas ponderadas y lo que hace falta', () => {
  const r = L.resumenNotas([{ peso: 20, nota: 80 }, { peso: 20, nota: 90 }, { peso: 35, nota: '' }, { peso: 25, nota: '' }], 71);
  assert.equal(r.pesoEvaluado, 40);
  assert.equal(r.puntos, 34);
  assert.equal(r.promedio, 85);
  assert.equal(r.restante, 60);
  assert.ok(Math.abs(r.necesita - 61.6667) < 1e-3);
  assert.equal(r.estado, 'falta');
  assert.equal(L.resumenNotas([{ peso: 60, nota: 100 }], 50).estado, 'asegurado');
  assert.equal(L.resumenNotas([{ peso: 80, nota: 40 }], 71).estado, 'no-alcanza');
  assert.equal(L.resumenNotas([{ peso: 100, nota: 70 }], 71).estado, 'reprobado');
  assert.equal(L.resumenNotas([{ peso: '', nota: 90 }], 71).estado, 'sin-datos');
  assert.equal(L.letra(91), 'A'); assert.equal(L.letra(90.9), 'B'); assert.equal(L.letra(71), 'C'); assert.equal(L.letra(60), 'F');
  assert.equal(L.redondeo(61.6667), '61.7'); assert.equal(L.redondeo(85), '85');
});

test('clases: bloques unidos, clase en curso y siguiente', () => {
  const mar13 = new Date(2026, 10, 17, 13, 0); // martes
  const { actual, siguiente, hoy } = L.claseAhora(D.clases, mar13);
  assert.equal(actual.materiaId, 'hor');
  assert.equal(siguiente.materiaId, 'geo');
  assert.equal(hoy.length, 4);
  const vie = L.unirBloques(L.clasesDelDia(D.clases, 5));
  assert.deepEqual(vie.map(c => `${c.materiaId} ${c.ini}-${c.fin}`), ['geo 10:20-12:45', 'geo 12:50-13:35', 'hid 13:40-15:15', 'hor 15:20-16:55', 'pla 17:00-17:45']);
  const jue = new Date(2026, 10, 19, 9, 0);
  assert.equal(L.claseAhora(D.clases, jue).hoy.length, 0);
  assert.equal(L.ymd(L.proximoDiaConClases(D.clases, jue).fecha), '2026-11-20');
});

test('próximo examen y avisos vencidos', () => {
  const now = new Date(2026, 10, 17, 22, 0);
  assert.equal(L.proximoExamen(D.evals, now).id, 'p-geo');
  const evs = D.evals.map(e => ({ ...e }));
  // 3 días antes del parcial de Geomática (vie 10:20) = mar 17, 10:20 → ya pasó hace más de 6 h
  assert.equal(L.avisosVencidos(evs, D.ajustes, now).length, 0);
  const a = L.avisosVencidos(evs, D.ajustes, new Date(2026, 10, 19, 10, 30));
  assert.deepEqual(a.map(x => `${x.e.id}:${x.min}`), ['p-geo:1440']);
  const mostrados = { [a[0].key]: Date.now() };
  assert.equal(L.avisosVencidos(evs, D.ajustes, new Date(2026, 10, 19, 10, 31), mostrados).length, 0);
  evs.find(e => e.id === 'p-geo').hecho = true;
  assert.equal(L.avisosVencidos(evs, D.ajustes, new Date(2026, 10, 19, 10, 30)).length, 0);
  assert.equal(L.proximoExamen(evs, now).id, 'p-hor');
});

test('enlace de Google Calendar', () => {
  const e = D.evals.find(x => x.id === 's-hid');
  const u = new URL(L.googleCalURL(e, D.materias[0]));
  assert.equal(u.hostname, 'calendar.google.com');
  assert.equal(u.searchParams.get('dates'), '20261207T125000/20261207T145000');
  assert.equal(u.searchParams.get('ctz'), 'America/Panama');
  assert.equal(u.searchParams.get('text'), 'Semestral de Hidráulica');
  assert.equal(u.searchParams.get('location'), 'Aula 1-107');
});

test('archivo .ics: formato RFC 5545', () => {
  const now = new Date(2026, 10, 17, 22, 0);
  const ics = L.buildICS({ evals: D.evals, clases: D.clases, materias: D.materias, ajustes: D.ajustes, now });
  assert.ok(ics.endsWith('\r\n'));
  assert.ok(!/[^\r]\n/.test(ics), 'todas las líneas terminan en CRLF');
  for (const line of ics.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, `línea larga: ${line}`);
  const count = s => ics.split(s).length - 1;
  assert.equal(count('BEGIN:VEVENT'), D.evals.length + D.clases.length);
  assert.equal(count('BEGIN:VEVENT'), count('END:VEVENT'));
  assert.equal(count('BEGIN:VALARM'), count('END:VALARM'));
  assert.match(ics, /DTSTART;TZID=America\/Panama:20261207T125000/);
  assert.match(ics, /TRIGGER:-P7D/); assert.match(ics, /TRIGGER:-PT2H/); assert.match(ics, /TRIGGER:-PT15M/);
  assert.match(ics, /RRULE:FREQ=WEEKLY;UNTIL=20261205T045959Z/); // 4 dic 23:59:59 en Panamá
  // escapes
  assert.equal(L.icsEscape('a,b;c\\d\ne'), 'a\\,b\\;c\\\\d\\ne');
  // cortes con acentos no parten caracteres
  const largo = 'DESCRIPTION:' + 'ñandú áéíóú '.repeat(20);
  const fold = L.icsFold(largo);
  assert.equal(fold.split('\r\n').map((l, i) => i ? l.slice(1) : l).join(''), largo);
  fs.writeFileSync(process.env.ICS_OUT || '/dev/null', ics);
});
