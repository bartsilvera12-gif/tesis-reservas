#!/usr/bin/env node
/**
 * Carga las imágenes de los negocios demo en Supabase Storage.
 *
 *   npm run db:images
 *
 * Descarga las fotos originales del prototipo, las optimiza (los PNG pesaban
 * hasta 2,4 MB: demasiado para datos móviles) y las sube al bucket
 * `tesisreserva-businesses`, dejando sólo la URL pública en la tabla.
 *
 * Sube autenticándose como el dueño demo, igual que lo haría la app: las
 * políticas de Storage validan que la carpeta <business_id>/ le pertenezca.
 * No se usa `service_role` en ningún momento.
 *
 * Requiere que `npm run db:seed` ya haya creado los negocios.
 */
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

for (const f of ['.env.local', '.env']) {
  const p = join(root, f);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const API = (process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
const KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const PG = process.env.DATABASE_URL;
const BUCKET = 'tesisreserva-businesses';

const OWNER_EMAIL = process.env.SEED_OWNER_EMAIL || 'demo.owner@tesisreserva.py';
const OWNER_PASS = process.env.SEED_OWNER_PASSWORD || 'DemoReserva2026';

if (!API || !KEY || !PG) {
  console.error('\n  Faltan VITE_SUPABASE_URL, la key pública o DATABASE_URL en .env.local\n');
  process.exit(1);
}


/**
 * Emblemas para los negocios que no tienen logo propio.
 *
 * No se generan con IA: se dibujan como SVG en el mismo lenguaje de iconos
 * que usa el resto de la app, así que quedan nítidos a cualquier tamaño,
 * pesan ~6 KB y combinan con la paleta de cada categoría.
 */
const EMBLEMAS = {
  cafe: `
    <path d="M28 42 h34 v16 a17 17 0 0 1 -34 0 z"/>
    <path d="M62 46 h6 a8 8 0 0 1 0 16 h-6"/>
    <path d="M24 80 h50"/>
    <path d="M40 34 q6 -5 0 -10 q-6 -5 0 -10"/>
    <path d="M53 34 q6 -5 0 -10 q-6 -5 0 -10"/>`,
  barberia: `
    <circle cx="33" cy="71" r="8"/>
    <circle cx="60" cy="71" r="8"/>
    <path d="M39 66 L72 24"/>
    <path d="M54 66 L21 24"/>
    <path d="M46 56 l3 4"/>`,
  spa: `
    <path d="M50 20 C50 20 29 46 29 60 a21 21 0 0 0 42 0 C71 46 50 20 50 20 z"/>
    <path d="M38 62 q6 -7 12 0 t12 0"/>`,
  parrilla: `
    <path d="M50 14 c9 10 7 17 0 22 -7 -5 -9 -12 0 -22 z"/>
    <path d="M18 54 h64"/>
    <path d="M18 66 h64"/>
    <path d="M18 78 h64"/>
    <path d="M27 54 v24"/>
    <path d="M73 54 v24"/>`,
};

const LOGOS = [
  { slug: 'lupe-cafe',         emblema: 'cafe',     bg: '#996044', fg: '#F6ECDD' },
  { slug: 'barberia-el-prado', emblema: 'barberia', bg: '#4E6B4F', fg: '#F1E9DA' },
  { slug: 'aqua-spa-wellness', emblema: 'spa',      bg: '#5E8378', fg: '#F1E9DA' },
];

function logoSvg({ emblema, bg, fg }) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="320" height="320">
      <rect width="100" height="100" fill="${bg}"/>
      <g fill="none" stroke="${fg}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round">
        ${EMBLEMAS[emblema]}
      </g>
    </svg>`,
  );
}

/** Fotos originales del prototipo de Claude Design. */
const SRC = 'https://d8j0ntlcm91z4.cloudfront.net/user_3EZufQH53g1was2DUGwVV5IRX0j';

/**
 * Foto de Unsplash (licencia libre, uso comercial sin atribución obligatoria).
 * Un asado real en una estancia argentina: es la portada de Parrilla Don Aldo.
 * https://unsplash.com/photos/TJ3CHS4HH2o — Paul (@paul_colorado)
 */
const FOTO_PARRILLA =
  'https://images.unsplash.com/photo-1749429600130-d799b74f0a72?w=1600&q=85&fm=jpg';

const PLAN = [
  { slug: 'la-cabana',         kind: 'cover', col: 'cover_url', url: `${SRC}/hf_20260806_162411_60ccd63c-095e-4220-af88-e80bf09f59bb.png` },
  { slug: 'la-cabana',         kind: 'logo',  col: 'logo_url',  url: `${SRC}/hf_20260806_163729_5ab287ee-a179-4bc1-b26f-392d5e25fbb9.png` },
  { slug: 'lupe-cafe',         kind: 'cover', col: 'cover_url', url: `${SRC}/hf_20260806_162411_c3359251-7f88-4cfe-a39e-cc2775eb0288.png` },
  { slug: 'barberia-el-prado', kind: 'cover', col: 'cover_url', url: `${SRC}/hf_20260806_162411_fce3e21f-3631-488f-a6e3-b90655524e8b.png` },
  { slug: 'aqua-spa-wellness', kind: 'cover', col: 'cover_url', url: `${SRC}/hf_20260806_162411_897493e5-415d-442f-ab52-02b1a7bd5f07.png` },
  { slug: 'parrilla-don-aldo', kind: 'cover', col: 'cover_url', url: FOTO_PARRILLA },
];

/** Portadas a 1200px (cubre pantallas 3x); logos a 320px. */
async function optimize(buffer, kind) {
  const img = sharp(buffer);
  return kind === 'logo'
    ? img.resize(320, 320, { fit: 'cover' }).jpeg({ quality: 85, mozjpeg: true }).toBuffer()
    : img.resize(1200, 800, { fit: 'cover', position: 'centre' }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
}

const auth = await fetch(`${API}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: OWNER_EMAIL, password: OWNER_PASS }),
});
const { access_token: token } = await auth.json();

if (!token) {
  console.error(`\n  No se pudo iniciar sesión como ${OWNER_EMAIL}.`);
  console.error('  Registrá esa cuenta desde la app (como Dueño de negocio) y volvé a intentar.\n');
  process.exit(1);
}

const db = new pg.Client({ connectionString: PG });
await db.connect();

const { rows } = await db.query('select id, slug from tesisreserva.businesses');
const idBySlug = Object.fromEntries(rows.map((r) => [r.slug, r.id]));
// El negocio creado desde el onboarding lleva un sufijo aleatorio en el slug,
// así que también se indexa por su prefijo.
for (const r of rows) {
  const base = r.slug.replace(/-[a-z0-9]{5}$/, '');
  if (!(base in idBySlug)) idBySlug[base] = r.id;
}

const cache = join(root, 'node_modules', '.cache', 'tesisreserva-img');
mkdirSync(cache, { recursive: true });

let done = 0;
for (const item of PLAN) {
  const id = idBySlug[item.slug];
  if (!id) {
    console.log(`  omitido  ${item.slug} — no existe todavía (corré npm run db:seed)`);
    continue;
  }

  const cached = join(cache, `${item.slug}-${item.kind}.jpg`);
  let data;

  if (existsSync(cached)) {
    data = readFileSync(cached);
  } else {
    const res = await fetch(item.url);
    if (!res.ok) {
      console.log(`  fallo    ${item.slug}/${item.kind} — no se pudo descargar (${res.status})`);
      continue;
    }
    data = await optimize(Buffer.from(await res.arrayBuffer()), item.kind);
  }

  const path = `${id}/${item.kind}.jpg`;
  const up = await fetch(`${API}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'image/jpeg',
      'x-upsert': 'true',
    },
    body: data,
  });

  if (!up.ok) {
    console.log(`  fallo    ${item.slug}/${item.kind} — ${up.status} ${await up.text()}`);
    continue;
  }

  await db.query(`update tesisreserva.businesses set ${item.col} = $1 where id = $2`, [
    `${API}/storage/v1/object/public/${BUCKET}/${path}`,
    id,
  ]);

  console.log(`  ok       ${item.slug.padEnd(20)} ${item.kind.padEnd(6)} ${Math.round(data.length / 1024)} KB`);
  done++;
}

// -- Logos generados para los negocios que no tienen uno propio -------------
for (const l of LOGOS) {
  const id = idBySlug[l.slug];
  if (!id) continue;

  const { rows: yaTiene } = await db.query(
    'select logo_url from tesisreserva.businesses where id = $1',
    [id],
  );
  // No pisamos un logo real que haya subido el dueño desde la app.
  if (yaTiene[0]?.logo_url) continue;

  const data = await sharp(logoSvg(l)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  const path = `${id}/logo.jpg`;

  const up = await fetch(`${API}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'image/jpeg',
      'x-upsert': 'true',
    },
    body: data,
  });

  if (!up.ok) {
    console.log(`  fallo    ${l.slug}/logo - ${up.status}`);
    continue;
  }

  await db.query('update tesisreserva.businesses set logo_url = $1 where id = $2', [
    `${API}/storage/v1/object/public/${BUCKET}/${path}`,
    id,
  ]);
  console.log(`  ok       ${l.slug.padEnd(20)} logo   ${Math.round(data.length / 1024)} KB`);
  done++;
}

await db.end();
console.log(`\n  ${done} imagen(es) cargadas.\n`);
