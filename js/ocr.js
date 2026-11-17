// Pestaña Texto (OCR) con Tesseract.js, 100 % local. Se carga solo al usarlo.
import { $, $$, toast, setProgress, withBusy, pickFiles } from './ui.js';
import { getTesseract, getPDFLib, CDN } from './libs.js';
import { getPages, resultSheet } from './scan.js';
import { fileToCanvas, canvasToBlob, thumbDataURL } from './imaging.js';
import { saveDoc, nextName } from './history.js';
import { kv } from './db.js';

let lang = 'spa', source = null; // {blob, thumb, id}
let worker = null, workerLang = null, last = null; // last = {blob, w, h, data}

export function initOcr() {
  window.addEventListener('pages-changed', renderSources);
  renderSources();
  $('#ocrSources').addEventListener('click', e => {
    const b = e.target.closest('[data-id]'); if (!b) return;
    const p = getPages().find(x => x.id === b.dataset.id); if (p) select({ blob: p.out, thumb: p.thumb, id: p.id });
  });
  $('#ocrPick').onclick = async () => { const [f] = await pickFiles($('#ocrFile')); if (f) selectFile(f); };
  $('#ocrPhoto').onclick = async () => { const [f] = await pickFiles($('#ocrCam')); if (f) selectFile(f); };
  $('#ocrLang').onclick = e => {
    const b = e.target.closest('[data-lang]'); if (!b) return;
    lang = b.dataset.lang;
    $$('#ocrLang [data-lang]').forEach(x => x.setAttribute('aria-checked', x === b));
    updateCacheInfo();
  };
  $('#ocrRun').onclick = run;
  $('#ocrCopy').onclick = copyText;
  $('#ocrPdf').onclick = searchablePdf;
  updateCacheInfo();
}

function renderSources() {
  const pages = getPages();
  // si la página elegida ya no existe (se borró o se vació el escaneo), se toma la más reciente
  if (source?.id && !pages.some(p => p.id === source.id)) { source = null; $('#ocrPreview').hidden = true; }
  $('#ocrSources').innerHTML = pages.map((p, i) => `<button data-id="${p.id}" class="${source?.id === p.id ? 'on' : ''}" aria-label="Página ${i + 1}"><img src="${p.thumb}" alt=""></button>`).join('');
  const lastP = pages[pages.length - 1];
  if (!source && lastP) select({ blob: lastP.out, thumb: lastP.thumb, id: lastP.id });
}

async function selectFile(f) {
  await withBusy('Abriendo imagen…', async () => {
    const c = await fileToCanvas(f, 2600);
    select({ blob: await canvasToBlob(c, 'image/jpeg', 0.92), thumb: thumbDataURL(c), id: null });
  });
}

let prevUrl;
function select(s) {
  source = s;
  $$('#ocrSources [data-id]').forEach(b => b.classList.toggle('on', b.dataset.id === s.id));
  if (prevUrl) URL.revokeObjectURL(prevUrl);
  prevUrl = URL.createObjectURL(s.blob);
  $('#ocrPreview').src = prevUrl; $('#ocrPreview').hidden = false;
}

async function updateCacheInfo() {
  const ready = await kv.get('ocr-ready-' + lang);
  $('#ocrCacheInfo').textContent = ready
    ? '✓ OCR en este idioma disponible sin conexión.'
    : 'La primera vez se descargan unos 6 MB (una sola vez); después funciona sin conexión.';
}

async function getWorker(onProgress) {
  if (worker && workerLang === lang) return worker;
  if (worker) { await worker.terminate(); worker = null; }
  const T = await getTesseract();
  worker = await T.createWorker(lang, 1, {
    workerPath: new URL('./ocr-worker.js', import.meta.url).href,
    workerBlobURL: false,
    corePath: CDN.tesseractCore,
    langPath: CDN.lang(lang),
    logger: m => onProgress && onProgress(m),
  });
  workerLang = lang;
  kv.set('ocr-ready-' + lang, true);
  return worker;
}

const STATUS = {
  'loading tesseract core': 'Cargando motor OCR', 'initializing tesseract': 'Iniciando OCR', 'initialized tesseract': 'OCR listo',
  'loading language traineddata': 'Cargando idioma', 'loaded language traineddata': 'Idioma cargado', 'initializing api': 'Preparando',
  'initialized api': 'Preparado', 'recognizing text': 'Reconociendo texto',
};

async function run() {
  if (!source) return toast('Primero elige una página o imagen');
  const pr = $('#ocrProgress'), btn = $('#ocrRun');
  btn.disabled = true;
  setProgress(pr, 0, 'Cargando OCR…');
  try {
    const onP = m => setProgress(pr, m.progress || 0, `${STATUS[m.status] || m.status}… ${Math.round((m.progress || 0) * 100)} %`);
    const w = await getWorker(onP);
    const { data } = await w.recognize(source.blob, {}, { text: true, blocks: true });
    const bmp = await createImageBitmap(source.blob);
    last = { blob: source.blob, w: bmp.width, h: bmp.height, data, thumb: source.thumb };
    bmp.close?.();
    const text = (data.text || '').trim();
    $('#ocrText').value = text;
    $('#ocrResult').hidden = false;
    setProgress(pr, 1, text ? `Listo · confianza media ${Math.round(data.confidence || 0)} %` : 'No se encontró texto');
    if (text && data.confidence < 60) toast('Confianza baja: revisa el texto (la letra manuscrita suele fallar)', 4000);
    updateCacheInfo();
    $('#ocrResult').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) {
    console.error(e);
    setProgress(pr, 0, 'Error');
    toast('⚠️ ' + (navigator.onLine ? (e.message || 'Error en el OCR') : 'Sin conexión: conéctate una vez para descargar el OCR'), 4500);
    if (worker) { try { await worker.terminate(); } catch { } worker = null; }
  } finally { btn.disabled = false; }
}

async function copyText() {
  const t = $('#ocrText').value;
  try { await navigator.clipboard.writeText(t); toast('Texto copiado'); }
  catch { $('#ocrText').select(); document.execCommand('copy'); toast('Texto copiado'); }
}

// PDF con la imagen y una capa de texto invisible encima de cada palabra (seleccionable y buscable)
async function searchablePdf() {
  if (!last) return;
  const rec = await withBusy('Creando PDF buscable…', async () => {
    const PL = await getPDFLib();
    const { PDFDocument, StandardFonts, pushGraphicsState, popGraphicsState, beginText, endText, setFontAndSize,
      setTextRenderingMode, TextRenderingMode, setTextMatrix, showText, setCharacterSqueeze } = PL;
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const img = await doc.embedJpg(new Uint8Array(await last.blob.arrayBuffer()));
    const landscape = img.width > img.height;
    const [pw, ph] = landscape ? [792, 612] : [612, 792];
    const page = doc.addPage([pw, ph]);
    const m = 14, s = Math.min((pw - 2 * m) / img.width, (ph - 2 * m) / img.height);
    const ox = (pw - img.width * s) / 2, oy = (ph - img.height * s) / 2;
    page.drawImage(img, { x: ox, y: oy, width: img.width * s, height: img.height * s });
    const sx = img.width / last.w; // bbox de Tesseract está en píxeles de la imagen original
    const fontRef = page.node.newFontDictionary(font.name, font.ref);
    const ops = [];
    for (const b of last.data.blocks || []) for (const par of b.paragraphs || []) for (const ln of par.lines || []) for (const wd of ln.words || []) {
      let t = (wd.text || '').trim(); if (!t) continue;
      t = [...t].filter(ch => { try { font.encodeText(ch); return true; } catch { return false; } }).join('');
      if (!t) continue;
      const { x0, y0, x1, y1 } = wd.bbox;
      const hgt = (y1 - y0) * sx * s, wid = (x1 - x0) * sx * s;
      if (hgt <= 0 || wid <= 0) continue;
      const size = hgt * 0.9;
      const natural = font.widthOfTextAtSize(t, size);
      const squeeze = natural > 0 ? Math.max(10, Math.min(500, wid / natural * 100)) : 100;
      const x = ox + x0 * sx * s, y = oy + (img.height - y1 * sx) * s + hgt * 0.15;
      ops.push(pushGraphicsState(), beginText(), setFontAndSize(fontRef, size), setTextRenderingMode(TextRenderingMode.Invisible),
        setCharacterSqueeze(squeeze), setTextMatrix(1, 0, 0, 1, x, y), showText(font.encodeText(t + ' ')), endText(), popGraphicsState());
    }
    page.pushOperators(...ops);
    const name = await nextName('pdf');
    doc.setTitle(name.replace(/\.pdf$/, '')); doc.setProducer('Escáner Libre'); doc.setSubject($('#ocrText').value.slice(0, 300));
    const blob = new Blob([await doc.save()], { type: 'application/pdf' });
    return saveDoc(blob, { name, pages: 1, thumb: last.thumb });
  });
  if (rec) resultSheet(rec);
}
