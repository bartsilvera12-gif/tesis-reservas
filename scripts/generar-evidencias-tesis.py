"""Láminas con las capturas de la matriz de pruebas funcionales (Anexo E).

    python scripts/generar-evidencias-tesis.py

Toma las capturas de docs/pruebas-tabla12 y las arma de a cuatro por fila,
con el caso de prueba debajo de cada una. Salen en
docs/diagramas/tesis/evidencias-*.png.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

RAIZ = Path(__file__).resolve().parent.parent
ORIGEN = RAIZ / 'docs' / 'pruebas-tabla12'
SALIDA = RAIZ / 'docs' / 'diagramas' / 'tesis'
FUENTE = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 40)

LAMINAS = {
    'evidencias-1-turnos-mesas-hospedaje': [
        ('CP01a-cristian-ocupado', 'CP01 (a)'), ('CP01b-asignado-matias', 'CP01 (b)'),
        ('CP02-sin-lugar-12h', 'CP02'), ('CP03a-juan-1030-ocupado', 'CP03 (a)'),
        ('CP03b-asignado-marcos', 'CP03 (b)'), ('CP04-asignada-gladys', 'CP04'),
        ('CP05a-grupo-de-5', 'CP05 (a)'), ('CP05b-asignada-mesa-de-6', 'CP05 (b)'),
        ('CP06-grupo-mayor-rechazado', 'CP06'), ('CP07-suite-sin-disponibilidad', 'CP07'),
        ('CP08-suite-12-al-14-aceptada', 'CP08'), ('CP09-salida-igual-entrada-rechazada', 'CP09'),
    ],
    'evidencias-2-sena-seguridad-avisos': [
        ('CP10-sena-sin-comprobante', 'CP10'), ('CP11a-comprobante-recibido', 'CP11 (a)'),
        ('CP11b-mis-reservas-comprobante-enviado', 'CP11 (b)'), ('CP12a-vencida', 'CP12 (a)'),
        ('CP12b-horario-liberado', 'CP12 (b)'), ('CP13a-rechazada-panel', 'CP13'),
        ('CP14-horario-liberado', 'CP14'), ('CP17-reserva-ajena-no-se-muestra', 'CP17'),
        ('CP18b-segunda-rechazada', 'CP18'), ('CP19a-confirmada-panel', 'CP19 (a)'),
        ('CP19b-notificacion-cliente', 'CP19 (b)'), ('CP20a-consulta-de-uso', 'CP20 (a)'),
        ('CP20b-no-expone-datos', 'CP20 (b)'),
    ],
}

ANCHO, ALTO = 364, 788
HUECO, MARGEN, PIE = 30, 24, 60

for nombre, capturas in LAMINAS.items():
    COLS = (len(capturas) + 1) // 2
    filas = (len(capturas) + COLS - 1) // COLS
    lienzo = Image.new('RGB', (MARGEN * 2 + COLS * ANCHO + (COLS - 1) * HUECO,
                               MARGEN * 2 + filas * (ALTO + PIE) + (filas - 1) * 10), 'white')
    d = ImageDraw.Draw(lienzo)
    for i, (archivo, rotulo) in enumerate(capturas):
        fila, col = divmod(i, COLS)
        x = MARGEN + col * (ANCHO + HUECO)
        y = MARGEN + fila * (ALTO + PIE + 10)
        img = Image.open(ORIGEN / f'{archivo}.png').convert('RGB').resize((ANCHO, ALTO))
        lienzo.paste(img, (x, y))
        d.rectangle([x - 1, y - 1, x + ANCHO, y + ALTO], outline='black', width=2)
        w = d.textlength(rotulo, font=FUENTE)
        d.text((x + (ANCHO - w) / 2, y + ALTO + 16), rotulo, fill='black', font=FUENTE)
    lienzo.save(SALIDA / f'{nombre}.png')
    print(f'  {nombre}.png  {lienzo.size}')
