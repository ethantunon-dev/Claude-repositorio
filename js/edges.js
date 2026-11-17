// Detección automática de los 4 bordes de un documento/pizarra (JS puro, sin OpenCV).
// Canny simplificado → Hough con orientación del gradiente → mejor cuadrilátero por soporte de borde.
// Devuelve esquinas normalizadas [TL, TR, BR, BL] (0..1) o null si no hay confianza.

export function detectQuad(rgba, width, height) {
  const maxSide = 480;
  const s = Math.min(1, maxSide / Math.max(width, height));
  const w = Math.max(8, Math.round(width * s)), h = Math.max(8, Math.round(height * s));
  const gray = downscaleGray(rgba, width, height, w, h);
  const blurred = gaussian(gaussian(gray, w, h), w, h);
  const { mag, ang } = sobel(blurred, w, h);
  const edges = canny(mag, ang, w, h);
  const dil = dilate(dilate(edges, w, h), w, h);
  const lines = hough(edges, ang, w, h);
  const quad = bestQuad(lines, dil, w, h);
  if (!quad) return null;
  let norm = quad.map(p => ({ x: p.x / w, y: p.y / h }));
  try { norm = refine(rgba, width, height, norm); } catch (e) { /* se queda con la detección gruesa */ }
  return norm.map(p => ({ x: clamp01(p.x), y: clamp01(p.y) }));
}

// Afinado de cada lado a mayor resolución: busca el máximo del gradiente perpendicular
// cerca de la línea gruesa y ajusta una recta por mínimos cuadrados.
function refine(rgba, width, height, q) {
  const s = Math.min(1, 1100 / Math.max(width, height));
  const w = Math.round(width * s), h = Math.round(height * s);
  const g = gaussian(downscaleGray(rgba, width, height, w, h), w, h);
  const P = q.map(p => ({ x: p.x * w, y: p.y * h }));
  const at = (x, y) => { const xi = Math.min(w - 2, Math.max(1, Math.round(x))), yi = Math.min(h - 2, Math.max(1, Math.round(y))); return g[yi * w + xi]; };
  const lines = [];
  const cx = P.reduce((a, p) => a + p.x, 0) / 4, cy = P.reduce((a, p) => a + p.y, 0) / 4;
  for (let i = 0; i < 4; i++) {
    const a = P[i], b = P[(i + 1) % 4];
    const len = Math.hypot(b.x - a.x, b.y - a.y), ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
    let nx = -uy, ny = ux;
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    if ((cx - mx) * nx + (cy - my) * ny < 0) { nx = -nx; ny = -ny; } // normal hacia adentro
    const onBorder = (Math.abs(a.x - b.x) < 2 && (a.x < 2 || a.x > w - 3)) || (Math.abs(a.y - b.y) < 2 && (a.y < 2 || a.y > h - 3));
    const pts = [];
    if (!onBorder) {
      // perfil medio del gradiente perpendicular: detecta un marco (dos bordes paralelos muy juntos)
      const span = 2 * Math.abs((cx - mx) * nx + (cy - my) * ny);
      const dIn = Math.max(8, span * 0.045), step = 0.5, d0 = -6;
      const nS = Math.round((dIn - d0) / step) + 1, prof = new Float32Array(nS);
      const samples = 30;
      for (let k = 1; k < samples; k++) {
        const t = 0.08 + 0.84 * k / samples, bx = a.x + (b.x - a.x) * t, by = a.y + (b.y - a.y) * t;
        for (let j = 0; j < nS; j++) {
          const d = d0 + j * step, x = bx + nx * d, y = by + ny * d;
          prof[j] += Math.abs(at(x + nx, y + ny) - at(x - nx, y - ny)) / samples;
        }
      }
      let j0 = 0;
      for (let j = 0; j <= Math.round(12 / step); j++) if (prof[j] > prof[j0]) j0 = j;
      let base = d0 + j0 * step;
      const minGap = Math.max(3, span * 0.005) / step;
      let valley = prof[j0];
      for (let j = j0 + 1; j < nS - 1; j++) {
        valley = Math.min(valley, prof[j]);
        if (j - j0 < minGap) continue;
        const isPeak = prof[j] >= prof[j - 1] && prof[j] >= prof[j + 1];
        if (isPeak && prof[j] > 0.2 * prof[j0] && prof[j] > 7 && valley < 0.5 * Math.min(prof[j], prof[j0])) { base = d0 + j * step; break; }
      }
      const R = 4;
      for (let k = 1; k < 40; k++) {
        const t = 0.06 + 0.88 * k / 40, bx = a.x + (b.x - a.x) * t + nx * base, by = a.y + (b.y - a.y) * t + ny * base;
        let best = 0, bd = 0;
        for (let d = -R; d <= R; d += 0.5) {
          const x = bx + nx * d, y = by + ny * d;
          const gn = Math.abs(at(x + nx, y + ny) - at(x - nx, y - ny));
          if (gn > best) { best = gn; bd = d; }
        }
        if (best > 12) pts.push({ x: bx + nx * bd, y: by + ny * bd });
      }
    }
    let line = null;
    if (pts.length >= 12) {
      line = fitLine(pts);
      const keep = pts.filter(p => Math.abs((p.x - line.px) * line.nx + (p.y - line.py) * line.ny) < 1.5);
      if (keep.length >= 10) line = fitLine(keep); else line = null;
    }
    if (!line) line = { px: a.x, py: a.y, nx: -uy, ny: ux };
    // pequeño margen hacia adentro para no dejar el marco
    const sgn = (line.nx * nx + line.ny * ny) > 0 ? 1 : -1;
    line.px += line.nx * sgn * 1.2; line.py += line.ny * sgn * 1.2;
    lines.push(line);
  }
  const out = [];
  for (let i = 0; i < 4; i++) {
    const l1 = lines[(i + 3) % 4], l2 = lines[i];
    const p = intersectPN(l1, l2);
    if (!p || Math.hypot(p.x - P[i].x, p.y - P[i].y) > Math.max(w, h) * 0.08) return q; // algo raro: conservar detección gruesa
    out.push({ x: p.x / w, y: p.y / h });
  }
  return out;
}

function fitLine(pts) {
  const n = pts.length, mx = pts.reduce((a, p) => a + p.x, 0) / n, my = pts.reduce((a, p) => a + p.y, 0) / n;
  let sxx = 0, sxy = 0, syy = 0;
  for (const p of pts) { const dx = p.x - mx, dy = p.y - my; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; }
  const th = 0.5 * Math.atan2(2 * sxy, sxx - syy); // dirección principal
  return { px: mx, py: my, nx: -Math.sin(th), ny: Math.cos(th) };
}

function intersectPN(a, b) {
  // n·(x - p) = 0 para ambas rectas
  const c1 = a.nx * a.px + a.ny * a.py, c2 = b.nx * b.px + b.ny * b.py;
  const det = a.nx * b.ny - a.ny * b.nx;
  if (Math.abs(det) < 1e-6) return null;
  return { x: (c1 * b.ny - c2 * a.ny) / det, y: (a.nx * c2 - b.nx * c1) / det };
}

export function fullQuad() {
  return [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
}

const clamp01 = v => Math.min(1, Math.max(0, v));

function downscaleGray(src, sw, sh, w, h) {
  const out = new Float32Array(w * h);
  const fx = sw / w, fy = sh / h;
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * fy), y1 = Math.max(y0 + 1, Math.floor((y + 1) * fy));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * fx), x1 = Math.max(x0 + 1, Math.floor((x + 1) * fx));
      let sum = 0, n = 0;
      // muestreo de 3x3 dentro del bloque (rápido y suficiente)
      for (let yy = y0; yy < y1; yy += Math.max(1, (y1 - y0) >> 1)) {
        for (let xx = x0; xx < x1; xx += Math.max(1, (x1 - x0) >> 1)) {
          const i = (yy * sw + xx) * 4;
          sum += 0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2]; n++;
        }
      }
      out[y * w + x] = sum / n;
    }
  }
  return out;
}

function gaussian(a, w, h) {
  const k = [1, 4, 6, 4, 1], t = new Float32Array(w * h), o = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0;
    for (let j = -2; j <= 2; j++) { const xx = Math.min(w - 1, Math.max(0, x + j)); s += a[y * w + xx] * k[j + 2]; }
    t[y * w + x] = s / 16;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0;
    for (let j = -2; j <= 2; j++) { const yy = Math.min(h - 1, Math.max(0, y + j)); s += t[yy * w + x] * k[j + 2]; }
    o[y * w + x] = s / 16;
  }
  return o;
}

function sobel(a, w, h) {
  const mag = new Float32Array(w * h), ang = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const gx = -a[i - w - 1] - 2 * a[i - 1] - a[i + w - 1] + a[i - w + 1] + 2 * a[i + 1] + a[i + w + 1];
    const gy = -a[i - w - 1] - 2 * a[i - w] - a[i - w + 1] + a[i + w - 1] + 2 * a[i + w] + a[i + w + 1];
    mag[i] = Math.hypot(gx, gy); ang[i] = Math.atan2(gy, gx);
  }
  return { mag, ang };
}

function canny(mag, ang, w, h) {
  const nms = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x, m = mag[i];
    if (m < 1) continue;
    let a = ang[i] * 180 / Math.PI; if (a < 0) a += 180;
    let n1, n2;
    if (a < 22.5 || a >= 157.5) { n1 = mag[i - 1]; n2 = mag[i + 1]; }
    else if (a < 67.5) { n1 = mag[i - w - 1]; n2 = mag[i + w + 1]; }
    else if (a < 112.5) { n1 = mag[i - w]; n2 = mag[i + w]; }
    else { n1 = mag[i - w + 1]; n2 = mag[i + w - 1]; }
    if (m >= n1 && m >= n2) nms[i] = m;
  }
  // umbrales por percentil de magnitudes no nulas
  const vals = [];
  for (let i = 0; i < nms.length; i += 3) if (nms[i] > 0) vals.push(nms[i]);
  vals.sort((p, q) => p - q);
  const hi = Math.max(20, vals.length ? vals[Math.floor(vals.length * 0.8)] : 40), lo = hi * 0.4;
  const out = new Uint8Array(w * h), stack = [];
  for (let i = 0; i < nms.length; i++) if (nms[i] >= hi) { out[i] = 1; stack.push(i); }
  while (stack.length) {
    const i = stack.pop();
    for (const d of [-w - 1, -w, -w + 1, -1, 1, w - 1, w, w + 1]) {
      const j = i + d;
      if (j > 0 && j < out.length && !out[j] && nms[j] >= lo) { out[j] = 1; stack.push(j); }
    }
  }
  return out;
}

function dilate(e, w, h) {
  const o = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!e[y * w + x]) continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < w && yy < h) o[yy * w + xx] = 1;
    }
  }
  return o;
}

// Hough: cada píxel de borde vota solo cerca de la orientación de su gradiente.
function hough(edges, ang, w, h) {
  const nT = 180, diag = Math.ceil(Math.hypot(w, h)), nR = diag * 2 + 1;
  const acc = new Float32Array(nT * nR);
  const cos = new Float32Array(nT), sin = new Float32Array(nT);
  for (let t = 0; t < nT; t++) { cos[t] = Math.cos(t * Math.PI / nT); sin[t] = Math.sin(t * Math.PI / nT); }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!edges[i]) continue;
    let a = ang[i]; if (a < 0) a += Math.PI;
    const tc = Math.round(a * nT / Math.PI);
    for (let d = -4; d <= 4; d++) {
      const t = ((tc + d) % nT + nT) % nT;
      const r = Math.round(x * cos[t] + y * sin[t]) + diag;
      acc[t * nR + r] += 1;
    }
  }
  const minVotes = Math.min(w, h) * 0.12;
  const peaks = [];
  for (let t = 0; t < nT; t++) for (let r = 0; r < nR; r++) {
    const v = acc[t * nR + r];
    if (v < minVotes) continue;
    let isMax = true;
    for (let dt = -3; dt <= 3 && isMax; dt++) for (let dr = -6; dr <= 6; dr++) {
      if (!dt && !dr) continue;
      const tt = ((t + dt) % nT + nT) % nT, rr = (t + dt < 0 || t + dt >= nT) ? (2 * diag - r) : r + dr;
      if (rr < 0 || rr >= nR) continue;
      if (acc[tt * nR + rr] > v) { isMax = false; break; }
    }
    if (isMax) peaks.push({ theta: t * Math.PI / nT, rho: r - diag, votes: v });
  }
  peaks.sort((a, b) => b.votes - a.votes);
  // eliminar casi duplicados
  const res = [];
  for (const p of peaks) {
    if (res.some(q => Math.abs(angDiff(q.theta, p.theta)) < 0.06 && Math.abs(Math.abs(q.rho) - Math.abs(p.rho)) < 8)) continue;
    res.push(p); if (res.length >= 24) break;
  }
  return res;
}

function angDiff(a, b) { let d = a - b; while (d > Math.PI / 2) d -= Math.PI; while (d < -Math.PI / 2) d += Math.PI; return d; }

function intersect(l1, l2) {
  const a1 = Math.cos(l1.theta), b1 = Math.sin(l1.theta), a2 = Math.cos(l2.theta), b2 = Math.sin(l2.theta);
  const det = a1 * b2 - a2 * b1;
  if (Math.abs(det) < 1e-6) return null;
  return { x: (l1.rho * b2 - l2.rho * b1) / det, y: (a1 * l2.rho - a2 * l1.rho) / det };
}

function support(p, q, dil, w, h) {
  const len = Math.hypot(q.x - p.x, q.y - p.y), n = Math.max(8, Math.round(len));
  let hit = 0, cnt = 0;
  for (let k = 0; k <= n; k++) {
    const x = Math.round(p.x + (q.x - p.x) * k / n), y = Math.round(p.y + (q.y - p.y) * k / n);
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    cnt++; if (dil[y * w + x]) hit++;
  }
  return cnt ? hit / (n + 1) : 0;
}

function polyArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p.x * q.y - q.x * p.y; }
  return a / 2;
}

function isConvex(pts) {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = pts[i], b = pts[(i + 1) % 4], c = pts[(i + 2) % 4];
    const z = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(z) < 1e-9) return false;
    const s = Math.sign(z); if (!sign) sign = s; else if (s !== sign) return false;
  }
  return true;
}

function cornerAngleOk(pts) {
  for (let i = 0; i < 4; i++) {
    const a = pts[(i + 3) % 4], b = pts[i], c = pts[(i + 1) % 4];
    const v1x = a.x - b.x, v1y = a.y - b.y, v2x = c.x - b.x, v2y = c.y - b.y;
    const cos = (v1x * v2x + v1y * v2y) / (Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y));
    const deg = Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
    if (deg < 50 || deg > 130) return false;
  }
  return true;
}

function bestQuad(lines, dil, w, h) {
  // bordes de la imagen como candidatos (documento que llena la foto); soporte fijo moderado
  const borders = [
    { theta: Math.PI / 2, rho: 1, votes: 0, border: true },
    { theta: Math.PI / 2, rho: h - 2, votes: 0, border: true },
    { theta: 0, rho: 1, votes: 0, border: true },
    { theta: 0, rho: w - 2, votes: 0, border: true },
  ];
  const horiz = [], vert = [];
  for (const l of lines) {
    const deg = l.theta * 180 / Math.PI; // normal: 90° → línea horizontal
    if (Math.abs(deg - 90) < 35) horiz.push(l); else if (deg < 45 || deg > 135) vert.push(l);
  }
  const H = horiz.slice(0, 10).concat(borders.slice(0, 2));
  const V = vert.slice(0, 10).concat(borders.slice(2));
  const img = w * h, margin = 0.04;
  let best = null;
  for (let i = 0; i < H.length; i++) for (let j = i + 1; j < H.length; j++)
    for (let k = 0; k < V.length; k++) for (let m = k + 1; m < V.length; m++) {
      const lines4 = [H[i], H[j], V[k], V[m]];
      const nb = lines4.filter(l => l.border).length;
      if (nb > 2) continue;
      let top = H[i], bot = H[j], left = V[k], right = V[m];
      const tl0 = intersect(top, left);
      if (!tl0) continue;
      let pts = [intersect(top, left), intersect(top, right), intersect(bot, right), intersect(bot, left)];
      if (pts.some(p => !p)) continue;
      // ordenar: arriba/abajo y izquierda/derecha por posición
      const cy = pts.reduce((s, p) => s + p.y, 0) / 4, cx = pts.reduce((s, p) => s + p.x, 0) / 4;
      if ((pts[0].y + pts[1].y) / 2 > cy) { [top, bot] = [bot, top]; }
      if ((pts[0].x + pts[3].x) / 2 > cx) { [left, right] = [right, left]; }
      pts = [intersect(top, left), intersect(top, right), intersect(bot, right), intersect(bot, left)];
      if (pts.some(p => p.x < -margin * w || p.y < -margin * h || p.x > w * (1 + margin) || p.y > h * (1 + margin))) continue;
      if (!isConvex(pts) || !cornerAngleOk(pts)) continue;
      const area = Math.abs(polyArea(pts)) / img;
      if (area < 0.15) continue;
      const sides = [[top, pts[0], pts[1]], [right, pts[1], pts[2]], [bot, pts[2], pts[3]], [left, pts[3], pts[0]]];
      let sum = 0, minS = 1;
      for (const [l, a, b] of sides) {
        const s = l.border ? 0.45 : support(a, b, dil, w, h);
        sum += s; minS = Math.min(minS, s);
      }
      const avg = sum / 4;
      if (minS < 0.25 || avg < 0.5) continue;
      const score = avg * (0.55 + 0.45 * Math.sqrt(area)) - nb * 0.04;
      if (!best || score > best.score) best = { score, pts };
    }
  return best ? best.pts : null;
}
