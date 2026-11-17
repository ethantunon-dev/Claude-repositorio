// Pestaña PDF: organizar (unir, dividir, reordenar, rotar), comprimir y firmar.
import { $, $$, esc, toast, busy, busyText, withBusy, openSheet, closeSheet, pickFiles, fmtBytes, setProgress, downloadBlob, shareFiles } from './ui.js';
import { getPDFLib, openPdfjs } from './libs.js';
import { saveDoc, nextName } from './history.js';
import { resultSheet } from './scan.js';
import { makeCanvas, canvasToBlob, nextFrame } from './imaging.js';
import { kv } from './db.js';
import { initSignaturePad, openPad } from './signature.js';

export function initPdfTools() {
  $('#pdfTabs').onclick = e => { const b = e.target.closest('[data-sub]'); if (b) showSub(b.dataset.sub); };
  initOrg(); initComp(); initSign();
  window.addEventListener('open-pdf', async e => {
    const { tool, file } = e.detail;
    document.querySelector('.tab[data-view="pdf"]').click();
    showSub(tool);
    if (tool === 'org') addOrgFiles([file]);
    else if (tool === 'comp') setCompFile(file);
    else if (tool === 'sign') loadSignPdf(file);
  });
}

function showSub(sub) {
  $$('#pdfTabs [data-sub]').forEach(b => b.setAttribute('aria-selected', b.dataset.sub === sub));
  for (const s of ['org', 'comp', 'sign']) $('#sub-' + s).hidden = s !== sub;
  $('#orgBar').hidden = sub !== 'org' || !org.pages.length;
}

async function readBytes(file) { return new Uint8Array(await file.arrayBuffer()); }

async function renderThumb(pdfDoc, n, maxW = 220) {
  const page = await pdfDoc.getPage(n);
  const vp1 = page.getViewport({ scale: 1 });
  const vp = page.getViewport({ scale: maxW / Math.max(vp1.width, vp1.height) * 1.3 });
  const c = makeCanvas(Math.ceil(vp.width), Math.ceil(vp.height));
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  page.cleanup();
  return c.toDataURL('image/jpeg', 0.7);
}

// ================= ORGANIZAR =================
const org = { files: [], pages: [] }; // files: {name, bytes, color}; pages: {f, i, rot, thumb}
const COLORS = ['#0f766e', '#b45309', '#7c3aed', '#be123c', '#2563eb', '#4d7c0f'];

function initOrg() {
  $('#orgAdd').onclick = async () => addOrgFiles(await pickFiles($('#orgFile')));
  $('#orgPages').addEventListener('click', e => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    const i = +b.closest('.pcard').dataset.i, p = org.pages[i], a = b.dataset.a;
    if (a === 'up' && i > 0) [org.pages[i - 1], org.pages[i]] = [org.pages[i], org.pages[i - 1]];
    else if (a === 'down' && i < org.pages.length - 1) [org.pages[i + 1], org.pages[i]] = [org.pages[i], org.pages[i + 1]];
    else if (a === 'rot') p.rot = (p.rot + 90) % 360;
    else if (a === 'del') org.pages.splice(i, 1);
    else return;
    renderOrg();
  });
  $('#orgClear').onclick = () => { org.files = []; org.pages = []; renderOrg(); };
  $('#orgSave').onclick = async () => {
    const rec = await withBusy('Creando PDF…', async () => {
      const blob = await buildPdf(org.pages);
      return saveDoc(blob, { pages: org.pages.length, thumb: org.pages[0]?.thumb });
    });
    if (rec) resultSheet(rec);
  };
  $('#orgSplit').onclick = splitMenu;
}

async function addOrgFiles(files) {
  files = files.filter(f => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
  if (!files.length) return;
  await withBusy('Leyendo PDF…', async () => {
    for (const f of files) {
      const bytes = await readBytes(f);
      const fi = org.files.length;
      let pdf;
      try { pdf = await openPdfjs(bytes.slice()); }
      catch (e) { toast(`⚠️ ${f.name}: ${e.name === 'PasswordException' ? 'está protegido con contraseña' : 'no se pudo leer'}`); continue; }
      org.files.push({ name: f.name, bytes, color: COLORS[fi % COLORS.length], n: pdf.numPages });
      for (let i = 1; i <= pdf.numPages; i++) {
        busyText(`Leyendo ${f.name}: página ${i} de ${pdf.numPages}…`);
        org.pages.push({ f: fi, i: i - 1, rot: 0, thumb: await renderThumb(pdf, i) });
      }
      pdf.destroy();
    }
  });
  renderOrg();
}

function renderOrg() {
  $('#orgFiles').innerHTML = org.files.map(f => `<span style="color:${f.color}">■</span> ${esc(f.name)} (${f.n} págs.)`).join('<br>');
  $('#orgPages').innerHTML = org.pages.map((p, i) => `
    <div class="pcard" data-i="${i}">
      <div class="thumb"><img src="${p.thumb}" alt="" style="transform:rotate(${p.rot}deg);${p.rot % 180 ? 'max-width:75%;max-height:75%' : ''}">
        <span class="num" style="background:${org.files[p.f].color}">${i + 1}</span></div>
      <div class="acts">
        <button data-a="up" aria-label="Mover antes" ${i === 0 ? 'disabled' : ''}><svg><use href="#i-left"/></svg></button>
        <button data-a="down" aria-label="Mover después" ${i === org.pages.length - 1 ? 'disabled' : ''}><svg><use href="#i-right"/></svg></button>
        <button data-a="rot" aria-label="Rotar"><svg><use href="#i-rot"/></svg></button>
        <button data-a="del" class="del" aria-label="Quitar"><svg><use href="#i-del"/></svg></button>
      </div>
    </div>`).join('');
  $('#orgBar').hidden = !org.pages.length || $('#sub-org').hidden;
}

async function buildPdf(list) {
  const { PDFDocument, degrees } = await getPDFLib();
  const out = await PDFDocument.create();
  const loaded = {};
  for (const p of list) {
    if (!loaded[p.f]) loaded[p.f] = await PDFDocument.load(org.files[p.f].bytes, { ignoreEncryption: true });
    const [pg] = await out.copyPages(loaded[p.f], [p.i]);
    pg.setRotation(degrees((pg.getRotation().angle + p.rot) % 360));
    out.addPage(pg);
  }
  out.setProducer('Escáner Libre');
  return new Blob([await out.save()], { type: 'application/pdf' });
}

function parseRanges(str, n) {
  const groups = [];
  for (const part of str.split(/[,;]+/)) {
    const m = part.trim().match(/^(\d+)\s*(?:-\s*(\d+))?$/); if (!m) continue;
    const a = +m[1], b = m[2] ? +m[2] : a;
    const lo = Math.max(1, Math.min(a, b)), hi = Math.min(n, Math.max(a, b));
    if (lo <= hi) groups.push(Array.from({ length: hi - lo + 1 }, (_, k) => lo + k - 1));
  }
  return groups;
}

function splitMenu() {
  const n = org.pages.length;
  const b = openSheet(`<h3>Dividir PDF (${n} páginas)</h3>
    <p class="small muted">Se crea un PDF por grupo y se guardan en el Historial.</p>
    <div class="stack">
      <button class="btn" data-s="each"><svg><use href="#i-pdf"/></svg>Cada página en un PDF</button>
      <label class="small muted" for="rangesIn">O por rangos (ej. 1-3, 4, 5-${n})</label>
      <input type="text" id="rangesIn" placeholder="1-3, 4, 5-${n}" inputmode="numeric">
      <button class="btn primary" data-s="ranges">Dividir por rangos</button>
    </div>`);
  b.addEventListener('click', async e => {
    const s = e.target.closest('[data-s]')?.dataset.s; if (!s) return;
    const groups = s === 'each' ? org.pages.map((_, i) => [i]) : parseRanges($('#rangesIn').value, n);
    if (!groups.length) return toast('Escribe rangos válidos, por ejemplo 1-3, 4');
    closeSheet();
    const recs = await withBusy('Dividiendo…', async () => {
      const out = [];
      for (let g = 0; g < groups.length; g++) {
        busyText(`Creando PDF ${g + 1} de ${groups.length}…`);
        const sel = groups[g].map(i => org.pages[i]);
        out.push(await saveDoc(await buildPdf(sel), { pages: sel.length, thumb: sel[0].thumb }));
      }
      return out;
    });
    if (recs?.length) listSheet(recs);
  });
}

function listSheet(recs) {
  const b = openSheet(`<h3>✅ ${recs.length} PDF creados</h3><p class="small muted">Guardados en el Historial.</p>
    <div class="stack">${recs.map((r, i) => `<button class="btn" data-i="${i}"><svg><use href="#i-share"/></svg>${esc(r.name)} · ${fmtBytes(r.size)}</button>`).join('')}
    <button class="btn primary" data-close>Cerrar</button></div>`);
  b.addEventListener('click', e => {
    if (e.target.closest('[data-close]')) return closeSheet();
    const i = e.target.closest('[data-i]')?.dataset.i; if (i == null) return;
    const r = recs[+i]; shareFiles([new File([r.blob], r.name, { type: 'application/pdf' })], r.name);
  });
}

// ================= COMPRIMIR =================
const LEVELS = {
  alta: { dpi: 150, q: 0.75, max: 2000 },
  media: { dpi: 120, q: 0.6, max: 1600 },
  whatsapp: { dpi: 100, q: 0.5, max: 1300 },
};
let comp = { file: null, level: 'media' };

function initComp() {
  $('#compPick').onclick = async () => { const [f] = await pickFiles($('#compFile')); if (f) setCompFile(f); };
  $('#compLevels').onclick = e => {
    const b = e.target.closest('[data-level]'); if (!b) return;
    comp.level = b.dataset.level;
    $$('#compLevels [data-level]').forEach(x => x.setAttribute('aria-checked', x === b));
  };
  $('#compRun').onclick = runCompress;
}

async function setCompFile(f) {
  comp.file = f;
  $('#compInfo').hidden = false;
  $('#compInfo').innerHTML = `<b>${esc(f.name)}</b><br><span class="muted small">Tamaño actual: ${fmtBytes(f.size)}</span>`;
  $('#compRun').disabled = false;
  $('#compResult').hidden = true;
}

// Rasteriza cada página con pdf.js y la vuelve a guardar como JPEG con la resolución del nivel.
export async function compressPdf(bytes, level, onProgress) {
  const L = LEVELS[level];
  const pdf = await openPdfjs(bytes.slice());
  const { PDFDocument } = await getPDFLib();
  const out = await PDFDocument.create();
  for (let i = 1; i <= pdf.numPages; i++) {
    onProgress && onProgress(i, pdf.numPages);
    const page = await pdf.getPage(i);
    const vp1 = page.getViewport({ scale: 1 });
    let scale = L.dpi / 72;
    scale = Math.min(scale, L.max / Math.max(vp1.width, vp1.height));
    const vp = page.getViewport({ scale });
    const c = makeCanvas(Math.ceil(vp.width), Math.ceil(vp.height));
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    const jpg = await canvasToBlob(c, 'image/jpeg', L.q);
    const img = await out.embedJpg(new Uint8Array(await jpg.arrayBuffer()));
    const pg = out.addPage([vp1.width, vp1.height]);
    pg.drawImage(img, { x: 0, y: 0, width: vp1.width, height: vp1.height });
    page.cleanup(); c.width = c.height = 0;
    await nextFrame();
  }
  pdf.destroy();
  out.setProducer('Escáner Libre');
  return { blob: new Blob([await out.save()], { type: 'application/pdf' }), pages: out.getPageCount() };
}

async function runCompress() {
  if (!comp.file) return;
  const pr = $('#compProgress'); $('#compRun').disabled = true; $('#compResult').hidden = true;
  try {
    const before = comp.file.size;
    const { blob, pages } = await compressPdf(await readBytes(comp.file), comp.level, (i, n) => setProgress(pr, (i - 1) / n, `Página ${i} de ${n}…`));
    setProgress(pr, 1, 'Listo');
    const pct = Math.round((1 - blob.size / before) * 100);
    const r = $('#compResult'); r.hidden = false;
    if (blob.size >= before) {
      r.innerHTML = `<div class="big">${fmtBytes(before)} → ${fmtBytes(blob.size)}</div><p>El archivo ya estaba bien comprimido; conviene usar el original o probar otro nivel.</p>`;
      return;
    }
    const base = comp.file.name.replace(/\.pdf$/i, '');
    const name = /_\d{4}-\d{2}-\d{2}_\d+$/.test(base) ? `${base}_${comp.level}.pdf` : await nextName('pdf');
    const thumb = (await openPdfjs((await readBytes(blob)).slice()).then(async d => { const t = await renderThumb(d, 1); d.destroy(); return t; }).catch(() => ''));
    const rec = await saveDoc(blob, { name, pages, thumb });
    r.innerHTML = `<div class="big">${fmtBytes(before)} → ${fmtBytes(blob.size)}</div>
      <p>−${pct} % · ${esc(rec.name)} guardado en el Historial.</p>
      <div class="row gap"><button class="btn primary" data-r="share"><svg><use href="#i-share"/></svg>Compartir</button>
      <button class="btn" data-r="dl"><svg><use href="#i-dl"/></svg>Descargar</button></div>`;
    r.onclick = e => {
      const a = e.target.closest('[data-r]')?.dataset.r;
      if (a === 'share') shareFiles([new File([blob], rec.name, { type: 'application/pdf' })], rec.name);
      if (a === 'dl') downloadBlob(blob, rec.name);
    };
  } catch (e) {
    console.error(e); setProgress(pr, 0, 'Error'); toast('⚠️ ' + (e.message || 'No se pudo comprimir'));
  } finally { $('#compRun').disabled = false; }
}

// ================= FIRMAR =================
const sign = { file: null, bytes: null, pdf: null, page: 1, boxes: [], sigUrl: null, sigBlob: null, vp: null };

function initSign() {
  initSignaturePad(async blob => { await kv.set('firma', blob); await loadSignature(); toast('Firma guardada en este dispositivo'); });
  $('#sigDraw').onclick = openPad;
  $('#signPick').onclick = async () => { const [f] = await pickFiles($('#signFile')); if (f) loadSignPdf(f); };
  $('#signPrev').onclick = () => gotoSign(sign.page - 1);
  $('#signNext').onclick = () => gotoSign(sign.page + 1);
  $('#signAdd').onclick = () => addBox(0.5, 0.8);
  $('#signSave').onclick = saveSigned;
  $('#signStage').addEventListener('click', e => {
    if (e.target.closest('.sig-box')) return;
    if (sign.boxes.some(b => b.page === sign.page)) return; // ya hay una: se mueve arrastrando
    const r = $('#signCanvas').getBoundingClientRect();
    addBox((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  });
  loadSignature();
}

async function loadSignature() {
  const blob = await kv.get('firma');
  sign.sigBlob = blob || null;
  if (sign.sigUrl) URL.revokeObjectURL(sign.sigUrl);
  sign.sigUrl = blob ? URL.createObjectURL(blob) : null;
  $('#sigPreview').innerHTML = blob ? `<img src="${sign.sigUrl}" alt="Tu firma">` : '<span class="muted small">Aún no has guardado una firma.</span>';
  $('#sigDraw').lastChild.textContent = blob ? 'Cambiar' : 'Dibujar';
  if (sign.pdf) drawBoxes();
}

async function loadSignPdf(f) {
  await withBusy('Abriendo PDF…', async () => {
    sign.bytes = await readBytes(f); sign.file = f;
    if (sign.pdf) sign.pdf.destroy();
    sign.pdf = await openPdfjs(sign.bytes.slice());
    sign.boxes = []; sign.page = 1;
    $('#signer').hidden = false;
    await gotoSign(1);
  });
  if (!sign.sigBlob) toast('Primero dibuja tu firma con el botón «Dibujar»', 3500);
}

async function gotoSign(n) {
  if (!sign.pdf || n < 1 || n > sign.pdf.numPages) return;
  sign.page = n;
  $('#signPageLbl').textContent = `Página ${n} de ${sign.pdf.numPages}`;
  const page = await sign.pdf.getPage(n);
  const vp1 = page.getViewport({ scale: 1 });
  const stageW = Math.min($('#view-pdf').clientWidth || 340, 700);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const vp = page.getViewport({ scale: stageW / vp1.width * dpr });
  sign.vp = page.getViewport({ scale: 1 });
  const c = $('#signCanvas'); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  $('#signStage').style.width = stageW + 'px';
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  drawBoxes();
}

function addBox(cx, cy) {
  if (!sign.sigBlob) return toast('Primero dibuja tu firma con el botón «Dibujar»');
  const w = 0.32, img = $('#sigPreview img');
  const ar = img && img.naturalWidth ? img.naturalHeight / img.naturalWidth : 0.35;
  const pageAr = sign.vp ? sign.vp.width / sign.vp.height : 0.77;
  const h = w * ar * pageAr;
  sign.boxes.push({ page: sign.page, x: Math.min(1 - w, Math.max(0, cx - w / 2)), y: Math.min(1 - h, Math.max(0, cy - h / 2)), w, h });
  drawBoxes();
}

function drawBoxes() {
  $$('#signStage .sig-box').forEach(b => b.remove());
  if (!sign.sigUrl) return;
  sign.boxes.forEach((b, idx) => {
    if (b.page !== sign.page) return;
    const el = document.createElement('div');
    el.className = 'sig-box';
    Object.assign(el.style, { left: b.x * 100 + '%', top: b.y * 100 + '%', width: b.w * 100 + '%', height: b.h * 100 + '%' });
    el.innerHTML = `<img src="${sign.sigUrl}" alt=""><span class="rs" aria-label="Cambiar tamaño"></span><button class="rm" aria-label="Quitar firma"><svg><use href="#i-x"/></svg></button>`;
    $('#signStage').appendChild(el);
    el.querySelector('.rm').onclick = ev => { ev.stopPropagation(); sign.boxes.splice(idx, 1); drawBoxes(); };
    let start = null;
    el.addEventListener('pointerdown', ev => {
      if (ev.target.closest('.rm')) return;
      ev.preventDefault(); el.setPointerCapture(ev.pointerId);
      start = { x: ev.clientX, y: ev.clientY, b: { ...b }, resize: !!ev.target.closest('.rs') };
    });
    el.addEventListener('pointermove', ev => {
      if (!start) return;
      const r = $('#signCanvas').getBoundingClientRect();
      const dx = (ev.clientX - start.x) / r.width, dy = (ev.clientY - start.y) / r.height;
      if (start.resize) {
        const nw = Math.max(0.06, Math.min(1 - b.x, start.b.w + dx));
        b.h = start.b.h * nw / start.b.w; b.w = nw;
      } else {
        b.x = Math.max(0, Math.min(1 - b.w, start.b.x + dx));
        b.y = Math.max(0, Math.min(1 - b.h, start.b.y + dy));
      }
      Object.assign(el.style, { left: b.x * 100 + '%', top: b.y * 100 + '%', width: b.w * 100 + '%', height: b.h * 100 + '%' });
    });
    const end = () => { start = null; };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  });
}

async function saveSigned() {
  if (!sign.boxes.length) return toast('Toca la página para colocar tu firma');
  const rec = await withBusy('Firmando…', async () => {
    const { PDFDocument, degrees } = await getPDFLib();
    const doc = await PDFDocument.load(sign.bytes, { ignoreEncryption: true });
    const png = await doc.embedPng(new Uint8Array(await sign.sigBlob.arrayBuffer()));
    for (const b of sign.boxes) {
      const page = doc.getPage(b.page - 1);
      const pj = await sign.pdf.getPage(b.page);
      const vp = pj.getViewport({ scale: 1 }); // incluye rotación y caja de recorte
      // esquinas de la caja en coordenadas PDF
      const [x1, y1] = vp.convertToPdfPoint(b.x * vp.width, (b.y + b.h) * vp.height); // abajo-izquierda en pantalla
      const [x2, y2] = vp.convertToPdfPoint((b.x + b.w) * vp.width, b.y * vp.height);
      const rot = ((page.getRotation().angle % 360) + 360) % 360;
      const w = b.w * vp.width, h = b.h * vp.height;
      // pdf-lib dibuja desde la esquina inferior izquierda de la imagen sin rotar; se compensa la rotación de la página
      const minX = Math.min(x1, x2), maxX = Math.max(x1, x2), minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
      const anchor = { 0: [minX, minY], 90: [maxX, minY], 180: [maxX, maxY], 270: [minX, maxY] }[rot] || [minX, minY];
      page.drawImage(png, { x: anchor[0], y: anchor[1], width: w, height: h, rotate: degrees(rot) });
    }
    doc.setProducer('Escáner Libre');
    const blob = new Blob([await doc.save()], { type: 'application/pdf' });
    const base = sign.file.name.replace(/\.pdf$/i, '');
    const thumb = await renderThumb(sign.pdf, 1).catch(() => '');
    return saveDoc(blob, { name: `${base}_firmado.pdf`, pages: doc.getPageCount(), thumb });
  });
  if (rec) { resultSheet(rec); sign.boxes = []; drawBoxes(); }
}
