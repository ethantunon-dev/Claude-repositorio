// Importar el horario (PDF "Horario de clases" de la UTP) y el calendario de semestrales (texto
// copiado de la página de la UTP). Lógica pura, sin DOM: recibe los textos del PDF con su posición
// ({ str, x, y, w, p }, y crece hacia abajo) o el texto pegado, y devuelve materias, clases y exámenes.

const DIAS_PDF = { LUNES: 1, MARTES: 2, MIERCOLES: 3, JUEVES: 4, VIERNES: 5, SABADO: 6, DOMINGO: 7 };
export const sinAcentos = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const may = s => sinAcentos(s).toUpperCase();
export const clave = s => may(s).replace(/[^A-Z0-9]/g, '');
const pad = n => String(n).padStart(2, '0');
const hm = min => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
const mediana = a => { const b = a.slice().sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : 0; };

// "12:50-1:35P.M." → { ini: 770, fin: 815 } (la marca a. m./p. m. va al final y vale para la hora de fin)
const RE_RANGO = /(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s*([AP])/i;
const a24 = (h, m, ap) => (+h % 12 + (ap === 'P' ? 12 : 0)) * 60 + +m;
export function rangoHora(str) {
  const r = RE_RANGO.exec(str || '');
  if (!r || +r[2] > 59 || +r[4] > 59 || +r[1] > 12 || +r[3] > 12) return null;
  const ap = r[5].toUpperCase();
  const fin = a24(r[3], r[4], ap);
  let ini = a24(r[1], r[2], ap);
  if (ini > fin) ini -= 720;
  return ini >= 0 && fin > ini ? { ini, fin } : null;
}

// ---------- nombres ----------
const STOP = new Set(['DE', 'DEL', 'LA', 'LAS', 'EL', 'LOS', 'Y', 'E', 'EN', 'A', 'PARA', 'CON', 'AL']);
const ACENTOS = {
  HIDRAULICA: 'Hidráulica', HORMIGON: 'Hormigón', GEOMATICA: 'Geomática', ELECTRICAS: 'Eléctricas', ELECTRICA: 'Eléctrica',
  ELECTR: 'Eléctr', ELECT: 'Eléct', MECANICA: 'Mecánica', MECANICAS: 'Mecánicas', MEC: 'Mec', TOPOGRAFIA: 'Topografía',
  CALCULO: 'Cálculo', FISICA: 'Física', QUIMICA: 'Química', ESTATICA: 'Estática', DINAMICA: 'Dinámica',
  MATEMATICA: 'Matemática', MATEMATICAS: 'Matemáticas', ALGEBRA: 'Álgebra', INGENIERIA: 'Ingeniería', ECONOMIA: 'Economía',
  PROGRAMACION: 'Programación', METODOLOGIA: 'Metodología', GEOLOGIA: 'Geología', TERMODINAMICA: 'Termodinámica',
  ANALISIS: 'Análisis', ETICA: 'Ética', TECNICAS: 'Técnicas', TECNICA: 'Técnica', HIDROLOGIA: 'Hidrología',
  CONSTRUCCION: 'Construcción', ADMINISTRACION: 'Administración', COMUNICACION: 'Comunicación', ESTADISTICA: 'Estadística',
  INGLES: 'Inglés', TECNOLOGIA: 'Tecnología', ELECTRONICA: 'Electrónica', DISENO: 'Diseño', INTERPRETACION: 'Interpretación',
  ESPECIFICACION: 'Especificación', GEOMETRIA: 'Geometría', DESCRIPTIVA: 'Descriptiva', ESTRUCTURAS: 'Estructuras',
  MECANICOS: 'Mecánicos', SANITARIA: 'Sanitaria', HIDRAULICAS: 'Hidráulicas', TRANSITO: 'Tránsito', ECOLOGIA: 'Ecología',
  LOGICA: 'Lógica', NUMERICOS: 'Numéricos', METODOS: 'Métodos', PRACTICA: 'Práctica', ESPANOL: 'Español',
};
const esRomano = t => /^[IVX]{1,4}$/.test(t);
// "ELEM.GEOM." → "Elem. Geom." · "HORMIGON I" → "Hormigón I" · "INST. ELÉCTR." → "Inst. Eléctr."
export function nombreBonito(s) {
  let primero = true;
  const out = String(s ?? '').trim().replace(/\s+/g, ' ')
    .replace(/\.(?=[A-Za-zÀ-ÿ])/g, '. ')
    .replace(/[A-Za-zÀ-ÿ]+/g, w => {
      const k = may(w);
      let r;
      if (esRomano(k)) r = k;
      else if (STOP.has(k) && !primero) r = k.toLowerCase();
      else r = ACENTOS[k] || (w[0].toUpperCase() + w.slice(1).toLowerCase());
      primero = false;
      return r;
    });
  return out;
}
// "MUÑOZ, LUIS" → "Luis Muñoz" · "GUIZADO, OBDULIA DE" → "Obdulia de Guizado"
export function docenteBonito(s) {
  const t = String(s ?? '').trim().replace(/\s+/g, ' ');
  if (!t) return '';
  const cap = w => STOP.has(may(w)) ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase();
  const tit = x => x.split(' ').filter(Boolean).map(cap).join(' ');
  const i = t.indexOf(',');
  if (i < 0) return tit(t);
  const nombre = tit(t.slice(i + 1)), apellido = tit(t.slice(0, i));
  return `${nombre} ${apellido}`.trim().replace(/^./, c => c.toUpperCase());
}

// ---------- emparejar con las materias que ya existen ----------
const tokens = s => may(s).split(/[^A-Z0-9]+/).filter(t => t && !STOP.has(t));
// cada palabra de a es el comienzo de una palabra de b, en el mismo orden (números romanos y cifras: iguales)
function prefijos(a, b) {
  if (!a.length) return false;
  let j = 0;
  for (const t of a) {
    const exacto = esRomano(t) || /^\d+$/.test(t);
    while (j < b.length && !(exacto ? b[j] === t : b[j].startsWith(t))) j++;
    if (j === b.length) return false;
    j++;
  }
  return true;
}
export function parecido(x, y) {
  if (!clave(x) || !clave(y)) return 0;
  if (clave(x) === clave(y)) return 3;
  const a = tokens(x), b = tokens(y);
  const ab = prefijos(a, b), ba = prefijos(b, a);
  // un número romano de más o de menos no es la misma materia (Hormigón I ≠ Hormigón II)
  const rom = t => t.filter(esRomano).join(' ');
  if ((ab || ba) && rom(a) !== rom(b)) return 0;
  return ab && ba ? 2 : ab || ba ? 1 : 0;
}
// La materia que mejor corresponde a `nombre` (por nombre o nombre corto), o null si no hay o hay empate.
export function emparejar(nombre, materias, excluir = new Set()) {
  let mejor = null, puntos = 0, empate = false;
  for (const m of materias) {
    if (excluir.has(m.id)) continue;
    const p = Math.max(parecido(nombre, m.nombre), parecido(nombre, m.corto || ''));
    if (p > puntos) { mejor = m; puntos = p; empate = false; } else if (p && p === puntos) empate = true;
  }
  return puntos && !empate ? mejor : null;
}

export function semestreDe(texto) {
  const t = may(texto);
  const y = /A[NÑ]O:?\s*(\d{4})/.exec(t)?.[1] || /\b(20\d\d)\b/.exec(t)?.[1] || '';
  const p = /PERIODO:?\s*(PRIMER|SEGUNDO|TERCER|VERANO)/.exec(t)?.[1];
  if (!p) return '';
  const n = { PRIMER: 'I semestre', SEGUNDO: 'II semestre', TERCER: 'III semestre', VERANO: 'Verano' }[p];
  return `${n}${y ? ' ' + y : ''}`;
}

// ---------- PDF del horario ----------
export function parseHorarioUTP(items) {
  const it = (items || []).filter(i => i && typeof i.str === 'string' && i.str.trim())
    .map(i => ({ ...i, s: i.str.trim(), p: i.p ?? 1, w: i.w || 0, cx: i.x + (i.w || 0) / 2 }));
  const crudas = [];
  for (const p of [...new Set(it.map(i => i.p))]) {
    const pi = it.filter(i => i.p === p);
    const cabeza = pi.filter(i => DIAS_PDF[may(i.s)]);
    if (cabeza.length < 3) continue;
    const yCab = mediana(cabeza.map(h => h.y));
    const cols = cabeza.filter(h => Math.abs(h.y - yCab) < 6).map(h => ({ dia: DIAS_PDF[may(h.s)], c: h.cx })).sort((a, b) => a.c - b.c);
    const cuerpo = pi.filter(i => i.y > yCab + 4);
    const etiquetas = cuerpo.filter(i => i.cx < cols[0].c && rangoHora(i.s));
    if (!etiquetas.length) continue;
    const filas = etiquetas.map(i => ({ y: i.y, ...rangoHora(i.s) })).sort((a, b) => a.y - b.y);
    const finHoras = Math.max(...etiquetas.map(i => i.x + i.w)) + 2;
    const celdas = cuerpo.filter(i => i.x >= finHoras);
    // borde izquierdo de cada columna: lo marcan los textos que están claramente bajo un día
    const izq = {};
    for (const i of celdas) {
      const d = cols.map(c => ({ c, d: Math.abs(i.cx - c.c) })).sort((a, b) => a.d - b.d);
      if (d.length === 1 || d[0].d < 0.5 * d[1].d) izq[d[0].c.dia] = Math.min(izq[d[0].c.dia] ?? Infinity, i.x);
    }
    const mitad = mediana(cols.filter(c => izq[c.dia] != null).map(c => c.c - izq[c.dia])) || 30;
    for (const c of cols) c.izq = izq[c.dia] ?? c.c - mitad;
    const columnaDe = i => cols.filter(c => c.izq <= i.x + 2).pop() || cols.slice().sort((a, b) => Math.abs(i.cx - a.c) - Math.abs(i.cx - b.c))[0];
    const filaDe = i => { let r = -1; filas.forEach((f, k) => { if (f.y - 4 <= i.y) r = k; }); return r; };
    const grupos = new Map();
    for (const i of celdas) {
      const r = filaDe(i);
      if (r < 0) continue;
      const k = `${columnaDe(i).dia}|${r}`;
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k).push(i);
    }
    for (const [k, lista] of grupos) {
      const [dia, r] = k.split('|').map(Number);
      lista.sort((a, b) => (a.y - b.y) || (a.x - b.x));
      const lineas = [];
      for (const i of lista) {
        const ult = lineas[lineas.length - 1];
        if (ult && Math.abs(ult.y - i.y) <= 2) ult.s += ' ' + i.s; else lineas.push({ y: i.y, s: i.s });
      }
      let aula = '', nombre = '';
      for (const l of lineas) {
        const a = /^aula\s*:?\s*(.+)$/i.exec(l.s);
        if (a) aula = a[1].trim();
        else if (!aula && /^\d{1,2}-\d{2,4}$/.test(l.s)) aula = l.s;
        else nombre += l.s; // las celdas son angostas: el texto se corta a mitad de palabra
      }
      nombre = nombre.replace(/\s+/g, ' ').trim();
      if (!clave(nombre)) continue;
      let tipo = 'teoria', grupo = '';
      const suf = /\(\s*([A-Za-z0-9]{1,3})\s*\)?\s*$/.exec(nombre);
      if (suf) {
        nombre = nombre.slice(0, suf.index).trim();
        const c = may(suf[1]);
        if (c === 'L' || c === 'LAB') tipo = 'lab'; else grupo = c;
      }
      crudas.push({ nombre, key: clave(nombre), dia, ini: filas[r].ini, fin: filas[r].fin, aula, tipo, grupo });
    }
  }
  // unir bloques seguidos de la misma clase
  crudas.sort((a, b) => (a.dia - b.dia) || (a.ini - b.ini));
  const clases = [];
  for (const c of crudas) {
    const prev = clases[clases.length - 1];
    if (prev && prev.dia === c.dia && prev.key === c.key && prev.tipo === c.tipo && prev.aula === c.aula && prev.grupo === c.grupo && c.ini - prev.fin <= 10 && c.ini >= prev.fin) prev.fin = c.fin;
    else clases.push({ ...c });
  }
  // un nombre por materia: el que se leyó en una sola línea (tiene sus espacios)
  const porClave = new Map();
  for (const c of crudas) {
    const v = porClave.get(c.key) || [];
    v.push(c.nombre); porClave.set(c.key, v);
  }
  const materias = [...porClave].map(([key, v]) => {
    const mejor = v.slice().sort((a, b) => ((b.match(/ /g) || []).length - (a.match(/ /g) || []).length) || (a.length - b.length))[0];
    return { key, original: mejor, nombre: nombreBonito(mejor), clases: clases.filter(c => c.key === key).length };
  });
  return {
    semestre: semestreDe(it.map(i => i.s).join(' ')),
    materias,
    clases: clases.map(c => ({ ...c, ini: hm(c.ini), fin: hm(c.fin) })),
  };
}

// ---------- calendario de semestrales (texto pegado) ----------
// Sirve tanto si se copia como tabla (columnas separadas por tabuladores) como si llega una celda por línea.
export function parseSemestrales(texto) {
  const t = String(texto ?? '').replace(/ /g, ' ').replace(/\r/g, '');
  const fechas = [...t.matchAll(/(\d{1,2})\/(\d{1,2})\/(\d{4})/g)];
  const RE_T = /^\s*(\d{1,2}):(\d{2})\s*([AP])\.?\s*M\.?\s*(?:-|–|a)\s*(\d{1,2}):(\d{2})\s*([AP])\.?\s*M\.?/i;
  const RE_FILA = /(?:^|\s)(\d{3,5})\s+([^\d\t\n]*?[A-Za-zÀ-ÿ][^\d\t\n]*?)\s+(\d{3,5})\s+(\S+)\s+(\S+)\s*$/;
  const filas = [];
  let cursor = 0;
  for (const f of fechas) {
    const d = +f[1], m = +f[2], y = +f[3];
    const dt = new Date(y, m - 1, d);
    if (dt.getMonth() !== m - 1 || dt.getDate() !== d) { cursor = f.index + f[0].length; continue; }
    const pre = t.slice(cursor, f.index);
    const finFecha = f.index + f[0].length;
    const mt = RE_T.exec(t.slice(finFecha));
    let ini = '', fin = '', despues = finFecha;
    if (mt) {
      const a = a24(mt[1], mt[2], mt[3].toUpperCase()), b = a24(mt[4], mt[5], mt[6].toUpperCase());
      if (b > a) { ini = hm(a); fin = hm(b); }
      despues = finFecha + mt[0].length;
    }
    const fila = { codigo: '', nombre: '', aula: '', docente: '', fecha: `${y}-${pad(m)}-${pad(d)}`, ini, fin };
    const mf = RE_FILA.exec(pre);
    let antes = '';
    if (mf) {
      fila.codigo = mf[1]; fila.nombre = mf[2].trim(); fila.aula = mf[5];
      antes = pre.slice(0, mf.index);
    } else {
      const aulas = [...pre.matchAll(/\b\d{1,2}-\d{2,4}\b/g)];
      fila.aula = aulas.length ? aulas[aulas.length - 1][0] : '';
      const trozos = [...pre.matchAll(/[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ .,]{3,}/g)].map(x => x[0].trim())
        .filter(x => !/^(CODASIG|ASIGNATURA|CODHORA|GRUPO|AULA|FECHA|HORA|DOCENTE)\b/i.test(x));
      fila.nombre = trozos.length ? trozos[trozos.length - 1] : '';
      antes = '';
    }
    // lo que quedó antes de esta fila es el profesor de la fila anterior
    const prev = filas[filas.length - 1];
    if (prev && !prev.docente && antes.trim()) prev.docente = antes.trim().split('\n').map(x => x.trim()).filter(Boolean)[0] || '';
    fila._despues = despues;
    filas.push(fila);
    cursor = despues;
  }
  const ult = filas[filas.length - 1];
  if (ult && !ult.docente) ult.docente = t.slice(ult._despues).split('\n').map(x => x.trim()).filter(Boolean)[0] || '';
  return filas.filter(f => clave(f.nombre)).map(({ _despues, ...f }) => ({
    ...f,
    docente: /[A-Za-zÀ-ÿ]/.test(f.docente) && f.docente.length <= 60 && !/\d{2}\/\d{2}\/\d{4}/.test(f.docente) ? docenteBonito(f.docente) : '',
  }));
}
