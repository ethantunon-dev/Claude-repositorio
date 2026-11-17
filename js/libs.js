// Librerías externas por CDN con versión fija. Se cargan solo cuando se necesitan
// y el service worker las guarda en caché para que todo funcione sin conexión.
export const CDN = {
  pdfLib: 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js',
  pdfjs: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/legacy/build/pdf.min.mjs',
  pdfjsBase: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/',
  tesseract: 'https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js',
  tesseractCore: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@6.0.0',
  lang: l => `https://cdn.jsdelivr.net/npm/@tesseract.js-data/${l}@1.0.0/4.0.0_best_int`,
};

const scripts = {};
function loadScript(src) {
  if (!scripts[src]) scripts[src] = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.crossOrigin = 'anonymous'; s.async = true;
    s.onload = res;
    s.onerror = () => { delete scripts[src]; rej(new Error('No se pudo cargar una librería. Conéctate a internet una vez para descargarla.')); };
    document.head.appendChild(s);
  });
  return scripts[src];
}

export async function getPDFLib() {
  await loadScript(CDN.pdfLib);
  return window.PDFLib;
}

let pdfjsP;
export function getPdfjs() {
  if (!pdfjsP) pdfjsP = import(CDN.pdfjs).then(lib => {
    // worker local (mismo origen) que importa el de la CDN → controlado por el service worker
    lib.GlobalWorkerOptions.workerPort = new Worker(new URL('./pdfjs-worker.mjs', import.meta.url), { type: 'module' });
    return lib;
  }).catch(e => { pdfjsP = null; throw new Error('No se pudo cargar el lector de PDF. Conéctate a internet una vez para descargarlo.'); });
  return pdfjsP;
}

export async function openPdfjs(data) {
  const lib = await getPdfjs();
  return lib.getDocument({
    data,
    isEvalSupported: false,
    cMapUrl: CDN.pdfjsBase + 'cmaps/', cMapPacked: true,
    standardFontDataUrl: CDN.pdfjsBase + 'standard_fonts/',
  }).promise;
}

export async function getTesseract() {
  await loadScript(CDN.tesseract);
  return window.Tesseract;
}
