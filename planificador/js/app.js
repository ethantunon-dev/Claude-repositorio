// Cronograma: interfaz. Estado en localStorage, vistas Hoy / Agenda / Horario / Materias,
// hojas inferiores para ver y editar, avisos dentro de la app y exportación al calendario.
import * as L from './logic.js';
import { datosIniciales } from './seed.js';

const KEY = 'cronograma.v1';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tiene = v => v !== '' && v != null;
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

// Para probar con otra fecha: ?ahora=2026-11-20T09:00
const AHORA_FIJA = (() => { const p = new URLSearchParams(location.search).get('ahora'); const d = p ? new Date(p) : null; return d && !isNaN(d) ? d : null; })();
const H = hm => L.hora12(hm).replace(/ /g, '\u00a0');
const NOW = () => AHORA_FIJA ? new Date(AHORA_FIJA) : new Date();

// ---------- estado ----------
let S;
let guardadoOK = true;
function normalizar(d) {
  const base = datosIniciales();
  const arr = v => Array.isArray(v) ? v : [];
  return {
    ...base, ...d,
    materias: arr(d.materias), clases: arr(d.clases), evals: arr(d.evals),
    ajustes: { ...base.ajustes, ...(d.ajustes || {}) },
    mostrados: d.mostrados || {}, vistos: d.vistos || {},
  };
}
function cargar() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const d = JSON.parse(raw); if (d && d.version === 1) return normalizar(d); }
  } catch { /* sin almacenamiento: se usa memoria */ }
  return datosIniciales();
}
function guardar() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); guardadoOK = true; }
  catch { if (guardadoOK) toast('No se pudo guardar en este teléfono. Exporta una copia desde Ajustes.'); guardadoOK = false; }
}
function limpiarViejos() {
  const lim = Date.now() - 30 * 864e5;
  for (const k of ['mostrados', 'vistos']) for (const [key, ts] of Object.entries(S[k])) if (ts < lim) delete S[k][key];
}
const mat = id => S.materias.find(m => m.id === id);
const colorVar = m => `--m: var(--c-${m && L.COLORES.includes(m.color) ? m.color : 'pizarra'})`;

// ---------- íconos ----------
const I = {
  hoy: '<path d="M12 3l9 9-9 9-9-9z"/>',
  agenda: '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  horario: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 10h18M9 10v11M15 10v11"/>',
  materias: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5M19 19v2H6"/>',
  ajustes: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  mas: '<path d="M12 5v14M5 12h14"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  calOk: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M9 15.5l2 2 4-4"/>',
  calWarn: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M12 13v3M12 18.5h.01"/>',
  cerrar: '<path d="M6 6l12 12M18 6L6 18"/>',
  campana: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10.3 20a1.9 1.9 0 0 0 3.4 0"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  link: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
};
const icon = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${I[n]}</svg>`;

// ---------- utilidades de interfaz ----------
let toastT;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false; t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => { t.classList.remove('on'); setTimeout(() => { t.hidden = true; }, 250); }, 3200);
}
const sheet = () => $('#sheet');
function abrirHoja(html, onMount) {
  const d = sheet();
  $('#sheetBody').innerHTML = html;
  if (!d.open) d.showModal();
  $('#sheetBody').scrollTop = 0;
  onMount?.($('#sheetBody'));
}
function cerrarHoja() { if (sheet().open) sheet().close(); }

function estadoCal(e) {
  if (!e.calFirma) return 'no';
  return e.calFirma === L.firmaCal(e, S.ajustes) ? 'ok' : 'cambio';
}
function chipsEval(e) {
  const out = [];
  const fer = L.feriado(e.fecha);
  if (e.hecho) out.push('<span class="chip ok">Hecha</span>');
  if (e.fechaTBD) out.push('<span class="chip warn">Fecha por confirmar</span>');
  else if (e.horaTBD) out.push('<span class="chip warn">Hora por confirmar</span>');
  if (fer) out.push(`<span class="chip warn">Feriado</span>`);
  if (tiene(e.peso)) out.push(`<span class="chip">${esc(e.peso)}%</span>`);
  if (tiene(e.nota)) out.push(`<span class="chip">Nota ${esc(e.nota)}</span>`);
  return out.join('');
}
function filaEval(e, now) {
  const m = mat(e.materiaId);
  const ini = L.inicioDe(e);
  const pasada = !e.hecho && L.finDe(e) <= now;
  const cal = estadoCal(e);
  const calTxt = { no: 'Sin agregar al calendario', ok: 'En el calendario', cambio: 'Cambió después de agregarla al calendario' }[cal];
  return `<button type="button" class="ev ${L.ES_EXAMEN.has(e.tipo) ? 'examen' : ''} ${e.hecho ? 'hecha' : ''} ${pasada ? 'pasada' : ''}" data-ev="${esc(e.id)}" style="${colorVar(m)}">
    <span class="ev-dia"><b>${ini.getDate()}</b><small>${L.DIAS_CORTO[ini.getDay()]}</small></span>
    <span class="ev-main">
      <span class="ev-t"><i class="hito" aria-hidden="true"></i>${esc(L.tituloDe(e, m))}</span>
      <span class="ev-s">${H(e.ini)}${e.aula ? `, aula ${esc(e.aula)}` : ''} <span class="rel">${L.relativo(ini, now)}</span></span>
      ${chipsEval(e) ? `<span class="chips">${chipsEval(e)}</span>` : ''}
    </span>
    <span class="ev-cal cal-${cal}" title="${calTxt}"><span class="sr">${calTxt}</span>${icon(cal === 'ok' ? 'calOk' : cal === 'cambio' ? 'calWarn' : 'cal')}</span>
  </button>`;
}

// ---------- vista Hoy ----------
function textoCuenta(ms) {
  const c = L.cuentaRegresiva(ms);
  if (c.d > 0) return `<span class="n">${c.d}</span> <span class="u">${c.d === 1 ? 'día' : 'días'}</span> <span class="n">${c.h}</span> <span class="u">h</span>`;
  if (c.h > 0) return `<span class="n">${c.h}</span> <span class="u">h</span> <span class="n">${c.m}</span> <span class="u">min</span>`;
  return `<span class="n">${c.m}</span> <span class="u">min</span>`;
}

function heroHTML(now) {
  const e = L.proximoExamen(S.evals, now) || L.proximaEval(S.evals, now);
  if (!e) return `<section class="hero vacio"><p class="hero-t">No tienes exámenes ni entregas pendientes.</p><p class="muted">Toca <b>+</b> para agregar uno.</p></section>`;
  const m = mat(e.materiaId), ini = L.inicioDe(e), fin = L.finDe(e);
  const enCurso = ini <= now && now < fin;
  const fer = L.feriado(e.fecha);
  return `<section class="hero" style="${colorVar(m)}" aria-label="Próxima evaluación">
    <p class="hero-cuenta" id="heroCuenta">${enCurso ? '<span class="n">Ahora</span>' : textoCuenta(ini - now)}</p>
    <h2 class="hero-t"><i class="hito grande" aria-hidden="true"></i>${enCurso ? 'En curso: ' : 'para el '}${esc(L.tituloDe(e, m))}</h2>
    <p class="hero-cuando">${cap(L.fechaLarga(ini))}, ${H(e.ini)}${e.fin ? ` a ${H(e.fin)}` : ''}${e.aula ? `<br>Aula ${esc(e.aula)}` : ''}</p>
    ${e.fechaTBD || e.horaTBD || fer ? `<p class="hero-aviso">${[e.fechaTBD ? 'Fecha por confirmar' : e.horaTBD ? 'Hora por confirmar' : '', fer ? `Ese día es feriado (${esc(fer)})` : ''].filter(Boolean).join('. ')}</p>` : ''}
    <div class="hero-acc">
      <button type="button" class="btn primario" data-ics="${esc(e.id)}">${icon(estadoCal(e) === 'ok' ? 'calOk' : 'cal')}${estadoCal(e) === 'ok' ? 'Ya está en el calendario' : 'Agregar al calendario'}</button>
      <button type="button" class="btn suave" data-ev="${esc(e.id)}">Ver detalles</button>
    </div>
  </section>`;
}

function cronogramaHTML(now) {
  const hoy = L.startOfDay(now);
  const pend = L.ordenarEvals(S.evals.filter(e => !e.hecho && L.finDe(e) > now));
  // 5 semanas, o hasta el último examen pendiente (máximo 8 semanas)
  let n = 35;
  const ultimoEx = pend.filter(e => L.ES_EXAMEN.has(e.tipo)).map(e => L.diasEntre(hoy, L.inicioDe(e))).reduce((a, b) => Math.max(a, b), 0);
  if (ultimoEx + 3 > n) n = Math.min(56, ultimoEx + 3);
  const dias = [];
  for (let i = 0; i < n; i++) {
    const d = L.addDays(hoy, i), dow = d.getDay();
    const fer = L.feriado(L.ymd(d));
    // "hoy" el primer día; los lunes, el número (y el mes si es el primer lunes del mes); nada si choca con "hoy"
    let marca = '';
    if (i === 0) marca = 'hoy';
    else if (dow === 1 && i >= 3) marca = d.getDate() <= 7 ? `${d.getDate()} ${L.MESES_CORTO[d.getMonth()]}` : String(d.getDate());
    dias.push(`<span class="cd ${dow === 0 || dow === 6 ? 'fin' : ''} ${fer ? 'fer' : ''} ${i === 0 ? 'hoy' : ''}" title="${esc(L.fechaCorta(d) + (fer ? ', ' + fer : ''))}">${marca ? `<em>${marca}</em>` : ''}</span>`);
  }
  const usados = {};
  const hitos = pend.map(e => {
    const i = L.diasEntre(hoy, L.inicioDe(e));
    if (i < 0 || i >= n) return '';
    const ex = L.ES_EXAMEN.has(e.tipo), fila = ex ? 0 : 1;
    const k = `${i}|${fila}`; const apil = usados[k] = (usados[k] ?? -1) + 1;
    const m = mat(e.materiaId);
    return `<button type="button" class="hito-b ${ex ? 'ex' : ''} ${e.tipo === 'semestral' ? 'sem' : ''}" data-ev="${esc(e.id)}" style="${colorVar(m)}; --x:${(i + .5) / n * 100}%; --apil:${apil}" aria-label="${esc(L.tituloDe(e, m) + ', ' + L.fechaCorta(L.inicioDe(e)))}"><i></i></button>`;
  }).join('');
  // tramo de semestrales
  const sems = pend.filter(e => e.tipo === 'semestral').map(e => L.diasEntre(hoy, L.inicioDe(e))).filter(i => i >= 0 && i < n);
  const tramo = sems.length >= 2 ? `<span class="tramo" style="--a:${Math.min(...sems) / n * 100}%; --b:${(Math.max(...sems) + 1) / n * 100}%"><span>Semestrales</span></span>` : '';
  return `<section class="bloque plano" aria-label="Cronograma de las próximas semanas">
    <div class="bloque-h"><h3>Cronograma</h3><span class="muted small">${Math.round(n / 7)} semanas</span></div>
    <div class="crono" style="--n:${n}">
      ${tramo}
      <div class="crono-hitos">${hitos}</div>
      <div class="crono-dias">${dias.join('')}</div>
    </div>
    <p class="leyenda small muted"><span><i class="lg ex"></i>Examen</span><span><i class="lg"></i>Entrega</span><span><i class="lg fer"></i>Feriado</span></p>
  </section>`;
}

function filaClase(c, now, esHoy) {
  const m = mat(c.materiaId);
  const t = now.getHours() * 60 + now.getMinutes();
  const st = !esHoy ? '' : t >= L.minutos(c.fin) ? 'pasada' : t >= L.minutos(c.ini) ? 'ahora' : '';
  return `<li class="cl ${st}" style="${colorVar(m)}" data-mat="${esc(c.materiaId)}">
    <span class="cl-h">${H(c.ini)}<small>${H(c.fin)}</small></span>
    <span class="cl-m"><b>${esc(m?.corto || m?.nombre || 'Materia')}</b>${c.tipo === 'lab' ? ' <span class="chip">Lab</span>' : ''}${st === 'ahora' ? ' <span class="chip ahora">Ahora</span>' : ''}<small>Aula ${esc(c.aula || '—')}</small></span>
  </li>`;
}

function clasesHoyHTML(now) {
  const { hoy } = L.claseAhora(S.clases, now);
  const t = now.getHours() * 60 + now.getMinutes();
  const quedan = hoy.filter(c => L.minutos(c.fin) > t);
  if (hoy.length && quedan.length) {
    return `<section class="bloque"><div class="bloque-h"><h3>Clases de hoy</h3><span class="muted small">${hoy.length} ${hoy.length === 1 ? 'bloque' : 'bloques'}</span></div>
      <ul class="clases">${hoy.map(c => filaClase(c, now, true)).join('')}</ul></section>`;
  }
  const px = L.proximoDiaConClases(S.clases, now);
  const tit = hoy.length ? 'Ya no tienes más clases hoy' : 'Hoy no tienes clases';
  if (!px) return `<section class="bloque"><div class="bloque-h"><h3>${tit}</h3></div></section>`;
  const cuando = L.diasEntre(now, px.fecha) === 1 ? 'Mañana' : cap(L.fechaLarga(px.fecha));
  return `<section class="bloque"><div class="bloque-h"><h3>${tit}</h3><span class="muted small">${cuando}</span></div>
    <ul class="clases">${px.clases.map(c => filaClase(c, now, false)).join('')}</ul></section>`;
}

function avisosHTML(now) {
  const parts = [];
  const venc = L.avisosVencidos(S.evals, S.ajustes, now, S.vistos, 24 * 3600e3);
  // un aviso por evaluación (el más reciente)
  const porEval = new Map();
  for (const a of venc) porEval.set(a.e.id, a);
  for (const a of porEval.values()) {
    const m = mat(a.e.materiaId);
    const ini = L.inicioDe(a.e);
    parts.push(`<div class="aviso" style="${colorVar(m)}">${icon('campana')}<p><b>${esc(L.tituloDe(a.e, m))}</b> ${L.relativo(ini, now)}, ${H(a.e.ini)}</p>
      <button type="button" class="x" data-visto="${esc(a.e.id)}" aria-label="Cerrar aviso">${icon('cerrar')}</button></div>`);
  }
  return parts.join('');
}

function calBarHTML(now) {
  const sinCal = S.evals.filter(e => !e.hecho && L.finDe(e) > now && estadoCal(e) !== 'ok').length;
  if (!sinCal) return '';
  return `<section class="calbar" aria-label="Alarmas">
    <span class="calbar-ic">${icon('campana')}</span>
    <p><b>${sinCal === 1 ? '1 evaluación sin alarma' : `${sinCal} evaluaciones sin alarma`}</b><span>Agrégalas al calendario del teléfono para que suenen aunque la app esté cerrada.</span></p>
    <div class="calbar-acc"><button type="button" class="btn primario chico" data-accion="ics-todo">Agregar todo</button><button type="button" class="link" data-accion="como-alarmas">Cómo funciona</button></div>
  </section>`;
}

function proximosHTML(now) {
  const lim = L.addDays(L.startOfDay(now), 15);
  const lista = L.ordenarEvals(S.evals.filter(e => L.pendiente(e, now) && L.inicioDe(e) < lim));
  return `<section class="bloque"><div class="bloque-h"><h3>Próximos 14 días</h3><button type="button" class="link" data-ir="agenda">Ver todo</button></div>
    ${lista.length ? `<div class="evs">${lista.map(e => filaEval(e, now)).join('')}</div>` : '<p class="vacio-t">Nada en las próximas dos semanas.</p>'}</section>`;
}

function renderHoy() {
  const now = NOW();
  $('#v-hoy').innerHTML = avisosHTML(now) + heroHTML(now) + calBarHTML(now) + cronogramaHTML(now) + clasesHoyHTML(now) + proximosHTML(now);
}

// ---------- vista Agenda ----------
const filtro = { estado: 'pendientes', materia: '' };
function renderAgenda() {
  const now = NOW();
  let lista = S.evals.slice();
  if (filtro.materia) lista = lista.filter(e => e.materiaId === filtro.materia);
  const sinMarcar = L.ordenarEvals(lista.filter(e => !e.hecho && L.finDe(e) <= now));
  if (filtro.estado === 'pendientes') lista = lista.filter(e => L.pendiente(e, now));
  else if (filtro.estado === 'hechas') lista = lista.filter(e => e.hecho);
  lista = L.ordenarEvals(lista);
  if (filtro.estado === 'hechas') lista.reverse();

  const grupos = [];
  for (const e of lista) {
    const ini = L.inicioDe(e);
    const lunes = L.addDays(L.startOfDay(ini), -(L.diaSemana(ini) - 1));
    const k = L.ymd(lunes);
    let g = grupos[grupos.length - 1];
    if (!g || g.k !== k) grupos.push(g = { k, lunes, items: [] });
    g.items.push(e);
  }
  const nomSemana = lunes => {
    const dom = L.addDays(lunes, 6);
    const a = lunes.getMonth() === dom.getMonth() ? `${lunes.getDate()}` : `${lunes.getDate()} de ${L.MESES[lunes.getMonth()]}`;
    const actual = L.diasEntre(lunes, now) >= 0 && L.diasEntre(lunes, now) < 7;
    return `${actual ? 'Esta semana, ' : 'Semana del '}${a} al ${dom.getDate()} de ${L.MESES[dom.getMonth()]}`;
  };
  const seg = (v, t) => `<button type="button" role="tab" aria-selected="${filtro.estado === v}" data-filtro="${v}">${t}</button>`;
  $('#v-agenda').innerHTML = `
    <div class="filtros">
      <div class="seg" role="tablist" aria-label="Estado">${seg('pendientes', 'Pendientes')}${seg('hechas', 'Hechas')}${seg('todas', 'Todas')}</div>
      <label class="sel"><span class="sr">Materia</span><select id="filtroMateria"><option value="">Todas las materias</option>${S.materias.map(m => `<option value="${esc(m.id)}" ${filtro.materia === m.id ? 'selected' : ''}>${esc(m.corto || m.nombre)}</option>`).join('')}</select></label>
    </div>
    ${filtro.estado === 'pendientes' && sinMarcar.length ? `<section class="bloque"><div class="bloque-h"><h3>Ya pasaron</h3><span class="muted small">Márcalas como hechas o cambia la fecha</span></div><div class="evs">${sinMarcar.map(e => filaEval(e, now)).join('')}</div></section>` : ''}
    ${grupos.length ? grupos.map(g => `<section class="bloque"><div class="bloque-h"><h3>${nomSemana(g.lunes)}</h3><span class="muted small">${g.items.length}</span></div><div class="evs">${g.items.map(e => filaEval(e, now)).join('')}</div></section>`).join('')
      : `<div class="vacio-g"><p class="vacio-t">${filtro.estado === 'hechas' ? 'Todavía no has marcado nada como hecho.' : 'No hay evaluaciones pendientes.'}</p><button type="button" class="btn primario" data-accion="nueva">${icon('mas')}Agregar evaluación</button></div>`}`;
}

// ---------- vista Horario ----------
function renderHorario() {
  const now = NOW();
  const diasCon = new Set(S.clases.map(c => +c.dia));
  const dias = [1, 2, 3, 4, 5, ...(diasCon.has(6) ? [6] : []), ...(diasCon.has(7) ? [7] : [])];
  const valid = S.clases.filter(c => L.validHM(c.ini) && L.validHM(c.fin));
  const desde = valid.length ? Math.floor(Math.min(...valid.map(c => L.minutos(c.ini))) / 60) * 60 : 7 * 60;
  const hasta = valid.length ? Math.ceil(Math.max(...valid.map(c => L.minutos(c.fin))) / 60) * 60 : 17 * 60;
  const K = 1.15; // px por minuto
  const alto = (hasta - desde) * K;
  const hoyDia = L.diaSemana(now);
  const lunes = L.addDays(L.startOfDay(now), -(hoyDia - 1));
  const tNow = now.getHours() * 60 + now.getMinutes();
  let horas = '';
  for (let m = desde; m <= hasta; m += 60) horas += `<span style="top:${(m - desde) * K}px">${((m / 60) % 12) || 12}</span>`;
  let total = 0;
  const cols = dias.map(d => {
    const bloques = L.unirBloques(L.clasesDelDia(valid, d));
    bloques.forEach(b => { total += L.minutos(b.fin) - L.minutos(b.ini); });
    const fecha = L.addDays(lunes, d - 1);
    const fer = L.feriado(L.ymd(fecha));
    const html = bloques.map(b => {
      const m = mat(b.materiaId);
      const top = (L.minutos(b.ini) - desde) * K, h = (L.minutos(b.fin) - L.minutos(b.ini)) * K;
      return `<button type="button" class="hz-b ${b.tipo === 'lab' ? 'lab' : ''}" data-mat="${esc(b.materiaId)}" style="${colorVar(m)}; top:${top}px; height:${h}px" aria-label="${esc(`${m?.nombre || ''}, ${L.DIAS[d % 7]} ${H(b.ini)} a ${H(b.fin)}, aula ${b.aula || ''}`)}">
        <b>${esc(m?.corto || m?.nombre || '')}</b>${h > 46 ? `<small>${esc(b.aula || '')}${b.tipo === 'lab' ? ' · Lab' : ''}</small>` : ''}${h > 70 ? `<small>${L.hora12(b.ini).replace(/ [ap]\. m\./, '')}–${L.hora12(b.fin).replace(/ [ap]\. m\./, '')}</small>` : ''}</button>`;
    }).join('');
    const linea = d === hoyDia && tNow >= desde && tNow <= hasta ? `<i class="hz-ahora" style="top:${(tNow - desde) * K}px"></i>` : '';
    return `<div class="hz-col ${d === hoyDia ? 'hoy' : ''}">${html}${!bloques.length ? `<span class="hz-libre">${fer ? 'Feriado' : 'Libre'}</span>` : ''}${linea}</div>`;
  }).join('');
  const head = dias.map(d => { const f = L.addDays(lunes, d - 1); return `<span class="${d === hoyDia ? 'hoy' : ''}">${cap(L.DIAS_CORTO[d % 7])}<small>${f.getDate()}</small></span>`; }).join('');
  const fin = L.parseYMD(S.ajustes.finClases);
  $('#v-horario').innerHTML = `
    <div class="hz" style="--cols:${dias.length}">
      <div class="hz-head"><span></span>${head}</div>
      <div class="hz-body" style="height:${alto}px"><div class="hz-ejes">${horas}</div>${cols}</div>
    </div>
    <p class="small muted hz-tot">${Math.floor(total / 60)} h ${total % 60 ? `${total % 60} min ` : ''}de clase a la semana. Toca una clase para ver la materia.</p>
    <section class="bloque">
      <div class="bloque-h"><h3>Avisos de clase</h3></div>
      <p class="small">Agrega tu horario al calendario del teléfono y te avisa ${+S.ajustes.avisoClase ? `${L.avisoNombre(+S.ajustes.avisoClase)} antes` : 'sin alarma'} de cada clase. Se repite cada semana hasta el ${fin ? L.fechaLarga(fin) : 'fin de clases'} y salta los feriados.</p>
      <div class="fila-btn"><button type="button" class="btn" data-accion="ics-horario">${icon('cal')}Agregar horario al calendario</button><button type="button" class="btn" data-accion="ajustes">Cambiar fecha o aviso</button></div>
    </section>`;
}

// ---------- vista Materias ----------
function renderMaterias() {
  const now = NOW();
  const aj = S.ajustes;
  $('#v-materias').innerHTML = `<div class="mats">${S.materias.map(m => {
    const evs = S.evals.filter(e => e.materiaId === m.id);
    const sem = L.ordenarEvals(evs.filter(e => e.tipo === 'semestral'))[0];
    const r = L.resumenNotas(evs, +aj.notaMin || 71);
    const pend = evs.filter(e => L.pendiente(e, now)).length;
    let nota = 'Sin notas todavía. Toca para anotar pesos y notas.';
    if (r.promedio != null) {
      nota = `Promedio ${L.redondeo(r.promedio)} (${L.letra(r.promedio)}) con ${L.redondeo(r.pesoEvaluado)}% evaluado. `;
      nota += { asegurado: `Ya tienes el ${aj.notaMin} asegurado.`, falta: `Necesitas ${L.redondeo(r.necesita)} en el ${L.redondeo(r.restante)}% que falta.`, 'no-alcanza': `Aunque saques 100 en lo que falta, no llegas a ${aj.notaMin}.`, aprobado: 'Nota final aprobada.', reprobado: 'Nota final por debajo del mínimo.' }[r.estado] || '';
    }
    return `<button type="button" class="mat" data-mat="${esc(m.id)}" style="${colorVar(m)}">
      <span class="mat-h"><i class="hito grande" aria-hidden="true"></i><b>${esc(m.nombre)}</b></span>
      <span class="mat-d small muted">${[m.codigo ? `Código ${esc(m.codigo)}` : '', m.docente ? `Prof. ${esc(m.docente)}` : ''].filter(Boolean).join(', ')}</span>
      ${sem ? `<span class="mat-sem">Semestral ${L.fechaCorta(L.inicioDe(sem))}${sem.hecho ? ', hecho' : `, ${L.relativo(L.inicioDe(sem), now)}`}</span>` : ''}
      <span class="small">${pend ? `${pend} pendiente${pend === 1 ? '' : 's'}. ` : ''}${nota}</span>
    </button>`;
  }).join('')}</div>
  <div class="fila-btn"><button type="button" class="btn" data-accion="nueva-materia">${icon('mas')}Agregar materia</button></div>`;
}

// ---------- hojas: evaluación ----------
function hojaEval(id) {
  const e = S.evals.find(x => x.id === id);
  if (!e) return;
  const now = NOW();
  const m = mat(e.materiaId), ini = L.inicioDe(e), fer = L.feriado(e.fecha);
  const cal = estadoCal(e);
  abrirHoja(`
    <div class="hoja-h" style="${colorVar(m)}">
      <div><p class="small muted">${esc(L.tipoDe(e).nombre)}${m ? ` de ${esc(m.nombre)}` : ''}</p><h2><i class="hito grande" aria-hidden="true"></i>${esc(L.tituloDe(e, m))}</h2></div>
      <button type="button" class="x" data-cerrar aria-label="Cerrar">${icon('cerrar')}</button>
    </div>
    <dl class="datos">
      <div><dt>Cuándo</dt><dd>${cap(L.fechaLarga(ini))}, ${H(e.ini)}${e.fin ? ` a ${H(e.fin)}` : ''} <span class="muted">(${L.relativo(ini, now)})</span></dd></div>
      ${e.aula ? `<div><dt>Aula</dt><dd>${esc(e.aula)}</dd></div>` : ''}
      ${m?.docente ? `<div><dt>Profesor</dt><dd>${esc(m.docente)}</dd></div>` : ''}
      ${tiene(e.peso) ? `<div><dt>Vale</dt><dd>${esc(e.peso)}%</dd></div>` : ''}
      ${tiene(e.nota) ? `<div><dt>Nota</dt><dd>${esc(e.nota)} (${L.letra(+e.nota)})</dd></div>` : ''}
      <div><dt>Avisos</dt><dd>${L.avisosDe(e, S.ajustes).slice().sort((a, b) => b - a).map(L.avisoNombre).join(', ') || 'Ninguno'} antes</dd></div>
    </dl>
    ${e.fechaTBD || e.horaTBD || fer ? `<p class="nota-warn">${[e.fechaTBD ? 'La fecha está por confirmar.' : '', e.horaTBD ? 'La hora está por confirmar.' : '', fer ? `El ${L.fechaLarga(ini)} es feriado: ${esc(fer)}.` : ''].filter(Boolean).join(' ')}</p>` : ''}
    ${e.notas ? `<p class="notas">${esc(e.notas)}</p>` : ''}
    <div class="grupo-btn">
      <button type="button" class="btn primario ancho" data-ics="${esc(e.id)}">${icon(cal === 'ok' ? 'calOk' : 'cal')}${cal === 'ok' ? 'Volver a agregar al calendario' : cal === 'cambio' ? 'Actualizar en el calendario' : 'Agregar al calendario del teléfono'}</button>
      <a class="btn ancho" href="${esc(L.googleCalURL(e, m))}" target="_blank" rel="noopener" data-gcal="${esc(e.id)}">${icon('link')}Abrir en Google Calendar</a>
      ${cal === 'cambio' ? '<p class="small muted">La cambiaste después de agregarla. Agrégala otra vez y borra la versión vieja del calendario.</p>' : ''}
    </div>
    <div class="fila-btn">
      <button type="button" class="btn" data-hecho="${esc(e.id)}">${icon('check')}${e.hecho ? 'Marcar como pendiente' : 'Marcar como hecha'}</button>
      <button type="button" class="btn" data-editar="${esc(e.id)}">Editar</button>
      <span class="confirmar" data-confirmar><button type="button" class="btn peligro" data-pedir-borrar>Eliminar</button></span>
    </div>`, root => {
    $('[data-pedir-borrar]', root).onclick = () => {
      $('[data-confirmar]', root).innerHTML = `<span class="small">¿Eliminar?</span><button type="button" class="btn peligro" data-borrar="${esc(e.id)}">Sí, eliminar</button><button type="button" class="btn" data-no-borrar>No</button>`;
      $('[data-no-borrar]', root).onclick = () => hojaEval(e.id);
    };
  });
}

function avisosChips(sel, nombre = 'avisos') {
  return `<div class="chips-sel" role="group">${L.AVISOS.map(([m, t]) => `<label class="chipsel"><input type="checkbox" name="${nombre}" value="${m}" ${sel.includes(m) ? 'checked' : ''}><span>${t}</span></label>`).join('')}</div>`;
}

function claseDe(materiaId, fecha) {
  const d = L.parseYMD(fecha);
  if (!d) return null;
  return L.unirBloques(L.clasesDelDia(S.clases.filter(c => c.materiaId === materiaId), L.diaSemana(d)))[0] || null;
}
function proximaClaseDe(materiaId, now) {
  for (let i = 1; i <= 14; i++) {
    const f = L.ymd(L.addDays(L.startOfDay(now), i));
    const c = claseDe(materiaId, f);
    if (c) return { fecha: f, c };
  }
  return null;
}

function hojaFormEval(id) {
  if (!S.materias.length) { toast('Primero agrega una materia.'); hojaMateria(null); return; }
  const now = NOW();
  const existente = id ? S.evals.find(x => x.id === id) : null;
  let e;
  if (existente) e = { ...existente };
  else {
    const { actual, siguiente } = L.claseAhora(S.clases, now);
    const materiaId = (actual || siguiente)?.materiaId || S.materias[0]?.id || '';
    const px = materiaId ? proximaClaseDe(materiaId, now) : null;
    e = { id: '', materiaId, tipo: 'tarea', titulo: '', fecha: px?.fecha || L.ymd(L.addDays(now, 7)), ini: px?.c.ini || '08:00', fin: '', aula: px?.c.aula || '', peso: '', nota: '', notas: '', hecho: false, fechaTBD: false, horaTBD: false, avisos: null, seq: 0 };
  }
  const avisosSel = L.avisosDe(e, S.ajustes);
  const opt = (v, t, s) => `<option value="${esc(v)}" ${v === s ? 'selected' : ''}>${esc(t)}</option>`;
  abrirHoja(`
    <div class="hoja-h"><h2>${existente ? 'Editar evaluación' : 'Nueva evaluación'}</h2><button type="button" class="x" data-cerrar aria-label="Cerrar">${icon('cerrar')}</button></div>
    <form id="fEval" class="form" novalidate>
      <div class="dos">
        <label>Materia<select name="materiaId" id="fe-materia">${S.materias.map(m => opt(m.id, m.corto || m.nombre, e.materiaId)).join('')}</select></label>
        <label>Tipo<select name="tipo" id="fe-tipo">${Object.entries(L.TIPOS).map(([k, t]) => opt(k, t.nombre, e.tipo)).join('')}</select></label>
      </div>
      <label><span>Título <span class="muted">(opcional)</span></span><input name="titulo" id="fe-titulo" maxlength="80" value="${esc(e.titulo)}" placeholder="${esc(L.tituloDe({ ...e, titulo: '' }, mat(e.materiaId)))}"></label>
      <div class="dos">
        <label>Fecha<input type="date" name="fecha" id="fe-fecha" value="${esc(e.fecha)}" required></label>
        <label class="check"><input type="checkbox" name="fechaTBD" id="fe-ftbd" ${e.fechaTBD ? 'checked' : ''}><span>Fecha por confirmar</span></label>
      </div>
      <p class="campo-info small" id="fe-fer" hidden></p>
      <div class="tres">
        <label>Empieza<input type="time" name="ini" id="fe-ini" value="${esc(e.ini)}" required></label>
        <label>Termina<input type="time" name="fin" id="fe-fin" value="${esc(e.fin)}"></label>
        <label>Aula<input name="aula" id="fe-aula" maxlength="20" value="${esc(e.aula)}" autocomplete="off"></label>
      </div>
      <label class="check"><input type="checkbox" name="horaTBD" id="fe-htbd" ${e.horaTBD ? 'checked' : ''}><span>Hora por confirmar</span></label>
      <fieldset><legend>Avisar antes</legend>${avisosChips(avisosSel)}</fieldset>
      <div class="dos">
        <label>Vale (%)<input type="number" name="peso" id="fe-peso" min="0" max="100" step="0.5" inputmode="decimal" value="${esc(e.peso)}"></label>
        <label>Nota obtenida<input type="number" name="nota" id="fe-nota" min="0" max="100" step="0.1" inputmode="decimal" value="${esc(e.nota)}"></label>
      </div>
      <label>Notas<textarea name="notas" id="fe-notas" rows="3" maxlength="1000" placeholder="Temas, capítulos, qué llevar…">${esc(e.notas)}</textarea></label>
      <p class="form-err" id="fe-err" role="alert" hidden></p>
      <div class="fila-btn fin"><button type="button" class="btn" data-cerrar>Cancelar</button><button type="submit" class="btn primario">${existente ? 'Guardar cambios' : 'Agregar'}</button></div>
    </form>`, root => {
    const f = $('#fEval', root);
    let tocado = !!existente; // en una nueva, la hora y el aula se rellenan con la clase de ese día hasta que el usuario las cambie
    const rellenar = () => {
      if (tocado) return;
      const c = claseDe(f.materiaId.value, f.fecha.value);
      if (c) { f.ini.value = c.ini; f.aula.value = c.aula || ''; f.fin.value = L.ES_EXAMEN.has(f.tipo.value) ? c.fin : ''; }
    };
    const actualizar = () => {
      f.titulo.placeholder = L.tituloDe({ tipo: f.tipo.value, titulo: '' }, mat(f.materiaId.value));
      const fer = L.feriado(f.fecha.value);
      const info = $('#fe-fer', root);
      info.hidden = !fer; info.textContent = fer ? `Ese día es feriado: ${fer}.` : '';
    };
    const tipoPrev = { v: f.tipo.value };
    f.tipo.onchange = () => {
      // si los avisos eran los del tipo anterior, pasar a los del nuevo tipo
      const marcados = $$('input[name=avisos]:checked', f).map(i => +i.value).sort((a, b) => a - b).join(',');
      const antes = (S.ajustes.avisosPorTipo?.[tipoPrev.v] ?? L.TIPOS[tipoPrev.v].avisos).slice().sort((a, b) => a - b).join(',');
      if (marcados === antes) {
        const nuevos = S.ajustes.avisosPorTipo?.[f.tipo.value] ?? L.TIPOS[f.tipo.value].avisos;
        $$('input[name=avisos]', f).forEach(i => { i.checked = nuevos.includes(+i.value); });
      }
      tipoPrev.v = f.tipo.value;
      rellenar(); actualizar();
    };
    f.materiaId.onchange = () => {
      if (!tocado) { const px = proximaClaseDe(f.materiaId.value, NOW()); if (px) f.fecha.value = px.fecha; }
      rellenar(); actualizar();
    };
    f.fecha.onchange = () => { rellenar(); actualizar(); };
    ['ini', 'fin', 'aula'].forEach(n => f[n].addEventListener('input', () => { tocado = true; }));
    actualizar();
    f.onsubmit = ev => {
      ev.preventDefault();
      const nuevo = {
        ...e,
        materiaId: f.materiaId.value, tipo: f.tipo.value, titulo: f.titulo.value.trim(), fecha: f.fecha.value,
        ini: f.ini.value, fin: f.fin.value, aula: f.aula.value.trim(), peso: f.peso.value.trim(), nota: f.nota.value.trim(),
        notas: f.notas.value.trim(), fechaTBD: f.fechaTBD.checked, horaTBD: f.horaTBD.checked,
      };
      const marcados = $$('input[name=avisos]:checked', f).map(i => +i.value);
      const porTipo = S.ajustes.avisosPorTipo?.[nuevo.tipo] ?? L.TIPOS[nuevo.tipo]?.avisos ?? [];
      const igual = marcados.slice().sort((a, b) => a - b).join(',') === porTipo.slice().sort((a, b) => a - b).join(',');
      nuevo.avisos = igual ? null : marcados;
      const err = L.validarEval(nuevo, S.materias);
      $$('.inv', f).forEach(x => x.classList.remove('inv'));
      const errEl = $('#fe-err', root);
      if (Object.keys(err).length) {
        for (const k of Object.keys(err)) f[k]?.classList.add('inv');
        errEl.textContent = Object.values(err).join(' '); errEl.hidden = false;
        f[Object.keys(err)[0]]?.focus();
        return;
      }
      if (existente) {
        if (existente.calFirma && L.firmaCal(existente, S.ajustes) !== L.firmaCal(nuevo, S.ajustes)) nuevo.seq = (existente.seq || 0) + 1;
        Object.assign(existente, nuevo);
        // si se cambió la fecha u hora, los avisos de pantalla vuelven a valer
      } else {
        nuevo.id = uid();
        S.evals.push(nuevo);
      }
      guardar(); renderTodo();
      toast(existente ? 'Cambios guardados' : 'Evaluación agregada');
      hojaEval(existente ? existente.id : nuevo.id);
    };
  });
}

// ---------- hojas: materia ----------
function hojaMateria(id) {
  const existente = id ? mat(id) : null;
  const m = existente ? { ...existente } : { id: '', nombre: '', corto: '', codigo: '', docente: '', color: L.COLORES.find(c => !S.materias.some(x => x.color === c)) || 'azul' };
  const evs = existente ? L.ordenarEvals(S.evals.filter(e => e.materiaId === m.id)) : [];
  const clases = existente ? S.clases.filter(c => c.materiaId === m.id).sort((a, b) => (a.dia - b.dia) || (L.minutos(a.ini) - L.minutos(b.ini))) : [];
  const notaMin = +S.ajustes.notaMin || 71;
  const resumen = () => {
    const r = L.resumenNotas(S.evals.filter(e => e.materiaId === m.id), notaMin);
    if (r.promedio == null) return 'Anota cuánto vale cada evaluación y la nota que sacaste para ver tu promedio y cuánto necesitas.';
    let t = `Promedio ${L.redondeo(r.promedio)} (${L.letra(r.promedio)}) con ${L.redondeo(r.pesoEvaluado)}% evaluado; llevas ${L.redondeo(r.puntos)} de ${notaMin} puntos. `;
    t += { asegurado: `Ya tienes el ${notaMin} asegurado.`, falta: `Necesitas un promedio de ${L.redondeo(r.necesita)} en el ${L.redondeo(r.restante)}% restante.`, 'no-alcanza': `Necesitarías ${L.redondeo(r.necesita)} en lo que falta: no alcanza.`, aprobado: `Nota final ${L.redondeo(r.puntos)}: aprobada.`, reprobado: `Nota final ${L.redondeo(r.puntos)}: por debajo de ${notaMin}.` }[r.estado] || '';
    if (Math.abs(r.pesoTotal - 100) > 0.01) t += ` Ojo: los pesos que anotaste suman ${L.redondeo(r.pesoTotal)}%.`;
    return t;
  };
  const diasOpt = [1, 2, 3, 4, 5, 6, 7].map(d => `<option value="${d}">${cap(L.DIAS[d % 7])}</option>`).join('');
  abrirHoja(`
    <div class="hoja-h" style="${colorVar(m)}"><h2>${existente ? `<i class="hito grande" aria-hidden="true"></i>${esc(m.nombre)}` : 'Nueva materia'}</h2><button type="button" class="x" data-cerrar aria-label="Cerrar">${icon('cerrar')}</button></div>
    ${existente ? `<section class="sub"><h3>Notas</h3>
      ${evs.length ? `<div class="tabla-notas" role="table" aria-label="Notas">
        <div class="tn-h" role="row"><span role="columnheader">Evaluación</span><span role="columnheader">Vale %</span><span role="columnheader">Nota</span></div>
        ${evs.map(e => `<div class="tn-f" role="row"><span role="cell">${esc(L.tituloDe(e, m))}<small>${L.fechaCorta(L.inicioDe(e))}</small></span>
          <span role="cell"><input type="number" min="0" max="100" step="0.5" inputmode="decimal" aria-label="Peso de ${esc(L.tituloDe(e, m))}" data-peso="${esc(e.id)}" value="${esc(e.peso)}"></span>
          <span role="cell"><input type="number" min="0" max="100" step="0.1" inputmode="decimal" aria-label="Nota de ${esc(L.tituloDe(e, m))}" data-nota="${esc(e.id)}" value="${esc(e.nota)}"></span></div>`).join('')}
      </div>` : '<p class="small muted">Esta materia no tiene evaluaciones todavía.</p>'}
      <p class="resumen-notas" id="resNotas">${esc(resumen())}</p>
      <p class="small muted">Escala: A 91–100, B 81–90, C 71–80, D 61–70, F 0–60. Nota mínima ${notaMin} (se cambia en Ajustes).</p>
    </section>` : ''}
    <form id="fMat" class="form sub" novalidate>
      <h3>Datos</h3>
      <label>Nombre<input name="nombre" id="fm-nombre" maxlength="80" value="${esc(m.nombre)}" required></label>
      <div class="dos">
        <label>Nombre corto<input name="corto" id="fm-corto" maxlength="18" value="${esc(m.corto)}" placeholder="Para el horario"></label>
        <label>Código<input name="codigo" id="fm-codigo" maxlength="10" value="${esc(m.codigo)}" inputmode="numeric"></label>
      </div>
      <label>Profesor<input name="docente" id="fm-docente" maxlength="60" value="${esc(m.docente)}"></label>
      <fieldset><legend>Color</legend><div class="colores">${L.COLORES.map(c => `<label class="color" style="--m: var(--c-${c})"><input type="radio" name="color" value="${c}" ${m.color === c ? 'checked' : ''}><span class="sr">${c}</span></label>`).join('')}</div></fieldset>
      <p class="form-err" id="fm-err" role="alert" hidden></p>
      <div class="fila-btn fin">${existente ? '' : '<button type="button" class="btn" data-cerrar>Cancelar</button>'}<button type="submit" class="btn primario">${existente ? 'Guardar datos' : 'Agregar materia'}</button></div>
    </form>
    ${existente ? `<section class="sub"><h3>Clases</h3>
      <ul class="clases editables">${clases.map(c => `<li class="cl" style="${colorVar(m)}"><span class="cl-h">${cap(L.DIAS_CORTO[c.dia % 7])}<small>${H(c.ini)}–${H(c.fin)}</small></span><span class="cl-m"><b>Aula ${esc(c.aula || '—')}</b>${c.tipo === 'lab' ? ' <span class="chip">Lab</span>' : ''}${c.grupo ? ` <span class="chip">Grupo ${esc(c.grupo)}</span>` : ''}</span><button type="button" class="x" data-borrar-clase="${esc(c.id)}" aria-label="Quitar clase del ${L.DIAS[c.dia % 7]} ${H(c.ini)}">${icon('cerrar')}</button></li>`).join('') || '<li class="small muted">Sin clases.</li>'}</ul>
      <form id="fClase" class="form compacto" novalidate>
        <div class="tres"><label>Día<select name="dia" id="fc-dia">${diasOpt}</select></label><label>Empieza<input type="time" name="ini" id="fc-ini" value="07:00"></label><label>Termina<input type="time" name="fin" id="fc-fin" value="08:30"></label></div>
        <div class="tres"><label>Aula<input name="aula" id="fc-aula" maxlength="20"></label><label>Tipo<select name="tipo" id="fc-tipo"><option value="teoria">Clase</option><option value="lab">Laboratorio</option></select></label><label>Grupo<input name="grupo" id="fc-grupo" maxlength="6"></label></div>
        <p class="form-err" id="fc-err" role="alert" hidden></p>
        <button type="submit" class="btn">${icon('mas')}Agregar clase</button>
      </form>
    </section>
    <section class="sub"><span class="confirmar" data-confirmar><button type="button" class="btn peligro" data-pedir-borrar>Eliminar materia</button></span></section>` : ''}
  `, root => {
    const f = $('#fMat', root);
    f.onsubmit = ev => {
      ev.preventDefault();
      const nombre = f.nombre.value.trim();
      if (!nombre) { const er = $('#fm-err', root); er.textContent = 'Ponle nombre a la materia.'; er.hidden = false; f.nombre.classList.add('inv'); f.nombre.focus(); return; }
      const datos = { nombre, corto: f.corto.value.trim(), codigo: f.codigo.value.trim(), docente: f.docente.value.trim(), color: (f.querySelector('input[name=color]:checked') || {}).value || 'azul' };
      if (existente) { Object.assign(existente, datos); toast('Materia guardada'); guardar(); renderTodo(); hojaMateria(existente.id); }
      else { const nm = { id: uid(), ...datos }; S.materias.push(nm); toast('Materia agregada. Ahora agrega sus clases.'); guardar(); renderTodo(); hojaMateria(nm.id); }
    };
    if (!existente) return;
    $$('[data-peso],[data-nota]', root).forEach(inp => {
      inp.addEventListener('change', () => {
        const k = inp.dataset.peso ? 'peso' : 'nota';
        const e = S.evals.find(x => x.id === (inp.dataset.peso || inp.dataset.nota));
        const v = inp.value.trim();
        if (v !== '' && (isNaN(+v) || +v < 0 || +v > 100)) { inp.classList.add('inv'); toast('Pon un número entre 0 y 100.'); return; }
        inp.classList.remove('inv');
        e[k] = v; guardar(); renderTodo();
        $('#resNotas', root).textContent = resumen();
      });
    });
    const fc = $('#fClase', root);
    fc.onsubmit = ev => {
      ev.preventDefault();
      const c = { id: uid(), materiaId: m.id, dia: +fc.dia.value, ini: fc.ini.value, fin: fc.fin.value, aula: fc.aula.value.trim(), tipo: fc.tipo.value, grupo: fc.grupo.value.trim() };
      const err = L.validarClase(c);
      if (Object.keys(err).length) { const er = $('#fc-err', root); er.textContent = Object.values(err).join(' '); er.hidden = false; return; }
      S.clases.push(c); guardar(); renderTodo(); toast('Clase agregada'); hojaMateria(m.id);
    };
    $$('[data-borrar-clase]', root).forEach(b => b.onclick = () => {
      S.clases = S.clases.filter(c => c.id !== b.dataset.borrarClase); guardar(); renderTodo(); toast('Clase quitada'); hojaMateria(m.id);
    });
    $('[data-pedir-borrar]', root).onclick = () => {
      const n = S.evals.filter(e => e.materiaId === m.id).length;
      $('[data-confirmar]', root).innerHTML = `<span class="small">Se borran también ${n} evaluaci${n === 1 ? 'ón' : 'ones'} y sus clases.</span><button type="button" class="btn peligro" data-si>Sí, eliminar</button><button type="button" class="btn" data-no>No</button>`;
      $('[data-no]', root).onclick = () => hojaMateria(m.id);
      $('[data-si]', root).onclick = () => {
        S.materias = S.materias.filter(x => x.id !== m.id);
        S.clases = S.clases.filter(c => c.materiaId !== m.id);
        S.evals = S.evals.filter(e => e.materiaId !== m.id);
        guardar(); renderTodo(); cerrarHoja(); toast('Materia eliminada');
      };
    };
  });
}

// ---------- hojas: ajustes y ayuda ----------
function hojaAjustes() {
  const aj = S.ajustes;
  const perm = 'Notification' in window ? Notification.permission : 'no';
  const estNotif = { granted: 'Activados', denied: 'Bloqueados en el navegador', default: 'Sin activar', no: 'Este navegador no los permite' }[perm];
  abrirHoja(`
    <div class="hoja-h"><h2>Ajustes</h2><button type="button" class="x" data-cerrar aria-label="Cerrar">${icon('cerrar')}</button></div>
    <section class="sub">
      <h3>Alarmas</h3>
      <p class="small">Las alarmas que suenan con el teléfono bloqueado son las del calendario del teléfono. Agrega tus evaluaciones y tu horario ahí.</p>
      <div class="grupo-btn">
        <button type="button" class="btn primario ancho" data-accion="ics-todo">${icon('cal')}Agregar todas las pendientes al calendario</button>
        <button type="button" class="btn ancho" data-accion="ics-horario">${icon('cal')}Agregar horario de clases al calendario</button>
        <button type="button" class="btn ancho" data-accion="como-alarmas">Cómo funcionan las alarmas</button>
      </div>
      <div class="fila-dato"><span>Instalar en el celular<small class="muted">${instalada() ? 'Ya está instalada' : 'Ícono en la pantalla de inicio y uso sin internet'}</small></span>${instalada() ? '' : '<button type="button" class="btn chico" data-accion="instalar">Instalar</button>'}</div>
      <div class="fila-dato"><span>Avisos dentro de la app<small class="muted">${estNotif}</small></span>${perm === 'default' ? '<button type="button" class="btn chico" data-accion="notifs">Activar</button>' : ''}</div>
    </section>
    <form id="fAj" class="form sub" novalidate>
      <h3>Semestre</h3>
      <div class="dos">
        <label>Último día de clases<input type="date" name="finClases" id="fa-fin" value="${esc(aj.finClases)}"></label>
        <label>Aviso antes de clase<select name="avisoClase" id="fa-aviso">${[[0, 'Sin aviso'], [5, '5 min'], [10, '10 min'], [15, '15 min'], [30, '30 min'], [60, '1 h']].map(([v, t]) => `<option value="${v}" ${+aj.avisoClase === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      </div>
      <label>Nota mínima para aprobar<input type="number" name="notaMin" id="fa-nota" min="0" max="100" step="1" value="${esc(aj.notaMin)}"></label>
      <h3>Avisos de fábrica por tipo</h3>
      <p class="small muted">Se usan en cada evaluación nueva. En cada una puedes cambiarlos.</p>
      ${Object.entries(L.TIPOS).map(([k, t]) => `<fieldset class="tipo-av"><legend>${t.nombre}</legend>${avisosChips(aj.avisosPorTipo?.[k] ?? t.avisos, 'av-' + k)}</fieldset>`).join('')}
      <h3>Apariencia</h3>
      <div class="seg" role="radiogroup" aria-label="Tema">${[['auto', 'Automático'], ['claro', 'Claro'], ['oscuro', 'Oscuro']].map(([v, t]) => `<label><input type="radio" name="tema" value="${v}" ${aj.tema === v ? 'checked' : ''}><span>${t}</span></label>`).join('')}</div>
      <div class="fila-btn fin"><button type="submit" class="btn primario">Guardar ajustes</button></div>
    </form>
    <section class="sub">
      <h3>Copia de seguridad</h3>
      <p class="small">Tus datos solo están en este teléfono. Guarda una copia antes de borrar el navegador o cambiar de teléfono.</p>
      <div class="fila-btn"><button type="button" class="btn" data-accion="exportar">Guardar copia (.json)</button><label class="btn">Cargar copia<input type="file" id="fileImport" accept="application/json,.json" hidden></label></div>
      <p class="small muted">${guardadoOK ? 'Guardado en este teléfono.' : 'No se está guardando: el navegador bloquea el almacenamiento.'}</p>
    </section>
    <section class="sub"><h3>Empezar de nuevo</h3>
      <span class="confirmar" data-confirmar><button type="button" class="btn peligro" data-pedir-reset>Volver a los datos del II semestre 2026</button></span>
    </section>`, root => {
    const f = $('#fAj', root);
    f.onsubmit = ev => {
      ev.preventDefault();
      const nm = +f.notaMin.value;
      if (!(nm >= 0 && nm <= 100)) { f.notaMin.classList.add('inv'); toast('La nota mínima va de 0 a 100.'); return; }
      if (!L.parseYMD(f.finClases.value)) { f.finClases.classList.add('inv'); toast('Pon una fecha válida para el último día de clases.'); return; }
      const porTipo = {};
      let distinto = false;
      for (const [k, t] of Object.entries(L.TIPOS)) {
        porTipo[k] = $$(`input[name="av-${k}"]:checked`, f).map(i => +i.value);
        if (porTipo[k].slice().sort((a, b) => a - b).join(',') !== t.avisos.slice().sort((a, b) => a - b).join(',')) distinto = true;
      }
      Object.assign(aj, { finClases: f.finClases.value, avisoClase: +f.avisoClase.value, notaMin: nm, avisosPorTipo: distinto ? porTipo : null, tema: (f.querySelector('input[name=tema]:checked') || {}).value || 'auto' });
      aplicarTema(); guardar(); renderTodo(); toast('Ajustes guardados'); cerrarHoja();
    };
    $('#fileImport', root).onchange = async ev => {
      const file = ev.target.files[0];
      if (!file) return;
      try {
        const d = JSON.parse(await file.text());
        if (!d || d.version !== 1 || !Array.isArray(d.materias) || !Array.isArray(d.evals)) throw new Error('formato');
        S = normalizar(d); guardar(); aplicarTema(); renderTodo(); cerrarHoja(); toast('Copia cargada');
      } catch { toast('Ese archivo no es una copia de Cronograma.'); }
    };
    $('[data-pedir-reset]', root).onclick = () => {
      $('[data-confirmar]', root).innerHTML = '<span class="small">Se pierde todo lo que agregaste o cambiaste.</span><button type="button" class="btn peligro" data-si>Sí, volver a empezar</button><button type="button" class="btn" data-no>No</button>';
      $('[data-no]', root).onclick = hojaAjustes;
      $('[data-si]', root).onclick = () => { S = datosIniciales(); guardar(); aplicarTema(); renderTodo(); cerrarHoja(); toast('Datos restaurados'); };
    };
  });
}

function hojaComoAlarmas() {
  abrirHoja(`
    <div class="hoja-h"><h2>Cómo funcionan las alarmas</h2><button type="button" class="x" data-cerrar aria-label="Cerrar">${icon('cerrar')}</button></div>
    <div class="texto">
      <p>Una app web no puede hacer sonar una alarma con el teléfono bloqueado. El calendario del teléfono sí. Por eso Cronograma crea los eventos con sus avisos ya puestos y tú los guardas en tu calendario una vez.</p>
      <h3>iPhone</h3>
      <p>Toca <b>Agregar al calendario</b>. Se abre la vista del evento: toca <b>Agregar</b> (o <b>Agregar todo</b>). Si no pasa nada desde el ícono de la pantalla de inicio, abre Cronograma en Safari y repite.</p>
      <h3>Android</h3>
      <p>Toca <b>Agregar al calendario</b> y abre el archivo descargado con tu app de calendario (Samsung Calendar lo importa directo). Si usas Google Calendar y el archivo no abre, usa <b>Abrir en Google Calendar</b> en cada evaluación: queda guardado con los avisos de tu calendario de Google, que puedes cambiar ahí.</p>
      <h3>Para que suene fuerte</h3>
      <p>En los ajustes de notificaciones de tu app de calendario, pon los avisos de eventos con sonido y prioridad alta.</p>
      <h3>Dentro de Cronograma</h3>
      <p>Si activas los avisos dentro de la app, te avisa mientras la tienes abierta o la acabas de usar, y la pantalla Hoy te muestra lo que se acerca cada vez que la abres.</p>
      <p class="small muted">Si cambias una evaluación que ya estaba en el calendario, aparece un ícono de alerta. Agrégala otra vez y borra la versión vieja.</p>
    </div>`);
}

// ---------- calendario y archivos ----------
const esIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function descargar(texto, nombre, tipo) {
  if (esIOS() && tipo === 'text/calendar') {
    // En iPhone, abrir el calendario directamente muestra "Agregar" sin pasar por Archivos.
    location.href = `data:text/calendar;charset=utf-8,${encodeURIComponent(texto)}`;
    return;
  }
  const url = URL.createObjectURL(new Blob([texto], { type: `${tipo};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url; a.download = nombre; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 40);
function exportarEvals(evals, nombre) {
  if (!evals.length) { toast('No hay evaluaciones pendientes para agregar.'); return; }
  const now = NOW();
  descargar(L.buildICS({ evals, materias: S.materias, ajustes: S.ajustes, now }), nombre, 'text/calendar');
  for (const e of evals) e.calFirma = L.firmaCal(e, S.ajustes);
  guardar(); renderTodo();
  toast(evals.length === 1 ? 'Evento listo: guárdalo en tu calendario' : `${evals.length} eventos listos: guárdalos en tu calendario`);
}
function exportarHorario() {
  const fin = L.parseYMD(S.ajustes.finClases);
  if (!fin || fin < L.startOfDay(NOW())) { toast('Las clases ya terminaron. Cambia el último día de clases en Ajustes.'); return; }
  if (!S.clases.length) { toast('No tienes clases guardadas.'); return; }
  descargar(L.buildICS({ clases: S.clases, materias: S.materias, ajustes: S.ajustes, now: NOW() }), 'horario-de-clases.ics', 'text/calendar');
  toast('Horario listo: guárdalo en tu calendario');
}

// ---------- avisos dentro de la app ----------
let swReg = null;
async function revisarAvisos() {
  const now = NOW();
  const venc = L.avisosVencidos(S.evals, S.ajustes, now, S.mostrados);
  if (!venc.length) return;
  const puede = 'Notification' in window && Notification.permission === 'granted';
  for (const a of venc) {
    S.mostrados[a.key] = Date.now();
    if (!puede) continue;
    const m = mat(a.e.materiaId), ini = L.inicioDe(a.e);
    const titulo = L.tituloDe(a.e, m);
    const cuerpo = `${cap(L.relativo(ini, now))}, ${H(a.e.ini)}${a.e.aula ? `, aula ${a.e.aula}` : ''}`;
    try {
      if (swReg) await swReg.showNotification(titulo, { body: cuerpo, tag: a.key, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', data: { ev: a.e.id } });
      else new Notification(titulo, { body: cuerpo, tag: a.key });
    } catch { /* el navegador puede negarse; el aviso sigue en la pantalla Hoy */ }
  }
  guardar();
}
async function activarNotifs() {
  if (!('Notification' in window)) { toast(esIOS() ? 'En iPhone, primero agrega Cronograma a la pantalla de inicio.' : 'Este navegador no permite avisos.'); return; }
  const p = await Notification.requestPermission();
  toast(p === 'granted' ? 'Avisos activados mientras la app está abierta' : 'No se activaron los avisos');
  if (sheet().open) hojaAjustes();
}

// ---------- instalar como app ----------
let pedidoInstalar = null;
const instalada = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
function botonInstalar() { $('#btnInstalar').hidden = instalada(); }
async function instalar() {
  if (pedidoInstalar) {
    const p = pedidoInstalar; pedidoInstalar = null;
    try { p.prompt(); const r = await p.userChoice; if (r.outcome === 'accepted') { toast('Instalando Cronograma…'); return; } } catch { }
  }
  hojaInstalar();
}
function hojaInstalar() {
  const url = location.origin + location.pathname;
  const ios = esIOS();
  abrirHoja(`
    <div class="hoja-h"><h2>Instalar Cronograma</h2><button type="button" class="x" data-cerrar aria-label="Cerrar">${icon('cerrar')}</button></div>
    <div class="texto">
      <p>Queda como una app con su ícono en la pantalla de inicio y funciona sin internet.</p>
      ${ios ? `<ol class="pasos"><li>Abre este enlace en <b>Safari</b>.</li><li>Toca el botón <b>Compartir</b> (el cuadro con la flecha).</li><li>Elige <b>Agregar a pantalla de inicio</b>.</li></ol>`
        : `<ol class="pasos"><li>Si la abriste desde otra app o en una vista rápida (con una <b>X</b> arriba a la izquierda), toca <b>⋮</b> y elige <b>Abrir en Brave</b> o <b>Abrir en Chrome</b>.</li><li>Ya en el navegador, toca <b>⋮</b> y elige <b>Instalar app</b> o <b>Agregar a pantalla de inicio</b>.</li></ol>`}
      <div class="copiar"><input id="urlApp" readonly value="${esc(url)}" aria-label="Enlace de Cronograma"><button type="button" class="btn chico" data-accion="copiar-url">Copiar</button></div>
    </div>`);
}
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); pedidoInstalar = e; botonInstalar(); });
window.addEventListener('appinstalled', () => { pedidoInstalar = null; botonInstalar(); toast('Cronograma instalado'); });

// ---------- tema ----------
function aplicarTema() {
  const t = S.ajustes.tema;
  if (t === 'claro') document.documentElement.dataset.theme = 'light';
  else if (t === 'oscuro') document.documentElement.dataset.theme = 'dark';
  else delete document.documentElement.dataset.theme;
  const oscuro = t === 'oscuro' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  $('meta[name=theme-color]').setAttribute('content', oscuro ? '#11161E' : '#F2F4F7');
}

// ---------- navegación ----------
const VISTAS = ['hoy', 'agenda', 'horario', 'materias'];
function vistaActual() { const h = location.hash.slice(1); return VISTAS.includes(h) ? h : 'hoy'; }
function mostrarVista() {
  const v = vistaActual();
  for (const x of VISTAS) $(`#v-${x}`).hidden = x !== v;
  $$('.tabbar button').forEach(b => b.setAttribute('aria-current', b.dataset.vista === v ? 'page' : 'false'));
  $('#tituloVista').textContent = { hoy: 'Hoy', agenda: 'Agenda', horario: 'Horario', materias: 'Materias' }[v];
}
function renderTodo() {
  const now = NOW();
  $('#hoyFecha').textContent = cap(L.fechaLarga(now));
  renderHoy(); renderAgenda(); renderHorario(); renderMaterias();
}

// ---------- eventos ----------
function alClic(ev) {
  const t = ev.target.closest('button, a, [data-mat]');
  if (!t) return;
  const ds = t.dataset;
  if (ds.cerrar !== undefined) return cerrarHoja();
  if (ds.vista) { location.hash = ds.vista; return; }
  if (ds.ir) { location.hash = ds.ir; return; }
  if (ds.ics) { const e = S.evals.find(x => x.id === ds.ics); if (e) exportarEvals([e], `${slug(L.tituloDe(e, mat(e.materiaId)))}.ics`); if (sheet().open) hojaEval(ds.ics); return; }
  if (ds.gcal) { const e = S.evals.find(x => x.id === ds.gcal); if (e) { e.calFirma = L.firmaCal(e, S.ajustes); guardar(); setTimeout(() => { renderTodo(); hojaEval(e.id); }, 300); } return; }
  if (ds.ev) return hojaEval(ds.ev);
  if (ds.editar) return hojaFormEval(ds.editar);
  if (ds.hecho) { const e = S.evals.find(x => x.id === ds.hecho); if (e) { e.hecho = !e.hecho; guardar(); renderTodo(); toast(e.hecho ? 'Marcada como hecha' : 'Marcada como pendiente'); hojaEval(e.id); } return; }
  if (ds.borrar) { S.evals = S.evals.filter(x => x.id !== ds.borrar); guardar(); renderTodo(); cerrarHoja(); toast('Evaluación eliminada'); return; }
  if (ds.visto) { const now = NOW(); for (const a of L.avisosVencidos(S.evals.filter(e => e.id === ds.visto), S.ajustes, now, S.vistos, 24 * 3600e3)) S.vistos[a.key] = Date.now(); guardar(); renderHoy(); return; }
  if (ds.filtro) { filtro.estado = ds.filtro; renderAgenda(); return; }
  if (ds.mat && !t.closest('.editables')) return hojaMateria(ds.mat);
  switch (ds.accion) {
    case 'nueva': return hojaFormEval(null);
    case 'nueva-materia': return hojaMateria(null);
    case 'ajustes': return hojaAjustes();
    case 'como-alarmas': return hojaComoAlarmas();
    case 'notifs': return activarNotifs();
    case 'instalar': return instalar();
    case 'copiar-url': {
      const inp = $('#urlApp');
      navigator.clipboard?.writeText(inp.value).then(() => toast('Enlace copiado'), () => { inp.select(); toast('Mantén presionado el enlace para copiarlo'); })
        ?? (inp.select(), toast('Mantén presionado el enlace para copiarlo'));
      return;
    }
    case 'ics-todo': {
      const now = NOW();
      return exportarEvals(L.ordenarEvals(S.evals.filter(e => L.pendiente(e, now))), 'evaluaciones-pendientes.ics');
    }
    case 'ics-horario': return exportarHorario();
    case 'exportar': {
      descargar(JSON.stringify(S, null, 2), `cronograma-copia-${L.ymd(NOW())}.json`, 'application/json');
      return toast('Copia guardada en Descargas');
    }
  }
}

function iniciar() {
  S = cargar();
  limpiarViejos();
  guardar();
  aplicarTema();
  document.addEventListener('click', alClic);
  document.addEventListener('change', ev => { if (ev.target.id === 'filtroMateria') { filtro.materia = ev.target.value; renderAgenda(); } });
  $('#fab').onclick = () => hojaFormEval(null);
  $('#btnAjustes').onclick = hojaAjustes;
  $('#btnInstalar').onclick = instalar;
  botonInstalar();
  sheet().addEventListener('click', ev => { if (ev.target === sheet()) cerrarHoja(); }); // toque fuera de la hoja
  window.addEventListener('hashchange', () => { mostrarVista(); window.scrollTo(0, 0); });
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', aplicarTema);
  renderTodo(); mostrarVista();

  // reloj: cuenta regresiva, clase en curso, avisos y cambio de día
  let dia = L.ymd(NOW());
  const tic = () => {
    if (document.hidden) return;
    if (L.ymd(NOW()) !== dia) { dia = L.ymd(NOW()); renderTodo(); }
    else renderHoy();
    revisarAvisos();
  };
  setInterval(tic, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tic(); });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    const habia = !!navigator.serviceWorker.controller;
    let recargado = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!habia || recargado) return; // primera instalación: no hace falta recargar
      recargado = true;
      if (sheet().open) toast('Hay una versión nueva. Cierra y vuelve a abrir la app para verla.');
      else location.reload();
    });
    navigator.serviceWorker.register('sw.js').then(r => { swReg = r; revisarAvisos(); }).catch(() => revisarAvisos());
    navigator.serviceWorker.addEventListener?.('message', ev => { if (ev.data?.ev) hojaEval(ev.data.ev); });
  } else revisarAvisos();
  navigator.storage?.persist?.().catch(() => { });
  const abrir = new URLSearchParams(location.search).get('ev');
  if (abrir) hojaEval(abrir);
}

// Si llegó el HTML de otra app (el service worker viejo de Escáner Libre atendía todas las páginas
// del sitio), se actualizan los service workers y se recarga para traer la página correcta.
async function reparar() {
  let n = 0;
  try { n = +sessionStorage.getItem('crono-reparar') || 0; sessionStorage.setItem('crono-reparar', String(n + 1)); } catch { n = 9; }
  if (n >= 3 || !('serviceWorker' in navigator)) return;
  const recargar = () => location.reload();
  navigator.serviceWorker.addEventListener('controllerchange', recargar, { once: true });
  setTimeout(recargar, 3000);
  try { for (const r of await navigator.serviceWorker.getRegistrations()) await r.update().catch(() => { }); } catch { }
}

if (document.getElementById('tituloVista')) {
  try { sessionStorage.removeItem('crono-reparar'); } catch { }
  iniciar();
} else reparar();
