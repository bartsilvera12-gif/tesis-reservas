/**
 * Verificación de la delimitación a Ñemby y de los turnos por servicio.
 *
 *   npm run test:nemby
 *
 * Dos cosas que se arreglaron juntas y que conviene no volver a romper:
 *
 * 1. Ñemby. El mapa no sale de la ciudad, el alta no deja poner un local
 *    afuera y la base lo rechaza aunque alguien saltee la app. Se prueba el
 *    contorno real de `src/lib/nemby.ts` (compilado, no copiado) y la regla
 *    `businesses_en_nemby` de la base.
 *
 * 2. Turnos de servicios largos. La lista de horarios se calculaba con la
 *    duración general del local y no con la del servicio elegido: un color de
 *    dos horas aparecía disponible hasta el cierre y recién al confirmar —con
 *    la seña ya transferida— la base lo rechazaba.
 *
 * Lo de la base corre dentro de una transacción que termina en ROLLBACK: no
 * deja nada guardado. Necesita DATABASE_URL en el entorno o en .env.local.
 */
import { build } from 'esbuild';
import pg from 'pg';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
for (const f of ['.env.local', '.env']) {
  const p = join(__dirname, '..', f);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

let pass = 0;
let fail = 0;
const ok = (nombre, cond, extra = '') => {
  if (cond) {
    pass++;
    console.log(`  OK    ${nombre}`);
  } else {
    fail++;
    console.log(`  FALLA ${nombre} ${extra}`);
  }
};

/* ───────────────  1. El contorno de Ñemby (código de la app)  ─────────────── */

console.log('\n--- 1. Qué cae dentro de Ñemby ---');

const salida = join(mkdtempSync(join(tmpdir(), 'nemby-')), 'nemby.mjs');
await build({
  entryPoints: ['src/lib/nemby.ts'],
  outfile: salida,
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  alias: { '@': './src' },
  logLevel: 'silent',
});
const { dentroDeNemby, NEMBY_CENTRO, NEMBY_LIMITES, BARRIOS } = await import(`file://${salida}`);

ok('el centro de Ñemby está adentro', dentroDeNemby(NEMBY_CENTRO));
for (const b of BARRIOS) {
  ok(`el barrio ${b.nombre} está adentro`, dentroDeNemby(b));
}

// Ciudades vecinas: puntos claramente afuera, en todas las direcciones.
const AFUERA = [
  ['Villa Morra (Asunción)', -25.2967, -57.5759],
  ['San Lorenzo', -25.3402, -57.5098],
  ['Lambaré', -25.3437, -57.6062],
  ['Villa Elisa', -25.3676, -57.5927],
  ['San Antonio', -25.4211, -57.5476 - 0.06],
];
for (const [nombre, lat, lng] of AFUERA) {
  ok(`${nombre} queda afuera`, !dentroDeNemby({ lat, lng }));
}

// El rectángulo de la app y el de la base tienen que coincidir: si la base
// fuera más chica, rechazaría puntos que el mapa deja elegir.
const [[sur, oeste], [norte, este]] = NEMBY_LIMITES;
ok(
  'el rectángulo de la base contiene al de la app',
  sur >= -25.444 && norte <= -25.3605 && oeste >= -57.5725 && este <= -57.5055,
  JSON.stringify(NEMBY_LIMITES),
);

/* ─────────────────────────────  2. La base  ───────────────────────────── */

const c = new pg.Client({ connectionString: process.env.PGURL || process.env.DATABASE_URL });
await c.connect();

let spN = 0;
/** Un error aborta la transacción: hay que aislarlo con un SAVEPOINT. */
const falla = async (sql, params = []) => {
  const sp = `sp${++spN}`;
  await c.query(`savepoint ${sp}`);
  try {
    await c.query(sql, params);
    await c.query(`release savepoint ${sp}`);
    return null;
  } catch (e) {
    await c.query(`rollback to savepoint ${sp}`);
    return e;
  }
};

const comoUsuario = async (uid) => {
  await c.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: uid, role: 'authenticated' }),
  ]);
  await c.query('set local role authenticated');
};

try {
  await c.query('begin');

  // Se usan dos cuentas que ya existen (el dueño y un cliente de los datos de
  // ejemplo): crear usuarios de Auth desde SQL es frágil.
  const dueno = (
    await c.query(`select id from auth.users where email = 'demo.owner@tesisreserva.py'`)
  ).rows[0]?.id;
  const cliente = (
    await c.query(
      `select p.id from tesisreserva.profiles p join auth.users u on u.id = p.id
        where u.email like '%@tesisreserva.py' and u.email <> 'demo.owner@tesisreserva.py'
        limit 1`,
    )
  ).rows[0]?.id;
  if (!dueno || !cliente) throw new Error('Faltan los usuarios de ejemplo: corré npm run db:seed.');

  const cat = (
    await c.query(`select id from tesisreserva.business_categories where slug = 'peluquerias'`)
  ).rows[0].id;

  console.log('\n--- 2. La base no acepta negocios fuera de Ñemby ---');
  await comoUsuario(dueno);

  const insertar = (slug, lat, lng) =>
    falla(
      `insert into tesisreserva.businesses
         (owner_id, category_id, name, slug, city, reservation_type, latitude, longitude)
       values ($1, $2, 'Prueba Ñemby', $3, 'Ñemby', 'slot', $4, $5)`,
      [dueno, cat, slug, lat, lng],
    );

  const enAsuncion = await insertar('prueba-asuncion', -25.2967, -57.5759);
  ok('crear un negocio en Asunción se rechaza', enAsuncion?.constraint === 'businesses_en_nemby');

  const enSanLorenzo = await insertar('prueba-san-lorenzo', -25.3402, -57.5098);
  ok('crear uno en San Lorenzo se rechaza', enSanLorenzo?.constraint === 'businesses_en_nemby');

  const enNemby = await insertar('prueba-nemby', NEMBY_CENTRO.lat, NEMBY_CENTRO.lng);
  ok('crear uno en el centro de Ñemby se acepta', enNemby === null, enNemby?.message);

  const mover = await falla(
    `update tesisreserva.businesses set latitude = -25.2967, longitude = -57.5759
      where slug = 'prueba-nemby'`,
  );
  ok('mover uno a Asunción se rechaza', mover?.constraint === 'businesses_en_nemby');

  console.log('\n--- 3. Los turnos respetan la duración del servicio ---');
  // Peluquería de 09:00 a 20:00, turnos de 45 min por defecto, cada 15.
  const biz = (
    await c.query(`select id from tesisreserva.businesses where slug = 'prueba-nemby'`)
  ).rows[0].id;
  await c.query(
    `update tesisreserva.businesses
        set default_slot_duration_minutes = 45, slot_step_minutes = 15,
            max_concurrent_reservations = 1, active = true
      where id = $1`,
    [biz],
  );
  for (let d = 0; d < 7; d++) {
    const h = (
      await c.query(
        `insert into tesisreserva.business_hours (business_id, day_of_week, enabled)
         values ($1, $2, true) returning id`,
        [biz, d],
      )
    ).rows[0].id;
    await c.query(
      `insert into tesisreserva.business_hour_slots (business_hour_id, opens_at, closes_at)
       values ($1, '09:00', '20:00')`,
      [h],
    );
  }
  const largo = (
    await c.query(
      `insert into tesisreserva.catalog_items (business_id, name, price, item_type, duration_minutes)
       values ($1, 'Color completo', 250000, 'service', 120) returning id`,
      [biz],
    )
  ).rows[0].id;

  const ultimo = async (item) =>
    (
      await c.query(
        `select max(slot_time)::text t from tesisreserva.get_availability($1, tesisreserva.hoy() + 1, null, $2)
          where available`,
        [biz, item],
      )
    ).rows[0].t;

  const sinServicio = await ultimo(null);
  const conServicio = await ultimo(largo);
  ok('sin servicio, el último turno deja 45 min hasta el cierre', sinServicio === '19:15:00', sinServicio);
  ok('con un servicio de 2 h, el último turno es a las 18:00', conServicio === '18:00:00', conServicio);

  // Lo que la lista ofrece se tiene que poder reservar, y lo que no ofrece no.
  await comoUsuario(cliente);
  const reservar = (hora) =>
    falla(
      `select id from tesisreserva.create_reservation($1, tesisreserva.hoy() + 1, $2::time, 1, $3, null, null, null)`,
      [biz, hora, largo],
    );

  const pasado = await reservar('19:15');
  ok('19:15 con el servicio de 2 h se rechaza', pasado !== null);
  const justo = await reservar('18:00');
  ok('18:00 (el último que ofrece la lista) se acepta', justo === null, justo?.message);

  // Con el turno de 18:00 tomado, la lista ya no ofrece nada que lo pise.
  const pisan = (
    await c.query(
      `select count(*)::int n from tesisreserva.get_availability($1, tesisreserva.hoy() + 1, null, $2)
        where available and slot_time > '16:00' and slot_time < '20:00'`,
      [biz, largo],
    )
  ).rows[0].n;
  ok('después de reservar, no se ofrecen turnos que se superpongan', pisan === 0, `(${pisan})`);
} catch (e) {
  fail++;
  console.log('\nERROR INESPERADO:', e.message);
} finally {
  await c.query('rollback').catch(() => {});
  await c.end();
}

console.log(`\n==========  ${pass} OK  /  ${fail} FALLA  ==========`);
process.exit(fail ? 1 : 0);
