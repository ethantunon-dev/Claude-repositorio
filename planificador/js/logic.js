// Lógica pura, sin DOM: fechas, avisos, archivo de calendario (.ics), enlaces de Google Calendar,
// notas ponderadas y feriados de Panamá. La usan la app y las pruebas en Node.

export const TIPOS = {
  semestral: { nombre: 'Semestral', avisos: [10080, 4320, 1440, 120], duracion: 120 },
  parcial: { nombre: 'Parcial', avisos: [4320, 1440, 120], duracion: 90 },
  taller: { nombre: 'Taller', avisos: [2880, 1440, 180], duracion: 60 },
  tarea: { nombre: 'Tarea', avisos: [1440, 180], duracion: 30 },
  informe: { nombre: 'Informe de lab', avisos: [1440, 180], duracion: 30 },
  proyecto: { nombre: 'Proyecto', avisos: [4320, 1440, 180], duracion: 60 },
  quiz: { nombre: 'Quiz', avisos: [1440, 60], duracion: 30 },
  otro: { nombre: 'Otro', avisos: [1440], duracion: 60 },
};
// Exámenes: los que llevan cuenta regresiva grande y hito grande en el cronograma.
export const ES_EXAMEN = new Set(['semestral', 'parcial']);

export const AVISOS = [
  [10080, '7 días'], [4320, '3 días'], [2880, '2 días'], [1440, '1 día'], [720, '12 h'],
  [180, '3 h'], [120, '2 h'], [60, '1 h'], [30, '30 min'], [15, '15 min'],
];
export const avisoNombre = m => (AVISOS.find(a => a[0] === m) || [m, `${m} min`])[1];

export const COLORES = ['azul', 'rojo', 'pizarra', 'violeta', 'naranja', 'turquesa', 'verde', 'rosa', 'ocre', 'indigo'];

export const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
export const DIAS_CORTO = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const MESES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// ---------- fechas (siempre en hora local del teléfono) ----------
export const pad = n => String(n).padStart(2, '0');
export const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function parseYMD(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return d.getMonth() === +m[2] - 1 ? d : null; // rechaza 31 de febrero, etc.
}
export const validHM = s => /^([01]\d|2[0-3]):[0-5]\d$/.test(s || '');
export const minutos = hm => validHM(hm) ? +hm.slice(0, 2) * 60 + +hm.slice(3) : null;
export const hmDe = min => `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`;
export function dateAt(fecha, hm) {
  const d = parseYMD(fecha);
  if (!d) return null;
  const m = minutos(hm);
  if (m != null) d.setHours(Math.floor(m / 60), m % 60, 0, 0);
  return d;
}
export const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
export const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const diasEntre = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / 864e5);
export const diaSemana = d => (d.getDay() + 6) % 7 + 1; // 1 = lunes … 7 = domingo

export function hora12(hm) {
  const m = minutos(hm);
  if (m == null) return '';
  let h = Math.floor(m / 60); const ap = h >= 12 ? 'p. m.' : 'a. m.';
  h = h % 12 || 12;
  return `${h}:${pad(m % 60)} ${ap}`;
}
export const fechaLarga = d => `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`;
export const fechaCorta = d => `${DIAS_CORTO[d.getDay()]} ${d.getDate()} ${MESES_CORTO[d.getMonth()]}`;

// "en 3 días", "mañana", "hoy", "ayer", "hace 4 días"
export function relativo(d, now) {
  const n = diasEntre(now, d);
  if (n === 0) return 'hoy';
  if (n === 1) return 'mañana';
  if (n === -1) return 'ayer';
  return n > 0 ? `en ${n} días` : `hace ${-n} días`;
}

export function cuentaRegresiva(ms) {
  if (ms <= 0) return { d: 0, h: 0, m: 0, pasado: true };
  const t = Math.floor(ms / 60000);
  return { d: Math.floor(t / 1440), h: Math.floor(t % 1440 / 60), m: t % 60, pasado: false };
}

// ---------- evaluaciones ----------
export const tipoDe = e => TIPOS[e.tipo] || TIPOS.otro;
export const inicioDe = e => dateAt(e.fecha, e.ini || '08:00');
export function finDe(e) {
  const ini = inicioDe(e);
  if (!ini) return null;
  const a = minutos(e.ini), b = minutos(e.fin);
  if (a != null && b != null && b > a) return dateAt(e.fecha, e.fin);
  return new Date(ini.getTime() + tipoDe(e).duracion * 60000);
}
export function tituloDe(e, materia) {
  if (e.titulo && e.titulo.trim()) return e.titulo.trim();
  const t = tipoDe(e).nombre;
  return materia ? `${t} de ${materia.corto || materia.nombre}` : t;
}
export const avisosDe = (e, ajustes) => Array.isArray(e.avisos) ? e.avisos
  : (ajustes?.avisosPorTipo?.[e.tipo] ?? tipoDe(e).avisos);

export function ordenarEvals(evals) {
  return evals.slice().sort((a, b) => (inicioDe(a) - inicioDe(b)) || String(a.id).localeCompare(String(b.id)));
}
// Pendiente = no marcada como hecha y todavía no ha terminado.
export const pendiente = (e, now) => !e.hecho && finDe(e) > now;

export function proximoExamen(evals, now) {
  return ordenarEvals(evals.filter(e => ES_EXAMEN.has(e.tipo) && pendiente(e, now)))[0] || null;
}
export function proximaEval(evals, now) {
  return ordenarEvals(evals.filter(e => pendiente(e, now)))[0] || null;
}

// Avisos que ya tocaron (entre `ventanaMs` atrás y ahora) y no se han mostrado.
export function avisosVencidos(evals, ajustes, now, mostrados = {}, ventanaMs = 6 * 3600e3) {
  const out = [];
  for (const e of evals) {
    if (e.hecho) continue;
    const ini = inicioDe(e);
    if (!ini || ini < now - 3600e3) continue;
    for (const min of avisosDe(e, ajustes)) {
      const at = new Date(ini.getTime() - min * 60000);
      const key = `${e.id}|${e.fecha}|${e.ini}|${min}`;
      if (at <= now && now - at <= ventanaMs && !mostrados[key]) out.push({ key, e, min, at });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

// Firma de lo que va al calendario: si cambia después de exportar, hay que volver a exportar.
export const firmaCal = (e, ajustes) => [e.fecha, e.ini, e.fin, e.aula || '', e.tipo, e.titulo || '', avisosDe(e, ajustes).join(',')].join('|');

// ---------- clases ----------
export function clasesDelDia(clases, dia) {
  return clases.filter(c => +c.dia === dia).sort((a, b) => minutos(a.ini) - minutos(b.ini));
}
// Junta bloques seguidos de la misma materia y tipo (12:50–1:35 + 1:40–2:25 → 12:50–2:25).
export function unirBloques(lista) {
  const out = [];
  for (const c of lista) {
    const prev = out[out.length - 1];
    if (prev && prev.materiaId === c.materiaId && prev.tipo === c.tipo && (prev.aula || '') === (c.aula || '')
      && minutos(c.ini) - minutos(prev.fin) <= 10) prev.fin = c.fin;
    else out.push({ ...c });
  }
  return out;
}
// Clase en curso y la siguiente del día `now`.
export function claseAhora(clases, now) {
  const hoy = unirBloques(clasesDelDia(clases, diaSemana(now)));
  const t = now.getHours() * 60 + now.getMinutes();
  return {
    actual: hoy.find(c => minutos(c.ini) <= t && t < minutos(c.fin)) || null,
    siguiente: hoy.find(c => minutos(c.ini) > t) || null,
    hoy,
  };
}
// Próximo día (desde mañana) que tiene clases.
export function proximoDiaConClases(clases, now) {
  for (let i = 1; i <= 7; i++) {
    const d = addDays(startOfDay(now), i);
    const l = unirBloques(clasesDelDia(clases, diaSemana(d)));
    if (l.length) return { fecha: d, clases: l };
  }
  return null;
}

// ---------- feriados de Panamá ----------
function pascua(y) { // algoritmo de Meeus/Jones/Butcher (calendario gregoriano)
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = (h + l - 7 * m + 114) % 31 + 1;
  return new Date(y, mes - 1, dia);
}
const FIJOS = [
  ['01-01', 'Año Nuevo'], ['01-09', 'Día de los Mártires'], ['05-01', 'Día del Trabajador'],
  ['11-03', 'Separación de Panamá de Colombia'], ['11-04', 'Día de los Símbolos Patrios'],
  ['11-05', 'Consolidación de la Separación (Colón)'], ['11-10', 'Primer Grito de Independencia'],
  ['11-28', 'Independencia de Panamá de España'], ['12-08', 'Día de las Madres'], ['12-25', 'Navidad'],
];
const cacheFeriados = {};
export function feriadosDe(y) {
  if (cacheFeriados[y]) return cacheFeriados[y];
  const map = {};
  for (const [md, n] of FIJOS) map[`${y}-${md}`] = n;
  const p = pascua(y);
  map[ymd(addDays(p, -48))] = 'Carnaval (lunes)';
  map[ymd(addDays(p, -47))] = 'Carnaval (martes)';
  map[ymd(addDays(p, -2))] = 'Viernes Santo';
  // Si un feriado fijo cae domingo, se descansa el lunes.
  for (const [md, n] of FIJOS) {
    const d = parseYMD(`${y}-${md}`);
    if (d.getDay() === 0) { const l = ymd(addDays(d, 1)); if (!map[l]) map[l] = `${n} (se pasa al lunes)`; }
  }
  return (cacheFeriados[y] = map);
}
export const feriado = fecha => { const d = parseYMD(fecha); return d ? feriadosDe(d.getFullYear())[fecha] || null : null; };

// ---------- notas (escala UTP 0–100) ----------
export function letra(n) {
  if (n == null || isNaN(n)) return '';
  return n >= 91 ? 'A' : n >= 81 ? 'B' : n >= 71 ? 'C' : n >= 61 ? 'D' : 'F';
}
const num = v => (v === '' || v == null || isNaN(+v)) ? null : +v;
export function resumenNotas(evals, notaMin = 71) {
  let pesoEvaluado = 0, puntos = 0, pesoTotal = 0;
  for (const e of evals) {
    const p = num(e.peso), n = porcentaje(e.nota, e.max);
    if (p == null || p <= 0) continue;
    pesoTotal += p;
    if (n != null) { pesoEvaluado += p; puntos += p * n / 100; }
  }
  const restante = Math.max(0, 100 - pesoEvaluado);
  const r = { pesoTotal, pesoEvaluado, puntos, restante, promedio: null, necesita: null, estado: 'sin-datos' };
  if (pesoEvaluado > 0) r.promedio = puntos / pesoEvaluado * 100;
  if (pesoEvaluado === 0) return r;
  if (restante <= 0.0001) { r.estado = puntos >= notaMin ? 'aprobado' : 'reprobado'; return r; }
  r.necesita = (notaMin - puntos) / (restante / 100);
  r.estado = r.necesita <= 0 ? 'asegurado' : r.necesita > 100 ? 'no-alcanza' : 'falta';
  return r;
}
// Nota sobre un máximo ("18 de 20") → porcentaje (90). Sin máximo, la nota ya está sobre 100.
export function porcentaje(nota, max) {
  const n = num(nota), m = num(max) ?? 100;
  return n == null || !(m > 0) ? null : n / m * 100;
}
export const notaTexto = (nota, max) => (num(max) ?? 100) === 100 ? String(nota) : `${nota} de ${max}`;

// ---------- rubros de una materia (Parciales 40 %, Laboratorio 20 %…) ----------
// m.rubros = [{ id, nombre, peso, cantidad, items: [{ id, nombre, nota, max }] }]
// Las evaluaciones de la agenda entran en un rubro por e.rubroId ('' = en ninguno) o, si no se eligió,
// por su tipo (un parcial va a "Parciales"; si hay "Parcial 1", "Parcial 2"…, se reparten en orden de fecha).
export const RUBROS_SUGERIDOS = ['Parciales', 'Semestral', 'Laboratorio', 'Talleres', 'Tareas', 'Quices', 'Proyecto', 'Asistencia'];
const RUBRO_DE_TIPO = {
  parcial: /PARCIAL/, semestral: /SEMESTRAL|FINAL/, taller: /TALLER/, informe: /LAB/, quiz: /QUI[CZ]|PRUEBA/,
  tarea: /TAREA|ASIGNACION/, proyecto: /PROYECTO/,
};
const mayus = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
export function asignarRubros(m, evals) {
  const out = new Map();
  const rubros = m?.rubros || [];
  if (!rubros.length) return out;
  const propias = ordenarEvals(evals.filter(e => e.materiaId === m.id));
  const cuenta = {};
  for (const e of propias) {
    if (e.rubroId === '') continue;
    if (e.rubroId) { const r = rubros.find(x => x.id === e.rubroId); if (r) { out.set(e.id, r); continue; } }
    const re = RUBRO_DE_TIPO[e.tipo];
    if (!re) continue;
    const posibles = rubros.filter(r => re.test(mayus(r.nombre)));
    if (!posibles.length) continue;
    const k = cuenta[e.tipo] = (cuenta[e.tipo] ?? -1) + 1;
    out.set(e.id, posibles[Math.min(k, posibles.length - 1)]);
  }
  return out;
}
export function detalleRubros(m, evals) {
  const asig = asignarRubros(m, evals);
  const propias = ordenarEvals(evals.filter(e => e.materiaId === m.id));
  return (m?.rubros || []).map(r => {
    const enAgenda = propias.filter(e => asig.get(e.id)?.id === r.id).map(e => ({ tipo: 'eval', e, pct: porcentaje(e.nota, e.max) }));
    const sueltas = (r.items || []).map(it => ({ tipo: 'item', it, pct: porcentaje(it.nota, it.max) }));
    const notas = [...enAgenda, ...sueltas];
    const total = Math.max(Math.floor(num(r.cantidad) || 0), notas.length);
    const conNota = notas.filter(x => x.pct != null);
    const promedio = conNota.length ? conNota.reduce((a, x) => a + x.pct, 0) / conNota.length : null;
    return { r, notas, total, conNota: conNota.length, promedio };
  });
}
// Resumen de la materia: con rubros, cada rubro reparte su porcentaje en partes iguales entre sus notas
// (las que faltan cuentan como pendientes); sin rubros, se usa el porcentaje de cada evaluación.
export function resumenMateria(m, evals, notaMin = 71) {
  if (!m?.rubros?.length) return { ...resumenNotas(evals.filter(e => e.materiaId === m.id), notaMin), modo: 'simple' };
  const partes = [];
  for (const d of detalleRubros(m, evals)) {
    const peso = num(d.r.peso);
    if (peso == null || peso <= 0) continue;
    if (!d.total) { partes.push({ peso, nota: '' }); continue; }
    for (let k = 0; k < d.total; k++) partes.push({ peso: peso / d.total, nota: d.notas[k]?.pct ?? '' });
  }
  return { ...resumenNotas(partes, notaMin), modo: 'rubros' };
}
export function validarNota(nota, max) {
  const n = num(nota), m = num(max) ?? 100;
  if (String(nota ?? '').trim() === '') return '';
  if (n == null || n < 0) return 'La nota debe ser un número desde 0.';
  if (!(m > 0)) return 'El máximo debe ser mayor que 0.';
  if (n > m) return `La nota no puede pasar de ${m}.`;
  return '';
}

export const redondeo = (n, d = 1) => n == null ? '' : (Math.round(n * 10 ** d) / 10 ** d).toFixed(d).replace(/\.0+$/, '');

// ---------- archivo de calendario (.ics, RFC 5545) ----------
const TZID = 'America/Panama';
const VTIMEZONE = ['BEGIN:VTIMEZONE', `TZID:${TZID}`, 'BEGIN:STANDARD', 'DTSTART:19700101T000000',
  'TZOFFSETFROM:-0500', 'TZOFFSETTO:-0500', 'TZNAME:EST', 'END:STANDARD', 'END:VTIMEZONE'];

export const icsEscape = s => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
// Corta líneas a 75 octetos (UTF-8) sin partir caracteres; la continuación empieza con un espacio.
export function icsFold(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out = []; let cur = '', curLen = 0, limit = 75;
  for (const ch of line) {
    const l = enc.encode(ch).length;
    if (curLen + l > limit) { out.push(cur); cur = ' '; curLen = 1; limit = 75; }
    cur += ch; curLen += l;
  }
  out.push(cur);
  return out.join('\r\n');
}
const localStamp = (fecha, hm) => `${fecha.replace(/-/g, '')}T${hm.replace(':', '')}00`;
const utcStamp = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
export function trigger(min) {
  if (min % 1440 === 0) return `-P${min / 1440}D`;
  if (min % 60 === 0) return `-PT${min / 60}H`;
  return `-PT${min}M`;
}

function veventEval(e, materia, ajustes, stamp) {
  const titulo = tituloDe(e, materia);
  const ini = e.ini && validHM(e.ini) ? e.ini : '08:00';
  const fin = finDe({ ...e, ini });
  const desc = [];
  if (materia) desc.push(`${materia.nombre}${materia.docente ? ` (prof. ${materia.docente})` : ''}`);
  if (e.fechaTBD) desc.push('Fecha por confirmar.');
  if (e.horaTBD) desc.push('Hora por confirmar.');
  if (e.peso) desc.push(`Vale ${e.peso}%.`);
  if (e.notas) desc.push(e.notas);
  const L = ['BEGIN:VEVENT', `UID:${e.id}@cronograma`, `DTSTAMP:${stamp}`, `SEQUENCE:${e.seq || 0}`,
    `DTSTART;TZID=${TZID}:${localStamp(e.fecha, ini)}`,
    `DTEND;TZID=${TZID}:${localStamp(ymd(fin), hmDe(fin.getHours() * 60 + fin.getMinutes()))}`,
    `SUMMARY:${icsEscape(titulo)}`];
  if (e.aula) L.push(`LOCATION:${icsEscape('Aula ' + e.aula)}`);
  if (desc.length) L.push(`DESCRIPTION:${icsEscape(desc.join('\n'))}`);
  L.push(`CATEGORIES:${icsEscape(tipoDe(e).nombre)}`);
  // Primero 1 día y 2 h antes: algunos calendarios (p. ej. el de iPhone) pueden quedarse solo con los dos primeros.
  const avisos = avisosDe(e, ajustes).slice().sort((a, b) => a - b);
  const orden = [...avisos.filter(m => m >= 120 && m <= 1440).reverse(), ...avisos.filter(m => m < 120 || m > 1440)];
  for (const m of orden) {
    L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(`${titulo}: faltan ${avisoNombre(m)}`)}`, `TRIGGER:${trigger(m)}`, 'END:VALARM');
  }
  L.push('END:VEVENT');
  return L;
}

function veventClase(c, materia, ajustes, stamp, desde) {
  // primera fecha con ese día de la semana desde `desde`
  let d = startOfDay(desde);
  while (diaSemana(d) !== +c.dia) d = addDays(d, 1);
  const fin = parseYMD(ajustes.finClases);
  if (!fin || d > fin) return [];
  const until = utcStamp(new Date(fin.getFullYear(), fin.getMonth(), fin.getDate(), 23, 59, 59)); // en UTC, como exige RRULE con TZID
  const nombre = (materia?.nombre || 'Clase') + (c.tipo === 'lab' ? ' (laboratorio)' : '');
  const L = ['BEGIN:VEVENT', `UID:clase-${c.id}@cronograma`, `DTSTAMP:${stamp}`,
    `DTSTART;TZID=${TZID}:${localStamp(ymd(d), c.ini)}`, `DTEND;TZID=${TZID}:${localStamp(ymd(d), c.fin)}`,
    `RRULE:FREQ=WEEKLY;UNTIL=${until}`, `SUMMARY:${icsEscape(nombre)}`];
  if (c.aula) L.push(`LOCATION:${icsEscape('Aula ' + c.aula)}`);
  // Sin clases en feriados.
  const ex = [];
  for (let x = d; x <= fin; x = addDays(x, 7)) if (feriado(ymd(x))) ex.push(localStamp(ymd(x), c.ini));
  if (ex.length) L.push(`EXDATE;TZID=${TZID}:${ex.join(',')}`);
  const av = +ajustes.avisoClase || 0;
  if (av > 0) L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(`${nombre} en ${avisoNombre(av)}`)}`, `TRIGGER:${trigger(av)}`, 'END:VALARM');
  L.push('END:VEVENT');
  return L;
}

export function buildICS({ evals = [], clases = [], materias = [], ajustes = {}, now = new Date() }) {
  const mat = id => materias.find(m => m.id === id);
  const stamp = utcStamp(now);
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Cronograma//Planificador universitario//ES',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Universidad', `X-WR-TIMEZONE:${TZID}`, ...VTIMEZONE];
  for (const e of evals) L.push(...veventEval(e, mat(e.materiaId), ajustes, stamp));
  for (const c of clases) L.push(...veventClase(c, mat(c.materiaId), ajustes, stamp, now));
  L.push('END:VCALENDAR');
  return L.map(icsFold).join('\r\n') + '\r\n';
}

// Enlace "agregar evento" de Google Calendar (sirve en Android sin descargar nada).
export function googleCalURL(e, materia) {
  const ini = e.ini && validHM(e.ini) ? e.ini : '08:00';
  const fin = finDe({ ...e, ini });
  const f = (fecha, hm) => localStamp(fecha, hm);
  const details = [materia?.nombre, e.peso ? `Vale ${e.peso}%` : '', e.fechaTBD ? 'Fecha por confirmar' : '', e.horaTBD ? 'Hora por confirmar' : '', e.notas || '']
    .filter(Boolean).join('\n');
  const p = new URLSearchParams({
    action: 'TEMPLATE', text: tituloDe(e, materia),
    dates: `${f(e.fecha, ini)}/${f(ymd(fin), hmDe(fin.getHours() * 60 + fin.getMinutes()))}`,
    ctz: TZID, details, location: e.aula ? `Aula ${e.aula}` : '',
  });
  return `https://calendar.google.com/calendar/render?${p}`;
}

// ---------- validación del formulario ----------
export function validarEval(e, materias) {
  const err = {};
  if (!materias.some(m => m.id === e.materiaId)) err.materiaId = 'Elige una materia.';
  if (!TIPOS[e.tipo]) err.tipo = 'Elige un tipo.';
  if (!parseYMD(e.fecha)) err.fecha = 'Pon una fecha válida.';
  if (!validHM(e.ini)) err.ini = 'Pon la hora de inicio.';
  if (e.fin && !validHM(e.fin)) err.fin = 'Hora de fin no válida.';
  if (validHM(e.ini) && validHM(e.fin) && minutos(e.fin) <= minutos(e.ini)) err.fin = 'Debe terminar después de empezar.';
  if (e.peso !== '' && e.peso != null && (isNaN(+e.peso) || +e.peso < 0 || +e.peso > 100)) err.peso = 'Entre 0 y 100.';
  if (e.max !== '' && e.max != null && !(+e.max > 0)) err.max = 'El máximo debe ser mayor que 0.';
  else if (validarNota(e.nota, e.max)) err.nota = validarNota(e.nota, e.max);
  return err;
}
export function validarClase(c) {
  const err = {};
  if (!(+c.dia >= 1 && +c.dia <= 7)) err.dia = 'Elige el día.';
  if (!validHM(c.ini)) err.ini = 'Hora de inicio no válida.';
  if (!validHM(c.fin)) err.fin = 'Hora de fin no válida.';
  if (validHM(c.ini) && validHM(c.fin) && minutos(c.fin) <= minutos(c.ini)) err.fin = 'Debe terminar después de empezar.';
  return err;
}
