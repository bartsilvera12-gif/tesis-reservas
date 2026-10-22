/**
 * Elegir con quién atenderse: profesionales de peluquerías, barberías y spas.
 *
 *   npm run test:profesionales
 *
 * Cada profesional tiene su agenda: atiende de a un cliente por vez y sólo los
 * días que trabaja. El cliente elige a alguien o "sin preferencia". Todo corre
 * dentro de una transacción que termina en ROLLBACK.
 */
import pg from 'pg';
import { readFileSync, existsSync } from 'node:fs';
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

const c = new pg.Client({ connectionString: process.env.PGURL || process.env.DATABASE_URL });
await c.connect();

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} ${extra}`); }
};
const asUser = async (uid) => {
  await c.query(`select set_config('request.jwt.claims', $1, true)`,
    [JSON.stringify({ sub: uid, role: 'authenticated' })]);
  await c.query(`set local role authenticated`);
};
const asAnon = async () => {
  await c.query(`select set_config('request.jwt.claims', '{"role":"anon"}', true)`);
  await c.query(`set local role anon`);
};
const asAdmin = async () => { await c.query('reset role'); };
let spN = 0;
const expectFail = async (name, sql, params = [], patron = null) => {
  const sp = `sp${++spN}`;
  await c.query(`savepoint ${sp}`);
  try {
    await c.query(sql, params);
    await c.query(`rollback to savepoint ${sp}`);
    fail++; console.log(`  FAIL  ${name} (no falló, debía fallar)`);
  } catch (e) {
    await c.query(`rollback to savepoint ${sp}`);
    if (patron && !patron.test(e.message)) {
      fail++; console.log(`  FAIL  ${name} (otro motivo: ${e.message.slice(0, 70)})`); return;
    }
    pass++; console.log(`  PASS  ${name} -> ${e.message.slice(0, 64)}`);
  }
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
  const duenio = await mk('pro.owner@test.local');
  const otro = await mk('pro.owner2@test.local');
  const cliA = await mk('pro.a@test.local');
  const cliB = await mk('pro.b@test.local');
  const cliC = await mk('pro.c@test.local');

  const cat = (await c.query(`select id from tesisreserva.business_categories limit 1`)).rows[0].id;
  const negocio = (await c.query(
    `insert into tesisreserva.businesses
       (owner_id, category_id, name, slug, city, reservation_type,
        default_slot_duration_minutes, slot_step_minutes, max_concurrent_reservations, active, latitude, longitude)
     values ($1,$2,'Peluquería Equipo','peluqueria-equipo','Ñemby','slot',60,60,5,true,-25.3925,-57.5471)
     returning id`, [duenio, cat])).rows[0].id;
  for (let d = 0; d < 7; d++) {
    const h = (await c.query(
      `insert into tesisreserva.business_hours (business_id, day_of_week, enabled) values ($1,$2,true) returning id`,
      [negocio, d])).rows[0].id;
    await c.query(
      `insert into tesisreserva.business_hour_slots (business_hour_id, opens_at, closes_at) values ($1,'08:00','20:00')`, [h]);
  }
  // El próximo lunes y el martes siguiente (al menos dos días adelante).
  const { lunes, martes } = (await c.query(`
    select (d)::text lunes, (d + 1)::text martes from (
      select tesisreserva.hoy() + g as d from generate_series(2, 9) g
       where extract(dow from tesisreserva.hoy() + g) = 1 limit 1) x`)).rows[0];

  const libres = async (fecha, hora, staff = null) => {
    const r = await c.query(`select * from tesisreserva.get_availability($1,$2,null,null,$3)`, [negocio, fecha, staff]);
    return r.rows.find((s) => s.slot_time.startsWith(hora));
  };
  const reservar = async (cli, fecha, hora, staff = null) => {
    await asUser(cli);
    const r = (await c.query(
      `select * from tesisreserva.create_reservation($1,$2,$3,null,null,null,null,null,$4)`,
      [negocio, fecha, hora, staff])).rows[0];
    await asAdmin();
    return r;
  };

  console.log('\n--- 1. Sin equipo cargado funciona como siempre ---');
  ok('usa la capacidad general (5 a la vez)', (await libres(lunes, '10:00'))?.remaining === 5);

  console.log('\n--- 2. El dueño carga su equipo ---');
  await asUser(duenio);
  const ana = (await c.query(
    `insert into tesisreserva.staff (business_id, name, days) values ($1,'Ana','{1,2,3,4,5,6}') returning id`, [negocio])).rows[0].id;
  const juan = (await c.query(
    `insert into tesisreserva.staff (business_id, name, days) values ($1,'Juan','{1}') returning id`, [negocio])).rows[0].id;
  ok('carga dos profesionales', Boolean(ana && juan));
  await asUser(otro);
  await expectFail('otro dueño no puede cargar gente en un negocio ajeno',
    `insert into tesisreserva.staff (business_id, name) values ($1,'Intruso')`, [negocio], /row-level security/);
  const cambio = await c.query(`update tesisreserva.staff set name='Hackeado' where id=$1`, [ana]);
  ok('ni cambiarle el nombre a alguien', cambio.rowCount === 0);
  await asUser(cliA);
  await expectFail('un cliente tampoco',
    `insert into tesisreserva.staff (business_id, name) values ($1,'Yo')`, [negocio], /row-level security/);
  await asAnon();
  ok('cualquiera ve al equipo del negocio para elegir',
    (await c.query(`select name from tesisreserva.staff where business_id=$1`, [negocio])).rows.length === 2);
  await asAdmin();

  console.log('\n--- 3. Disponibilidad por persona ---');
  ok('lunes a las 10: hay 2 libres (Ana y Juan)', (await libres(lunes, '10:00'))?.remaining === 2,
    JSON.stringify(await libres(lunes, '10:00')));
  ok('martes Juan no trabaja: no tiene turnos', (await libres(martes, '10:00', juan)) === undefined
    || (await libres(martes, '10:00', juan))?.available === false);
  ok('martes sin preferencia: 1 libre (Ana)', (await libres(martes, '10:00'))?.remaining === 1);

  console.log('\n--- 4. Reservar con alguien en particular ---');
  const r1 = await reservar(cliA, lunes, '10:00', ana);
  ok('reserva con Ana', r1.staff_id === ana, r1.staff_id);
  ok('Ana ya no tiene las 10', (await libres(lunes, '10:00', ana))?.available === false);
  ok('pero sin preferencia queda 1 (Juan)', (await libres(lunes, '10:00'))?.remaining === 1);
  await asUser(cliB);
  await expectFail('otro cliente no puede tomar a Ana a la misma hora',
    `select * from tesisreserva.create_reservation($1,$2,'10:00',null,null,null,null,null,$3)`,
    [negocio, lunes, ana], /Ana ya tiene ese horario ocupado/);
  await expectFail('ni pedir a Juan un martes',
    `select * from tesisreserva.create_reservation($1,$2,'10:00',null,null,null,null,null,$3)`,
    [negocio, martes, juan], /Juan no atiende ese día/);
  await asAdmin();
  const aviso = (await c.query(
    `select body from tesisreserva.notifications where reference_id=$1 and user_id=$2`, [r1.id, duenio])).rows[0]?.body ?? '';
  ok('el aviso al dueño dice con quién', /con Ana/.test(aviso), aviso);

  console.log('\n--- 5. Sin preferencia: se asigna a quien esté libre ---');
  const r2 = await reservar(cliB, lunes, '10:00');
  ok('le toca Juan, que estaba libre', r2.staff_id === juan, r2.staff_id);
  await asUser(cliC);
  await expectFail('con los dos ocupados ya no hay lugar',
    `select * from tesisreserva.create_reservation($1,$2,'10:00',null,null,null,null,null,null)`,
    [negocio, lunes], /no está disponible/);
  await asAdmin();
  // Reparto: Ana tiene 1 turno el lunes y Juan 1; a las 12 Ana suma otro con
  // nombre, y el siguiente sin preferencia tiene que ir a Juan.
  await reservar(cliA, lunes, '12:00', ana);
  const r4 = await reservar(cliC, lunes, '14:00');
  ok('reparte el trabajo: va a quien tiene menos turnos ese día', r4.staff_id === juan, r4.staff_id);

  console.log('\n--- 6. Si alguien deja de atender ---');
  await asUser(duenio);
  await c.query(`update tesisreserva.staff set active=false where id=$1`, [juan]);
  await asAnon();
  ok('ya no aparece para elegir',
    !(await c.query(`select id from tesisreserva.staff where business_id=$1`, [negocio])).rows.some((x) => x.id === juan));
  await asAdmin();
  await asUser(cliC);
  await expectFail('y no se le puede reservar',
    `select * from tesisreserva.create_reservation($1,$2,'16:00',null,null,null,null,null,$3)`,
    [negocio, lunes, juan], /ya no atiende/);
  await asAdmin();
  ok('sin preferencia sólo cuenta a Ana', (await libres(lunes, '16:00'))?.remaining === 1);

  console.log('\n--- 7. Las reservas que ya tenía siguen ---');
  const r2b = (await c.query(`select staff_id, status from tesisreserva.reservations where id=$1`, [r2.id])).rows[0];
  ok('la reserva con Juan sigue en pie', r2b.staff_id === juan && r2b.status === 'pending');
} catch (e) {
  fail++;
  console.error('\nERROR INESPERADO:', e.message);
} finally {
  await c.query('rollback').catch(() => {});
  await c.end();
  console.log(`\n==========  ${pass} PASS  /  ${fail} FAIL  ==========`);
  process.exit(fail ? 1 : 0);
}
