"""Láminas de prototipos de interfaz para la tesis (capítulo Resultados).

    python scripts/generar-prototipos-tesis.py

Toma las capturas del manual (public/ayuda) y las arma de a cuatro, lado a
lado, con un rótulo (a), (b)... debajo de cada pantalla. Salen en
docs/diagramas/tesis/prototipos-*.png.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

RAIZ = Path(__file__).resolve().parent.parent
ORIGEN = RAIZ / 'public' / 'ayuda'
SALIDA = RAIZ / 'docs' / 'diagramas' / 'tesis'
FUENTE = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 30)

LAMINAS = {
    'prototipos-cliente-reserva': [
        ('c03-inicio', 'Inicio'), ('c07-ficha-info', 'Ficha del negocio'),
        ('c08-reservar-turno', 'Reservar un turno'), ('c11-reserva-creada', 'Reserva creada'),
    ],
    'prototipos-cliente-seguimiento': [
        ('c09-reservar-sena', 'Seña y comprobante'), ('c12-mis-reservas', 'Mis reservas'),
        ('c13-avisos', 'Notificaciones'), ('c14-asistente-respuesta', 'Asistente de ayuda'),
    ],
    'prototipos-administrador': [
        ('e02-por-responder', 'Reservas por responder'), ('d13-aceptar', 'Forma de aceptar reservas'),
        ('d07-negocio', 'Datos del negocio'), ('d14-equipo', 'Equipo de profesionales'),
    ],
    'prototipos-informes': [
        ('d06-panel', 'Panel con estadísticas'), ('d06-consejos', 'Recomendaciones'),
        ('e06-senas-devolver', 'Señas a devolver'),
    ],
}

ANCHO, ALTO = 390, 843
HUECO, MARGEN, PIE = 40, 30, 70

for nombre, pantallas in LAMINAS.items():
    n = len(pantallas)
    lienzo = Image.new('RGB', (MARGEN * 2 + n * ANCHO + (n - 1) * HUECO, MARGEN * 2 + ALTO + PIE), 'white')
    d = ImageDraw.Draw(lienzo)
    for i, (archivo, rotulo) in enumerate(pantallas):
        img = Image.open(ORIGEN / f'{archivo}.jpg').convert('RGB')
        img = img.crop((0, 0, min(img.width, ANCHO), min(img.height, ALTO))).resize((ANCHO, ALTO))
        x = MARGEN + i * (ANCHO + HUECO)
        lienzo.paste(img, (x, MARGEN))
        d.rectangle([x - 1, MARGEN - 1, x + ANCHO, MARGEN + ALTO], outline='black', width=2)
        texto = f'({chr(97 + i)}) {rotulo}'
        w = d.textlength(texto, font=FUENTE)
        d.text((x + (ANCHO - w) / 2, MARGEN + ALTO + 22), texto, fill='black', font=FUENTE)
    lienzo.save(SALIDA / f'{nombre}.png')
    print(f'  {nombre}.png  {lienzo.size}')
