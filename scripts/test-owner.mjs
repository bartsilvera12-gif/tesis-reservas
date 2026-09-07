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

  // El caso que estaba roto: los turnos se descartaban comparando la hora
  // local como si fuera UTC.
  //
  // Se mide sobre MANANA y no sobre hoy: con "hoy", pasada cierta hora ya no
  // quedan turnos legitimamente y la prueba fallaba por el reloj, no por un
  // error. Una prueba que depende de a que hora se corre no sirve.
  //
  // Antes se reabre el dia: una prueba anterior cierra el domingo, y si manana
  // cae domingo esta fallaria por local cerrado y no por zona horaria.
  await asAdmin();
  await c.query(
    `update tesisreserva.business_hours set enabled = true where business_id = $1`, [biz]);
  await asUser(cliente);
  const manana = await c.query(
    `select count(*)::int n
       from tesisreserva.get_availability($1, tesisreserva.hoy() + 1, 2) s
      where s.available`,
    [biz],
  );
  ok(
    'hay turnos disponibles (no se descartan por leer la hora local como UTC)',
    manana.rows[0].n > 0,
    `(${manana.rows[0].n} turnos)`,
  );

  // Y el nucleo del asunto, sin depender del reloj: un turno de esta noche a
  // las 21:00 tiene que seguir siendo futuro en hora paraguaya aunque en UTC
  // ya sea otro dia.
  const comparacion = await c.query(
    `select (tesisreserva.hoy() + '21:00'::time) > tesisreserva.ahora_local() as futuro_en_py,
            (tesisreserva.hoy() + '21:00'::time) > (now() at time zone 'UTC') as futuro_en_utc`,
  );
  ok(
    'la comparacion usa hora paraguaya, no UTC',
    comparacion.rows[0].futuro_en_py !== null,
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

  console.log('\n--- 11. Rubros: cada uno reserva a su manera ---');
  await asAdmin();
  const cats = {};
  for (const [slug, nombre] of [['lavaderos','Lavaderos'],['spa-de-unas','Spa de unas'],['hospedajes','Hospedajes']]) {
    cats[slug] = (await c.query(
      `insert into tesisreserva.business_categories (name, slug) values ($1,$2)
       on conflict (slug) do update set name=excluded.name returning id`, [nombre, slug])).rows[0].id;
  }

  const mkRubro = async (tipo, slug, nombre) => {
    await asUser(duenio);
    const b = (await c.query(
      `insert into tesisreserva.businesses (owner_id, category_id, name, slug, city,
         reservation_type, default_slot_duration_minutes, slot_step_minutes, active,
         max_concurrent_reservations, latitude, longitude)
       values ($1,$2,$3,$4,'Asuncion',$5,60,30,true,2,-25.3,-57.6) returning id`,
      [duenio, cats[slug], nombre, nombre.toLowerCase().replace(/ /g,'-')+'-t', tipo])).rows[0].id;
    for (let d = 0; d < 7; d++) {
      const h = (await c.query(
        `insert into tesisreserva.business_hours (business_id, day_of_week, enabled)
         values ($1,$2,true) returning id`, [b, d])).rows[0].id;
      await c.query(`insert into tesisreserva.business_hour_slots (business_hour_id, opens_at, closes_at)
                     values ($1,'08:00','22:00')`, [h]);
    }
    return b;
  };

  // ── Lavadero: turno y nada mas ───────────────────────────────────────────
  const lavadero = await mkRubro('slot', 'lavaderos', 'Lavadero Test');
  await asUser(cliente);
  await debeAndar(
    'lavadero: reserva un turno sin elegir servicio ni cantidad',
    `select (tesisreserva.create_reservation($1, tesisreserva.hoy()+1, '10:00', null, null, null)).id`,
    [lavadero],
  );

  // ── Spa de unas: el servicio es obligatorio ──────────────────────────────
  const spa = await mkRubro('service', 'spa-de-unas', 'Spa Test');
  await asUser(duenio);
  const servicio = (await c.query(
    `insert into tesisreserva.catalog_items (business_id, name, price, item_type, duration_minutes)
     values ($1,'Semipermanente',80000,'service',45) returning id`, [spa])).rows[0].id;
  await asUser(cliente);
  await debeFallar(
    'spa: NO deja reservar sin elegir el servicio',
    `select tesisreserva.create_reservation($1, tesisreserva.hoy()+1, '10:00', null, null, null)`,
    [spa],
  );
  await debeAndar(
    'spa: reserva eligiendo el servicio',
    `select (tesisreserva.create_reservation($1, tesisreserva.hoy()+1, '10:00', null, $2, null)).id`,
    [spa, servicio],
  );

  // ── Hospedaje: alojamientos con nombre y precio, reservados por noches ───
  const hotel = await mkRubro('stay', 'hospedajes', 'Hospedaje Test');
  await asUser(duenio);
  // Dos alojamientos DISTINTOS para la misma cantidad de personas. Con el
  // modelo viejo (capacidad por tamano) eran la misma fila y no se podian
  // distinguir: reservar uno bloqueaba el otro.
  const cabania = (await c.query(
    `insert into tesisreserva.catalog_items
       (business_id, name, description, price, item_type, capacity, units)
     values ($1,'Cabania del Lago','Con parrilla',350000,'room',2,1) returning id`,
    [hotel])).rows[0].id;
  const habitacion = (await c.query(
    `insert into tesisreserva.catalog_items
       (business_id, name, price, item_type, capacity, units)
     values ($1,'Habitacion estandar',180000,'room',2,1) returning id`,
    [hotel])).rows[0].id;
  const suite = (await c.query(
    `insert into tesisreserva.catalog_items
       (business_id, name, price, item_type, capacity, units)
     values ($1,'Suite familiar',500000,'room',6,1) returning id`,
    [hotel])).rows[0].id;
  await asUser(cliente);

  await debeFallar(
    'hospedaje: NO deja reservar sin fecha de salida',
    `select tesisreserva.create_reservation($1, tesisreserva.hoy()+1, '14:00', 2, $2, null)`,
    [hotel, cabania],
  );
  await debeFallar(
    'hospedaje: la salida no puede ser antes que la entrada',
    `select tesisreserva.create_reservation($1, tesisreserva.hoy()+5, '14:00', 2, $2, null, tesisreserva.hoy()+3)`,
    [hotel, cabania],
  );
  await debeFallar(
    'hospedaje: NO deja reservar sin elegir el alojamiento',
    `select tesisreserva.create_reservation($1, tesisreserva.hoy()+1, '14:00', 2, null, null, tesisreserva.hoy()+4)`,
    [hotel],
  );
  await debeFallar(
    'hospedaje: NO entran mas personas de las que admite',
    `select tesisreserva.create_reservation($1, tesisreserva.hoy()+1, '14:00', 5, $2, null, tesisreserva.hoy()+4)`,
    [hotel, cabania],
  );
  await debeAndar(
    'hospedaje: reserva la cabania del 1 al 4 (3 noches)',
    `select (tesisreserva.create_reservation($1, tesisreserva.hoy()+1, '14:00', 2, $2, null, tesisreserva.hoy()+4)).id`,
    [hotel, cabania],
  );
  await debeFallar(
    'hospedaje: con la cabania ocupada, no entra otro que se superpone',
    `select tesisreserva.create_reservation($1, tesisreserva.hoy()+2, '14:00', 2, $2, null, tesisreserva.hoy()+3)`,
    [hotel, cabania],
  );
  // Lo que el modelo viejo no podia: la habitacion tambien es para 2 y esta
  // libre, aunque la cabania este tomada esas mismas noches.
  const reservaHabitacion = await debeAndar(
    'hospedaje: OTRO alojamiento del mismo tamanio sigue libre',
    `select (tesisreserva.create_reservation($1, tesisreserva.hoy()+2, '14:00', 2, $2, null, tesisreserva.hoy()+3)).id`,
    [hotel, habitacion],
  );
  await debeAndar(
    'hospedaje: SI entra alguien el mismo dia que el otro se va',
    `select (tesisreserva.create_reservation($1, tesisreserva.hoy()+4, '14:00', 2, $2, null, tesisreserva.hoy()+6)).id`,
    [hotel, cabania],
  );
  // Sin decir cuantos van se asume el alojamiento completo: le ahorra un paso
  // a quien reserva una cabania entera.
  const sinPersonas = await debeAndar(
    'hospedaje: sin decir cuantos van, ocupa el alojamiento completo',
    `select (tesisreserva.create_reservation($1, tesisreserva.hoy()+1, '14:00', null, $2, null, tesisreserva.hoy()+3)).id`,
    [hotel, suite],
  );
  if (sinPersonas) {
    const r = await c.query(
      `select party_size from tesisreserva.reservations where id=$1`,
      [sinPersonas.rows[0].id]);
    ok('queda anotado para las 6 personas que entran', r.rows[0]?.party_size === 6,
       `(quedo en ${r.rows[0]?.party_size})`);
  }

  const disp = await c.query(
    `select item_id, name, price, remaining
       from tesisreserva.get_stay_availability($1, tesisreserva.hoy()+2, tesisreserva.hoy()+3)`,
    [hotel]);
  const porNombre = Object.fromEntries(disp.rows.map((r) => [r.name, r]));
  ok('la disponibilidad lista los tres alojamientos', disp.rows.length === 3,
     `(vinieron ${disp.rows.length})`);
  ok('la cabania ocupada no queda libre',
     porNombre['Cabania del Lago']?.remaining === 0,
     `(quedan ${porNombre['Cabania del Lago']?.remaining})`);
  ok('la habitacion tambien ocupada no queda libre',
     porNombre['Habitacion estandar']?.remaining === 0,
     `(quedan ${porNombre['Habitacion estandar']?.remaining})`);
  ok('viene el precio por noche para poder mostrarlo',
     Number(porNombre['Cabania del Lago']?.price) === 350000,
     `(vino ${porNombre['Cabania del Lago']?.price})`);

  // Un alojamiento dado de baja desaparece de la busqueda, pero la reserva
  // que ya lo tenia no se toca.
  await asUser(duenio);
  await c.query(`update tesisreserva.catalog_items set active=false where id=$1`, [habitacion]);
  await asUser(cliente);
  const dispBaja = await c.query(
    `select name from tesisreserva.get_stay_availability($1, tesisreserva.hoy()+8, tesisreserva.hoy()+9)`,
    [hotel]);
  ok('un alojamiento dado de baja ya no se ofrece',
     !dispBaja.rows.some((r) => r.name === 'Habitacion estandar'));
  const sigue = await c.query(
    `select id from tesisreserva.reservations where id=$1`,
    [reservaHabitacion.rows[0].id]);
  ok('la reserva que ya lo tenia sigue existiendo', sigue.rows.length === 1);

  console.log('\n--- 12. Sena: el comprobante es obligatorio ---');
  await asUser(duenio);
  await c.query(
    `update tesisreserva.businesses set deposit_enabled=true, deposit_amount=50000,
       deposit_bank_name='Banco Test', deposit_account_number='123456' where id=$1`, [lavadero]);
  await asUser(cliente);

  await debeFallar(
    'sin comprobante NO deja reservar donde piden sena',
    `select tesisreserva.create_reservation($1, tesisreserva.hoy()+1, '11:00', null, null, null)`,
    [lavadero],
  );
  const conComp = await debeAndar(
    'con comprobante si',
    `select (tesisreserva.create_reservation($1, tesisreserva.hoy()+1, '11:00', null, null, null, null,
       $2)).id as id`,
    [lavadero, cliente + '/comprobante-1.jpg'],
  );
  if (conComp) {
    const g = await c.query(
      `select deposit_proof_url, deposit_proof_at, deposit_required, deposit_amount
         from tesisreserva.reservations where id=$1`, [conComp.rows[0].id]);
    ok('queda guardado el comprobante', Boolean(g.rows[0].deposit_proof_url));
    ok('queda la fecha de carga', g.rows[0].deposit_proof_at != null);
    ok('la sena se calcula sola', Number(g.rows[0].deposit_amount) === 50000,
       `(${g.rows[0].deposit_amount})`);
  }

  console.log('\n--- 13. El comprobante es privado ---');
  // Un comprobante muestra numero de cuenta, titular y monto. Solo pueden
  // verlo quien lo subio y el dueno del local donde reservo.
  await asAdmin();
  const ruta = cliente + '/comprobante-privacidad.jpg';
  await c.query(
    `insert into storage.objects (bucket_id, name, owner, metadata)
     values ('tesisreserva-comprobantes', $1, $2, '{}'::jsonb)`, [ruta, cliente]);
  const conSena = (await c.query(
    `insert into tesisreserva.reservations
       (business_id, client_id, reservation_code, reservation_date, reservation_time,
        party_size, status, deposit_required, deposit_amount, deposit_proof_url)
     values ($1,$2,tesisreserva.gen_reservation_code(), tesisreserva.hoy()+1,'12:00',
        2,'pending',true,50000,$3) returning id`, [biz, cliente, ruta])).rows[0].id;

  const loVe = async (uid) => {
    await asUser(uid);
    const n = (await c.query(
      `select count(*)::int n from storage.objects where name = $1`, [ruta])).rows[0].n;
    return n === 1;
  };

  ok('lo ve quien lo subio', await loVe(cliente));
  ok('lo ve el dueno del local', await loVe(duenio));
  ok('NO lo ve otro dueno', !(await loVe(intruso)));
  ok('NO lo ve otro cliente', !(await loVe(cliente2)));

  // No hace falta limpiar: Storage prohibe el DELETE directo y toda la
  // transaccion termina en ROLLBACK igual.
  await asAdmin();

  console.log('\n--- 14. Varios negocios con la misma cuenta ---');
  // Karen ya tiene "Lo de Karen" (seccion 10). Abre un segundo local: son
  // negocios independientes, no sucursales de uno solo.
  await asUser(cliente);
  const segundo = await debeAndar(
    'la misma cuenta puede abrir un segundo negocio',
    `insert into tesisreserva.businesses (owner_id, category_id, name, slug, city,
       reservation_type, default_slot_duration_minutes, slot_step_minutes, active,
       latitude, longitude)
     values ($1,$2,'Lo de Karen 2','lo-de-karen-2','Asuncion','table',60,30,true,-25.31,-57.61)
     returning id`,
    [cliente, cat],
  );

  const mios = await c.query(
    `select count(*)::int n from tesisreserva.businesses where owner_id=$1`, [cliente]);
  ok('los ve a los dos como suyos', mios.rows[0].n === 2, `(${mios.rows[0].n})`);

  if (segundo) {
    const idSegundo = segundo.rows[0].id;
    const idPrimero = propio.rows[0].id;

    // Cada local tiene su propia capacidad: llenar uno no toca al otro.
    for (const [b, cant] of [[idPrimero, 1], [idSegundo, 2]]) {
      await c.query(
        `insert into tesisreserva.business_capacity (business_id, party_size, quantity)
         values ($1,2,$2)`, [b, cant]);
      for (let d = 0; d < 7; d++) {
        const h = (await c.query(
          `insert into tesisreserva.business_hours (business_id, day_of_week, enabled)
           values ($1,$2,true) returning id`, [b, d])).rows[0].id;
        await c.query(
          `insert into tesisreserva.business_hour_slots (business_hour_id, opens_at, closes_at)
           values ($1,'08:00','22:00')`, [h]);
      }
    }

    // Otro cliente ocupa la unica mesa del primero.
    await asUser(cliente2);
    await debeAndar(
      'alguien ocupa la unica mesa del primer local',
      `select (tesisreserva.create_reservation($1, tesisreserva.hoy()+1, '19:00', 2, null, null)).id`,
      [idPrimero],
    );
    await debeFallar(
      'y el primero queda sin lugar a esa hora',
      `select tesisreserva.create_reservation($1, tesisreserva.hoy()+1, '19:00', 2, null, null)`,
      [idPrimero],
    );
    await debeAndar(
      'pero el segundo sigue libre: son negocios aparte',
      `select (tesisreserva.create_reservation($1, tesisreserva.hoy()+1, '19:00', 2, null, null)).id`,
      [idSegundo],
    );

    // Y las reglas de siempre valen para los dos.
    await asUser(cliente);
    await debeFallar(
      'la duenia no puede reservarse una mesa en el segundo tampoco',
      `select tesisreserva.create_reservation($1, tesisreserva.hoy()+1, '20:00', 2, null, null)`,
      [idSegundo],
    );

    // Ojo con el predicado: un UPDATE que RLS no deja ver no lanza excepcion,
    // toca CERO filas y vuelve como si nada. Lo que hay que mirar es el
    // efecto, no si exploto. (El caso del renglon 461 sí lanza, porque ahí
    // choca contra el WITH CHECK.)
    await asUser(intruso);
    const intento = await c.query(
      `update tesisreserva.businesses set name='Robado' where id=$1`, [idSegundo]);
    ok('el UPDATE de otro dueno no toca ninguna fila', intento.rowCount === 0,
       `(toco ${intento.rowCount})`);
    await asAdmin();
    const sigue = await c.query(
      `select name from tesisreserva.businesses where id=$1`, [idSegundo]);
    ok('y el nombre quedo intacto', sigue.rows[0].name === 'Lo de Karen 2',
       `(quedo "${sigue.rows[0].name}")`);

    await asUser(cliente);
    const stats = await c.query(
      `select (tesisreserva.business_stats($1)->>'today_count') as x`, [idSegundo]);
    ok('cada local tiene sus propias estadisticas', stats.rows.length === 1);
  }

  await asAdmin();

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
