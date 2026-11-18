# Escáner Libre

> En la misma carpeta publicada vive también **[Cronograma](planificador/)** (`/planificador/`), el planificador de semestrales, talleres y tareas con alarmas.

PWA para escanear pizarras, cuadernos y documentos a PDF desde el celular.
**Gratis, sin cuenta, sin anuncios, sin marca de agua y sin límites.** Todo se procesa en el dispositivo y funciona sin conexión.

## Qué hace

| Pestaña | Funciones |
|---|---|
| **Escanear** | Cámara integrada o varias fotos de la galería · detección automática de los 4 bordes · esquinas ajustables con lupa · corrección de perspectiva (homografía con proporción real) · filtros *Original*, *Pizarra blanca*, *Pizarra verde* (invertida) y *B/N documento* · reordenar, rotar y borrar páginas · exportar PDF tamaño Carta o JPG |
| **Texto (OCR)** | Tesseract.js local, español o inglés · copiar texto · *PDF con texto buscable* (imagen + capa de texto invisible) |
| **PDF** | Unir, dividir por rangos, reordenar y rotar · comprimir en 3 niveles (Alta, Media, WhatsApp/Teams) con tamaño antes → después · firmar: dibujar la firma con el dedo, guardarla y colocarla en cualquier página |
| **Historial** | Últimos 60 documentos con nombre `Materia_AAAA-MM-DD_n.pdf` · materias editables · compartir con la hoja del sistema (Web Share API), descargar, renombrar, eliminar |

Foto de pizarra → PDF en 4 toques: **Cámara → disparar → Aceptar → PDF**.

## Instalar en el celular

- **Android (Chrome):** abre el enlace → menú ⋮ → **Instalar app** (o el botón ⬇ de la barra superior).
- **iPhone (Safari):** abre el enlace en Safari → botón **Compartir** → **Agregar a pantalla de inicio**.

Ábrela una vez con internet: queda guardada para usarse en modo avión. El OCR descarga ~6 MB la primera vez que se usa cada idioma.

## Archivos

| Archivo | Para qué sirve |
|---|---|
| `index.html` | Estructura de las 4 pestañas, pantallas de cámara/bordes/firma e íconos SVG. |
| `css/styles.css` | Estilos mobile-first, botones grandes, modo claro/oscuro. |
| `js/app.js` | Arranque: pestañas, tema, botón instalar, aviso sin conexión, registro del service worker. |
| `js/ui.js` | Utilidades: avisos, hojas inferiores, descargar y compartir archivos. |
| `js/db.js` | IndexedDB: historial, firma, materias y sesión de escaneo. |
| `js/libs.js` | Carga diferida de pdf-lib, pdf.js y Tesseract.js desde la CDN con versión fija. |
| `js/edges.js` | Detección de bordes en JS puro (Canny + Hough + afinado subpíxel y detección de marco). |
| `js/imaging.js` | Homografía, proporción real (Zhang–He), filtros de pizarra/documento y rotación. |
| `js/scan.js` | Pestaña Escanear: cámara, editor de esquinas, páginas y exportación PDF/JPG. |
| `js/ocr.js` | Pestaña Texto: OCR, copiar y PDF buscable. |
| `js/pdftools.js` | Pestaña PDF: organizar/unir/dividir, comprimir y firmar. |
| `js/signature.js` | Pad para dibujar la firma con el dedo (PNG transparente). |
| `js/history.js` | Pestaña Historial: nombres automáticos, materias, compartir. |
| `js/pdfjs-worker.mjs` | Worker de pdf.js en el mismo origen (para que funcione sin conexión). |
| `js/ocr-worker.js` | Worker de Tesseract en el mismo origen (para que funcione sin conexión). |
| `sw.js` | Service worker: guarda la app y las librerías en caché. |
| `manifest.webmanifest` | Nombre, colores e íconos para instalar la app. |
| `icons/` | Íconos de la app (SVG, 192, 512, maskable y Apple). |
| `fonts/` | Tipografía Archivo (licencia OFL), incluida para que funcione sin conexión. |
| `.github/workflows/pages.yml` | Publica la app en GitHub Pages en cada push. |
| `tests/` | Muestras sintéticas y prueba automática de extremo a extremo (no se publica). |

## Librerías (CDN jsDelivr, versión fija)

pdf-lib 1.17.1 · pdfjs-dist 4.10.38 (build legacy, compatible con iPhone antiguos) · tesseract.js 6.0.1 + tesseract.js-core 6.0.0 + datos `@tesseract.js-data/{spa,eng}` 1.0.0.
No se usa OpenCV: la detección de bordes está escrita en JS (≈100 ms), así no hay que descargar 8 MB.

## Pruebas

```bash
cd tests
python3 generar_muestras.py        # 3 fotos sintéticas: pizarra blanca, pizarra verde, hoja impresa
npm install                        # mismas versiones que la CDN, solo para la prueba
python3 servidor.py ..  &          # sirve la app en http://127.0.0.1:8080/
node verificar.mjs                 # 24 comprobaciones con Chromium (Playwright)
```
