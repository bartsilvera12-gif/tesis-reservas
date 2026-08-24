/**
 * Verificación de los flujos completos contra la base real.
 *
 *   npm run db:test
 *
 * Crea usuarios y datos de prueba, ejerce cliente / dueño / anon y comprueba
 * RLS, capacidad, seña, trazabilidad y notificaciones. Todo corre dentro de
 * una transacción que termina en ROLLBACK: no deja nada en la base.
 *
 * Necesita DATABASE_URL (o PGURL) en el entorno.
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
  await c.query(`select set_config('role', 'authenticated', true)`);
  await c.query(`set local role authenticated`);
};
const asAdmin = async () => { await c.query(`reset role`); };

let spN = 0;
/** Un error aborta la transacción: hay que aislarlo con un SAVEPOINT. */
const expectFail = async (name, sql, params = []) => {
  const sp = `sp${++spN}`;
  await c.query(`savepoint ${sp}`);
  try {
    await c.query(sql, params);
    await c.query(`release savepoint ${sp}`);
    fail++; console.log(`  FAIL  ${name} (no falló, debía fallar)`);
  } catch (e) {
    await c.query(`rollback to savepoint ${sp}`);
    pass++; console.log(`  PASS  ${name} -> ${e.message.slice(0, 62)}`);
  }
};

try {
  await c.query('begin');

  console.log('\n--- auth.uid() definición ---');
  const def = await c.query(`select pg_get_functiondef('auth.uid'::regproc) as d`);
  console.log(def.rows[0].d.replace(/\s+/g, ' ').slice(0, 260));

  // ---- usuarios de prueba (se revierten) ----
  const mk = async (email) => {
    const r = await c.query(
      `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
       values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated',
         'authenticated', $1::text, 'x', now(), now(), now(), '{}'::jsonb,
         jsonb_build_object('app','tesisreserva','role',$2::text,'full_name',$3::text))
       returning id`,
      [email, email.includes('owner') ? 'owner' : 'client', email.split('@')[0]]);
    return r.rows[0].id;
  };

  const owner  = await mk('t.owner@test.local');
  const owner2 = await mk('t.owner2@test.local');
  const cliA   = await mk('t.clientA@test.local');
  const cliB   = await mk('t.clientB@test.local');

  console.log('\n--- 1. Trigger crea profiles con el role correcto ---');
  const profs = await c.query(
    `select id, role, full_name from tesisreserva.profiles where id = any($1)`,
    [[owner, owner2, cliA, cliB]]);
  ok('se crearon 4 profiles', profs.rows.length === 4, `(${profs.rows.length})`);
  ok('owner tiene role=owner', profs.rows.find(r => r.id === owner)?.role === 'owner');
  ok('cliente tiene role=client', profs.rows.find(r => r.id === cliA)?.role === 'client');

  // usuario de OTRA app: el trigger no debe tocarlo
  await c.query(
    `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
       created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
     values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),'authenticated',
       'authenticated','t.other@test.local','x',now(),now(),'{}'::jsonb,
       '{"app":"otro-proyecto"}'::jsonb)`);
  const other = await c.query(
    `select count(*)::int n from tesisreserva.profiles p
     join auth.users u on u.id=p.id where u.email='t.other@test.local'`);
  ok('usuario de otra app NO entra a este schema', other.rows[0].n === 0);

  console.log('\n--- 2. El dueño configura su negocio (RLS) ---');
  // Un dueño NO debe poder crear categorías globales.
  await asUser(owner);
  await expectFail('el dueño no puede crear categorías globales',
    `insert into tesisreserva.business_categories (name, slug) values ('Hack','hack-cat')`);

  await asAdmin();
  const cat = (await c.query(
    `insert into tesisreserva.business_categories (name, slug) values ('TestCat','test-cat')
     on conflict (slug) do update set name=excluded.name returning id`)).rows[0].id;
  await asUser(owner);

  const biz = (await c.query(
    `insert into tesisreserva.businesses
       (owner_id, category_id, name, slug, city, reservation_type,
        default_slot_duration_minutes, slot_step_minutes, deposit_enabled,
        deposit_amount, deposit_per_person, active, latitude, longitude)
     values ($1,$2,'Test Resto','test-resto','Asunción','table',90,30,true,50000,true,true,-25.29,-57.57)
     returning id`, [owner, cat])).rows[0].id;
  ok('el dueño creó su negocio', Boolean(biz));

  // horarios: todos los días 11:00-23:00
  for (let d = 0; d < 7; d++) {
    const h = (await c.query(
      `insert into tesisreserva.business_hours (business_id, day_of_week, enabled)
       values ($1,$2,true) returning id`, [biz, d])).rows[0].id;
    await c.query(
      `insert into tesisreserva.business_hour_slots (business_hour_id, opens_at, closes_at)
       values ($1,'11:00','23:00')`, [h]);
  }
  // capacidad: 1 sola mesa de 2 para probar el tope
  await c.query(
    `insert into tesisreserva.business_capacity (business_id, party_size, quantity)
     values ($1,2,1),($1,4,2)`, [biz]);

  console.log('\n--- 3. Un dueño NO puede tocar el negocio de otro ---');
  await asUser(owner2);
  const upd = await c.query(
    `update tesisreserva.businesses set name='Hackeado' where id=$1`, [biz]);
  ok('UPDATE de otro dueño afecta 0 filas', upd.rowCount === 0, `(${upd.rowCount})`);
  await expectFail('otro dueño no puede insertar a su nombre en ajeno',
    `insert into tesisreserva.businesses (owner_id, name, slug, city)
     values ($1,'Robado','robado','Asunción')`, [owner]);

  console.log('\n--- 4. Disponibilidad ---');
  await asUser(cliA);
  const dateISO = (await c.query(`select (current_date + 2)::text d`)).rows[0].d;
  const slots = await c.query(
    `select * from tesisreserva.get_availability($1,$2,2)`, [biz, dateISO]);
  ok('devuelve horarios', slots.rows.length > 0, `(${slots.rows.length})`);
  const first = slots.rows[0];
  ok('el primer horario está disponible', first?.available === true);
  ok('respeta el paso de 30 min',
    slots.rows.length >= 2 &&
    slots.rows[1].slot_time.slice(0,5) === '11:30', `(${slots.rows[1]?.slot_time})`);
  ok('no genera turnos que excedan el cierre',
    slots.rows[slots.rows.length-1].slot_time <= '21:30:00',
    `(${slots.rows[slots.rows.length-1].slot_time})`);

  console.log('\n--- 5. Crear reserva (RPC transaccional) ---');
  const res1 = (await c.query(
    `select * from tesisreserva.create_reservation($1,$2,'20:00',2,null,'sin sal')`,
    [biz, dateISO])).rows[0];
  ok('reserva creada', Boolean(res1?.id));
  ok('queda pendiente', res1.status === 'pending');
  ok('genera código', /^RSV-[A-Z0-9]{6}$/.test(res1.reservation_code), res1.reservation_code);
  ok('calcula la seña (50.000 x 2 personas)', Number(res1.deposit_amount) === 100000,
     `(${res1.deposit_amount})`);
  ok('marca la seña como requerida', res1.deposit_required === true);

  await asAdmin();
  const hist = await c.query(
    `select * from tesisreserva.reservation_status_history where reservation_id=$1`, [res1.id]);
  ok('registra el historial de estado', hist.rows.length === 1);
  const notif = await c.query(
    `select * from tesisreserva.notifications where reference_id=$1 and user_id=$2`,
    [res1.id, owner]);
  ok('notifica al dueño', notif.rows.length === 1);
  const pay = await c.query(
    `select * from tesisreserva.reservation_payments where reservation_id=$1`, [res1.id]);
  ok('crea el registro de pago pendiente',
     pay.rows.length === 1 && pay.rows[0].status === 'pending');

  console.log('\n--- 6. Capacidad: el segundo intento debe rebotar ---');
  await asUser(cliB);
  await expectFail('sin mesas libres -> rechaza',
    `select * from tesisreserva.create_reservation($1,$2,'20:00',2,null,null)`, [biz, dateISO]);

  const slots2 = await c.query(
    `select * from tesisreserva.get_availability($1,$2,2)`, [biz, dateISO]);
  const at20 = slots2.rows.find(s => s.slot_time.startsWith('20:00'));
  ok('el horario ocupado ya no figura disponible', at20?.available === false);
  const at1900 = slots2.rows.find(s => s.slot_time.startsWith('19:00'));
  ok('un horario que se solapa también se bloquea', at1900?.available === false,
     `(19:00 available=${at1900?.available})`);
  // 20:00 ocupa 20:00-21:30; 21:30 arranca justo al terminar -> no se solapa.
  const at2130 = slots2.rows.find(s => s.slot_time.startsWith('21:30'));
  ok('un horario sin solape sigue libre', at2130?.available === true,
     `(21:30 available=${at2130?.available})`);
  ok('no ofrece turnos que no entran antes del cierre',
     slots2.rows.every(s => s.slot_time < '22:00:00'));

  console.log('\n--- 7. Otra mesa (4 personas) sigue disponible ---');
  const res2 = (await c.query(
    `select * from tesisreserva.create_reservation($1,$2,'20:00',4,null,null)`,
    [biz, dateISO])).rows[0];
  ok('reserva para 4 personas OK', Boolean(res2?.id));

  console.log('\n--- 8. Aislamiento entre clientes ---');
  await asUser(cliB);
  const seen = await c.query(`select id from tesisreserva.reservations where id=$1`, [res1.id]);
  ok('cliente B NO ve la reserva de A', seen.rows.length === 0);
  const hijack = await c.query(
    `update tesisreserva.reservations set status='cancelled' where id=$1`, [res1.id]);
  ok('cliente B NO puede cancelar la de A', hijack.rowCount === 0);
  await expectFail('cliente B no puede confirmar por RPC',
    `select tesisreserva.set_reservation_status($1,'confirmed')`, [res1.id]);

  console.log('\n--- 9. El dueño acepta ---');
  await asUser(owner);
  const conf = (await c.query(
    `select * from tesisreserva.set_reservation_status($1,'confirmed')`, [res1.id])).rows[0];
  ok('pending -> confirmed', conf.status === 'confirmed');
  await asAdmin();
  const hist2 = await c.query(
    `select * from tesisreserva.reservation_status_history
     where reservation_id=$1 order by created_at`, [res1.id]);
  ok('historial con 2 entradas', hist2.rows.length === 2,
     `(${hist2.rows.map(h=>h.new_status).join(',')})`);
  const nCli = await c.query(
    `select * from tesisreserva.notifications
     where user_id=$1 and type='reservation_confirmed'`, [cliA]);
  ok('notifica al cliente', nCli.rows.length === 1);

  console.log('\n--- 10. Reseñas ---');
  await asUser(cliB);
  await expectFail('cliente sin reserva no puede reseñar',
    `insert into tesisreserva.reviews (business_id, client_id, rating, comment)
     values ($1,$2,5,'falsa')`, [biz, cliB]);

  await asUser(cliA);
  const rev = (await c.query(
    `insert into tesisreserva.reviews (business_id, client_id, rating, comment, reservation_id)
     values ($1,$2,5,'Muy bueno',$3) returning *`, [biz, cliA, res1.id])).rows[0];
  ok('cliente con reserva confirmada SÍ puede reseñar', Boolean(rev?.id));

  await expectFail('rating fuera de 1..5 rechazado',
    `insert into tesisreserva.reviews (business_id, client_id, rating)
     values ($1,$2,7)`, [biz, cliA]);

  // el cliente no puede falsificar la respuesta del local
  await c.query(
    `update tesisreserva.reviews set owner_reply='Respuesta falsa' where id=$1`, [rev.id]);
  await asAdmin();
  const forged = await c.query(`select owner_reply from tesisreserva.reviews where id=$1`, [rev.id]);
  ok('cliente NO puede falsificar owner_reply', forged.rows[0].owner_reply === null,
     `(${forged.rows[0].owner_reply})`);

  console.log('\n--- 11. El dueño responde ---');
  await asUser(owner);
  const replied = (await c.query(
    `select * from tesisreserva.reply_to_review($1,'¡Gracias!')`, [rev.id])).rows[0];
  ok('guarda owner_reply', replied.owner_reply === '¡Gracias!');
  ok('guarda owner_replied_at', replied.owner_replied_at !== null);
  ok('no altera el rating del cliente', replied.rating === 5);

  await asUser(owner2);
  await expectFail('otro dueño no puede responder',
    `select tesisreserva.reply_to_review($1,'spam')`, [rev.id]);

  console.log('\n--- 12. Estadísticas ---');
  await asUser(owner);
  const st = (await c.query(`select tesisreserva.business_stats($1) s`, [biz])).rows[0].s;
  ok('cuenta reseñas', st.reviews_count === 1, JSON.stringify(st.rating_avg));
  ok('promedio de rating', Number(st.rating_avg) === 5);
  ok('cuenta confirmadas', st.confirmed_count === 1, `(${st.confirmed_count})`);
  ok('cuenta pendientes', st.pending_count === 1, `(${st.pending_count})`);
  ok('week_bars con 7 días', (st.week_bars ?? []).length === 7);

  await asUser(owner2);
  await expectFail('otro dueño no ve estadísticas ajenas',
    `select tesisreserva.business_stats($1)`, [biz]);

  console.log('\n--- 13. Reglas de negocio varias ---');
  await asUser(cliA);
  await expectFail('no se puede reservar en el pasado',
    `select tesisreserva.create_reservation($1, current_date - 1, '20:00', 2, null, null)`, [biz]);
  await expectFail('no se puede reservar fuera de horario',
    `select tesisreserva.create_reservation($1,$2,'03:00',2,null,null)`, [biz, dateISO]);

  // La regla ya no es "un dueño no puede reservar" sino "no en su propio
  // negocio": ahora un mismo correo sirve para vender y para reservar.
  await asUser(owner);
  await expectFail('nadie se reserva una mesa en su propio negocio',
    `select tesisreserva.create_reservation($1,$2,'21:00',4,null,null)`, [biz, dateISO]);

  // owner2 tiene su propio local, así que acá actúa como cliente cualquiera.
  await asUser(owner2);
  const reservaCruzada = await c.query(
    `select (tesisreserva.create_reservation($1,$2,'21:00',4,null,null)).reservation_code as cod`,
    [biz, dateISO]);
  ok('un dueño SÍ puede reservar en el local de otro',
    Boolean(reservaCruzada.rows[0].cod), `(${reservaCruzada.rows[0].cod})`);

  console.log('\n--- 14. El role no se puede cambiar desde el cliente ---');
  await asUser(cliA);
  await c.query(`update tesisreserva.profiles set full_name='Nuevo Nombre' where id=$1`, [cliA]);
  const nameChanged = await c.query(`select full_name from tesisreserva.profiles where id=$1`, [cliA]);
  ok('puede editar su nombre', nameChanged.rows[0].full_name === 'Nuevo Nombre');
  await expectFail('NO puede auto-promoverse a owner',
    `update tesisreserva.profiles set role='owner' where id=$1`, [cliA]);
  await expectFail('NO puede auto-promoverse a admin',
    `update tesisreserva.profiles set role='admin' where id=$1`, [cliA]);

  console.log('\n--- 15. anon: lectura pública acotada ---');
  await c.query(`select set_config('request.jwt.claims', '', true)`);
  await c.query(`set local role anon`);
  const pub = await c.query(`select count(*)::int n from tesisreserva.businesses`);
  ok('anon ve negocios activos', pub.rows[0].n >= 1);
  await expectFail('anon NO puede leer reservas',
    `select count(*) from tesisreserva.reservations`);
  await expectFail('anon no puede crear reservas',
    `select tesisreserva.create_reservation($1,$2,'21:30',4,null,null)`, [biz, dateISO]);
  await expectFail('anon no puede leer profiles',
    `select count(*) from tesisreserva.profiles`);
  await expectFail('anon no puede leer notificaciones',
    `select count(*) from tesisreserva.notifications`);
  await expectFail('anon no puede TRUNCATE (no respeta RLS)',
    `truncate tesisreserva.reservations cascade`);
  await expectFail('anon no puede borrar negocios',
    `delete from tesisreserva.businesses`);
  await expectFail('anon no puede modificar la carta',
    `update tesisreserva.catalog_items set price = 0`);
  const anonRead = await c.query(
    `select count(*)::int n from tesisreserva.catalog_items`);
  ok('anon SÍ puede leer la carta pública', anonRead.rows[0].n >= 0);

  console.log('\n--- 16. Permisos mínimos efectivos ---');
  await asAdmin();
  const bad = await c.query(`
    select table_name, privilege_type
    from information_schema.role_table_grants
    where table_schema='tesisreserva' and grantee='anon'
      and privilege_type in ('DELETE','TRUNCATE','UPDATE','INSERT','REFERENCES','TRIGGER')`);
  ok('anon no tiene permisos de escritura en ninguna tabla', bad.rows.length === 0,
     JSON.stringify(bad.rows.slice(0, 4)));

  const authBad = await c.query(`
    select table_name, privilege_type
    from information_schema.role_table_grants
    where table_schema='tesisreserva' and grantee='authenticated'
      and privilege_type in ('TRUNCATE','REFERENCES','TRIGGER')`);
  ok('authenticated tampoco puede TRUNCATE', authBad.rows.length === 0,
     JSON.stringify(authBad.rows.slice(0, 4)));

  const rlsOff = await c.query(`
    select c.relname from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='tesisreserva' and c.relkind='r' and not c.relrowsecurity`);
  ok('todas las tablas tienen RLS activo', rlsOff.rows.length === 0,
     JSON.stringify(rlsOff.rows));

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
