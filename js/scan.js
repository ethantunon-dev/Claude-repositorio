// Pestaña Escanear: cámara/galería → bordes → perspectiva → filtro → páginas → PDF/JPG.
import { $, $$, esc, toast, busy, busyText, withBusy, openSheet, closeSheet, confirmSheet, downloadBlob, shareFiles, canShareFiles, fmtBytes, pickFiles } from './ui.js';
import { kv } from './db.js';
import { detectQuad, fullQuad } from './edges.js';
import { fileToCanvas, makeCanvas, canvasToBlob, renderPage, FILTERS, nextFrame, MAX_SRC, warp, applyFilter, rotateCanvas } from './imaging.js';
import { getPDFLib } from './libs.js';
import { saveDoc, nextName, markUsed, getMateria } from './history.js';

let pages = []; // {id, src:Blob, corners, filter, rotation, out:Blob, w, h, thumb}
let pending = new Map();
const uid = () => Math.random().toString(36).slice(2, 10);

export const getPages = () => pages;

export async function initScan() {
  try {
    const saved = await kv.get('scanPages');
    if (Array.isArray(saved)) pages = saved.filter(p => p && p.src && p.out);
  } catch { }
  renderPages();
  document.addEventListener('click', e => {
    const b = e.target.closest('#view-scan [data-act]'); if (!b) return;
    const a = b.dataset.act;
    if (a === 'camera') openCamera();
    else if (a === 'gallery') fromGallery();
    else if (a === 'sysCamera') fromSystemCamera();
    else if (a === 'exportPdf') exportPdf();
    else if (a === 'exportJpg') exportJpg();
    else if (a === 'clearPages') clearPages();
  });
  $('#pageList').addEventListener('click', onPageListClick);
  window.addEventListener('docs-changed', updateCajetin);
  initCrop();
  initPageView();
  initCamera();
}

let saveT;
function persist() {
  clearTimeout(saveT);
  saveT = setTimeout(() => kv.set('scanPages', pages.map(p => ({ ...p }))).catch(e => console.warn('No se pudo guardar la sesión', e)), 300);
  window.dispatchEvent(new Event('pages-changed'));
}

function renderPages() {
  const has = pages.length > 0;
  $('#scanEmpty').hidden = has;
  $('#scanBar').hidden = !has;
  $('#scanFooter').hidden = !has;
  $('#scanHint').hidden = !has;
  $('#pageList').innerHTML = pages.map((p, i) => `
    <div class="pcard" data-id="${p.id}">
      <button class="thumb" data-a="view" aria-label="Ver página ${i + 1}">
        ${p.thumb ? `<img src="${p.thumb}" alt="">` : ''}
        <span class="num">Hoja ${i + 1}</span>
        <span class="tag">${esc(FILTERS[p.filter] || '')}</span>
        ${pending.has(p.id) ? '<span class="busy-dot"><span class="spinner" style="width:28px;height:28px;border-width:4px"></span></span>' : ''}
      </button>
      <div class="acts">
        <button data-a="up" aria-label="Mover antes" ${i === 0 ? 'disabled' : ''}><svg><use href="#i-left"/></svg></button>
        <button data-a="down" aria-label="Mover después" ${i === pages.length - 1 ? 'disabled' : ''}><svg><use href="#i-right"/></svg></button>
        <button data-a="rot" aria-label="Rotar"><svg><use href="#i-rot"/></svg></button>
        <button data-a="del" class="del" aria-label="Eliminar"><svg><use href="#i-del"/></svg></button>
      </div>
    </div>`).join('');
  $('#pdfBtn span').textContent = pages.length > 1 ? `PDF (${pages.length})` : 'PDF';
  updateCajetin();
}

export async function updateCajetin() {
  $('#cjHojas').textContent = pages.length;
  try { $('#cjFile').textContent = await nextName('pdf'); } catch { }
}

async function onPageListClick(e) {
  const b = e.target.closest('[data-a]'); if (!b) return;
  const id = b.closest('.pcard').dataset.id, i = pages.findIndex(p => p.id === id), p = pages[i];
  if (!p) return;
  const a = b.dataset.a;
  if (a === 'up' && i > 0) { [pages[i - 1], pages[i]] = [pages[i], pages[i - 1]]; renderPages(); persist(); }
  else if (a === 'down' && i < pages.length - 1) { [pages[i + 1], pages[i]] = [pages[i], pages[i + 1]]; renderPages(); persist(); }
  else if (a === 'rot') { p.rotation = ((p.rotation || 0) + 90) % 360; reprocess(p); }
  else if (a === 'del') { pages.splice(i, 1); renderPages(); persist(); toast('Página eliminada'); }
  else if (a === 'view') openPageView(p);
}

async function reprocess(p) {
  const job = (async () => {
    const src = await fileToCanvas(p.src, MAX_SRC);
    const r = await renderPage(src, p);
    Object.assign(p, { out: r.blob, w: r.w, h: r.h, thumb: r.thumb });
  })();
  pending.set(p.id, job); renderPages();
  try { await job; } catch (e) { toast('⚠️ No se pudo procesar la página'); console.error(e); }
  pending.delete(p.id); renderPages(); persist();
  return p;
}

// --------- entrada de imágenes ---------
function smallCanvas(c, max = 480) {
  const s = Math.min(1, max / Math.max(c.width, c.height));
  const t = makeCanvas(Math.round(c.width * s), Math.round(c.height * s));
  const ctx = t.getContext('2d', { willReadFrequently: true }); ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(c, 0, 0, t.width, t.height);
  return t;
}

function autoDetect(src) {
  try {
    const mid = smallCanvas(src, 1100);
    const d = mid.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, mid.width, mid.height);
    return { corners: detectQuad(d.data, mid.width, mid.height), small: smallCanvas(mid, 480) };
  } catch (e) { console.warn(e); return { corners: null, small: null }; }
}

async function srcToBlob(canvas) { return canvasToBlob(canvas, 'image/jpeg', 0.92); }

// Añade una imagen. interactive=true abre el editor de bordes.
async function addImage(fileOrCanvas, interactive) {
  let src = fileOrCanvas instanceof HTMLCanvasElement ? fileOrCanvas : await fileToCanvas(fileOrCanvas, MAX_SRC);
  const det = autoDetect(src);
  const corners = det.corners || fullQuad();
  // el filtro NO se elige solo: la hoja empieza en «Original»
  const page = { id: uid(), corners, filter: 'original', rotation: 0, detected: !!det.corners };
  if (interactive) {
    const r = await openCrop(src, page);
    if (!r) return null;
    src = r.src; page.corners = r.corners;
  }
  busy(true, 'Corrigiendo perspectiva…');
  try {
    page.src = await srcToBlob(src);
    const r = await renderPage(src, page);
    Object.assign(page, { out: r.blob, w: r.w, h: r.h, thumb: r.thumb });
    pages.push(page); renderPages(); persist();
  } finally { busy(false); }
  return page;
}

async function addFiles(files) {
  files = files.filter(f => f.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif|gif|bmp)$/i.test(f.name));
  if (!files.length) return;
  if (files.length === 1) {
    try { await addImage(files[0], true); } catch (e) { console.error(e); toast('⚠️ No se pudo abrir la imagen (' + (e.message || 'formato no compatible') + ')'); }
    return;
  }
  let ok = 0, nodet = 0;
  busy(true, `Procesando 1 de ${files.length}…`);
  try {
    for (let i = 0; i < files.length; i++) {
      busyText(`Procesando ${i + 1} de ${files.length}…`);
      await nextFrame();
      try { const p = await addImage(files[i], false); if (p) { ok++; if (!p.detected) nodet++; } }
      catch (e) { console.error(e); }
    }
  } finally { busy(false); }
  toast(`${ok} páginas añadidas${nodet ? ` · ${nodet} sin bordes detectados (toca para ajustar)` : ''}`, 4000);
}

async function fromGallery() { addFiles(await pickFiles($('#fileGallery'))); }
async function fromSystemCamera() { addFiles(await pickFiles($('#fileCamera'))); }

// --------- cámara integrada ---------
let stream = null, track = null, torchOn = false;
function initCamera() {
  $('#camClose').onclick = closeCamera;
  $('#camShot').onclick = shoot;
  $('#camGallery').onclick = () => { closeCamera(); fromGallery(); };
  $('#camTorch').onclick = async () => {
    try { torchOn = !torchOn; await track.applyConstraints({ advanced: [{ torch: torchOn }] }); } catch { }
  };
}

// De la más exigente a la más simple: algunos teléfonos rechazan resoluciones altas.
const CAM_CONSTRAINTS = [
  { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } },
  { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
  { facingMode: 'environment' },
  true,
];

async function openCamera() {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) return cameraError({ name: 'NoSoportado' });
  $('#cameraView').hidden = false;
  $('#camCount').textContent = pages.length ? `${pages.length} ${pages.length === 1 ? 'hoja' : 'hojas'}` : '';
  let lastErr = null;
  for (const video of CAM_CONSTRAINTS) {
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: false, video }); break; }
    catch (e) {
      lastErr = e; console.warn('getUserMedia', e.name, e.message);
      // permiso denegado o sin cámara: no tiene sentido seguir probando
      if (e.name === 'NotAllowedError' || e.name === 'SecurityError' || e.name === 'NotFoundError') break;
    }
  }
  if (!stream) { closeCamera(); return cameraError(lastErr || {}); }
  track = stream.getVideoTracks()[0];
  const v = $('#camVideo'); v.srcObject = stream;
  await v.play().catch(() => { });
  try { $('#camTorch').hidden = !track.getCapabilities?.().torch; } catch { $('#camTorch').hidden = true; }
  // si en 5 s no llega imagen, la cámara está ocupada o bloqueada
  const ok = await new Promise(res => {
    if (v.videoWidth) return res(true);
    const t = setTimeout(() => res(false), 5000);
    v.addEventListener('loadeddata', () => { clearTimeout(t); res(true); }, { once: true });
  });
  if (!ok && stream) { closeCamera(); cameraError({ name: 'SinImagen' }); }
}

// Explica qué pasó y ofrece la cámara del sistema (con un toque, que el teléfono sí permite).
function cameraError(e) {
  const why = {
    NotAllowedError: 'El permiso de cámara está bloqueado para esta página.',
    SecurityError: 'El permiso de cámara está bloqueado para esta página.',
    NotFoundError: 'No se encontró ninguna cámara en este dispositivo.',
    NotReadableError: 'Otra app está usando la cámara. Ciérrala e inténtalo de nuevo.',
    AbortError: 'Otra app está usando la cámara. Ciérrala e inténtalo de nuevo.',
    SinImagen: 'La cámara no envió imagen. Puede estar ocupada por otra app.',
    NoSoportado: 'Este navegador no permite usar la cámara dentro de la página.',
  }[e.name] || 'No se pudo abrir la cámara dentro de la app.';
  const blocked = e.name === 'NotAllowedError' || e.name === 'SecurityError';
  const b = openSheet(`<h3>No se pudo abrir la cámara</h3>
    <p>${esc(why)}</p>
    ${blocked ? `<p class="small muted">Para permitirla: toca el ícono junto a la dirección (candado o ajustes) → Permisos → Cámara → Permitir.
      Si la app está instalada: mantén presionado su ícono → Información → Permisos → Cámara.</p>` : ''}
    <div class="stack">
      <button class="btn primary" data-r="sys"><svg><use href="#i-cam"/></svg>Usar la cámara del sistema</button>
      <button class="btn" data-r="retry">Intentar otra vez</button>
      <button class="btn ghost" data-r="close">Cerrar</button>
    </div>
    <p class="small muted">Código: ${esc(e.name || 'desconocido')}</p>`);
  b.addEventListener('click', ev => {
    const r = ev.target.closest('[data-r]')?.dataset.r; if (!r) return;
    closeSheet();
    if (r === 'sys') fromSystemCamera();
    else if (r === 'retry') openCamera();
  });
}

function closeCamera() {
  $('#cameraView').hidden = true;
  if (stream) stream.getTracks().forEach(t => t.stop());
  stream = null; track = null; torchOn = false;
}

async function shoot() {
  const v = $('#camVideo');
  if (!stream || !v.videoWidth) return toast('La cámara aún se está iniciando…');
  let canvas;
  try {
    if ('ImageCapture' in window) {
      const blob = await new ImageCapture(track).takePhoto();
      canvas = await fileToCanvas(blob, MAX_SRC);
    }
  } catch (e) { console.warn('takePhoto falló, uso el fotograma de video', e); }
  if (!canvas) {
    const s = Math.min(1, MAX_SRC / Math.max(v.videoWidth, v.videoHeight));
    canvas = makeCanvas(Math.round(v.videoWidth * s), Math.round(v.videoHeight * s));
    canvas.getContext('2d').drawImage(v, 0, 0, canvas.width, canvas.height);
  }
  closeCamera();
  try { await addImage(canvas, true); } catch (e) { console.error(e); toast('⚠️ ' + e.message); }
}

// --------- editor de bordes ---------
const crop = { src: null, corners: null, resolve: null, view: null, drag: -1, rotated: false };

function initCrop() {
  $('#cropCancel').onclick = () => finishCrop(null);
  $('#cropOk').onclick = () => finishCrop({ corners: crop.corners.map(p => ({ ...p })), src: crop.src, rotated: crop.rotated });
  $('#cropAuto').onclick = () => {
    const det = autoDetect(crop.src);
    if (det.corners) { crop.corners = det.corners; drawQuad(); toast('Bordes detectados'); }
    else toast('No se detectaron bordes; ajusta las esquinas a mano');
  };
  $('#cropFull').onclick = () => { crop.corners = fullQuad(); drawQuad(); };
  // gira la foto en pantalla (90° a la derecha) junto con las esquinas
  $('#cropRot').onclick = () => {
    crop.src = rotateCanvas(crop.src, 90); crop.rotated = true;
    const f = p => ({ x: 1 - p.y, y: p.x }), c = crop.corners;
    crop.corners = [f(c[3]), f(c[0]), f(c[1]), f(c[2])];
    layoutCrop();
  };
  const st = $('#cropStage');
  st.addEventListener('pointerdown', cropDown);
  st.addEventListener('pointermove', cropMove);
  st.addEventListener('pointerup', cropUp);
  st.addEventListener('pointercancel', cropUp);
  window.addEventListener('resize', () => { if (!$('#cropView').hidden) layoutCrop(); });
}

function markChips(sel, val) { $$(sel + ' [data-f]').forEach(c => c.classList.toggle('on', c.dataset.f === val)); }

function openCrop(src, page) {
  return new Promise(res => {
    Object.assign(crop, { src, corners: page.corners.map(p => ({ ...p })), resolve: res, rotated: false });
    $('#cropTitle').textContent = page.detected === false ? 'Ajusta las esquinas' : 'Ajusta los bordes';
    $('#cropView').hidden = false;
    requestAnimationFrame(layoutCrop);
    if (page.detected === false) toast('No se detectaron bordes: se usa la imagen completa. Arrastra las esquinas si quieres.', 3500);
  });
}

function finishCrop(r) {
  $('#cropView').hidden = true;
  const f = crop.resolve; crop.resolve = null; crop.src = null;
  f && f(r);
}

function layoutCrop() {
  const st = $('#cropStage'), W = st.clientWidth, H = st.clientHeight, pad = 24;
  const s = Math.min((W - pad * 2) / crop.src.width, (H - pad * 2) / crop.src.height);
  const dw = crop.src.width * s, dh = crop.src.height * s, ox = (W - dw) / 2, oy = (H - dh) / 2;
  crop.view = { s, ox, oy, dw, dh };
  const c = $('#cropCanvas'), dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = Math.round(dw * dpr); c.height = Math.round(dh * dpr);
  Object.assign(c.style, { left: ox + 'px', top: oy + 'px', width: dw + 'px', height: dh + 'px' });
  const ctx = c.getContext('2d'); ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(crop.src, 0, 0, c.width, c.height);
  drawQuad();
}

function toScreen(p) { const v = crop.view; return { x: v.ox + p.x * v.dw, y: v.oy + p.y * v.dh }; }

function drawQuad() {
  const pts = crop.corners.map(toScreen);
  const poly = pts.map(p => `${p.x},${p.y}`).join(' ');
  $('#cropSvg').innerHTML = `<polygon class="quad" points="${poly}"/>` +
    pts.map((p, i) => `<circle class="hd" cx="${p.x}" cy="${p.y}" r="${crop.drag === i ? 22 : 16}"/>`).join('');
}

function cropDown(e) {
  if (!crop.view) return;
  const r = $('#cropStage').getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  let best = -1, bd = 56;
  crop.corners.forEach((p, i) => { const s = toScreen(p), d = Math.hypot(s.x - x, s.y - y); if (d < bd) { bd = d; best = i; } });
  if (best < 0) return;
  crop.drag = best;
  const s = toScreen(crop.corners[best]);
  crop.off = { x: s.x - x, y: s.y - y };
  $('#cropStage').setPointerCapture(e.pointerId);
  cropMove(e);
}

function cropMove(e) {
  if (crop.drag < 0) return;
  e.preventDefault();
  const r = $('#cropStage').getBoundingClientRect(), v = crop.view;
  const x = e.clientX - r.left + crop.off.x, y = e.clientY - r.top + crop.off.y;
  const p = crop.corners[crop.drag];
  p.x = Math.min(1, Math.max(0, (x - v.ox) / v.dw));
  p.y = Math.min(1, Math.max(0, (y - v.oy) / v.dh));
  drawQuad();
  // lupa
  const L = $('#loupe'), lc = L.getContext('2d'), z = 3, src = crop.src;
  const sx = p.x * src.width, sy = p.y * src.height, span = L.width / (z * v.s);
  lc.fillStyle = '#000'; lc.fillRect(0, 0, L.width, L.height);
  lc.drawImage(src, sx - span / 2, sy - span / 2, span, span, 0, 0, L.width, L.height);
  lc.strokeStyle = '#3D7BFF'; lc.lineWidth = 2;
  lc.beginPath(); lc.moveTo(L.width / 2, 0); lc.lineTo(L.width / 2, L.height); lc.moveTo(0, L.height / 2); lc.lineTo(L.width, L.height / 2); lc.stroke();
  const sp = toScreen(p);
  L.style.left = Math.min(r.width - 130, Math.max(10, sp.x - 60 + (sp.x < r.width / 2 ? 80 : -80))) + 'px';
  L.style.top = Math.max(10, sp.y - 170) + 'px';
  L.hidden = false;
}

function cropUp() { crop.drag = -1; $('#loupe').hidden = true; if (crop.view) drawQuad(); }

// --------- editor de hoja: filtros con vista previa, rotar, bordes ---------
let pvPage = null, pvToken = 0;
function initPageView() {
  $('#pvFilters').onclick = async e => {
    const f = e.target.closest('[data-f]'); if (!f || !pvPage || f.dataset.f === pvPage.filter) return;
    pvPage.filter = f.dataset.f; markChips('#pvFilters', pvPage.filter);
    await withBusy('Aplicando filtro…', () => reprocess(pvPage)); showPv();
  };
  $('#pvAll').onclick = applyFilterToAll;
  $('#pvRotL').onclick = async () => { pvPage.rotation = ((pvPage.rotation || 0) + 270) % 360; await withBusy('Rotando…', () => reprocess(pvPage)); showPv(); buildPreviews(); };
  $('#pvRotR').onclick = async () => { pvPage.rotation = ((pvPage.rotation || 0) + 90) % 360; await withBusy('Rotando…', () => reprocess(pvPage)); showPv(); buildPreviews(); };
  $('#pvCrop').onclick = async () => {
    const p = pvPage;
    const src = await fileToCanvas(p.src, MAX_SRC);
    $('#pageView').hidden = true;
    const r = await openCrop(src, p);
    $('#pageView').hidden = false;
    if (!r) return;
    p.corners = r.corners;
    await withBusy('Corrigiendo perspectiva…', async () => {
      if (r.rotated) p.src = await srcToBlob(r.src);
      await reprocess(p);
    });
    showPv(); buildPreviews();
  };
  $('#pvDone').onclick = () => { $('#pageView').hidden = true; pvPage = null; };
  $('#pvDelete').onclick = async () => {
    if (!(await confirmSheet('¿Eliminar esta hoja?', 'Eliminar', true))) return;
    pages = pages.filter(p => p !== pvPage); $('#pageView').hidden = true; pvPage = null; renderPages(); persist();
  };
}

// Miniaturas de cada filtro sobre la hoja recortada (en baja resolución, rápido)
async function buildPreviews() {
  const p = pvPage, token = ++pvToken;
  $('#pvFilters').innerHTML = Object.entries(FILTERS).map(([k, v]) =>
    `<button class="fprev ${k === p.filter ? 'on' : ''}" data-f="${k}"><span class="fimg"></span><span>${v}</span></button>`).join('');
  try {
    const src = await fileToCanvas(p.src, 800);
    let base = rotateCanvas(warp(src, p.corners), p.rotation || 0);
    base = smallCanvas(base, 300);
    for (const k of Object.keys(FILTERS)) {
      if (token !== pvToken) return;
      const c = makeCanvas(base.width, base.height);
      c.getContext('2d', { willReadFrequently: true }).drawImage(base, 0, 0);
      applyFilter(c, k);
      const slot = $(`#pvFilters [data-f="${k}"] .fimg`);
      if (slot) slot.style.backgroundImage = `url(${c.toDataURL('image/jpeg', 0.7)})`;
      await nextFrame();
    }
  } catch (e) { console.warn('vista previa de filtros', e); }
}

async function applyFilterToAll() {
  const f = pvPage.filter, todo = pages.filter(p => p.filter !== f);
  if (!todo.length) return toast(`Todas las hojas ya usan «${FILTERS[f]}»`);
  busy(true, `Aplicando «${FILTERS[f]}»…`);
  try {
    for (let i = 0; i < todo.length; i++) {
      busyText(`Aplicando «${FILTERS[f]}» a la hoja ${i + 1} de ${todo.length}…`);
      todo[i].filter = f;
      await reprocess(todo[i]);
    }
  } finally { busy(false); }
  toast(`«${FILTERS[f]}» aplicado a las ${pages.length} hojas`);
}

let pvUrl;
function showPv() {
  if (!pvPage) return;
  if (pvUrl) URL.revokeObjectURL(pvUrl);
  pvUrl = URL.createObjectURL(pvPage.out);
  $('#pvImg').src = pvUrl;
  $('#pvTitle').textContent = `Hoja ${pages.indexOf(pvPage) + 1} de ${pages.length}`;
  $('#pvAll').hidden = pages.length < 2;
}
function openPageView(p) {
  pvPage = p; $('#pageView').hidden = false; showPv(); buildPreviews();
}

// --------- exportar ---------
async function waitPending() { if (pending.size) { busy(true, 'Terminando páginas…'); try { await Promise.all(pending.values()); } finally { busy(false); } } }

const LETTER = [612, 792];
export async function pagesToPdf(list, { title = 'Escáner Libre', margin = 14 } = {}) {
  const { PDFDocument } = await getPDFLib();
  const doc = await PDFDocument.create();
  for (const p of list) {
    const img = await doc.embedJpg(new Uint8Array(await p.out.arrayBuffer()));
    const landscape = img.width > img.height;
    const [pw, ph] = landscape ? [LETTER[1], LETTER[0]] : LETTER;
    const page = doc.addPage([pw, ph]);
    const s = Math.min((pw - 2 * margin) / img.width, (ph - 2 * margin) / img.height);
    const w = img.width * s, h = img.height * s;
    page.drawImage(img, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
  }
  doc.setTitle(title); doc.setProducer('Escáner Libre'); doc.setCreator('Escáner Libre');
  return new Blob([await doc.save()], { type: 'application/pdf' });
}

async function exportPdf() {
  if (!pages.length) return;
  await waitPending();
  const rec = await withBusy('Creando PDF…', async () => {
    const name = await nextName('pdf');
    const blob = await pagesToPdf(pages, { title: name.replace(/\.pdf$/, '') });
    return saveDoc(blob, { name, pages: pages.length, thumb: pages[0].thumb });
  });
  if (rec) resultSheet(rec, true);
}

export function resultSheet(rec, fromScan = false) {
  const file = new File([rec.blob], rec.name, { type: 'application/pdf' });
  const b = openSheet(`<h3>${esc(rec.name)}</h3>
    <p class="small muted">${rec.pages ? rec.pages + (rec.pages === 1 ? ' hoja, ' : ' hojas, ') : ''}${fmtBytes(rec.size)}. Guardado en Historial.</p>
    <div class="stack">
      <button class="btn primary" data-r="share"><svg><use href="#i-share"/></svg>Compartir</button>
      <button class="btn" data-r="dl"><svg><use href="#i-dl"/></svg>Descargar</button>
      ${fromScan ? '<button class="btn" data-r="new"><svg><use href="#i-plus"/></svg>Nuevo escaneo (vaciar páginas)</button>' : ''}
      <button class="btn" data-r="close">Cerrar</button>
    </div>`);
  b.addEventListener('click', async e => {
    const r = e.target.closest('[data-r]')?.dataset.r; if (!r) return;
    if (r === 'share') shareFiles([file], rec.name);
    else if (r === 'dl') downloadBlob(rec.blob, rec.name);
    else if (r === 'new') { pages = []; renderPages(); persist(); closeSheet(); }
    else closeSheet();
  });
}

async function exportJpg() {
  if (!pages.length) return;
  if (pending.size) { await waitPending(); }
  const base = (await nextName('pdf')).replace(/\.pdf$/, '');
  markUsed(base + '.jpg');
  const files = pages.map((p, i) => new File([p.out], pages.length > 1 ? `${base}_p${i + 1}.jpg` : `${base}.jpg`, { type: 'image/jpeg' }));
  if (canShareFiles(files)) return shareFiles(files, base);
  for (const f of files) { downloadBlob(f, f.name); await new Promise(r => setTimeout(r, 350)); }
  toast(files.length > 1 ? `${files.length} JPG descargados` : 'JPG descargado');
}

async function clearPages() {
  if (!(await confirmSheet('¿Vaciar todas las páginas escaneadas? (los PDF del historial no se borran)', 'Vaciar', true))) return;
  pages = []; renderPages(); persist();
}
