/**
 * Recomendaciones para clientes ("Para vos") y para negocios (panel).
 *
 *   npm run test:recomendaciones
 *
 * La del cliente se prueba contra la base, dentro de una transacción que
 * termina en ROLLBACK. La del negocio es una función pura del frontend
 * (`src/services/stats.ts`) que se compila al vuelo, como en
 * test-recordatorios, para no desincronizarse de lo que usa la app.
 */
import pg from 'pg';
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
for (const f of ['.env.local', '.env']) {
  const p = join(__dirname, '..', f);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} ${extra}`); }
};

// ════════════════════════════════════════════════════════════════════════════
//  Negocio: buildInsights
// ════════════════════════════════════════════════════════════════════════════
const dir = mkdtempSync(join(tmpdir(), 'recos-'));
const salida = join(dir, 'stats.mjs');
await build({
  entryPoints: [join(__dirname, '..', 'src/services/stats.ts')],
  outfile: salida,
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  alias: { '@': join(__dirname, '..', 'src') },
  // El cliente de Supabase no hace falta para la función pura.
  plugins: [{
    name: 'sin-supabase',
    setup(b) {
      b.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'supabase', namespace: 'falso' }));
      b.onLoad({ filter: /.*/, namespace: 'falso' }, () => ({
        contents: 'export const supabase = {}; export const friendlyError = (e, m) => m;',
      }));
    },
  }],
  logLevel: 'silent',
});
writeFileSync(salida, readFileSync(salida, 'utf8'));
const { buildInsights } = await import(`file://${salida}`);

const base = {
  today_count: 0, pending_count: 0, confirmed_count: 0, active_promotions: 0,
  rating_avg: null, reviews_count: 0, rating_breakdown: {}, week_bars: [],
  peak_hour: null, total_reservations: 0, valid_reservations: 0,
  unanswered_reviews: 0, low_unanswered_reviews: 0, expiring_soon: 0, expired_recent: 0,
  attended: 0, no_shows: 0, client_cancellations: 0, top_item: null, returning_clients: 0,
};
const sinSena = { deposit_enabled: false, deposit_amount: 0, auto_confirm: false, reservation_type: 'slot' };
const conSena = { deposit_enabled: true, deposit_amount: 20000, auto_confirm: false, reservation_type: 'slot' };
const titulos = (s, n = sinSena) => buildInsights({ ...base, ...s }, n).map((i) => i.title);

console.log('\n--- Negocio: recomendaciones del panel ---');
ok('un negocio nuevo sin nada pendiente no recibe consejos inventados',
  titulos({}).length === 0);
ok('un negocio nuevo con reseñas sin responder ya recibe un consejo (antes: "no hay datos")',
  titulos({ reviews_count: 2, unanswered_reviews: 2 }).includes('Reseñas sin responder'));
ok('las reseñas negativas sin respuesta tienen prioridad',
  titulos({ reviews_count: 3, unanswered_reviews: 3, low_unanswered_reviews: 1 })
    .includes('Reseñas negativas sin respuesta'));
const urg = buildInsights({ ...base, expiring_soon: 2, unanswered_reviews: 1 }, sinSena);
ok('lo urgente va primero: reservas por vencer', urg[0]?.title === 'Por vencer');
ok('y lleva a responderlas', urg[0]?.accion?.to === '/panel/reservas?ver=pendientes');
const venc = buildInsights({ ...base, expired_recent: 2 }, sinSena)[0];
ok('si se le vencen reservas y no pide seña, sugiere aceptar automáticamente',
  /automáticamente/.test(venc?.text ?? '') && venc?.accion?.to === '/panel/negocio');
const vencSena = buildInsights({ ...base, expired_recent: 1 }, conSena)[0];
ok('con seña, recuerda devolverlas en vez de sugerir lo automático',
  /devolver/.test(vencSena?.text ?? '') && !/automáticamente/.test(vencSena?.text ?? ''));
ok('con pocas reservas no inventa un horario pico',
  !titulos({ valid_reservations: 3, peak_hour: '20:00' }).includes('Horario más pedido'));
const barras = [0, 1, 1, 2, 3, 6, 7].map((count, dow) => ({ dow, count }));
const dem = buildInsights({ ...base, valid_reservations: 20, peak_hour: '20:30', week_bars: barras,
  top_item: { name: 'Corte de pelo', count: 9 } }, sinSena);
ok('con volumen, muestra el horario más pedido y lo más pedido',
  dem.some((i) => i.title === 'Horario más pedido' && /20:30/.test(i.text) && /Corte de pelo/.test(i.text)));
ok('y los días flojos, con una promo como acción',
  dem.some((i) => i.title === 'Días flojos' && i.accion?.to === '/panel/promos'));
ok('si ya tiene promo activa, no le insiste con crear otra',
  !buildInsights({ ...base, valid_reservations: 20, week_bars: barras, active_promotions: 1 }, sinSena)
    .some((i) => i.accion?.to === '/panel/promos'));
const aus = buildInsights({ ...base, attended: 8, no_shows: 3 }, sinSena).find((i) => i.title === 'Clientes que no vienen');
ok('muchas ausencias sin seña: sugiere pedir seña', /seña/.test(aus?.text ?? ''));
ok('pocas ausencias no disparan nada',
  !titulos({ attended: 20, no_shows: 1 }).includes('Clientes que no vienen'));
ok('nunca muestra más de 4 a la vez',
  buildInsights({ ...base, expiring_soon: 1, expired_recent: 1, low_unanswered_reviews: 1,
    unanswered_reviews: 2, attended: 5, no_shows: 3, valid_reservations: 30, peak_hour: '10:00',
    week_bars: barras, returning_clients: 5 }, sinSena).length === 4);

// ════════════════════════════════════════════════════════════════════════════
//  Cliente: recommended_businesses
// ════════════════════════════════════════════════════════════════════════════
const c = new pg.Client({ connectionString: process.env.PGURL || process.env.DATABASE_URL });
await c.connect();
const asUser = async (uid) => {
  await c.query(`select set_config('request.jwt.claims', $1, true)`,
    [JSON.stringify({ sub: uid, role: 'authenticated' })]);
  await c.query(`set local role authenticated`);
};

try {
  await c.query('begin');
  const mk = async (email) => (await c.query(
    `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
       email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
     values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated',
       'authenticated', $1::text, 'x', now(), now(), now(), '{}'::jsonb,
       jsonb_build_object('app','tesisreserva','role','client','full_name',$1::text))
     returning id`, [email])).rows[0].id;
  const duenio = await mk('reco.owner@test.local');
  const cliente = await mk('reco.cliente@test.local');
  const otro = await mk('reco.otro@test.local');

  // Se aíslan del resto: sólo se miran negocios de este dueño.
  await c.query(`update tesisreserva.businesses set active = false where active`);
  const cat = Object.fromEntries((await c.query(
    `select slug, id from tesisreserva.business_categories`)).rows.map((r) => [r.slug, r.id]));
  const ids = Object.keys(cat);
  const nuevo = async (nombre, catSlug, lat = -25.3946, lng = -57.5462) => (await c.query(
    `insert into tesisreserva.businesses (owner_id, category_id, name, slug, city, active, latitude, longitude, neighborhood)
     values ($1,$2,$3,$4,'Ñemby',true,$5,$6,'Centro') returning id`,
    [duenio, cat[catSlug], nombre, nombre.toLowerCase().replace(/\W+/g, '-'), lat, lng])).rows[0].id;

  const [rubroA, rubroB, rubroC] = ids;
  const unaResena = await nuevo('Una Resena', rubroA);
  const muchas = await nuevo('Muchas Resenas', rubroA);
  const conPromo = await nuevo('Con Promo', rubroB);
  const lejos = await nuevo('Lejos', rubroC, -25.42, -57.52);
  const cerca = await nuevo('Cerca', rubroC, -25.3950, -57.5465);

  const resena = (b, rating, cli) => c.query(
    `insert into tesisreserva.reviews (business_id, client_id, rating, comment) values ($1,$2,$3,'x')`,
    [b, cli, rating]);
  await resena(unaResena, 5, otro);
  for (let i = 0; i < 6; i++) await resena(muchas, 5, otro);
  await resena(muchas, 4, otro);
  await c.query(
    `insert into tesisreserva.promotions (business_id, title, starts_at, unlimited, active)
     values ($1, '2x1 los lunes', now() - interval '1 day', true, true)`, [conPromo]);

  const recos = async (lat = null, lng = null) => {
    await asUser(cliente);
    const r = (await c.query(
      `select r.business_id, r.reason, b.name from tesisreserva.recommended_businesses(10, $1, $2) r
         join tesisreserva.businesses b on b.id = r.business_id`, [lat, lng])).rows;
    await c.query('reset role');
    return r;
  };

  console.log('\n--- Cliente: "Para vos" ---');
  let r = await recos();
  const pos = (id) => r.findIndex((x) => x.business_id === id);
  ok('con muchas reseñas buenas le gana a una sola de 5 estrellas', pos(muchas) < pos(unaResena),
    JSON.stringify(r.map((x) => x.name)));
  ok('primero un negocio de cada rubro (no dos del mismo seguidos)',
    new Set(r.slice(0, 3).map((x) => x.business_id).map((id) =>
      [unaResena, muchas].includes(id) ? 'A' : id === conPromo ? 'B' : 'C')).size === 3,
    JSON.stringify(r.map((x) => x.name)));
  ok('sin ubicación nunca dice "de vos" ni "cerca"',
    r.every((x) => !/de vos|cerca/i.test(x.reason)), JSON.stringify(r.map((x) => x.reason)));
  ok('la promo aparece como motivo', r.find((x) => x.business_id === conPromo)?.reason === 'Promo: 2x1 los lunes');
  ok('con reseñas suficientes el motivo dice el puntaje',
    /★ 4,9 en 7 reseñas/.test(r.find((x) => x.business_id === muchas)?.reason ?? ''),
    r.find((x) => x.business_id === muchas)?.reason);

  r = await recos(-25.3946, -57.5462);
  ok('con ubicación, el que está cerca le gana al lejano del mismo rubro',
    r.findIndex((x) => x.business_id === cerca) < r.findIndex((x) => x.business_id === lejos));
  ok('y lo dice en metros', /^A \d+ m de vos$/.test(r.find((x) => x.business_id === cerca)?.reason ?? ''),
    r.find((x) => x.business_id === cerca)?.reason);

  // Reservó en el rubro C: el rubro pasa adelante y el motivo lo dice.
  await c.query(
    `insert into tesisreserva.reservations (reservation_code, client_id, business_id, reservation_date, reservation_time, status)
     values (tesisreserva.gen_reservation_code(), $1, $2, tesisreserva.hoy() - 10, '10:00', 'completed')`,
    [cliente, lejos]);
  r = await recos();
  ok('lo que ya eligió antes pasa adelante', [cerca, lejos].includes(r[0]?.business_id),
    JSON.stringify(r.map((x) => x.name)));
  ok('con el motivo "Porque ya reservaste en …"', /^Porque ya reservaste en /.test(r[0]?.reason ?? ''));

  // Una reserva en pie: no tiene sentido recomendárselo.
  await c.query(
    `insert into tesisreserva.reservations (reservation_code, client_id, business_id, reservation_date, reservation_time, status)
     values (tesisreserva.gen_reservation_code(), $1, $2, tesisreserva.hoy() + 3, '10:00', 'confirmed')`,
    [cliente, conPromo]);
  r = await recos();
  ok('no recomienda donde ya tiene una reserva próxima', !r.some((x) => x.business_id === conPromo));

  await asUser(duenio);
  const propios = (await c.query(`select * from tesisreserva.recommended_businesses(10)`)).rows;
  ok('a un dueño no le recomienda sus propios negocios', propios.length === 0, `(${propios.length})`);
} catch (e) {
  fail++;
  console.error('\nERROR INESPERADO:', e.message);
} finally {
  await c.query('rollback').catch(() => {});
  await c.end();
  console.log(`\n==========  ${pass} PASS  /  ${fail} FAIL  ==========`);
  process.exit(fail ? 1 : 0);
}
