/**
 * Auditoría de la lógica del DUEÑO contra la base real.
 *
 *   npm run db:test:owner
 *
 * Complementa a `test-flows.mjs`: aquel verifica RLS y permisos, éste verifica
 * que las reglas de negocio del panel del dueño se cumplan (máquina de estados
 * de las reservas, respuestas a reseñas, promociones, carta, horarios,
 * capacidad y estadísticas).
 *
 * Todo corre dentro de una transacción que termina en ROLLBACK: no deja nada.
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

let pass = 0;
let fail = 0;
const fallos = [];

const ok = (name, cond, extra = '') => {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    fallos.push(name);
    console.log(`  FAIL  ${name} ${extra}`);
  }
};

const asUser = async (uid) => {
  await c.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: uid, role: 'authenticated' }),
  ]);
  await c.query(`select set_config('role', 'authenticated', true)`);
  await c.query(`set local role authenticated`);
};
const asAdmin = async () => {
  await c.query(`reset role`);
};

let spN = 0;
/** Un error aborta la transacción: hay que aislarlo con un SAVEPOINT. */
const debeFallar = async (name, sql, params = []) => {
  const sp = `sp${++spN}`;
  await c.query(`savepoint ${sp}`);
  try {
    await c.query(sql, params);
    fail++;
    fallos.push(name);
    console.log(`  FAIL  ${name} (no falló, debía fallar)`);
  } catch (e) {
    pass++;
    console.log(`  PASS  ${name} -> ${e.message.slice(0, 58)}`);
  }
  // Se revierte pase lo que pase: si la operación NO falló (o sea, encontramos
  // un bug) dejarla aplicada le cambiaría el estado a las pruebas siguientes y
  // el informe se llenaría de fallos en cascada que no son reales.
  await c.query(`rollback to savepoint ${sp}`);
};

/** Como `debeFallar` pero al revés: aísla para que un error no aborte todo. */
const debeAndar = async (name, sql, params = []) => {
  const sp = `sp${++spN}`;
  await c.query(`savepoint ${sp}`);
  try {
    const r = await c.query(sql, params);
    await c.query(`release savepoint ${sp}`);
    pass++;
    console.log(`  PASS  ${name}`);
    return r;
  } catch (e) {
    await c.query(`rollback to savepoint ${sp}`);
    fail++;
    fallos.push(name);
    console.log(`  FAIL  ${name} -> ${e.message.slice(0, 70)}`);
    return null;
  }
};

try {
  await c.query('begin');

  // ── Actores ────────────────────────────────────────────────────────────────
  const mk = async (email, role) => {
    const r = await c.query(
      `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
       values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated',
         'authenticated', $1::text, 'x', now(), now(), now(), '{}'::jsonb,
         jsonb_build_object('app','tesisreserva','role',$2::text,'full_name',$3::text))
       returning id`,
      [email, role, email.split('@')[0]],
    );
    return r.rows[0].id;
  };

  const duenio = await mk('o.duenio@test.local', 'owner');
  const intruso = await mk('o.intruso@test.local', 'owner');
  const cliente = await mk('o.cliente@test.local', 'client');
  const cliente2 = await mk('o.cliente2@test.local', 'client');

  await asAdmin();
  const cat = (
    await c.query(
      `insert into tesisreserva.business_categories (name, slug) values ('AudCat','aud-cat')
       on conflict (slug) do update set name=excluded.name returning id`,
    )
  ).rows[0].id;

  // Negocio del dueño y otro del intruso, para probar aislamiento.
  const mkBiz = async (owner, name, slug) =>
    (
      await c.query(
        `insert into tesisreserva.businesses
           (owner_id, category_id, name, slug, city, reservation_type,
            default_slot_duration_minutes, slot_step_minutes, active, latitude, longitude)
         values ($1,$2,$3,$4,'Asunción','table',90,30,true,-25.29,-57.57)
         returning id`,
        [owner, cat, name, slug],
      )
    ).rows[0].id;

  await asUser(duenio);
  const biz = await mkBiz(duenio, 'Audit Resto', 'audit-resto');
  await asUser(intruso);
  const bizAjeno = await mkBiz(intruso, 'Ajeno', 'audit-ajeno');

  await asUser(duenio);
  for (let d = 0; d < 7; d++) {
    const h = (
      await c.query(
        `insert into tesisreserva.business_hours (business_id, day_of_week, enabled)
         values ($1,$2,true) returning id`,
        [biz, d],
      )
    ).rows[0].id;
    await c.query(
      `insert into tesisreserva.business_hour_slots (business_hour_id, opens_at, closes_at)
       values ($1,'09:00','23:00')`,
      [h],
    );
  }
  await c.query(
    `insert into tesisreserva.business_capacity (business_id, party_size, quantity)
     values ($1,2,5),($1,4,5)`,
    [biz],
  );

  /** Crea una reserva ya en el estado pedido, saltando la RPC. */
  const mkReserva = async (dias, estado = 'pending', cli = cliente) => {
    await asAdmin();
    const r = await c.query(
      `insert into tesisreserva.reservations
         (business_id, client_id, reservation_code, reservation_date, reservation_time, party_size, status)
       values ($1,$2, tesisreserva.gen_reservation_code(), tesisreserva.hoy() + $3::int, '20:00', 2, $4)
       returning id`,
      [biz, cli, dias, estado],
    );
    await asUser(duenio);
    return r.rows[0].id;
  };

  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n--- 1. Máquina de estados de las reservas ---');

  // Ayer: es el único caso en que confirmar y después cerrar tiene sentido,
  // porque marcar asistencia exige que la reserva ya haya ocurrido.
  const rPend = await mkReserva(-1, 'pending');
  await debeAndar(
    'el dueño confirma una reserva pendiente',
    `select tesisreserva.set_reservation_status($1,'confirmed')`,
    [rPend],
  );
  await debeAndar(
    'el dueño marca asistida una confirmada que ya ocurrió',
    `select tesisreserva.set_reservation_status($1,'completed')`,
    [rPend],
  );
  await debeFallar(
    'no puede reabrir una reserva ya cerrada',
    `select tesisreserva.set_reservation_status($1,'confirmed')`,
    [rPend],
  );

  // Pasada a propósito: así lo único que puede rechazarla es la falta de
  // confirmación, no la regla de que todavía no ocurrió.
  const rSalto = await mkReserva(-1, 'pending');
  await debeFallar(
    'no puede marcar asistida una reserva SIN confirmar',
    `select tesisreserva.set_reservation_status($1,'completed')`,
    [rSalto],
  );
  await debeFallar(
    'no puede marcar ausente una reserva SIN confirmar',
    `select tesisreserva.set_reservation_status($1,'no_show')`,
    [rSalto],
  );

  const rFutura = await mkReserva(5, 'confirmed');
  await debeFallar(
    'no puede marcar asistida una reserva que todavía no ocurrió',
    `select tesisreserva.set_reservation_status($1,'completed')`,
    [rFutura],
  );
  await debeFallar(
    'no puede marcar ausente una reserva que todavía no ocurrió',
    `select tesisreserva.set_reservation_status($1,'no_show')`,
    [rFutura],
  );
  await debeAndar(
    'sí puede rechazar/cancelar una reserva futura',
    `select tesisreserva.set_reservation_status($1,'cancelled','Cierre por refacción')`,
    [rFutura],
  );

  const rPasada = await mkReserva(-2, 'confirmed');
  await debeAndar(
    'el dueño cierra una reserva PASADA que quedó abierta',
    `select tesisreserva.set_reservation_status($1,'no_show')`,
    [rPasada],
  );

  console.log('\n--- 2. Aislamiento entre dueños ---');
  await asUser(intruso);
  const rAjena = await mkReserva(1, 'pending');
  await asUser(intruso);
  await debeFallar(
    'un dueño NO puede tocar reservas de otro negocio',
    `select tesisreserva.set_reservation_status($1,'confirmed')`,
    [rAjena],
  );
  await debeFallar(
    'un dueño NO puede leer las estadísticas de otro negocio',
    `select tesisreserva.business_stats($1)`,
    [biz],
  );
  // RLS no lanza error en un UPDATE: filtra las filas y afecta 0. Hay que
  // mirar el efecto real, no esperar una excepción.
  const intento = await c.query(
    `update tesisreserva.businesses set name='Robado' where id=$1 returning id`,
    [biz],
  );
  ok('un dueño NO puede editar el negocio de otro', intento.rowCount === 0, `(afectó ${intento.rowCount})`);
  await asAdmin();
  const nombre = await c.query(`select name from tesisreserva.businesses where id=$1`, [biz]);
  ok('el nombre del negocio quedó intacto', nombre.rows[0].name === 'Audit Resto', `(${nombre.rows[0].name})`);
  await asUser(intruso);
  const vioAjenas = await c.query(
    `select count(*)::int n from tesisreserva.reservations where business_id=$1`,
    [biz],
  );
  ok('un dueño NO ve las reservas de otro negocio', vioAjenas.rows[0].n === 0, `(vio ${vioAjenas.rows[0].n})`);

  console.log('\n--- 3. Reseñas y respuestas ---');
  await asAdmin();
  const rev = (
    await c.query(
      `insert into tesisreserva.reviews (business_id, client_id, rating, comment)
       values ($1,$2,4,'Muy bueno todo') returning id`,
      [biz, cliente],
    )
  ).rows[0].id;
  const revAjena = (
    await c.query(
      `insert into tesisreserva.reviews (business_id, client_id, rating, comment)
       values ($1,$2,2,'Ni ahí') returning id`,
      [bizAjeno, cliente2],
    )
  ).rows[0].id;

  await asUser(duenio);
  await debeAndar(
    'el dueño responde una reseña de su negocio',
    `select tesisreserva.reply_to_review($1,'Gracias por venir!')`,
    [rev],
  );
  const resp = await c.query(
    `select owner_reply, owner_replied_at from tesisreserva.reviews where id=$1`,
    [rev],
  );
  ok('la respuesta quedó guardada', resp.rows[0].owner_reply === 'Gracias por venir!');
  ok('quedó la fecha de la respuesta', resp.rows[0].owner_replied_at != null);

  await debeAndar(
    'puede corregir su respuesta',
    `select tesisreserva.reply_to_review($1,'Gracias, te esperamos de nuevo.')`,
    [rev],
  );
  await debeFallar(
    'NO puede responder reseñas de otro negocio',
    `select tesisreserva.reply_to_review($1,'Mentira')`,
    [revAjena],
  );
  await debeFallar(
    'NO puede responder con texto vacío',
    `select tesisreserva.reply_to_review($1,'   ')`,
    [rev],
  );
  // El diseño no rechaza el UPDATE: un trigger repone los campos del cliente en
  // silencio. Lo que importa es el efecto, así que se comprueba el dato final.
  await c.query(
    `update tesisreserva.reviews set rating=1, comment='Lo cambio yo' where id=$1`,
    [rev],
  );
  const tras = await c.query(`select rating, comment from tesisreserva.reviews where id=$1`, [rev]);
  ok('NO puede cambiar la calificación que le pusieron', tras.rows[0].rating === 4, `(quedó ${tras.rows[0].rating})`);
  ok('NO puede reescribir el comentario del cliente', tras.rows[0].comment === 'Muy bueno todo', `(quedó "${tras.rows[0].comment}")`);
  await debeFallar(
    'NO puede borrar una reseña que no le gusta',
    `delete from tesisreserva.reviews where id=$1`,
    [rev],
  );

  console.log('\n--- 4. Promociones ---');
  const promo = await debeAndar(
    'crea una promoción',
    `insert into tesisreserva.promotions (business_id, title, description, starts_at, ends_at)
     values ($1,'2x1 en pizzas','Solo martes', now(), now() + interval '10 days') returning id`,
    [biz],
  );
  const promoId = promo?.rows[0].id;

  await debeFallar(
    'NO puede crear una promo que termina antes de empezar',
    `insert into tesisreserva.promotions (business_id, title, starts_at, ends_at)
     values ($1,'Imposible', now(), now() - interval '1 day')`,
    [biz],
  );
  await debeFallar(
    'NO puede marcar ilimitada una promo con fecha de fin',
    `insert into tesisreserva.promotions (business_id, title, unlimited, ends_at)
     values ($1,'Contradictoria', true, now() + interval '5 days')`,
    [biz],
  );
  await debeFallar(
    'NO puede crear promociones en el negocio de otro',
    `insert into tesisreserva.promotions (business_id, title) values ($1,'Intrusa')`,
    [bizAjeno],
  );
  await debeAndar('desactiva su promoción', `update tesisreserva.promotions set active=false where id=$1`, [promoId]);
  await debeAndar('borra su promoción', `delete from tesisreserva.promotions where id=$1`, [promoId]);

  console.log('\n--- 5. Carta / servicios ---');
  const item = await debeAndar(
    'agrega un ítem a la carta',
    `insert into tesisreserva.catalog_items (business_id, name, price, item_type, duration_minutes)
     values ($1,'Corte de pelo', 60000, 'service', 45) returning id`,
    [biz],
  );
  await debeFallar(
    'NO acepta precio negativo',
    `insert into tesisreserva.catalog_items (business_id, name, price) values ($1,'Roto', -100)`,
    [biz],
  );
  await debeFallar(
    'NO acepta una duración absurda',
    `insert into tesisreserva.catalog_items (business_id, name, duration_minutes)
     values ($1,'Eterno', 900)`,
    [biz],
  );
  await debeFallar(
    'NO puede agregar ítems al negocio de otro',
    `insert into tesisreserva.catalog_items (business_id, name) values ($1,'Intruso')`,
    [bizAjeno],
  );
  await debeAndar(
    'edita el precio de su ítem',
    `update tesisreserva.catalog_items set price=70000 where id=$1`,
    [item?.rows[0].id],
  );

  console.log('\n--- 6. Horarios y capacidad ---');
  await debeFallar(
    'NO acepta un cierre anterior a la apertura',
    `insert into tesisreserva.business_hour_slots (business_hour_id, opens_at, closes_at)
     values ((select id from tesisreserva.business_hours where business_id=$1 and day_of_week=1),
             '22:00','10:00')`,
    [biz],
  );
  await debeAndar(
    'acepta horario partido (mañana y tarde)',
    `insert into tesisreserva.business_hour_slots (business_hour_id, opens_at, closes_at, sort_order)
     values ((select id from tesisreserva.business_hours where business_id=$1 and day_of_week=2),
             '08:00','12:00', 1)`,
    [biz],
  );
  await debeFallar(
    'NO acepta capacidad negativa',
    `update tesisreserva.business_capacity set quantity=-1 where business_id=$1 and party_size=2`,
    [biz],
  );
  await debeAndar(
    'puede cerrar un día de la semana',
    `update tesisreserva.business_hours set enabled=false where business_id=$1 and day_of_week=0`,
    [biz],
  );

  console.log('\n--- 7. Estadísticas: los números tienen que cerrar ---');
  await asAdmin();
  await c.query(`delete from tesisreserva.reservations where business_id=$1`, [biz]);
  await c.query(
    `insert into tesisreserva.reservations
       (business_id, client_id, reservation_code, reservation_date, reservation_time, party_size, status)
     values ($1,$2,tesisreserva.gen_reservation_code(),tesisreserva.hoy(),'20:00',2,'pending'),
            ($1,$2,tesisreserva.gen_reservation_code(),tesisreserva.hoy(),'21:00',2,'confirmed'),
            ($1,$2,tesisreserva.gen_reservation_code(),tesisreserva.hoy() + 3,'20:00',2,'pending'),
            ($1,$2,tesisreserva.gen_reservation_code(),tesisreserva.hoy() - 3,'20:00',2,'completed'),
            ($1,$2,tesisreserva.gen_reservation_code(),tesisreserva.hoy() + 1,'20:00',2,'cancelled')`,
    [biz, cliente],
  );
  await asUser(duenio);
  const st = (await c.query(`select tesisreserva.business_stats($1) s`, [biz])).rows[0].s;

  ok('cuenta bien las de hoy (2, sin las canceladas)', st.today_count === 2, `(${st.today_count})`);
  ok('cuenta bien las pendientes (2)', st.pending_count === 2, `(${st.pending_count})`);
  ok('cuenta bien las confirmadas (1)', st.confirmed_count === 1, `(${st.confirmed_count})`);
  ok('no cuenta las canceladas como pendientes', st.pending_count !== 3);
  ok('el promedio de estrellas refleja la reseña real', Number(st.rating_avg) === 4, `(${st.rating_avg})`);
  ok('cuenta 1 reseña', st.reviews_count === 1, `(${st.reviews_count})`);

  console.log('\n--- 8. Estado del negocio ---');
  await debeAndar(
    'puede desactivar su negocio',
    `update tesisreserva.businesses set active=false where id=$1`,
    [biz],
  );
  await asAdmin();
  await c.query(`select set_config('request.jwt.claims', '', true)`);
  await c.query(`set local role anon`);
  const visible = await c.query(`select count(*)::int n from tesisreserva.businesses where id=$1`, [biz]);
  ok('un negocio desactivado deja de verse en público', visible.rows[0].n === 0, `(${visible.rows[0].n})`);

  await asAdmin();
  await asUser(duenio);
  await debeAndar(
    'lo puede volver a activar',
    `update tesisreserva.businesses set active=true where id=$1`,
    [biz],
  );
  // Acá sí salta excepción (y no un filtrado silencioso): el WITH CHECK de la
  // política rechaza la fila nueva porque ya no le pertenecería.
  await debeFallar(
    'NO puede pasarle su negocio a otra persona',
    `update tesisreserva.businesses set owner_id=$2 where id=$1`,
    [biz, intruso],
  );

  console.log('\n--- 9. Zona horaria: la agenda es hora de Paraguay, no UTC ---');
  await asAdmin();
  const tz = (
    await c.query(
      `select tesisreserva.hoy() as hoy,
              (now() at time zone 'America/Asuncion')::date as esperado`,
    )
  ).rows[0];
  ok('hoy() devuelve la fecha paraguaya', tz.hoy.getTime() === tz.esperado.getTime());

  // A las 21:00 de Paraguay ya es el dia siguiente en UTC. Es la hora pico de
  // un restaurante: si el panel usara current_date mostraria las de manana.
  const cruce = (
    await c.query(
      `select ('2026-08-25 01:00:00+00'::timestamptz at time zone 'UTC')::date as segun_utc,
              ('2026-08-25 01:00:00+00'::timestamptz at time zone 'America/Asuncion')::date as segun_py`,
    )
  ).rows[0];
  ok(
    'a las 21:00 de Paraguay UTC ya cambio de dia (por eso hacia falta el cambio)',
    cruce.segun_utc.getTime() !== cruce.segun_py.getTime(),
  );

  // El caso que estaba roto: reservar a la tarde una mesa para esa misma noche.
  // Antes se reabre el dia: una prueba anterior cierra el domingo, y si hoy
  // cae domingo esta fallaria por local cerrado y no por zona horaria.
  await asAdmin();
  await c.query(
    `update tesisreserva.business_hours set enabled = true where business_id = $1`, [biz]);
  await asUser(cliente);
  const estaNoche = await c.query(
    `select count(*)::int n
       from tesisreserva.get_availability($1, tesisreserva.hoy(), 2) s
      where s.available`,
    [biz],
  );
  ok(
    'quedan horarios disponibles para hoy (no se descarta la noche por UTC)',
    estaNoche.rows[0].n > 0,
    `(${estaNoche.rows[0].n} turnos)`,
  );

  console.log('\n--- 10. Un solo correo, los dos modos ---');

  // Karen se registro como CLIENTE. Quiere publicar su negocio sin abrir
  // otra cuenta con otro correo.
  await asUser(cliente);
  const antes = await c.query(
    `select role, is_owner from tesisreserva.profiles where id=$1`, [cliente]);
  ok('arranca como cliente sin modo negocio',
     antes.rows[0].role === 'client' && antes.rows[0].is_owner === false);

  await debeFallar(
    'un cliente NO puede crear un negocio antes de activarlo',
    `insert into tesisreserva.businesses (owner_id, category_id, name, slug, city,
       reservation_type, default_slot_duration_minutes, slot_step_minutes, active)
     values ($1,$2,'Prematuro','prematuro','Asuncion','table',60,30,true)`,
    [cliente, cat],
  );

  await debeFallar(
    'NO puede activarse el modo negocio por UPDATE directo',
    `update tesisreserva.profiles set is_owner = true where id=$1`,
    [cliente],
  );

  await debeAndar('activa el modo negocio por la RPC', `select tesisreserva.become_owner()`);

  const luego = await c.query(
    `select role, is_owner from tesisreserva.profiles where id=$1`, [cliente]);
  ok('ahora puede tener negocios', luego.rows[0].is_owner === true);
  ok('y NO se auto-ascendio de rol', luego.rows[0].role === 'client', `(${luego.rows[0].role})`);

  const propio = await debeAndar(
    'ya puede publicar su negocio con el mismo correo',
    `insert into tesisreserva.businesses (owner_id, category_id, name, slug, city,
       reservation_type, default_slot_duration_minutes, slot_step_minutes, active,
       latitude, longitude)
     values ($1,$2,'Lo de Karen','lo-de-karen','Asuncion','table',60,30,true,-25.3,-57.6)
     returning id`,
    [cliente, cat],
  );

  // Y lo importante: sigue siendo cliente. Antes, ser dueno lo impedia.
  await debeAndar(
    'y SIGUE pudiendo reservar en otros locales',
    `select tesisreserva.create_reservation($1, tesisreserva.hoy() + 1, '20:00', 2, null, null)`,
    [biz],
  );

  await debeFallar(
    'pero NO puede reservarse una mesa en su propio negocio',
    `select tesisreserva.create_reservation($1, tesisreserva.hoy() + 1, '20:00', 2, null, null)`,
    [propio?.rows[0].id],
  );

  await debeFallar(
    'nadie se vuelve admin por este camino',
    `update tesisreserva.profiles set role='admin' where id=$1`,
    [cliente],
  );

  console.log(`\n==========  ${pass} PASS  /  ${fail} FAIL  ==========`);
  if (fallos.length) {
    console.log('\nFallaron:');
    for (const f of fallos) console.log(`  · ${f}`);
  }
} finally {
  await c.query('rollback').catch(() => {});
  await c.end();
}

process.exit(fail ? 1 : 0);
