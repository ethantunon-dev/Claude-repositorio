// Utilidades de interfaz compartidas: toasts, hoja inferior, ocupado, descargas y compartir.
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];

export function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function fmtBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' KB';
  return (n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 2 : 1).replace('.', ',') + ' MB';
}

let toastT;
export function toast(msg, ms = 2800) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, ms);
}

let busyN = 0;
export function busy(on, text = 'Procesando…') {
  busyN = Math.max(0, busyN + (on ? 1 : -1));
  $('#busy').hidden = busyN === 0;
  if (on) $('#busyText').textContent = text;
}
export function busyText(text) { $('#busyText').textContent = text; }

export async function withBusy(text, fn) {
  busy(true, text);
  try { return await fn(); }
  catch (e) { console.error(e); toast('⚠️ ' + (e.message || 'Algo salió mal')); return undefined; }
  finally { busy(false); }
}

// Hoja inferior. html: contenido; devuelve el elemento cuerpo. onClose opcional.
let sheetClose = null;
export function openSheet(html, onClose) {
  const bd = $('#sheet');
  // contenedor nuevo en cada apertura: así no se acumulan escuchadores de hojas anteriores
  const body = document.createElement('div');
  body.id = 'sheetBody'; body.innerHTML = html;
  $('#sheetBody').replaceWith(body);
  bd.hidden = false;
  sheetClose = onClose || null;
  return body;
}
export function closeSheet() {
  $('#sheet').hidden = true; $('#sheetBody').innerHTML = '';
  const f = sheetClose; sheetClose = null; f && f();
}
document.addEventListener('click', e => { if (e.target.id === 'sheet') closeSheet(); });

export function confirmSheet(title, okText = 'Aceptar', danger = false) {
  return new Promise(res => {
    const b = openSheet(`<h3>${esc(title)}</h3><div class="stack">
      <button class="btn ${danger ? 'danger' : 'primary'}" data-r="1">${esc(okText)}</button>
      <button class="btn" data-r="0">Cancelar</button></div>`, () => res(false));
    b.addEventListener('click', e => {
      const r = e.target.closest('[data-r]'); if (!r) return;
      sheetClose = null; closeSheet(); res(r.dataset.r === '1');
    });
  });
}

export function promptSheet(title, value = '', okText = 'Guardar') {
  return new Promise(res => {
    const b = openSheet(`<h3>${esc(title)}</h3><input type="text" id="promptIn" value="${esc(value)}">
      <div class="stack"><button class="btn primary" data-r="1">${esc(okText)}</button><button class="btn" data-r="0">Cancelar</button></div>`, () => res(null));
    const inp = $('#promptIn', b); setTimeout(() => inp.focus(), 50);
    const done = ok => { sheetClose = null; const v = inp.value.trim(); closeSheet(); res(ok ? v : null); };
    b.addEventListener('click', e => { const r = e.target.closest('[data-r]'); if (r) done(r.dataset.r === '1'); });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') done(true); });
  });
}

export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export function canShareFiles(files) {
  try { return !!(navigator.canShare && navigator.share && navigator.canShare({ files })); } catch { return false; }
}

// Comparte con la hoja del sistema; si no se puede, descarga.
export async function shareFiles(files, title = 'Escáner Libre') {
  if (canShareFiles(files)) {
    try { await navigator.share({ files, title }); return true; }
    catch (e) { if (e.name === 'AbortError') return false; console.warn(e); }
  }
  for (const f of files) downloadBlob(f, f.name);
  toast(files.length > 1 ? 'Archivos descargados' : 'Archivo descargado');
  return false;
}

export function pickFiles(input) {
  return new Promise(res => {
    input.value = '';
    input.onchange = () => res([...input.files]);
    input.click();
  });
}

export function setProgress(el, frac, text) {
  el.hidden = false;
  $('.bar', el).style.width = Math.round(Math.max(0, Math.min(1, frac)) * 100) + '%';
  $('.ptext', el).textContent = text;
}
