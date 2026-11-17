// Pad para dibujar la firma con el dedo. Se guarda como PNG transparente recortado.
import { $, $$, toast } from './ui.js';

let onSave, strokes = [], cur = null, color = '#111827';

export function initSignaturePad(cb) {
  onSave = cb;
  const c = $('#padCanvas');
  c.addEventListener('pointerdown', e => {
    e.preventDefault(); c.setPointerCapture(e.pointerId);
    cur = { color, pts: [pt(e)] }; strokes.push(cur); draw();
  });
  c.addEventListener('pointermove', e => {
    if (!cur) return;
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of (evs.length ? evs : [e])) cur.pts.push(pt(ev));
    draw();
  });
  const end = () => { cur = null; };
  c.addEventListener('pointerup', end); c.addEventListener('pointercancel', end);
  $('#padClear').onclick = () => { strokes = []; draw(); };
  $('#padCancel').onclick = closePad;
  $('#padColors').onclick = e => {
    const b = e.target.closest('[data-color]'); if (!b) return;
    color = b.dataset.color; $$('#padColors .chip').forEach(x => x.classList.toggle('on', x === b));
  };
  $('#padSave').onclick = save;
  window.addEventListener('resize', () => { if (!$('#sigPad').hidden) size(); });
}

function pt(e) {
  const r = $('#padCanvas').getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function size() {
  const c = $('#padCanvas'), dpr = Math.min(3, window.devicePixelRatio || 1);
  c.width = c.clientWidth * dpr; c.height = c.clientHeight * dpr;
  draw();
}

function paint(ctx, scale, ox = 0, oy = 0) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const base = Math.max(2.2, Math.min($('#padCanvas').clientWidth || 340, 700) / 160);
  for (const s of strokes) {
    ctx.strokeStyle = s.color; ctx.fillStyle = s.color;
    const p = s.pts;
    if (p.length === 1) { ctx.beginPath(); ctx.arc((p[0].x - ox) * scale, (p[0].y - oy) * scale, base * scale / 2, 0, 7); ctx.fill(); continue; }
    ctx.lineWidth = base * scale;
    ctx.beginPath(); ctx.moveTo((p[0].x - ox) * scale, (p[0].y - oy) * scale);
    for (let i = 1; i < p.length - 1; i++) {
      const mx = (p[i].x + p[i + 1].x) / 2, my = (p[i].y + p[i + 1].y) / 2;
      ctx.quadraticCurveTo((p[i].x - ox) * scale, (p[i].y - oy) * scale, (mx - ox) * scale, (my - oy) * scale);
    }
    const l = p[p.length - 1]; ctx.lineTo((l.x - ox) * scale, (l.y - oy) * scale); ctx.stroke();
  }
}

function draw() {
  const c = $('#padCanvas'), ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  paint(ctx, c.width / (c.clientWidth || 1));
}

export function openPad() {
  strokes = []; $('#sigPad').hidden = false;
  requestAnimationFrame(size);
}
function closePad() { $('#sigPad').hidden = true; strokes = []; }

function save() {
  const all = strokes.flatMap(s => s.pts);
  if (all.length < 3) return toast('Dibuja tu firma primero');
  const pad = 8;
  const minX = Math.min(...all.map(p => p.x)) - pad, minY = Math.min(...all.map(p => p.y)) - pad;
  const maxX = Math.max(...all.map(p => p.x)) + pad, maxY = Math.max(...all.map(p => p.y)) + pad;
  const scale = 3; // alta resolución para impresión
  const out = document.createElement('canvas');
  out.width = Math.ceil((maxX - minX) * scale); out.height = Math.ceil((maxY - minY) * scale);
  paint(out.getContext('2d'), scale, minX, minY);
  out.toBlob(b => { if (b) { onSave(b); closePad(); } }, 'image/png');
}
