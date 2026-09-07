/**
 * Verificación del filtro "cerca mío" del mapa.
 *
 *   npm run test:cercania
 *
 * El recorte por distancia se hace en dos pasos: una caja de coordenadas que
 * viaja a la base y la distancia exacta acá. Es fácil de romper sin que se
 * note — un local del borde que deja de aparecer no da ningún error, y en el
 * teléfono uno asume que no hay nada cerca.
 *
 * Compila el TypeScript real de `src/services/businesses.ts` y
 * `src/lib/format.ts`, así la prueba no se desincroniza del producto.
 */
import { build } from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let pass = 0;
let fail = 0;
const fallos = [];

const ok = (nombre, cond, extra = '') => {
  if (cond) {
    pass++;
    console.log(`  OK    ${nombre}`);
  } else {
    fail++;
    fallos.push(nombre);
    console.log(`  FALLA ${nombre} ${extra}`);
  }
};

const dir = mkdtempSync(join(tmpdir(), 'cercania-'));
const salida = join(dir, 'geo.mjs');

// El módulo de negocios arrastra el cliente de Supabase, que necesita
// variables de entorno y una conexión. Se reemplaza por un objeto vacío: lo
// que se prueba es el cálculo geográfico, que no lo toca.
await build({
  entryPoints: ['src/services/businesses.ts'],
  outfile: salida,
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  alias: { '@': './src' },
  logLevel: 'silent',
  plugins: [
    {
      name: 'sin-supabase',
      setup(b) {
        b.onResolve({ filter: /lib\/supabase$/ }, () => ({
          path: 'supabase',
          namespace: 'stub',
        }));
        b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
          contents:
            'export const supabase = {}; export const friendlyError = (e, f) => f;',
          loader: 'js',
        }));
      },
    },
  ],
});

const { cajaDeBusqueda } = await import(`file://${salida}`);

// La misma fórmula que usa la app para mostrar "a 1,4 km".
const haversineKm = (aLat, aLng, bLat, bLng) => {
  const R = 6371;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
};

/** Villa Morra, Asunción. */
const AQUI = { lat: -25.2967, lng: -57.5762 };

const dentroDeLaCaja = (caja, p) =>
  p.lat >= caja.latMin && p.lat <= caja.latMax &&
  p.lng >= caja.lngMin && p.lng <= caja.lngMax;

/** Un punto a `km` en la dirección dada, buscando por bisección. */
const puntoA = (km, rumbo) => {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 60; i++) {
    const m = (lo + hi) / 2;
    const p =
      rumbo === 'norte' ? { lat: AQUI.lat + m, lng: AQUI.lng }
      : rumbo === 'este' ? { lat: AQUI.lat, lng: AQUI.lng + m }
      : { lat: AQUI.lat + m * 0.7071, lng: AQUI.lng + m * 0.7071 };
    if (haversineKm(AQUI.lat, AQUI.lng, p.lat, p.lng) < km) lo = m;
    else hi = m;
  }
  const m = (lo + hi) / 2;
  return rumbo === 'norte' ? { lat: AQUI.lat + m, lng: AQUI.lng }
    : rumbo === 'este' ? { lat: AQUI.lat, lng: AQUI.lng + m }
    : { lat: AQUI.lat + m * 0.7071, lng: AQUI.lng + m * 0.7071 };
};

console.log('\n--- 1. La caja no se come nada del círculo ---');
for (const radio of [1, 3, 5, 10]) {
  const caja = cajaDeBusqueda(AQUI, radio);
  // Justo sobre el borde, en las cuatro direcciones que más aprietan.
  const bordes = [
    puntoA(radio * 0.999, 'norte'),
    puntoA(radio * 0.999, 'este'),
    { lat: 2 * AQUI.lat - puntoA(radio * 0.999, 'norte').lat, lng: AQUI.lng },
    { lat: AQUI.lat, lng: 2 * AQUI.lng - puntoA(radio * 0.999, 'este').lng },
  ];
  ok(
    `a ${radio} km, los cuatro bordes entran en la caja`,
    bordes.every((p) => dentroDeLaCaja(caja, p)),
  );
}

console.log('\n--- 2. La corrección por longitud está puesta ---');
{
  const caja = cajaDeBusqueda(AQUI, 5);
  const altoKm = haversineKm(caja.latMin, AQUI.lng, caja.latMax, AQUI.lng);
  const anchoKm = haversineKm(AQUI.lat, caja.lngMin, AQUI.lat, caja.lngMax);
  // Nunca menor al diámetro (escondería locales) ni mucho mayor (traería de
  // más al pedo). El margen del 2% entra holgado en esa ventana.
  ok('la caja cubre el diámetro a lo alto', altoKm >= 10 && altoKm < 11,
     `(${altoKm.toFixed(2)} km)`);
  ok('y también a lo ancho', anchoKm >= 10 && anchoKm < 11,
     `(${anchoKm.toFixed(2)} km)`);

  // Sin corregir por el coseno, en Asunción la caja quedaría ~9 km de ancho
  // y se perderían los locales del este y del oeste.
  const sinCorregir = (5 / 111.32) * 2;
  ok(
    'sin la corrección quedaría angosta (por eso está)',
    caja.lngMax - caja.lngMin > sinCorregir * 1.05,
  );
}

console.log('\n--- 3. La caja trae de más y la distancia lo corrige ---');
{
  const caja = cajaDeBusqueda(AQUI, 5);
  const esquina = puntoA(6.5, 'noreste');
  const km = haversineKm(AQUI.lat, AQUI.lng, esquina.lat, esquina.lng);
  ok('un punto en diagonal a 6,5 km entra en la caja', dentroDeLaCaja(caja, esquina));
  ok('pero la distancia real lo deja afuera', km > 5, `(${km.toFixed(2)} km)`);
}

console.log('\n--- 4. Casos molestos ---');
{
  const eq = cajaDeBusqueda({ lat: 0, lng: 0 }, 10);
  ok('en el ecuador el ancho es igual al alto',
     Math.abs((eq.lngMax - eq.lngMin) - (eq.latMax - eq.latMin)) < 1e-9);

  const polo = cajaDeBusqueda({ lat: 89.9, lng: 0 }, 10);
  ok('cerca del polo no explota', Number.isFinite(polo.lngMax) && polo.lngMax > polo.lngMin);

  const chico = cajaDeBusqueda(AQUI, 0.2);
  ok('un radio chico da una caja chica',
     chico.latMax - chico.latMin < 0.01 && chico.latMax > chico.latMin);
}

console.log('\n--- 5. Con los negocios de ejemplo ---');
{
  // Distancias reales del seed, medidas desde Villa Morra.
  const locales = [
    ['La Cabaña', -25.2967, -57.5762],
    ['Studio Kuña', -25.2989, -57.5731],
    ['Aqua Spa & Wellness', -25.3052, -57.5858],
    ['Lavadero Autolimpio', -25.3176, -57.5623],
    ['Bella Uñas', -25.3215, -57.5402],
    ['Marisquería Costanera', -25.3084, -57.6271],
    ['Sushi Ñu', -25.3402, -57.5098],
    ['Cabañas del Lago', -25.31, -57.39],
  ];
  const cerca = (radio) =>
    locales
      .filter(([, lat, lng]) => dentroDeLaCaja(cajaDeBusqueda(AQUI, radio), { lat, lng }))
      .filter(([, lat, lng]) => haversineKm(AQUI.lat, AQUI.lng, lat, lng) <= radio)
      .map(([n]) => n);

  ok('a 1 km sólo entran los de Villa Morra',
     JSON.stringify(cerca(1)) === JSON.stringify(['La Cabaña', 'Studio Kuña']),
     `(${cerca(1)})`);
  ok('a 5 km no entra Sushi Ñu, que está a 8', !cerca(5).includes('Sushi Ñu'), `(${cerca(5)})`);
  ok('a 5 km queda afuera Marisquería, que está a 5,3',
     !cerca(5).includes('Marisquería Costanera'));
  ok('a 10 km entra Sushi Ñu', cerca(10).includes('Sushi Ñu'));
  ok('Cabañas del Lago (18 km) no entra ni a 10 km', !cerca(10).includes('Cabañas del Lago'));
}

console.log(`\n==========  ${pass} OK  /  ${fail} FALLA  ==========`);
if (fallos.length) {
  console.log('\nFallaron:');
  fallos.forEach((f) => console.log('  - ' + f));
}
process.exit(fail ? 1 : 0);
