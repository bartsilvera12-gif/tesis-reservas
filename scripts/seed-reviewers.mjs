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
  { email: 'marta.gonzalez@ejemplo.py',  name: 'Marta González', city: 'Ñemby' },
  { email: 'carlos.ruiz@ejemplo.py',     name: 'Carlos Ruiz',    city: 'Ñemby' },
  { email: 'sofia.lopez@ejemplo.py',     name: 'Sofía López',    city: 'Ñemby' },
  { email: 'diego.paredes@ejemplo.py',   name: 'Diego Paredes',  city: 'Ñemby' },
  { email: 'hugo.benitez@ejemplo.py',    name: 'Hugo Benítez',   city: 'Ñemby' },
  { email: 'laura.caceres@ejemplo.py',   name: 'Laura Cáceres',  city: 'Ñemby' },
  { email: 'romina.ortiz@ejemplo.py',    name: 'Romina Ortiz',   city: 'Ñemby' },
  { email: 'javier.acosta@ejemplo.py',   name: 'Javier Acosta',  city: 'Ñemby' },
];

const REVIEWS = [
  // ── Restaurantes ──────────────────────────────────────────────────────────
  { slug: 'la-cabana', by: 'marta.gonzalez@ejemplo.py', rating: 5, days: 2,
    text: 'Excelente atención y los cortes impecables. El quincho es hermoso, volvemos seguro.',
    reply: '¡Gracias Marta! Los esperamos el viernes con música en vivo.' },
  { slug: 'la-cabana', by: 'carlos.ruiz@ejemplo.py', rating: 4, days: 7,
    text: 'Muy rica la comida, aunque los sábados a la noche demora un poco la entrega de mesas.' },
  { slug: 'la-cabana', by: 'sofia.lopez@ejemplo.py', rating: 5, days: 14,
    text: 'Reservé por la app y fue todo rapidísimo. La seña se descontó sin problemas.' },

  { slug: 'lupe-cafe', by: 'diego.paredes@ejemplo.py', rating: 5, days: 3,
    text: 'El mejor flat white de Ñemby. Ambiente tranquilo para trabajar.' },
  { slug: 'lupe-cafe', by: 'romina.ortiz@ejemplo.py', rating: 4, days: 9,
    text: 'La pastelería es buenísima. Los sábados se llena, conviene reservar.' },
  { slug: 'lupe-cafe', by: 'laura.caceres@ejemplo.py', rating: 5, days: 16,
    text: 'Vinimos a desayunar con mi mamá y nos atendieron re bien. El croissant, de diez.' },

  { slug: 'bocatto-trattoria', by: 'hugo.benitez@ejemplo.py', rating: 5, days: 4,
    text: 'Los sorrentinos son caseros de verdad. La mesa en el patio es lo más lindo.',
    reply: '¡Gracias Hugo! El patio te espera, avisanos y te guardamos la de la esquina.' },
  { slug: 'bocatto-trattoria', by: 'sofia.lopez@ejemplo.py', rating: 4, days: 10,
    text: 'Rica la pizza a la piedra. Un poco de espera, pero valió la pena.' },
  { slug: 'bocatto-trattoria', by: 'javier.acosta@ejemplo.py', rating: 5, days: 21,
    text: 'Festejamos un cumpleaños y estuvo todo perfecto. Reservar con la app fue facilísimo.' },

  { slug: 'marisqueria-costanera', by: 'carlos.ruiz@ejemplo.py', rating: 5, days: 3,
    text: 'El surubí a la plancha, impecable. Porciones grandes y precio justo.' },
  { slug: 'marisqueria-costanera', by: 'marta.gonzalez@ejemplo.py', rating: 4, days: 12,
    text: 'Muy fresco todo. La paella es para compartir entre dos tranquilamente.',
    reply: 'Gracias Marta, la próxima probá el ceviche de surubí.' },
  { slug: 'marisqueria-costanera', by: 'diego.paredes@ejemplo.py', rating: 5, days: 25,
    text: 'Fuimos en familia y los chicos comieron feliz. Atención muy amable.' },

  { slug: 'sushi-nu', by: 'romina.ortiz@ejemplo.py', rating: 5, days: 2,
    text: 'Los rolls de autor son una locura. El salón es chico, así que mejor reservar.' },
  { slug: 'sushi-nu', by: 'laura.caceres@ejemplo.py', rating: 3, days: 8,
    text: 'Muy rico y fresco. Me hubiera gustado más variedad de opciones sin pescado.' },
  { slug: 'sushi-nu', by: 'hugo.benitez@ejemplo.py', rating: 5, days: 19,
    text: 'El mejor sushi de la zona, sin tener que ir hasta Asunción.' },

  { slug: 'parrilla-don-aldo-yu2zn', by: 'javier.acosta@ejemplo.py', rating: 5, days: 5,
    text: 'Asado como en casa del abuelo. La costilla se deshace.' },
  { slug: 'parrilla-don-aldo-yu2zn', by: 'carlos.ruiz@ejemplo.py', rating: 4, days: 13,
    text: 'Muy buena carne. Los domingos al mediodía hay que reservar sí o sí.',
    reply: '¡Gracias Carlos! Los domingos se llena, la app te guarda la mesa.' },
  { slug: 'parrilla-don-aldo-yu2zn', by: 'sofia.lopez@ejemplo.py', rating: 5, days: 30,
    text: 'Atención de primera y el chipa guasu de acompañamiento, buenísimo.' },

  // ── Peluquerías ───────────────────────────────────────────────────────────
  { slug: 'barberia-el-prado', by: 'hugo.benitez@ejemplo.py', rating: 5, days: 5,
    text: 'Puntualidad total, reservás y no esperás nada.' },
  { slug: 'barberia-el-prado', by: 'javier.acosta@ejemplo.py', rating: 5, days: 11,
    text: 'El afeitado a navaja vale cada guaraní. Muy recomendable.',
    reply: '¡Gracias Javier! Te esperamos en el próximo turno.' },
  { slug: 'barberia-el-prado', by: 'diego.paredes@ejemplo.py', rating: 5, days: 20,
    text: 'Buen corte y buena charla. El local es lindo y limpio.' },

  { slug: 'studio-kuna', by: 'laura.caceres@ejemplo.py', rating: 5, days: 3,
    text: 'Me hice color completo y quedó exactamente como quería. Súper detallistas.',
    reply: '¡Gracias Laura! Te esperamos para el retoque.' },
  { slug: 'studio-kuna', by: 'marta.gonzalez@ejemplo.py', rating: 5, days: 9,
    text: 'Peinado para un casamiento, aguantó toda la noche. Lo recomiendo.' },
  { slug: 'studio-kuna', by: 'romina.ortiz@ejemplo.py', rating: 5, days: 17,
    text: 'Muy buen trabajo. Pedí turno por la app y lo confirmaron enseguida.' },

  { slug: 'barberia-guarani', by: 'carlos.ruiz@ejemplo.py', rating: 5, days: 6,
    text: 'Rápido, bien hecho y a buen precio. Barbería de barrio como tiene que ser.' },
  { slug: 'barberia-guarani', by: 'hugo.benitez@ejemplo.py', rating: 4, days: 15,
    text: 'Buen corte. Los sábados conviene reservar porque se llena.' },
  { slug: 'barberia-guarani', by: 'diego.paredes@ejemplo.py', rating: 5, days: 28,
    text: 'Llevé a mi hijo y quedó contento. Atención muy cálida.' },

  // ── Spa de uñas ──────────────────────────────────────────────────────────
  { slug: 'aqua-spa-wellness', by: 'laura.caceres@ejemplo.py', rating: 5, days: 7,
    text: 'Una experiencia hermosa, todo impecable y ordenado.' },
  { slug: 'aqua-spa-wellness', by: 'sofia.lopez@ejemplo.py', rating: 5, days: 14,
    text: 'La pedicura spa es un mimo total. El lugar es muy relajante.',
    reply: '¡Gracias Sofía! Nos alegra que hayas disfrutado.' },
  { slug: 'aqua-spa-wellness', by: 'romina.ortiz@ejemplo.py', rating: 4, days: 26,
    text: 'Muy profesionales. Un poco caro, pero la calidad se nota.' },

  { slug: 'nails-ysapy', by: 'marta.gonzalez@ejemplo.py', rating: 5, days: 4,
    text: 'Las uñas esculpidas me duraron un montón. El nail art, precioso.' },
  { slug: 'nails-ysapy', by: 'laura.caceres@ejemplo.py', rating: 5, days: 12,
    text: 'Súper prolijas y puntuales. Ya tengo mi turno fijo cada dos semanas.' },
  { slug: 'nails-ysapy', by: 'sofia.lopez@ejemplo.py', rating: 5, days: 23,
    text: 'Muy lindo el trabajo. El local es chiquito pero cómodo.',
    reply: '¡Gracias Sofía! Pronto estrenamos un sillón más.' },

  { slug: 'bella-unas', by: 'romina.ortiz@ejemplo.py', rating: 5, days: 2,
    text: 'El semipermanente me duró tres semanas perfecto. Muy recomendable.' },
  { slug: 'bella-unas', by: 'marta.gonzalez@ejemplo.py', rating: 3, days: 11,
    text: 'Buena atención y buenos precios. A veces hay que esperar unos minutos.' },
  { slug: 'bella-unas', by: 'laura.caceres@ejemplo.py', rating: 5, days: 22,
    text: 'Me sacaron el gel sin lastimar nada. Re cuidadosas.' },

  // ── Lavaderos ────────────────────────────────────────────────────────────
  { slug: 'lavadero-autolimpio', by: 'carlos.ruiz@ejemplo.py', rating: 5, days: 3,
    text: 'Dejé la camioneta un desastre y me la devolvieron como nueva.',
    reply: '¡Gracias Carlos! Para eso estamos.' },
  { slug: 'lavadero-autolimpio', by: 'javier.acosta@ejemplo.py', rating: 3, days: 10,
    text: 'Buen lavado y la sala de espera tiene wifi. Tardó un poco más de lo previsto.' },
  { slug: 'lavadero-autolimpio', by: 'diego.paredes@ejemplo.py', rating: 5, days: 24,
    text: 'La limpieza de tapizados quedó impecable. Vale la pena.' },

  { slug: 'full-wash-luque', by: 'hugo.benitez@ejemplo.py', rating: 5, days: 5,
    text: 'Lavado a mano bien detallista. Reservé por la app y no hice fila.' },
  { slug: 'full-wash-luque', by: 'carlos.ruiz@ejemplo.py', rating: 4, days: 14,
    text: 'El pulido de faros hace una diferencia enorme. Buen precio.' },
  { slug: 'full-wash-luque', by: 'romina.ortiz@ejemplo.py', rating: 5, days: 27,
    text: 'Atención muy amable y rápida. Ya es mi lavadero de siempre.' },

  // ── Hospedajes ───────────────────────────────────────────────────────────
  { slug: 'posada-del-rio', by: 'sofia.lopez@ejemplo.py', rating: 5, days: 6,
    text: 'Fuimos con los chicos un fin de semana y la pileta fue lo mejor. Muy limpio todo.',
    reply: '¡Gracias Sofía! Los esperamos en el verano.' },
  { slug: 'posada-del-rio', by: 'diego.paredes@ejemplo.py', rating: 4, days: 18,
    text: 'Habitación cómoda y tranquila. El desayuno podría ser un poco más variado.' },
  { slug: 'posada-del-rio', by: 'marta.gonzalez@ejemplo.py', rating: 5, days: 33,
    text: 'Atención familiar, como estar en casa. Volvería sin dudarlo.' },

  { slug: 'hotel-estacion-central', by: 'javier.acosta@ejemplo.py', rating: 4, days: 4,
    text: 'Muy bien ubicado y con cochera. Ideal para una noche de trabajo.' },
  { slug: 'hotel-estacion-central', by: 'laura.caceres@ejemplo.py', rating: 5, days: 15,
    text: 'El desayuno buffet, excelente. Personal muy atento.',
    reply: '¡Gracias Laura! Te esperamos en tu próxima visita.' },
  { slug: 'hotel-estacion-central', by: 'hugo.benitez@ejemplo.py', rating: 4, days: 29,
    text: 'Limpio y cómodo. Las habitaciones que dan a la calle tienen algo de ruido.' },

  { slug: 'cabanas-del-lago', by: 'romina.ortiz@ejemplo.py', rating: 5, days: 8,
    text: 'Desconectamos de todo. La cabaña con galería es hermosa para ver el atardecer.' },
  { slug: 'cabanas-del-lago', by: 'carlos.ruiz@ejemplo.py', rating: 5, days: 20,
    text: 'Fuimos en pareja, muy tranquilo y la parrilla de la cabaña es un plus.',
    reply: '¡Gracias Carlos! Los esperamos para otra escapada.' },
  { slug: 'cabanas-del-lago', by: 'sofia.lopez@ejemplo.py', rating: 5, days: 36,
    text: 'Lindo lugar y bien equipado. Para llegar conviene tener auto.' },
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
