// Procesamiento de imagen: carga, homografía (corrección de perspectiva), filtros y rotación.

export const MAX_SRC = 3000;   // lado máximo de la foto original guardada
export const MAX_OUT = 2200;   // lado máximo de la página procesada (~200 ppp en Carta)

export function nextFrame() { return new Promise(r => requestAnimationFrame(() => setTimeout(r, 0))); }

export function makeCanvas(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}

export async function loadImage(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}

// Lee un archivo de imagen (respeta orientación EXIF) y lo reduce a MAX_SRC.
export async function fileToCanvas(blob, max = MAX_SRC) {
  const img = await loadImage(blob);
  const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = makeCanvas(Math.round(img.naturalWidth * s), Math.round(img.naturalHeight * s));
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

export function canvasToBlob(canvas, type = 'image/jpeg', quality = 0.85) {
  return new Promise((res, rej) => canvas.toBlob(b => b ? res(b) : rej(new Error('No se pudo codificar la imagen')), type, quality));
}

export function thumbDataURL(canvas, max = 240) {
  const s = Math.min(1, max / Math.max(canvas.width, canvas.height));
  const t = makeCanvas(Math.max(1, Math.round(canvas.width * s)), Math.max(1, Math.round(canvas.height * s)));
  const ctx = t.getContext('2d'); ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, 0, 0, t.width, t.height);
  return t.toDataURL('image/jpeg', 0.7);
}

// ---------- Homografía ----------
function solve(A, b) {
  const n = b.length;
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
    [A[i], A[p]] = [A[p], A[i]]; [b[i], b[p]] = [b[p], b[i]];
    for (let r = i + 1; r < n; r++) {
      const f = A[r][i] / A[i][i];
      for (let c = i; c < n; c++) A[r][c] -= f * A[i][c];
      b[r] -= f * b[i];
    }
  }
  const x = new Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i];
    for (let c = i + 1; c < n; c++) s -= A[i][c] * x[c];
    x[i] = s / A[i][i];
  }
  return x;
}

// Matriz 3x3 que lleva puntos de `from` a `to` (4 pares).
export function homography(from, to) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i], { x: u, y: v } = to[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  const h = solve(A, b);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

// Relación de aspecto real del rectángulo (Zhang & He, "Whiteboard scanning"), con respaldo simple.
export function estimateSize(q, imgW, imgH) {
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const wTop = d(q[0], q[1]), wBot = d(q[3], q[2]), hL = d(q[0], q[3]), hR = d(q[1], q[2]);
  const naiveW = Math.max(wTop, wBot), naiveH = Math.max(hL, hR);
  let ratio = naiveW / naiveH;
  try {
    const u0 = imgW / 2, v0 = imgH / 2;
    const m = p => [p.x - u0, p.y - v0, 1];
    const m1 = m(q[0]), m2 = m(q[1]), m3 = m(q[3]), m4 = m(q[2]);
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const k2 = dot(cross(m1, m4), m3) / dot(cross(m2, m4), m3);
    const k3 = dot(cross(m1, m4), m2) / dot(cross(m3, m4), m2);
    const n2 = m2.map((v, i) => k2 * v - m1[i]), n3 = m3.map((v, i) => k3 * v - m1[i]);
    const f2 = -(n2[0] * n3[0] + n2[1] * n3[1]) / (n2[2] * n3[2]);
    if (isFinite(f2) && f2 > 0 && Math.abs(n2[2]) > 1e-6 && Math.abs(n3[2]) > 1e-6) {
      const r = Math.sqrt((n2[0] ** 2 + n2[1] ** 2 + f2 * n2[2] ** 2) / (n3[0] ** 2 + n3[1] ** 2 + f2 * n3[2] ** 2));
      const f = Math.sqrt(f2), diag = Math.hypot(imgW, imgH);
      // aceptar solo si la focal es plausible y no se aleja demasiado de la estimación ingenua
      if (isFinite(r) && f > diag * 0.3 && f < diag * 4 && r / ratio < 1.6 && ratio / r < 1.6) ratio = r;
    }
  } catch { /* respaldo ingenuo */ }
  let W = Math.max(naiveW, naiveH * ratio), H = W / ratio;
  const s = Math.min(1, MAX_OUT / Math.max(W, H));
  return { w: Math.max(16, Math.round(W * s)), h: Math.max(16, Math.round(H * s)) };
}

// Corrige perspectiva. corners normalizadas [TL,TR,BR,BL].
export function warp(srcCanvas, cornersN) {
  const sw = srcCanvas.width, sh = srcCanvas.height;
  const q = cornersN.map(p => ({ x: p.x * sw, y: p.y * sh }));
  const { w, h } = estimateSize(q, sw, sh);
  const isFull = cornersN.every((p, i) => Math.abs(p.x - [0, 1, 1, 0][i]) < 1e-3 && Math.abs(p.y - [0, 0, 1, 1][i]) < 1e-3);
  const out = makeCanvas(isFull ? Math.round(sw * Math.min(1, MAX_OUT / Math.max(sw, sh))) : w,
    isFull ? Math.round(sh * Math.min(1, MAX_OUT / Math.max(sw, sh))) : h);
  if (isFull) { out.getContext('2d').drawImage(srcCanvas, 0, 0, out.width, out.height); return out; }
  const src = srcCanvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, sw, sh).data;
  const H = homography([{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }], q);
  const octx = out.getContext('2d');
  const img = octx.createImageData(w, h), d = img.data;
  for (let y = 0; y < h; y++) {
    const yc = y + 0.5;
    for (let x = 0; x < w; x++) {
      const xc = x + 0.5;
      const z = H[6] * xc + H[7] * yc + 1;
      let sx = (H[0] * xc + H[1] * yc + H[2]) / z - 0.5, sy = (H[3] * xc + H[4] * yc + H[5]) / z - 0.5;
      if (sx < 0) sx = 0; else if (sx > sw - 1.001) sx = sw - 1.001;
      if (sy < 0) sy = 0; else if (sy > sh - 1.001) sy = sh - 1.001;
      const x0 = sx | 0, y0 = sy | 0, fx = sx - x0, fy = sy - y0;
      const i00 = (y0 * sw + x0) * 4, i10 = i00 + 4, i01 = i00 + sw * 4, i11 = i01 + 4;
      const o = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const top = src[i00 + c] + (src[i10 + c] - src[i00 + c]) * fx;
        const bot = src[i01 + c] + (src[i11 + c] - src[i01 + c]) * fx;
        d[o + c] = top + (bot - top) * fy;
      }
      d[o + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}

// ---------- Filtros ----------
export const FILTERS = {
  original: 'Original',
  blanca: 'Pizarra blanca',
  verde: 'Pizarra verde',
  bn: 'B/N documento',
};

// Estima el fondo (iluminación) en baja resolución: filtro máx (fondo claro) o mín (fondo oscuro) + suavizado.
function background(chan, w, h, mode) {
  const f = Math.max(4, Math.round(Math.max(w, h) / 96));
  const bw = Math.ceil(w / f), bh = Math.ceil(h / f);
  let small = new Float32Array(bw * bh);
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    let s = 0, n = 0;
    for (let y = by * f; y < Math.min(h, (by + 1) * f); y += 2) for (let x = bx * f; x < Math.min(w, (bx + 1) * f); x += 2) { s += chan[y * w + x]; n++; }
    small[by * bw + bx] = s / n;
  }
  const r = 2;
  const ext = new Float32Array(bw * bh);
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    let v = mode === 'max' ? -1 : 1e9;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const xx = Math.min(bw - 1, Math.max(0, x + dx)), yy = Math.min(bh - 1, Math.max(0, y + dy));
      const p = small[yy * bw + xx];
      v = mode === 'max' ? Math.max(v, p) : Math.min(v, p);
    }
    ext[y * bw + x] = v;
  }
  small = boxBlur(boxBlur(ext, bw, bh, 2), bw, bh, 2);
  // reescalado bilineal a tamaño completo
  const full = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(bh - 1.001, Math.max(0, (y + 0.5) / f - 0.5)), y0 = sy | 0, fy = sy - y0;
    for (let x = 0; x < w; x++) {
      const sx = Math.min(bw - 1.001, Math.max(0, (x + 0.5) / f - 0.5)), x0 = sx | 0, fx = sx - x0;
      const a = small[y0 * bw + x0], b = small[y0 * bw + x0 + 1] ?? a, c = small[(y0 + 1) * bw + x0] ?? a, d = small[(y0 + 1) * bw + x0 + 1] ?? a;
      full[y * w + x] = (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
    }
  }
  return full;
}

function boxBlur(a, w, h, r) {
  const t = new Float32Array(w * h), o = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0, n = 0;
    for (let d = -r; d <= r; d++) { const xx = x + d; if (xx >= 0 && xx < w) { s += a[y * w + xx]; n++; } }
    t[y * w + x] = s / n;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0, n = 0;
    for (let d = -r; d <= r; d++) { const yy = y + d; if (yy >= 0 && yy < h) { s += t[yy * w + x]; n++; } }
    o[y * w + x] = s / n;
  }
  return o;
}

const clamp = (v, a = 0, b = 255) => v < a ? a : v > b ? b : v;

export function applyFilter(canvas, filter) {
  if (filter === 'original' || !FILTERS[filter]) return canvas;
  const w = canvas.width, h = canvas.height, ctx = canvas.getContext('2d', { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, w, h), d = img.data, n = w * h;
  const gray = new Float32Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) gray[i] = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2];

  if (filter === 'blanca') {
    // fondo blanco por canal (corrige iluminación y balance de blancos), trazo oscuro, conserva color del marcador
    const R = new Float32Array(n), G = new Float32Array(n), B = new Float32Array(n);
    for (let i = 0, j = 0; i < n; i++, j += 4) { R[i] = d[j]; G[i] = d[j + 1]; B[i] = d[j + 2]; }
    const br = background(R, w, h, 'max'), bg = background(G, w, h, 'max'), bb = background(B, w, h, 'max');
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      let r = R[i] / Math.max(br[i], 1), g = G[i] / Math.max(bg[i], 1), b = B[i] / Math.max(bb[i], 1);
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      // curva: lo cercano al fondo → blanco puro; el trazo se oscurece
      const t = clamp((l - 0.45) / (0.88 - 0.45), 0, 1), k = t * t * (3 - 2 * t);
      const ink = 1 - k; // 0 = fondo, 1 = tinta
      const sat = 1.6;
      const mr = l + (r - l) * sat, mg = l + (g - l) * sat, mb = l + (b - l) * sat;
      const dark = 0.55; // intensidad del trazo
      d[j] = clamp(255 * (1 - ink) + ink * clamp(mr * dark * 255));
      d[j + 1] = clamp(255 * (1 - ink) + ink * clamp(mg * dark * 255));
      d[j + 2] = clamp(255 * (1 - ink) + ink * clamp(mb * dark * 255));
    }
  } else if (filter === 'verde') {
    // pizarra oscura: la tiza (clara) pasa a trazo oscuro sobre fondo blanco
    const bgk = background(gray, w, h, 'min');
    let lo = 1e9, hi = 0;
    const diff = new Float32Array(n);
    for (let i = 0; i < n; i++) { const v = (gray[i] - bgk[i]) / Math.max(30, 255 - bgk[i]); diff[i] = v; }
    // normalizar con percentil alto del trazo
    const sample = []; for (let i = 0; i < n; i += 37) sample.push(diff[i]);
    sample.sort((a, b) => a - b);
    lo = sample[Math.floor(sample.length * 0.6)]; hi = sample[Math.floor(sample.length * 0.995)];
    lo = Math.max(lo, 0.06); hi = Math.max(hi, lo + 0.15);
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      const t = clamp((diff[i] - lo - 0.04) / (hi - lo), 0, 1);
      const v = 255 * (1 - Math.pow(t, 0.8));
      d[j] = d[j + 1] = d[j + 2] = v;
    }
  } else if (filter === 'bn') {
    const bgk = background(gray, w, h, 'max');
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      const r = gray[i] / Math.max(bgk[i], 1);
      const v = 255 * clamp((r - 0.62) / (0.8 - 0.62), 0, 1);
      d[j] = d[j + 1] = d[j + 2] = v;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// Sugerir filtro según el brillo y color del área recortada
export function suggestFilter(canvas) {
  const s = 64, t = makeCanvas(s, s), ctx = t.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(canvas, 0, 0, s, s);
  const d = ctx.getImageData(0, 0, s, s).data;
  const lums = [];
  for (let i = 0; i < d.length; i += 4) lums.push(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
  lums.sort((a, b) => a - b);
  const median = lums[lums.length >> 1];
  return median < 110 ? 'verde' : 'blanca';
}

export function rotateCanvas(canvas, deg) {
  deg = ((deg % 360) + 360) % 360;
  if (!deg) return canvas;
  const swap = deg === 90 || deg === 270;
  const out = makeCanvas(swap ? canvas.height : canvas.width, swap ? canvas.width : canvas.height);
  const ctx = out.getContext('2d');
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate(deg * Math.PI / 180);
  ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
  return out;
}

// Proceso completo de una página: perspectiva → filtro → rotación → JPEG
export async function renderPage(srcCanvas, page) {
  let c = warp(srcCanvas, page.corners);
  await nextFrame();
  c = applyFilter(c, page.filter);
  c = rotateCanvas(c, page.rotation || 0);
  const blob = await canvasToBlob(c, 'image/jpeg', 0.85);
  return { blob, w: c.width, h: c.height, thumb: thumbDataURL(c), canvas: c };
}
