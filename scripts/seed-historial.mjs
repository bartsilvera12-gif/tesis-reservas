#!/usr/bin/env node
/**
 * Historial de reservas de demostración para los negocios de ejemplo.
 *
 *   npm run db:historial
 *
 * Las recomendaciones del panel ("tu horario más pedido", "los martes
 * recibís menos", "clientes que vuelven") salen de reservas reales. Un
 * negocio de ejemplo sin historial no puede mostrarlas, y en una demo el
 * panel quedaba vacío.
 *
 * Carga unas 6 semanas hacia atrás con los clientes de muestra de
 * `seed-reviewers.mjs`, y algunas confirmadas para los próximos días:
 *   · días y horarios con un patrón por rubro (fin de semana más fuerte, una
 *     franja pico), siempre dentro del horario de atención del negocio;
 *   · la mayoría asistidas, algunas canceladas por el cliente, alguna
 *     rechazada y algún "no asistió", como pasa de verdad;
 *   · el servicio, la mesa o el alojamiento salen de lo que el negocio tiene
 *     cargado.
 *
 * Se puede correr las veces que haga falta: primero borra lo que cargó antes
 * (las reservas de los clientes de muestra en esos negocios). Es aleatorio
 * pero con semilla fija por negocio, así que da siempre lo mismo.
 *
 * Sólo toca negocios activos de las cuentas de demostración. Nunca los de
 * una cuenta real.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
for (const f of ['.env.local', '.env']) {
  const p = join(__dirname, '..', f);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const DUENIOS_DEMO = ['demo.owner@tesisreserva.py', 'prueba.tesis@ajspots.test'];
const SEMANAS = 6;

/** Peso de cada día (domingo = 0) según el rubro. */
const PESO_DIA = {
  table: [1.4, 0.4, 0.5, 0.7, 0.9, 1.6, 1.8],
  slot: [0, 0.6, 0.7, 0.8, 1.0, 1.5, 1.8],
  service: [0, 0.5, 0.7, 0.9, 1.0, 1.4, 1.6],
  stay: [0.6, 0.3, 0.3, 0.4, 0.8, 1.6, 1.4],
};
/** Reservas por semana, aproximado. */
const POR_SEMANA = { table: 4, slot: 4, service: 3.5, stay: 1.5 };

// PRNG con semilla (mulberry32): mismo negocio, mismo historial.
function prng(seedText) {
  let a = 0;
  for (const ch of seedText) a = (a * 31 + ch.charCodeAt(0)) | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const elegir = (rnd, arr) => arr[Math.floor(rnd() * arr.length)];
const minutos = (t) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
const hhmm = (min) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

try {
  await c.query('begin');

  const clientes = (
    await c.query(`select id from auth.users where email like '%@ejemplo.py' order by email`)
  ).rows.map((r) => r.id);
  if (clientes.length < 3) throw new Error('Faltan los clientes de muestra: corré npm run db:reviewers.');

  const negocios = (
    await c.query(
      `select b.* from tesisreserva.businesses b
         join auth.users u on u.id = b.owner_id
        where b.active and u.email = any($1)
        order by b.name`,
      [DUENIOS_DEMO],
    )
  ).rows;

  const borradas = await c.query(
    `delete from tesisreserva.reservations
      where client_id = any($1) and business_id = any($2)`,
    [clientes, negocios.map((b) => b.id)],
  );
  console.log(`  Historial anterior borrado: ${borradas.rowCount} reservas.\n`);

  const hoy = new Date((await c.query(`select tesisreserva.hoy()::text d`)).rows[0].d + 'T00:00:00');

  for (const b of negocios) {
    const rnd = prng(b.id);
    const tipo = b.reservation_type;

    // Horario por día de la semana.
    const franjas = (
      await c.query(
        `select h.day_of_week dow, s.opens_at::text a, s.closes_at::text z
           from tesisreserva.business_hours h
           join tesisreserva.business_hour_slots s on s.business_hour_id = h.id
          where h.business_id = $1 and h.enabled and s.closes_at > s.opens_at`,
        [b.id],
      )
    ).rows;
    const items = (
      await c.query(
        `select id, duration_minutes, item_type, capacity from tesisreserva.catalog_items
          where business_id = $1 and active`,
        [b.id],
      )
    ).rows;
    const mesas = (
      await c.query(
        `select party_size from tesisreserva.business_capacity
          where business_id = $1 and active and quantity > 0 order by party_size`,
        [b.id],
      )
    ).rows.map((r) => r.party_size);

    const servicios = items.filter((i) => i.item_type === 'service');
    const cuartos = items.filter((i) => i.item_type === 'room');
    if (tipo === 'stay' && !cuartos.length) continue;
    if (tipo === 'table' && !mesas.length) continue;

    // Cada negocio tiene su franja preferida: así aparece un "horario pico".
    const pico = rnd();
    let n = 0;

    for (let dia = -SEMANAS * 7; dia <= 5; dia++) {
      if (dia === 0) continue;
      const fecha = new Date(hoy);
      fecha.setDate(hoy.getDate() + dia);
      const dow = fecha.getDay();
      const delDia = franjas.filter((f) => f.dow === dow);
      if (!delDia.length) continue;

      // Hacia adelante, menos: lo que ya está reservado para la semana.
      const esperado = ((POR_SEMANA[tipo] ?? 3) * PESO_DIA[tipo][dow]) / 7 * (dia > 0 ? 0.5 : 1);
      let cuantas = Math.floor(esperado) + (rnd() < esperado % 1 ? 1 : 0);
      const usadas = new Set();

      while (cuantas-- > 0) {
        const item =
          tipo === 'stay' ? elegir(rnd, cuartos) : servicios.length ? elegir(rnd, servicios) : null;
        const dur = tipo === 'stay' ? 60 : item?.duration_minutes ?? b.default_slot_duration_minutes;

        let hora = '14:00';
        if (tipo !== 'stay') {
          // Horarios válidos del día: dentro de una franja y terminando antes del cierre.
          const opciones = [];
          for (const f of delDia) {
            for (let t = minutos(f.a); t + dur <= minutos(f.z); t += b.slot_step_minutes) opciones.push(t);
          }
          if (!opciones.length) break;
          // 55% en la franja pico del negocio, el resto repartido.
          const idx =
            rnd() < 0.55
              ? Math.min(opciones.length - 1, Math.floor(pico * opciones.length))
              : Math.floor(rnd() * opciones.length);
          let t = opciones[idx];
          // La misma hora dos veces el mismo día se corre al siguiente turno.
          while (usadas.has(t) && idx < opciones.length - 1) t += b.slot_step_minutes;
          if (usadas.has(t)) continue;
          usadas.add(t);
          hora = hhmm(t);
        }

        const pasado = dia < 0;
        const r = rnd();
        const estado = !pasado
          ? 'confirmed'
          : r < 0.8 ? 'completed' : r < 0.88 ? 'no_show' : r < 0.95 ? 'cancelled' : 'rejected';
        const cliente = elegir(rnd, clientes);
        const salida = new Date(fecha);
        salida.setDate(fecha.getDate() + 1 + Math.floor(rnd() * 3));
        const personas =
          tipo === 'table' ? elegir(rnd, mesas) : tipo === 'stay' ? item.capacity ?? 2 : null;
        const creada = new Date(fecha);
        creada.setDate(fecha.getDate() - 1 - Math.floor(rnd() * 5));
        if (creada > new Date()) creada.setTime(Date.now() - 3600_000);

        const { rows } = await c.query(
          `insert into tesisreserva.reservations
             (reservation_code, client_id, business_id, catalog_item_id,
              reservation_date, check_out_date, reservation_time, party_size, duration_minutes,
              status, created_at, cancelled_at, cancellation_reason)
           values (tesisreserva.gen_reservation_code(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                   case when $9 in ('cancelled', 'rejected') then $10::timestamptz + interval '1 day' end,
                   case when $9 = 'rejected' then 'No teníamos lugar en ese horario.' end)
           returning id`,
          [
            cliente, b.id, item?.id ?? null, iso(fecha),
            tipo === 'stay' ? iso(salida) : null, hora, personas, dur,
            estado, creada.toISOString(),
          ],
        );

        // El historial que habría dejado la app: pedido, respuesta y cierre.
        const pasos = [[null, 'pending', cliente]];
        if (estado === 'cancelled') pasos.push(['pending', 'cancelled', cliente]);
        else if (estado === 'rejected') pasos.push(['pending', 'rejected', b.owner_id]);
        else {
          pasos.push(['pending', 'confirmed', b.owner_id]);
          if (estado !== 'confirmed') pasos.push(['confirmed', estado, b.owner_id]);
        }
        for (const [prev, nuevo, quien] of pasos) {
          await c.query(
            `insert into tesisreserva.reservation_status_history
               (reservation_id, previous_status, new_status, changed_by, created_at)
             values ($1, $2, $3, $4, $5)`,
            [rows[0].id, prev, nuevo, quien, creada.toISOString()],
          );
        }
        n++;
      }
    }
    console.log(`  ${b.name.padEnd(24)} ${n} reservas`);
  }

  await c.query('commit');
  console.log('\n  Listo.');
} catch (e) {
  await c.query('rollback').catch(() => {});
  console.error('\n  ERROR:', e.message);
  process.exitCode = 1;
} finally {
  await c.end();
}
