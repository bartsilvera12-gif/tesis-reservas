#!/usr/bin/env node
/**
 * Genera los iconos de Android a partir de `assets/app-icon.png`.
 *
 *   npm run android:icons
 *
 * Produce las tres variantes que pide Android, en las cinco densidades:
 *
 *   ic_launcher.png            icono clásico (Android < 8)
 *   ic_launcher_round.png      variante circular (launchers que la piden)
 *   ic_launcher_foreground.png capa del icono adaptativo (Android 8+)
 *
 * El icono adaptativo se recorta con máscaras distintas según el launcher
 * (círculo, squircle, cuadrado…), así que el logo tiene que vivir dentro de
 * la "zona segura": el 66% central del lienzo de 108dp. Por eso el monograma
 * se recorta del original y se re-centra, en vez de escalar la imagen entera.
 */
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ORIGEN = join(root, 'assets', 'app-icon.png');
const RES = join(root, 'android', 'app', 'src', 'main', 'res');

/** Tamaños del icono clásico y de la capa adaptativa (108dp). */
const DENSIDADES = [
  { carpeta: 'mipmap-mdpi', legacy: 48, adaptativo: 108 },
  { carpeta: 'mipmap-hdpi', legacy: 72, adaptativo: 162 },
  { carpeta: 'mipmap-xhdpi', legacy: 96, adaptativo: 216 },
  { carpeta: 'mipmap-xxhdpi', legacy: 144, adaptativo: 324 },
  { carpeta: 'mipmap-xxxhdpi', legacy: 192, adaptativo: 432 },
];

const base = sharp(ORIGEN).ensureAlpha();
const { width, height } = await base.metadata();
if (!width || !height) throw new Error('No pude leer el icono de origen.');

// ── 1. Color de fondo: se muestrea del propio icono ─────────────────────────
const muestra = await sharp(ORIGEN)
  .extract({ left: Math.round(width * 0.5) - 8, top: Math.round(height * 0.06), width: 16, height: 16 })
  .stats();
const [r, g, b] = muestra.channels.map((c) => Math.round(c.mean));
const hexFondo = '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();

// ── 2. Recorte del monograma (los píxeles claros sobre el fondo) ────────────
const { data, info } = await sharp(ORIGEN)
  .resize(256, 256, { fit: 'fill' })
  .removeAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const lumFondo = 0.299 * r + 0.587 * g + 0.114 * b;
let x0 = info.width, y0 = info.height, x1 = 0, y1 = 0;

for (let y = 0; y < info.height; y++) {
  for (let x = 0; x < info.width; x++) {
    const i = (y * info.width + x) * info.channels;
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    // El monograma es MUCHO más claro que el fondo. El margen de 60 es
    // deliberado: con menos entra también el bisel del borde redondeado
    // (~130-149 de luminancia) y el recorte termina siendo la imagen entera.
    if (lum > lumFondo + 60) {
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  }
}

if (x1 <= x0 || y1 <= y0) throw new Error('No pude detectar el logo dentro del icono.');

// Se pasa a coordenadas del original y se cuadra el recorte.
const escala = width / info.width;
const cx = ((x0 + x1) / 2) * escala;
const cy = ((y0 + y1) / 2) * escala;
const lado = Math.max(x1 - x0, y1 - y0) * escala * 1.08; // aire alrededor

const recorte = {
  left: Math.max(0, Math.round(cx - lado / 2)),
  top: Math.max(0, Math.round(cy - lado / 2)),
  width: Math.min(width, Math.round(lado)),
  height: Math.min(height, Math.round(lado)),
};

console.log(`  fondo detectado: ${hexFondo}`);
console.log(`  logo recortado:  ${recorte.width}x${recorte.height} px del original`);

/**
 * El monograma se recorta CON transparencia.
 *
 * Si se dejara el terracota del recorte, sobre el color plano del fondo
 * adaptativo se vería el borde cuadrado del recorte: la imagen original tiene
 * textura y vignetteado, y no empata con un color liso.
 *
 * La transparencia se calcula por luminancia con una transición suave, para
 * que el bisel de las letras no quede dentado.
 */
const crudo = await sharp(ORIGEN).extract(recorte).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const px = crudo.data;
const rgba = Buffer.alloc(crudo.info.width * crudo.info.height * 4);

const t0 = lumFondo + 20; // desde acá empieza a verse
const t1 = lumFondo + 52; // desde acá es opaco

for (let i = 0, j = 0; i < px.length; i += crudo.info.channels, j += 4) {
  const l = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
  const t = Math.min(1, Math.max(0, (l - t0) / (t1 - t0)));
  rgba[j] = px[i];
  rgba[j + 1] = px[i + 1];
  rgba[j + 2] = px[i + 2];
  rgba[j + 3] = Math.round(t * 255);
}

const monograma = await sharp(rgba, {
  raw: { width: crudo.info.width, height: crudo.info.height, channels: 4 },
}).png().toBuffer();

// ── 3. Generación por densidad ──────────────────────────────────────────────
for (const d of DENSIDADES) {
  const dir = join(RES, d.carpeta);
  mkdirSync(dir, { recursive: true });

  // Clásico: la imagen tal cual, que ya trae sus esquinas redondeadas.
  await sharp(ORIGEN)
    .resize(d.legacy, d.legacy, { fit: 'cover' })
    .png()
    .toFile(join(dir, 'ic_launcher.png'));

  // Circular: misma imagen recortada en círculo.
  const mascara = Buffer.from(
    `<svg width="${d.legacy}" height="${d.legacy}"><circle cx="${d.legacy / 2}" cy="${d.legacy / 2}" r="${d.legacy / 2}" fill="#fff"/></svg>`,
  );
  await sharp(ORIGEN)
    .resize(d.legacy, d.legacy, { fit: 'cover' })
    .composite([{ input: mascara, blend: 'dest-in' }])
    .png()
    .toFile(join(dir, 'ic_launcher_round.png'));

  // Adaptativo: el monograma dentro del 66% central, fondo transparente.
  const seguro = Math.round(d.adaptativo * 0.62);
  const capa = await sharp(monograma).resize(seguro, seguro, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();

  await sharp({
    create: {
      width: d.adaptativo,
      height: d.adaptativo,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: capa, gravity: 'centre' }])
    .png()
    .toFile(join(dir, 'ic_launcher_foreground.png'));

  console.log(`  ${d.carpeta.padEnd(16)} ${d.legacy}px · adaptativo ${d.adaptativo}px`);
}

// ── 4. Color de fondo del icono adaptativo ──────────────────────────────────
writeFileSync(
  join(RES, 'values', 'ic_launcher_background.xml'),
  `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <!-- Muestreado de assets/app-icon.png por scripts/gen-icons.mjs -->
    <color name="ic_launcher_background">${hexFondo}</color>
</resources>
`,
);

console.log(`\n  Listo. Fondo adaptativo: ${hexFondo}\n`);
