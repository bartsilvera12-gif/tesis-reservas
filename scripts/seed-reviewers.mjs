#!/usr/bin/env node
/**
 * Crea los clientes ficticios que dejan las reseñas demo.
 *
 *   npm run db:reviewers
 *
 * Los usuarios se dan de alta con el **API de Auth** (el mismo signup que usa
 * la app), no escribiendo a mano en `auth.users`: replicar el hashing y el
 * esquema interno de GoTrue es frágil y se rompe en cada actualización.
 *
 * Las reseñas se insertan por conexión directa porque la política RLS exige
 * una reserva confirmada previa, cosa que estos usuarios de muestra no tienen.
 * Es intencional: son datos de demostración, no reseñas reales.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

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

if (!API || !KEY || !PG) {
  console.error('\n  Faltan VITE_SUPABASE_URL, la key pública o DATABASE_URL en .env.local\n');
  process.exit(1);
}

/** Contraseña común de las cuentas de muestra. */
const PASS = process.env.SEED_REVIEWER_PASSWORD || 'ResenaDemo2026';

/** Los mismos reseñadores y textos que traía el prototipo. */
const REVIEWERS = [
  { email: 'marta.gonzalez@ejemplo.py',  name: 'Marta González', city: 'Asunción' },
  { email: 'carlos.ruiz@ejemplo.py',     name: 'Carlos Ruiz',    city: 'Asunción' },
  { email: 'sofia.lopez@ejemplo.py',     name: 'Sofía López',    city: 'Asunción' },
  { email: 'diego.paredes@ejemplo.py',   name: 'Diego Paredes',  city: 'Asunción' },
  { email: 'hugo.benitez@ejemplo.py',    name: 'Hugo Benítez',   city: 'Asunción' },
  { email: 'laura.caceres@ejemplo.py',   name: 'Laura Cáceres',  city: 'Asunción' },
  { email: 'romina.ortiz@ejemplo.py',    name: 'Romina Ortiz',   city: 'Asunción' },
  { email: 'javier.acosta@ejemplo.py',   name: 'Javier Acosta',  city: 'Asunción' },
];

const REVIEWS = [
  { slug: 'la-cabana', by: 'marta.gonzalez@ejemplo.py', rating: 5, days: 2,
    text: 'Excelente atención y los cortes impecables. El quincho es hermoso, volvemos seguro.',
    reply: '¡Gracias Marta! Los esperamos el viernes con música en vivo.' },
  { slug: 'la-cabana', by: 'carlos.ruiz@ejemplo.py', rating: 4, days: 7,
    text: 'Muy rica la comida, aunque los sábados a la noche demora un poco la entrega de mesas.' },
  { slug: 'la-cabana', by: 'sofia.lopez@ejemplo.py', rating: 5, days: 14,
    text: 'Reservé por la app y fue todo rapidísimo. La seña se descontó sin problemas.' },

  { slug: 'lupe-cafe', by: 'diego.paredes@ejemplo.py', rating: 5, days: 3,
    text: 'El mejor flat white de Asunción. Ambiente tranquilo para trabajar.' },
  { slug: 'lupe-cafe', by: 'romina.ortiz@ejemplo.py', rating: 4, days: 9,
    text: 'La pastelería es buenísima. Los sábados se llena, conviene reservar.' },

  { slug: 'barberia-el-prado', by: 'hugo.benitez@ejemplo.py', rating: 5, days: 5,
    text: 'Puntualidad total, reservás y no esperás nada.' },
  { slug: 'barberia-el-prado', by: 'javier.acosta@ejemplo.py', rating: 5, days: 11,
    text: 'El afeitado a navaja vale cada guaraní. Muy recomendable.',
    reply: '¡Gracias Javier! Te esperamos en el próximo turno.' },

  { slug: 'aqua-spa-wellness', by: 'laura.caceres@ejemplo.py', rating: 5, days: 7,
    text: 'Una experiencia hermosa, todo impecable y ordenado.' },
];

// ── 1. Alta de los usuarios vía Auth API ────────────────────────────────────
const idByEmail = {};

for (const r of REVIEWERS) {
  const res = await fetch(`${API}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: r.email,
      password: PASS,
      data: { app: 'tesisreserva', role: 'client', full_name: r.name, city: r.city },
    }),
  });
  const body = await res.json();

  if (body?.user?.id) {
    idByEmail[r.email] = body.user.id;
    console.log(`  creado   ${r.name}`);
    continue;
  }

  // Ya existía: iniciamos sesión para recuperar su id.
  const login = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: r.email, password: PASS }),
  });
  const session = await login.json();

  if (session?.user?.id) {
    idByEmail[r.email] = session.user.id;
    console.log(`  ya existía  ${r.name}`);
  } else {
    console.log(`  fallo    ${r.name}: ${body?.msg || body?.error_description || JSON.stringify(body).slice(0, 90)}`);
  }
}

// ── 2. Perfiles y reseñas ───────────────────────────────────────────────────
const db = new pg.Client({ connectionString: PG });
await db.connect();

for (const r of REVIEWERS) {
  const id = idByEmail[r.email];
  if (!id) continue;
  await db.query(
    `insert into tesisreserva.profiles (id, full_name, email, role, city)
     values ($1, $2, $3, 'client', $4)
     on conflict (id) do update set full_name = excluded.full_name`,
    [id, r.name, r.email, r.city],
  );
}

const { rows: bizRows } = await db.query(
  `select id, slug from tesisreserva.businesses where slug = any($1)`,
  [[...new Set(REVIEWS.map((r) => r.slug))]],
);
const bizBySlug = Object.fromEntries(bizRows.map((b) => [b.slug, b.id]));

// Se limpian sólo las reseñas de estas cuentas de muestra: las reales quedan.
const demoIds = Object.values(idByEmail);
if (demoIds.length) {
  await db.query(`delete from tesisreserva.reviews where client_id = any($1)`, [demoIds]);
}

let n = 0;
for (const rv of REVIEWS) {
  const businessId = bizBySlug[rv.slug];
  const clientId = idByEmail[rv.by];
  if (!businessId || !clientId) continue;

  await db.query(
    `insert into tesisreserva.reviews
       (business_id, client_id, rating, comment, owner_reply, owner_replied_at, active, created_at)
     values ($1, $2, $3, $4, $5, $6, true, now() - make_interval(days => $7))`,
    [businessId, clientId, rv.rating, rv.text, rv.reply ?? null,
     rv.reply ? new Date(Date.now() - (rv.days - 1) * 86400000) : null, rv.days],
  );
  n++;
}

await db.end();
console.log(`\n  ${n} reseñas demo cargadas con ${Object.keys(idByEmail).length} clientes ficticios.\n`);
