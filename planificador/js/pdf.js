// Lee los textos de un PDF con su posición (pdf.js por CDN con versión fija; el service worker lo
// guarda la primera vez, así después funciona sin conexión).
const BASE = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/';
let libP = null;
function pdfjs() {
  if (!libP) libP = import(BASE + 'legacy/build/pdf.min.mjs').then(lib => {
    // worker del mismo origen que importa el de la CDN (un worker no puede venir de otro dominio)
    lib.GlobalWorkerOptions.workerPort = new Worker(new URL('./pdfjs-worker.mjs', import.meta.url), { type: 'module' });
    return lib;
  }).catch(() => {
    libP = null;
    const e = new Error('Para leer el PDF hace falta internet la primera vez. Conéctate y vuelve a intentarlo.');
    e.propio = true; throw e;
  });
  return libP;
}

export async function itemsDePDF(file) {
  const lib = await pdfjs();
  let doc;
  try {
    doc = await lib.getDocument({
      data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false,
      cMapUrl: BASE + 'cmaps/', cMapPacked: true, standardFontDataUrl: BASE + 'standard_fonts/',
    }).promise;
  } catch (err) {
    const e = new Error(err?.name === 'PasswordException' ? 'Ese PDF tiene contraseña. Descárgalo otra vez sin contraseña.' : 'No se pudo abrir ese archivo como PDF.');
    e.propio = true; throw e;
  }
  const out = [];
  for (let p = 1; p <= Math.min(doc.numPages, 5); p++) {
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    for (const it of tc.items) {
      if (it.str && it.str.trim()) out.push({ p, str: it.str, x: it.transform[4], y: vp.height - it.transform[5], w: it.width, h: it.height });
    }
  }
  doc.destroy?.();
  return out;
}
