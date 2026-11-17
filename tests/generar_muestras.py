"""Genera 3 fotos sintéticas de prueba (pizarra blanca, pizarra verde, hoja impresa)
con perspectiva, iluminación desigual y ruido, para probar Escáner Libre."""
import random, math, sys, os
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

random.seed(7); np.random.seed(7)
OUT = os.path.join(os.path.dirname(__file__), 'muestras')
F = '/usr/share/fonts/truetype/'
def font(name, size): return ImageFont.truetype(F + name, size)

def perspective_coeffs(dst, src):
    # coeficientes para Image.transform: mapea dst (salida) -> src (entrada)
    m = []
    for (x, y), (u, v) in zip(dst, src):
        m.append([x, y, 1, 0, 0, 0, -u * x, -u * y]); m.append([0, 0, 0, x, y, 1, -v * x, -v * y])
    A = np.array(m, dtype=float); b = np.array(src, dtype=float).reshape(8)
    return np.linalg.solve(A, b).tolist()

def camera_quad(aspect, img_size, yaw, pitch, roll, fill=0.78, shift=(0, 0)):
    # Proyección pinhole real: rectángulo en 3D, cámara con focal ~ diagonal de la imagen
    W, H = img_size
    f = 0.85 * math.hypot(W, H)
    rw, rh = aspect, 1.0
    P = np.array([[-rw / 2, -rh / 2, 0], [rw / 2, -rh / 2, 0], [rw / 2, rh / 2, 0], [-rw / 2, rh / 2, 0]])
    a, b, c = map(math.radians, (yaw, pitch, roll))
    Ry = np.array([[math.cos(a), 0, math.sin(a)], [0, 1, 0], [-math.sin(a), 0, math.cos(a)]])
    Rx = np.array([[1, 0, 0], [0, math.cos(b), -math.sin(b)], [0, math.sin(b), math.cos(b)]])
    Rz = np.array([[math.cos(c), -math.sin(c), 0], [math.sin(c), math.cos(c), 0], [0, 0, 1]])
    R = Rz @ Rx @ Ry
    # distancia para que ocupe ~fill del ancho/alto
    Z = f * max(rw / (W * fill), rh / (H * fill))
    pts = []
    for p in P:
        q = R @ p + np.array([0, 0, Z])
        pts.append((W / 2 + shift[0] + f * q[0] / q[2], H / 2 + shift[1] + f * q[1] / q[2]))
    return [(round(x), round(y)) for x, y in pts]

def paste_perspective(bg, flat, quad):
    W, H = flat.size
    coeffs = perspective_coeffs(quad, [(0, 0), (W, 0), (W, H), (0, H)])
    warped = flat.convert('RGBA').transform(bg.size, Image.PERSPECTIVE, coeffs, Image.BICUBIC)
    bg.alpha_composite(warped)
    return bg

def lighting(img, strength=0.35, glare=None):
    a = np.asarray(img).astype(float)
    h, w = a.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    g = 1 - strength * (xx / w) * 0.8 - strength * 0.5 * (yy / h)
    if glare:
        gx, gy, r, s = glare
        g += s * np.exp(-(((xx - gx) ** 2 + (yy - gy) ** 2) / (2 * r * r)))
    a[..., :3] = a[..., :3] * g[..., None]
    a[..., :3] += np.random.normal(0, 5, a[..., :3].shape)
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))

def wall(size, base):
    w, h = size
    a = np.ones((h, w, 3)) * np.array(base, float)
    a += np.random.normal(0, 6, (h, w, 1))
    img = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))
    return img.convert('RGBA')

def jitter_text(d, xy, text, f, fill):
    x, y = xy
    for ch in text:
        d.text((x, y + random.uniform(-2, 2)), ch, font=f, fill=fill)
        x += d.textlength(ch, font=f) + random.uniform(-1, 2)

# ---------- 1. Pizarra blanca ----------
def whiteboard():
    W, H = 2400, 1500
    b = Image.new('RGBA', (W, H), (236, 238, 240, 255))
    d = ImageDraw.Draw(b)
    d.rectangle([0, 0, W - 1, H - 1], outline=(150, 152, 156, 255), width=34)
    f = font('dejavu/DejaVuSans.ttf', 78); f2 = font('dejavu/DejaVuSans.ttf', 62)
    jitter_text(d, (110, 90), 'Estática – Equilibrio de cuerpos rígidos', f, (20, 40, 140))
    lines = ['ΣFx = 0   ΣFy = 0   ΣM = 0', 'R = 12.5 kN  a 2.4 m del apoyo A', 'Ay + By = 30 kN', 'M_A = By(6) - 30(3) = 0  ->  By = 15 kN']
    for i, t in enumerate(lines):
        jitter_text(d, (130, 260 + i * 120), t, f2, (25, 25, 25) if i % 2 == 0 else (160, 20, 20))
    # viga dibujada
    d.line([1500, 1150, 2200, 1150], fill=(20, 20, 20), width=10)
    d.polygon([(1500, 1150), (1460, 1230), (1540, 1230)], outline=(20, 20, 20), width=8)
    d.ellipse([2175, 1155, 2225, 1205], outline=(20, 20, 20), width=8)
    for x in range(1600, 2150, 110):
        d.line([x, 950, x, 1135], fill=(20, 40, 140), width=7)
        d.polygon([(x - 18, 1110), (x + 18, 1110), (x, 1140)], fill=(20, 40, 140))
    # ligera mancha de borrado
    d.ellipse([700, 1050, 1150, 1300], fill=(225, 228, 232, 255))
    bg = wall((3000, 2250), (182, 170, 150))
    quad = camera_quad(2400 / 1500, (3000, 2250), 14, -10, -2, 0.82, (30, 40))
    paste_perspective(bg, b, quad)
    img = lighting(bg.convert('RGB'), 0.4, glare=(1800, 700, 380, 0.25))
    img.save(os.path.join(OUT, 'pizarra_blanca.jpg'), quality=88)
    return quad

# ---------- 2. Pizarra verde ----------
def chalkboard():
    W, H = 2400, 1400
    a = np.ones((H, W, 3)) * np.array([38, 72, 52], float)
    a += np.random.normal(0, 7, (H, W, 1))
    b = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).convert('RGBA')
    d = ImageDraw.Draw(b)
    d.rectangle([0, 0, W - 1, H - 1], outline=(120, 80, 45, 255), width=46)
    f = font('dejavu/DejaVuSans.ttf', 80); f2 = font('dejavu/DejaVuSans.ttf', 64)
    jitter_text(d, (120, 100), 'Resistencia de Materiales', f, (235, 235, 225))
    lines = ['σ = P / A = 50 kN / 0.002 m² = 25 MPa', 'ε = δ / L = 0.0012', 'E = σ / ε = 20.8 GPa', 'τ = V·Q / (I·t)']
    for i, t in enumerate(lines):
        jitter_text(d, (140, 280 + i * 125), t, f2, (230, 230, 215) if i != 2 else (240, 225, 120))
    d.rectangle([1700, 900, 2150, 1200], outline=(235, 235, 225), width=7)
    d.line([1700, 900, 2150, 1200], fill=(235, 235, 225), width=5)
    b = b.filter(ImageFilter.GaussianBlur(0.8))
    # polvo de tiza
    dust = Image.new('RGBA', (W, H), (0, 0, 0, 0)); dd = ImageDraw.Draw(dust)
    for _ in range(25):
        x, y = random.randint(100, W - 300), random.randint(100, H - 200)
        dd.ellipse([x, y, x + random.randint(150, 400), y + random.randint(60, 160)], fill=(200, 210, 200, 22))
    b.alpha_composite(dust.filter(ImageFilter.GaussianBlur(25)))
    bg = wall((3000, 2250), (205, 200, 190))
    quad = camera_quad(2400 / 1400, (3000, 2250), -12, 8, 1.5, 0.84, (0, 60))
    paste_perspective(bg, b, quad)
    img = lighting(bg.convert('RGB'), 0.3)
    img.save(os.path.join(OUT, 'pizarra_verde.jpg'), quality=88)
    return quad

# ---------- 3. Hoja impresa ----------
TEXTO = """Universidad Tecnológica - Facultad de Ingeniería Civil
Laboratorio de Mecánica de Suelos

Práctica 3: Límites de consistencia de Atterberg

Objetivo: determinar el límite líquido y el límite plástico de
una muestra de suelo fino, y calcular el índice de plasticidad.

Procedimiento: se coloca la muestra en la copa de Casagrande y
se cuenta el número de golpes necesarios para cerrar la ranura
en una longitud de 13 mm. Se repite el ensayo con distintos
contenidos de humedad y se grafica la curva de fluidez.

Resultados: el límite líquido es 42 por ciento, el límite
plástico es 23 por ciento y el índice de plasticidad es 19.
El suelo se clasifica como una arcilla de baja plasticidad.

Conclusión: los valores obtenidos coinciden con los esperados
para este tipo de suelo según la norma ASTM D4318."""

def paper():
    W, H = 1700, 2200  # carta a 200 dpi
    b = Image.new('RGBA', (W, H), (250, 250, 247, 255))
    d = ImageDraw.Draw(b)
    f = font('liberation/LiberationSerif-Regular.ttf', 44); fb = font('liberation/LiberationSerif-Bold.ttf', 46)
    y = 170
    for i, line in enumerate(TEXTO.split('\n')):
        d.text((150, y), line, font=fb if i in (0, 1, 3) else f, fill=(25, 25, 25))
        y += 64
    a = np.ones((2250, 3000, 3)) * np.array([140, 98, 60], float)
    xx = np.arange(3000)[None, :, None]
    a += 18 * np.sin(xx / 37.0 + np.random.normal(0, 0.3, (2250, 1, 1))) + np.random.normal(0, 5, (2250, 3000, 1))
    bg = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).convert('RGBA')
    bg = bg.rotate(90, expand=True).resize((2250, 3000))  # vertical
    quad = camera_quad(1700 / 2200, (2250, 3000), 8, 16, 3, 0.78, (0, 20))
    # sombra
    sh = Image.new('RGBA', bg.size, (0, 0, 0, 0)); ImageDraw.Draw(sh).polygon([(x + 25, y + 30) for x, y in quad], fill=(0, 0, 0, 110))
    bg.alpha_composite(sh.filter(ImageFilter.GaussianBlur(30)))
    paste_perspective(bg, b, quad)
    img = lighting(bg.convert('RGB'), 0.35)
    img.save(os.path.join(OUT, 'hoja_impresa.jpg'), quality=90)
    with open(os.path.join(OUT, 'hoja_impresa.txt'), 'w') as fh: fh.write(TEXTO)
    return quad

import json
quads = {}
quads = {'pizarra_blanca': whiteboard(), 'pizarra_verde': chalkboard(), 'hoja_impresa': paper()}
quads['aspecto_real'] = {'pizarra_blanca': 2400 / 1500, 'pizarra_verde': 2400 / 1400, 'hoja_impresa': 1700 / 2200}
json.dump(quads, open(os.path.join(OUT, 'esquinas_reales.json'), 'w'), indent=1)
print('ok', quads)

# Cámara falsa para Chromium (formato y4m) con la foto de la pizarra blanca
im = Image.open(os.path.join(OUT, 'pizarra_blanca.jpg')).convert('RGB').resize((1280, 960))
a = np.asarray(im).astype(float)
Y = 0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2]
U = (-0.169 * a[..., 0] - 0.331 * a[..., 1] + 0.5 * a[..., 2] + 128).reshape(480, 2, 640, 2).mean((1, 3))
V = (0.5 * a[..., 0] - 0.419 * a[..., 1] - 0.081 * a[..., 2] + 128).reshape(480, 2, 640, 2).mean((1, 3))
fr = b''.join(np.clip(x, 0, 255).astype(np.uint8).tobytes() for x in (Y, U, V))
with open(os.path.join(OUT, 'camara.y4m'), 'wb') as fh:
    fh.write(b'YUV4MPEG2 W1280 H960 F10:1 Ip A1:1 C420jpeg\n')
    for _ in range(3): fh.write(b'FRAME\n' + fr)
