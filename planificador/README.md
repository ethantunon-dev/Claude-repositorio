# Cronograma

Planificador universitario para el celular: semestrales, parciales, talleres, tareas y horario de clases, con alarmas en el calendario del teléfono.
Viene cargado con el II semestre 2026 (grupo 1IC133). Gratis, sin cuenta, sin anuncios y funciona sin conexión. Es hermana de Escáner Libre y se publica en `/planificador/`.

## Qué hace

| Pantalla | Para qué sirve |
|---|---|
| **Hoy** | Cuenta regresiva al próximo examen · cronograma de 5 semanas con cada examen y entrega como hito (◆) y los feriados marcados · clases de hoy (o del próximo día con clases) · lo que viene en 14 días · avisos que ya tocaron. |
| **Agenda** | Todas las evaluaciones por semana. Filtros: pendientes, hechas, todas y por materia. Las que ya pasaron sin marcar aparecen arriba. |
| **Horario** | Semana de clases con la hora actual marcada; los laboratorios van rayados. Botón para mandar el horario al calendario (se repite cada semana hasta el último día de clases y salta los feriados). |
| **Materias** | Profesor, código y fecha del semestral. Notas con peso: promedio, letra (escala UTP) y cuánto necesitas en lo que falta para llegar a la nota mínima. |
| **+** | Nueva evaluación en pocos toques: la fecha, la hora y el aula se llenan solas con la próxima clase de esa materia. Avisa si el día es feriado. |
| **Ajustes** | Avisos de fábrica por tipo, último día de clases, aviso antes de clase, nota mínima, tema y copia de seguridad (.json). |

## Alarmas

Una app web no puede hacer sonar una alarma con el teléfono bloqueado (Notification Triggers nunca salió y iPhone solo permite avisos por servidor). Por eso:

1. **Calendario del teléfono (lo principal).** Cada evaluación se exporta como `.ics` con varios avisos (`VALARM`, p. ej. 7 días, 3 días, 1 día y 2 h antes para un semestral). El calendario los hace sonar sin internet y con la app cerrada. Primero van 1 día y 2 h, porque algunos calendarios guardan solo los dos primeros.
2. **Google Calendar.** Enlace "Abrir en Google Calendar" por evaluación, para Android si el `.ics` no abre.
3. **Dentro de la app.** Avisos del sistema mientras está abierta o se acaba de usar, y la pantalla Hoy muestra lo que se acerca.

Si una evaluación cambia después de mandarla al calendario, su ícono pasa a alerta para volver a agregarla.

## Archivos

| Archivo | Para qué sirve |
|---|---|
| `index.html` | Estructura: cabecera, 4 vistas, barra inferior, botón +, hoja inferior. |
| `css/styles.css` | Estilos (papel de ingeniería / pizarra, como Escáner Libre). |
| `js/logic.js` | Lógica pura: fechas, avisos, `.ics` (RFC 5545), enlace de Google Calendar, notas, feriados de Panamá (con Carnaval y Viernes Santo calculados). |
| `js/seed.js` | Datos iniciales del semestre: materias, horario, parciales y semestrales. |
| `js/app.js` | Interfaz y estado (localStorage). |
| `sw.js` | Service worker: caché para usarla sin conexión y abrir la evaluación al tocar un aviso. |
| `tests/` | Pruebas (no se publican). |

## Pruebas

```bash
TZ=America/Panama node --test planificador/tests/logica.test.mjs   # lógica, .ics y feriados
node planificador/tests/e2e.mjs /tmp/capturas                        # app completa en Chromium (Playwright)
```
