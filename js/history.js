// Historial (IndexedDB): nombre automático Materia_AAAA-MM-DD_n.pdf, compartir, materias editables.
import { docs, kv } from './db.js';
import { $, esc, fmtBytes, toast, openSheet, closeSheet, confirmSheet, promptSheet, downloadBlob, shareFiles } from './ui.js';

const DEFAULT_MATERIAS = ['General', 'Estática', 'Cálculo', 'Física', 'Resistencia de Materiales', 'Topografía', 'Dibujo'];
let materias = [], materia = 'General';

export async function initHistory() {
  materias = (await kv.get('materias')) || DEFAULT_MATERIAS.slice();
  materia = (await kv.get('materia')) || materias[0];
  if (!materias.includes(materia)) materia = materias[0] || 'General';
  renderMaterias();
  $('#materiaSel').addEventListener('change', e => setMateria(e.target.value));
  $('#materiaForm').addEventListener('submit', async e => {
    e.preventDefault();
    const v = $('#materiaInput').value.trim().replace(/[\\/:*?"<>|_]+/g, ' ').trim();
    if (!v) return;
    if (!materias.some(m => m.toLowerCase() === v.toLowerCase())) materias.push(v);
    $('#materiaInput').value = '';
    await kv.set('materias', materias);
    await setMateria(v);
  });
  $('#materiaChips').addEventListener('click', async e => {
    const x = e.target.closest('.x');
    const chip = e.target.closest('.chip');
    if (!chip) return;
    const name = chip.dataset.m;
    if (x) {
      if (materias.length <= 1) return toast('Debe quedar al menos una materia');
      materias = materias.filter(m => m !== name);
      await kv.set('materias', materias);
      if (materia === name) await setMateria(materias[0]); else renderMaterias();
    } else await setMateria(name);
  });
  $('#histList').addEventListener('click', onListClick);
  await renderHistory();
}

async function setMateria(m) {
  materia = m; await kv.set('materia', m); renderMaterias();
}
export const getMateria = () => materia;

function renderMaterias() {
  $('#materiaSel').innerHTML = materias.map(m => `<option ${m === materia ? 'selected' : ''}>${esc(m)}</option>`).join('');
  $('#materiaChips').innerHTML = materias.map(m => `<span class="chip ${m === materia ? 'on' : ''}" data-m="${esc(m)}" role="button" tabindex="0">${esc(m)}
    <button class="x" aria-label="Quitar ${esc(m)}"><svg><use href="#i-x"/></svg></button></span>`).join('');
}

function today() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
const fileSafe = s => s.trim().replace(/\s+/g, '-').replace(/[\\/:*?"<>|]+/g, '');

// Siguiente nombre libre: Materia_AAAA-MM-DD_n.ext
export async function nextName(ext = 'pdf', m = materia) {
  const base = `${fileSafe(m)}_${today()}_`;
  const all = await docs.all();
  let n = 0;
  const re = new RegExp('^' + base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\d+)');
  for (const d of all) { const r = re.exec(d.name); if (r) n = Math.max(n, +r[1]); }
  // también cuenta los ya usados en esta sesión (JPG no se guardan en historial)
  n = Math.max(n, usedJpg[base] || 0);
  return `${base}${n + 1}.${ext}`;
}
const usedJpg = {};
export function markUsed(name) {
  const r = /^(.*_)(\d+)\.\w+$/.exec(name); if (r) usedJpg[r[1]] = Math.max(usedJpg[r[1]] || 0, +r[2]);
}

// Guarda un PDF en el historial y devuelve el registro
export async function saveDoc(blob, { name, pages = 0, thumb = '' } = {}) {
  name = name || await nextName('pdf');
  const rec = { name, materia, created: Date.now(), size: blob.size, pages, thumb, blob };
  rec.id = await docs.add(rec);
  // mantener historial razonable: conservar los 60 más recientes
  const all = await docs.all();
  if (all.length > 60) {
    all.sort((a, b) => a.created - b.created);
    for (const d of all.slice(0, all.length - 60)) await docs.del(d.id);
  }
  renderHistory();
  return rec;
}

export async function renderHistory() {
  const all = (await docs.all()).sort((a, b) => b.created - a.created);
  $('#histList').innerHTML = all.map(d => `
    <div class="hitem" data-id="${d.id}">
      ${d.thumb ? `<img src="${d.thumb}" alt="">` : `<div class="ph"><svg><use href="#i-pdf"/></svg></div>`}
      <div><div class="name">${esc(d.name)}</div>
        <div class="meta">${new Date(d.created).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' })} · ${d.pages ? d.pages + (d.pages === 1 ? ' pág.' : ' págs.') + ' · ' : ''}${fmtBytes(d.size)}</div></div>
      <div class="acts">
        <button class="btn primary" data-a="share"><svg><use href="#i-share"/></svg>Compartir</button>
        <button class="btn" data-a="dl"><svg><use href="#i-dl"/></svg>Descargar</button>
        <button class="btn" data-a="more" aria-label="Más opciones"><svg><use href="#i-more"/></svg></button>
      </div>
    </div>`).join('');
  try {
    const est = await navigator.storage?.estimate?.();
    if (est) $('#storageInfo').textContent = `${all.length} documentos · espacio usado ${fmtBytes(est.usage || 0)}`;
  } catch { }
}

export function fileOf(d) { return new File([d.blob], d.name, { type: d.blob.type || 'application/pdf' }); }

async function onListClick(e) {
  const btn = e.target.closest('[data-a]'); if (!btn) return;
  const id = +btn.closest('.hitem').dataset.id;
  const d = await docs.get(id); if (!d) return;
  const a = btn.dataset.a;
  if (a === 'share') shareFiles([fileOf(d)], d.name);
  else if (a === 'dl') downloadBlob(d.blob, d.name);
  else if (a === 'more') moreMenu(d);
}

function moreMenu(d) {
  const b = openSheet(`<h3>${esc(d.name)}</h3><div class="stack">
    <button class="btn" data-m="open"><svg><use href="#i-pdf"/></svg>Abrir / ver</button>
    <button class="btn" data-m="rename"><svg><use href="#i-pen"/></svg>Renombrar</button>
    <button class="btn" data-m="org"><svg><use href="#i-crop"/></svg>Organizar (unir, dividir, rotar)</button>
    <button class="btn" data-m="comp"><svg><use href="#i-dl"/></svg>Comprimir</button>
    <button class="btn" data-m="sign"><svg><use href="#i-pen"/></svg>Firmar</button>
    <button class="btn danger" data-m="del"><svg><use href="#i-del"/></svg>Eliminar</button>
  </div>`);
  b.addEventListener('click', async e => {
    const m = e.target.closest('[data-m]')?.dataset.m; if (!m) return;
    closeSheet();
    if (m === 'open') {
      const url = URL.createObjectURL(d.blob);
      const w = window.open(url, '_blank');
      if (!w) downloadBlob(d.blob, d.name);
      setTimeout(() => URL.revokeObjectURL(url), 120000);
    } else if (m === 'rename') {
      let n = await promptSheet('Nuevo nombre', d.name.replace(/\.pdf$/i, ''));
      if (!n) return;
      n = n.replace(/[\\/:*?"<>|]+/g, '-'); if (!/\.pdf$/i.test(n)) n += '.pdf';
      d.name = n; await docs.put(d); renderHistory();
    } else if (m === 'del') {
      if (await confirmSheet(`¿Eliminar ${d.name}?`, 'Eliminar', true)) { await docs.del(d.id); renderHistory(); toast('Eliminado'); }
    } else {
      window.dispatchEvent(new CustomEvent('open-pdf', { detail: { tool: m, file: fileOf(d) } }));
    }
  });
}
