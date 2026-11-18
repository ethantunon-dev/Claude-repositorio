// Datos iniciales: II semestre 2026, grupo 1IC133 (horario de clases y calendario de semestrales).
// Solo se cargan la primera vez; después todo se edita desde la app.

const M = (id, nombre, corto, codigo, docente, color) => ({ id, nombre, corto, codigo, docente, color });
const C = (id, materiaId, dia, ini, fin, aula, tipo = 'teoria', grupo = '') => ({ id, materiaId, dia, ini, fin, aula, tipo, grupo });
const E = (id, materiaId, tipo, fecha, ini, fin, aula, extra = {}) => ({
  id, materiaId, tipo, titulo: '', fecha, ini, fin, aula, peso: '', nota: '', notas: '',
  hecho: false, fechaTBD: false, horaTBD: false, avisos: null, seq: 0, ...extra,
});

export function datosIniciales() {
  return {
    version: 1,
    materias: [
      M('hid', 'Hidráulica', 'Hidráulica', '8020', 'Luis Muñoz', 'azul'),
      M('pla', 'Interpretación de Planos y Especificaciones', 'Interp. Planos', '8029', 'Alfredo Herrera', 'violeta'),
      M('est', 'Estructuras II', 'Estructuras II', '8018', 'Obdulia de Guizado', 'rojo'),
      M('hor', 'Hormigón I', 'Hormigón I', '8019', 'Juan Salado', 'pizarra'),
      M('ins', 'Instalaciones Eléctricas y Mecánicas en Obras Civiles', 'Inst. Eléctricas', '0074', 'Pacífico Atencio', 'naranja'),
      M('geo', 'Elementos de Geomática', 'Geomática', '8329', 'Mehidys Manzane', 'turquesa'),
    ],
    clases: [
      C('c01', 'est', 1, '12:50', '14:25', '1-104'),
      C('c02', 'ins', 1, '14:30', '16:55', '1-104'),
      C('c03', 'hid', 2, '11:10', '12:45', '1-118', 'teoria', 'A'),
      C('c04', 'hor', 2, '12:50', '14:25', '1-101'),
      C('c05', 'geo', 2, '14:30', '16:05', '1-101'),
      C('c06', 'hid', 2, '16:10', '16:55', '1-101'),
      C('c07', 'est', 3, '12:50', '14:25', '1-104', 'lab'),
      C('c08', 'pla', 3, '14:30', '16:05', '1-104', 'lab'),
      C('c09', 'geo', 5, '10:20', '12:45', '1-125', 'teoria', 'B'),
      C('c10', 'geo', 5, '12:50', '13:35', '1-104'),
      C('c11', 'hid', 5, '13:40', '15:15', '1-104'),
      C('c12', 'hor', 5, '15:20', '16:55', '1-104', 'lab'),
      C('c13', 'pla', 5, '17:00', '17:45', '1-104'),
    ],
    evals: [
      // Parciales que dijiste (hora sin confirmar)
      E('p-geo', 'geo', 'parcial', '2026-11-20', '10:20', '12:45', '1-125', { horaTBD: true }),
      E('p-hor', 'hor', 'parcial', '2026-11-21', '08:00', '', '', { horaTBD: true }),
      E('p-hid', 'hid', 'parcial', '2026-12-08', '11:10', '12:45', '1-118', {
        fechaTBD: true, horaTBD: true,
        notas: 'Dijiste "viernes 8 de diciembre", pero el 8 de diciembre de 2026 es martes, es feriado y cae después del semestral de Hidráulica (7 dic). Confirma la fecha.',
      }),
      // Calendario oficial de semestrales, aula 1-107, 12:50–2:50 p. m.
      E('s-hid', 'hid', 'semestral', '2026-12-07', '12:50', '14:50', '1-107'),
      E('s-pla', 'pla', 'semestral', '2026-12-09', '12:50', '14:50', '1-107'),
      E('s-est', 'est', 'semestral', '2026-12-11', '12:50', '14:50', '1-107'),
      E('s-hor', 'hor', 'semestral', '2026-12-14', '12:50', '14:50', '1-107'),
      E('s-ins', 'ins', 'semestral', '2026-12-16', '12:50', '14:50', '1-107'),
      E('s-geo', 'geo', 'semestral', '2026-12-18', '12:50', '14:50', '1-107'),
    ],
    ajustes: {
      finClases: '2026-12-04', // último viernes antes de semestrales; se puede cambiar en Ajustes
      notaMin: 71,
      avisoClase: 15,
      avisosPorTipo: null, // null = los de fábrica (logic.js → TIPOS)
      tema: 'auto',
    },
    mostrados: {}, // avisos ya notificados
    vistos: {}, // avisos que el usuario cerró en la pantalla Hoy
  };
}
