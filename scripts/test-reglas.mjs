/**
 * Reglas del ciclo de vida de una reserva: plazo de respuesta, vencimiento,
 * aceptación automática y seña.
 *
 *   npm run test:reglas
 *
 * Son las reglas que piden la corrección de la tesis (puntos 16 y 17): qué
 * pasa si el negocio no responde, qué pasa si no pide seña y por qué estados
 * pasa la seña. Todo corre dentro de una transacción que termina en ROLLBACK.
 *
 * Ojo: dentro de una transacción now() no avanza. Para simular que "pasó el
 * plazo" se corre `expires_at` hacia atrás a mano.
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
const asAdmin = async () => { await c.query(`reset role`); };

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
      fail++; console.log(`  FAIL  ${name} (falló por otro motivo: ${e.message.slice(0, 60)})`);
      return;
    }
    pass++; console.log(`  PASS  ${name} -> ${e.message.slice(0, 62)}`);
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

  const duenio = await mk('r.owner@test.local');
  const otro   = await mk('r.owner2@test.local');
  const cliA   = await mk('r.clienteA@test.local');
  const cliB   = await mk('r.clienteB@test.local');

  // Un lavadero: 1 auto a la vez, turnos de 60 min, abierto todo el día.
  const cat = (await c.query(`select id from tesisreserva.business_categories limit 1`)).rows[0].id;
  const negocio = (await c.query(
    `insert into tesisreserva.businesses
       (owner_id, category_id, name, slug, city, reservation_type,
        default_slot_duration_minutes, slot_step_minutes, max_concurrent_reservations,
        active, latitude, longitude)
     values ($1,$2,'Lavadero Reglas','lavadero-reglas','Ñemby','slot',60,60,1,true,-25.3925,-57.5471)
     returning id`, [duenio, cat])).rows[0].id;
  for (let d = 0; d < 7; d++) {
    const h = (await c.query(
      `insert into tesisreserva.business_hours (business_id, day_of_week, enabled)
       values ($1,$2,true) returning id`, [negocio, d])).rows[0].id;
    await c.query(
      `insert into tesisreserva.business_hour_slots (business_hour_id, opens_at, closes_at)
       values ($1,'08:00','20:00')`, [h]);
  }
  const fecha = (await c.query(`select (tesisreserva.hoy() + 3)::text d`)).rows[0].d;

  const reservar = async (cli, hora, comprobante = null) => {
    await asUser(cli);
    const r = (await c.query(
      `select * from tesisreserva.create_reservation($1,$2,$3,null,null,null,null,$4)`,
      [negocio, fecha, hora, comprobante])).rows[0];
    await asAdmin();
    return r;
  };
  const libre = async (hora) => {
    const r = await c.query(`select * from tesisreserva.get_availability($1,$2,null)`, [negocio, fecha]);
    return r.rows.find((s) => s.slot_time.startsWith(hora))?.available;
  };
  const vencerYa = (id) => c.query(
    `update tesisreserva.reservations set expires_at = now() - interval '1 minute' where id=$1`, [id]);

  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n--- 1. Sin seña y sin aceptación automática: queda pendiente ---');
  const r1 = await reservar(cliA, '09:00');
  ok('queda pendiente', r1.status === 'pending', r1.status);
  ok('tiene plazo para responder', r1.expires_at != null);
  const esperado = (await c.query(
    `select least(now() + tesisreserva.plazo_respuesta(),
                  ($1::date + '09:00'::time) at time zone tesisreserva.zona_horaria()) e`,
    [fecha])).rows[0].e;
  ok('el plazo es 24 h o la hora de la reserva, lo que llegue antes',
    new Date(r1.expires_at).getTime() === new Date(esperado).getTime(),
    `(${r1.expires_at} vs ${esperado})`);
  ok('el turno queda ocupado mientras espera', (await libre('09:00')) === false);

  // Una reserva para dentro de un rato vence a su hora, no 24 h después.
  await asAdmin();
  const cercana = (await c.query(
    `select least(now() + tesisreserva.plazo_respuesta(),
                  (tesisreserva.ahora_local() + interval '2 hours') at time zone tesisreserva.zona_horaria()) e,
            now() + interval '2 hours' dos`)).rows[0];
  ok('una reserva cercana vence a su hora (no después)',
    new Date(cercana.e).getTime() === new Date(cercana.dos).getTime());

  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n--- 2. Pasado el plazo se libera el lugar ---');
  await vencerYa(r1.id);
  ok('el turno vuelve a estar disponible al instante', (await libre('09:00')) === true);
  const r1b = await reservar(cliB, '09:00');
  ok('otro cliente puede tomarlo', r1b?.status === 'pending');

  await asUser(duenio);
  await expectFail('el dueño ya no puede aceptar la vencida',
    `select tesisreserva.set_reservation_status($1,'confirmed')`, [r1.id], /venció/);

  await asAdmin();
  const vencidas = (await c.query(`select tesisreserva.vencer_reservas() n`)).rows[0].n;
  ok('la tarea programada la marca como vencida', vencidas >= 1, `(${vencidas})`);
  const r1v = (await c.query(`select * from tesisreserva.reservations where id=$1`, [r1.id])).rows[0];
  ok('estado: expired', r1v.status === 'expired', r1v.status);
  ok('guarda el motivo', /no respondió/.test(r1v.cancellation_reason ?? ''));
  const hist = await c.query(
    `select 1 from tesisreserva.reservation_status_history
      where reservation_id=$1 and new_status='expired'`, [r1.id]);
  ok('queda en el historial', hist.rows.length === 1);
  const avisos = await c.query(
    `select user_id from tesisreserva.notifications
      where reference_id=$1 and type='reservation_expired'`, [r1.id]);
  ok('avisa al cliente', avisos.rows.some((a) => a.user_id === cliA));
  ok('avisa al dueño', avisos.rows.some((a) => a.user_id === duenio));
  ok('la otra reserva (vigente) no se toca',
    (await c.query(`select status from tesisreserva.reservations where id=$1`, [r1b.id])).rows[0].status === 'pending');

  await asUser(cliA);
  await expectFail('el cliente no puede cancelar una vencida',
    `select tesisreserva.set_reservation_status($1,'cancelled')`, [r1.id], /vencida/);
  await asAdmin();

  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n--- 3. Aceptación automática (sin seña) ---');
  await c.query(`update tesisreserva.businesses set auto_confirm = true where id=$1`, [negocio]);
  const r2 = await reservar(cliA, '11:00');
  ok('se confirma sola', r2.status === 'confirmed', r2.status);
  ok('no tiene plazo de respuesta', r2.expires_at == null);
  const aviso2 = (await c.query(
    `select title from tesisreserva.notifications where reference_id=$1 and user_id=$2`,
    [r2.id, duenio])).rows[0]?.title ?? '';
  ok('el aviso al dueño dice que ya está confirmada', /confirmada/.test(aviso2), aviso2);
  const h2 = (await c.query(
    `select new_status from tesisreserva.reservation_status_history where reservation_id=$1`,
    [r2.id])).rows.map((x) => x.new_status);
  ok('el historial arranca en confirmed', h2.length === 1 && h2[0] === 'confirmed', JSON.stringify(h2));

  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n--- 4. Con seña nunca se acepta sola ---');
  await c.query(
    `update tesisreserva.businesses set deposit_enabled = true, deposit_amount = 20000 where id=$1`,
    [negocio]);
  await asUser(cliA);
  await expectFail('sin comprobante no hay reserva',
    `select * from tesisreserva.create_reservation($1,$2,'13:00',null,null,null,null,null)`,
    [negocio, fecha], /comprobante/);
  await asAdmin();
  const r3 = await reservar(cliA, '13:00', 'comprobante.jpg');
  ok('queda pendiente aunque esté la aceptación automática', r3.status === 'pending', r3.status);
  ok('seña: comprobante adjuntado, a verificar', r3.deposit_status === 'pending', r3.deposit_status);

  console.log('\n--- 5. Estados de la seña ---');
  await asUser(duenio);
  const r3c = (await c.query(
    `select * from tesisreserva.set_reservation_status($1,'confirmed')`, [r3.id])).rows[0];
  ok('al confirmar, la seña queda verificada (paid)', r3c.deposit_status === 'paid', r3c.deposit_status);
  ok('y deja de tener plazo', r3c.expires_at == null);
  await asAdmin();
  ok('el pago también figura como pagado',
    (await c.query(`select status from tesisreserva.reservation_payments where reservation_id=$1`, [r3.id]))
      .rows[0]?.status === 'paid');

  const r4 = await reservar(cliB, '15:00', 'comprobante.jpg');
  await asUser(duenio);
  const r4r = (await c.query(
    `select * from tesisreserva.set_reservation_status($1,'rejected','No tenemos lugar')`, [r4.id])).rows[0];
  ok('al rechazar, la seña queda "a devolver"', r4r.deposit_status === 'to_refund', r4r.deposit_status);

  const r5 = await reservar(cliB, '16:00', 'comprobante.jpg');
  await asUser(cliB);
  const r5c = (await c.query(
    `select * from tesisreserva.set_reservation_status($1,'cancelled')`, [r5.id])).rows[0];
  ok('si el cliente cancela antes de la confirmación, también "a devolver"',
    r5c.deposit_status === 'to_refund', r5c.deposit_status);

  const r6 = await reservar(cliA, '17:00', 'comprobante.jpg');
  await vencerYa(r6.id);
  await c.query(`select tesisreserva.vencer_reservas()`);
  ok('si vence, también "a devolver"',
    (await c.query(`select deposit_status from tesisreserva.reservations where id=$1`, [r6.id]))
      .rows[0].deposit_status === 'to_refund');

  console.log('\n--- 6. Devolución de la seña ---');
  await asUser(cliB);
  await expectFail('el cliente no puede marcarla como devuelta',
    `select tesisreserva.mark_deposit_refunded($1)`, [r4.id], /permiso/);
  await asUser(otro);
  await expectFail('otro dueño tampoco',
    `select tesisreserva.mark_deposit_refunded($1)`, [r4.id], /permiso/);
  await asUser(duenio);
  const r4d = (await c.query(`select * from tesisreserva.mark_deposit_refunded($1)`, [r4.id])).rows[0];
  ok('el dueño la marca como devuelta', r4d.deposit_status === 'refunded', r4d.deposit_status);
  await expectFail('no se marca dos veces',
    `select tesisreserva.mark_deposit_refunded($1)`, [r4.id], /no tiene una seña/);
  await expectFail('una seña confirmada y vigente no se "devuelve"',
    `select tesisreserva.mark_deposit_refunded($1)`, [r3.id], /no tiene una seña/);
  await asAdmin();
  ok('el cliente recibe el aviso de la devolución',
    (await c.query(
      `select 1 from tesisreserva.notifications where reference_id=$1 and user_id=$2 and title ilike '%devolvieron%'`,
      [r4.id, cliB])).rows.length === 1);

  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n--- 7. Nadie escribe reservas por fuera de las reglas ---');
  await asUser(cliA);
  await expectFail('el cliente no puede autoconfirmarse con un UPDATE',
    `update tesisreserva.reservations set status='confirmed' where id=$1`, [r1b.id], /permission denied/);
  await expectFail('ni insertar una reserva saltando la capacidad',
    `insert into tesisreserva.reservations
       (reservation_code, client_id, business_id, reservation_date, reservation_time, status)
     values ('RSV-HACK00', $1, $2, $3, '09:00', 'confirmed')`, [cliA, negocio, fecha], /permission denied/);
  await expectFail('ni escribir el historial a mano',
    `insert into tesisreserva.reservation_status_history (reservation_id, new_status)
     values ($1, 'confirmed')`, [r1b.id], /permission denied/);
  await asUser(duenio);
  await expectFail('el dueño no puede revivir una vencida con un UPDATE',
    `update tesisreserva.reservations set status='confirmed' where id=$1`, [r1.id], /permission denied/);
  await expectFail('la tarea de vencimiento no se puede llamar desde la app',
    `select tesisreserva.vencer_reservas()`, [], /permission denied/);
  await asAdmin();

  const job = await c.query(
    `select 1 from cron.job where jobname='tesisreserva-vencer-reservas' and active`).catch(() => ({ rows: [] }));
  ok('el vencimiento está programado en la base (pg_cron)', job.rows.length === 1);
} catch (e) {
  fail++;
  console.error('\nERROR INESPERADO:', e.message);
  console.error(e.stack?.split('\n').slice(0, 4).join('\n'));
} finally {
  await c.query('rollback').catch(() => {});
  await c.end();
  console.log(`\n==========  ${pass} PASS  /  ${fail} FAIL  ==========`);
  process.exit(fail ? 1 : 0);
}
