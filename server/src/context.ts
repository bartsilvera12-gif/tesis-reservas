import { createClient } from '@supabase/supabase-js';

/** El genérico por defecto de SupabaseClient asume 'public'; acá usamos otro schema. */
type Db = ReturnType<typeof clienteConJwt>;

/**
 * Reúne el contexto que el asistente necesita para responder.
 *
 * IMPORTANTE: todas las consultas se hacen con el JWT del propio usuario, no
 * con service_role. Así RLS sigue aplicando y el asistente sólo puede ver lo
 * que esa persona ya vería dentro de la app. Si el prompt se filtrara, no
 * revelaría nada a lo que el usuario no tuviera acceso de todos modos.
 */

const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';

export interface Contexto {
  rol: 'client' | 'owner' | 'admin';
  nombre: string;
  texto: string;
}

function clienteConJwt(jwt: string) {
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    db: { schema: 'tesisreserva' },
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
}

const money = (n: unknown): string =>
  '₲ ' +
  Math.round(Number(n) || 0)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** Recorta texto libre de la base para que no infle el prompt. */
const corto = (s: unknown, n = 120): string =>
  String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, n);

const hhmm = (t: unknown): string => String(t ?? '').slice(0, 5);

type Nombrable = { name?: string } | null;

export async function construirContexto(jwt: string): Promise<Contexto | null> {
  const supabase = clienteConJwt(jwt);

  const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
  if (userErr || !userData.user) return null;

  const { data: perfil } = await supabase
    .from('profiles')
    .select('id, full_name, role, city')
    .eq('id', userData.user.id)
    .maybeSingle();

  if (!perfil) return null;

  const partes: string[] = [];
  const hoy = new Date().toISOString().slice(0, 10);

  partes.push(
    `Fecha de hoy: ${hoy}`,
    `Usuario: ${corto(perfil.full_name, 60) || 'sin nombre'} (rol: ${perfil.role})`,
    perfil.city ? `Ciudad: ${corto(perfil.city, 40)}` : '',
  );

  if (perfil.role === 'owner') {
    await contextoDueno(supabase, perfil.id, hoy, partes);
  } else {
    await contextoCliente(supabase, perfil.id, partes);
  }

  return {
    rol: perfil.role,
    nombre: perfil.full_name || '',
    texto: partes.filter(Boolean).join('\n'),
  };
}

async function contextoDueno(
  supabase: Db,
  ownerId: string,
  hoy: string,
  partes: string[],
): Promise<void> {
  const { data: negocios } = await supabase
    .from('businesses')
    .select(
      'id, name, active, neighborhood, city, reservation_type, deposit_enabled, deposit_amount, deposit_per_person, default_slot_duration_minutes, max_concurrent_reservations, category:business_categories(name)',
    )
    .eq('owner_id', ownerId);

  if (!negocios || negocios.length === 0) {
    partes.push('', 'Todavía no configuró ningún negocio en la app.');
    return;
  }

  // Las consultas de cada negocio son independientes: en serie sumaban varios
  // segundos antes de que Claude empezara siquiera a responder.
  const porNegocio = await Promise.all(
    negocios.map(async (n) => {
      const [stats, capacidad, horarios, reservas, resenas, promos, carta] = await Promise.all([
        supabase.rpc('business_stats', { p_business_id: n.id }).then((r) => r.data),
        supabase
          .from('business_capacity')
          .select('party_size, quantity')
          .eq('business_id', n.id)
          .order('party_size')
          .then((r) => r.data),
        supabase
          .from('business_hours')
          .select('day_of_week, enabled, slots:business_hour_slots(opens_at, closes_at)')
          .eq('business_id', n.id)
          .order('day_of_week')
          .then((r) => r.data),
        supabase
          .from('reservations')
          .select(
            'reservation_date, reservation_time, party_size, status, reservation_code, client:profiles(full_name)',
          )
          .eq('business_id', n.id)
          .gte('reservation_date', hoy)
          .order('reservation_date')
          .limit(25)
          .then((r) => r.data),
        supabase
          .from('reviews')
          .select('rating, comment, owner_reply')
          .eq('business_id', n.id)
          .eq('active', true)
          .order('created_at', { ascending: false })
          .limit(10)
          .then((r) => r.data),
        supabase
          .from('promotions')
          .select('title, active')
          .eq('business_id', n.id)
          .order('created_at', { ascending: false })
          .limit(10)
          .then((r) => r.data),
        supabase
          .from('catalog_items')
          .select('name, price, active')
          .eq('business_id', n.id)
          .order('sort_order')
          .limit(40)
          .then((r) => r.data),
      ]);
      return { n, stats, capacidad, horarios, reservas, resenas, promos, carta };
    }),
  );

  for (const { n, stats, capacidad, horarios, reservas, resenas, promos, carta } of porNegocio) {
    const cat = (n.category as Nombrable)?.name ?? 'sin categoría';
    partes.push(
      '',
      `## Negocio: ${corto(n.name, 60)}`,
      `- Categoría: ${cat} · Zona: ${corto(n.neighborhood, 40) || '—'}, ${corto(n.city, 40)}`,
      `- Estado: ${n.active ? 'activo' : 'inactivo'} · Reservas ${n.reservation_type === 'table' ? 'por mesa' : 'por turno'}`,
      `- Duración de cada reserva: ${n.default_slot_duration_minutes} min`,
      n.reservation_type === 'service'
        ? `- Turnos simultáneos: ${n.max_concurrent_reservations}`
        : '',
      n.deposit_enabled
        ? `- Seña: ${money(n.deposit_amount)} ${n.deposit_per_person ? 'por persona' : 'por reserva'}`
        : '- Seña: no pide',
    );

    if (stats) {
      const s = stats as Record<string, unknown>;
      const barras = (s.week_bars as { dow: number; count: number }[] | null) ?? [];
      partes.push(
        `- Hoy: ${s.today_count} reservas · pendientes: ${s.pending_count} · confirmadas: ${s.confirmed_count}`,
        `- Reseñas: ${s.reviews_count} (promedio ${s.rating_avg ?? 'sin datos'})`,
        `- Promociones activas: ${s.active_promotions} · reservas históricas: ${s.total_reservations}`,
        s.peak_hour ? `- Horario más pedido: ${s.peak_hour}` : '',
        barras.length
          ? `- Reservas por día (últimas 4 semanas): ${barras
              .map((b) => `${DIAS[b.dow]} ${b.count}`)
              .join(', ')}`
          : '',
      );
    }

    if (capacidad && capacidad.length > 0) {
      partes.push(
        `- Mesas: ${capacidad.map((c) => `${c.quantity} para ${c.party_size} personas`).join(', ')}`,
      );
    }

    if (horarios && horarios.length > 0) {
      const linea = horarios
        .map((h) => {
          const slots = (h.slots as { opens_at: string; closes_at: string }[] | null) ?? [];
          if (!h.enabled || slots.length === 0) return `${DIAS[h.day_of_week]}: cerrado`;
          return `${DIAS[h.day_of_week]}: ${slots
            .map((s) => `${hhmm(s.opens_at)}-${hhmm(s.closes_at)}`)
            .join(' y ')}`;
        })
        .join(' · ');
      partes.push(`- Horarios: ${linea}`);
    }

    if (reservas && reservas.length > 0) {
      partes.push('- Próximas reservas:');
      for (const r of reservas) {
        const cli = corto((r.client as { full_name?: string } | null)?.full_name, 40) || 'cliente';
        partes.push(
          `  · ${r.reservation_date} ${hhmm(r.reservation_time)} — ${cli}${r.party_size ? `, ${r.party_size} personas` : ''} — ${r.status} (${r.reservation_code})`,
        );
      }
    } else {
      partes.push('- No tiene reservas próximas.');
    }

    if (resenas && resenas.length > 0) {
      // El total se calcula acá a propósito: pedirle al modelo que sume una
      // lista es justo donde se equivoca, y "¿cuántas tengo sin responder?"
      // es de las preguntas más frecuentes.
      const sinResponder = resenas.filter((r) => !r.owner_reply).length;
      partes.push(
        `- Reseñas sin responder en este negocio: ${sinResponder} de ${resenas.length}`,
      );
      partes.push('- Últimas reseñas:');
      for (const r of resenas) {
        partes.push(
          `  · ${r.rating} estrellas: "${corto(r.comment, 130)}"${r.owner_reply ? ' (ya respondida)' : ' — SIN RESPONDER'}`,
        );
      }
    }

    if (promos && promos.length > 0) {
      partes.push(
        `- Promociones: ${promos
          .map((p) => `"${corto(p.title, 40)}" (${p.active ? 'activa' : 'pausada'})`)
          .join(', ')}`,
      );
    }

    if (carta && carta.length > 0) {
      partes.push(
        `- Carta/servicios: ${carta
          .map((i) => `${corto(i.name, 40)} ${money(i.price)}${i.active ? '' : ' (inactivo)'}`)
          .join(', ')}`,
      );
    }
  }
}

async function contextoCliente(
  supabase: Db,
  clientId: string,
  partes: string[],
): Promise<void> {
  const { data: reservas } = await supabase
    .from('reservations')
    .select(
      'reservation_date, reservation_time, party_size, status, reservation_code, deposit_required, deposit_amount, business:businesses(name, neighborhood), catalog_item:catalog_items(name)',
    )
    .eq('client_id', clientId)
    .order('reservation_date', { ascending: false })
    .limit(20);

  if (reservas && reservas.length > 0) {
    partes.push('', '## Tus reservas');
    for (const r of reservas) {
      const b = r.business as { name?: string; neighborhood?: string } | null;
      const item = (r.catalog_item as Nombrable)?.name;
      partes.push(
        `- ${corto(b?.name, 50)} · ${r.reservation_date} ${hhmm(r.reservation_time)}${r.party_size ? ` · ${r.party_size} personas` : ''}${item ? ` · ${corto(item, 40)}` : ''} · estado: ${r.status} (código ${r.reservation_code})${r.deposit_required ? ` · seña ${money(r.deposit_amount)}` : ''}`,
      );
    }
  } else {
    partes.push('', 'Todavía no hizo ninguna reserva.');
  }

  const { data: negocios } = await supabase
    .from('businesses')
    .select(
      'name, neighborhood, city, deposit_enabled, deposit_amount, description, category:business_categories(name), reviews(rating)',
    )
    .eq('active', true)
    .limit(30);

  if (negocios && negocios.length > 0) {
    partes.push('', '## Negocios disponibles en la app');
    for (const n of negocios) {
      const cat = (n.category as Nombrable)?.name ?? '—';
      const notas = ((n.reviews as { rating: number }[] | null) ?? []).map((r) => r.rating);
      const prom = notas.length
        ? (notas.reduce((a, b) => a + b, 0) / notas.length).toFixed(1)
        : null;
      partes.push(
        `- ${corto(n.name, 50)} (${cat}, ${corto(n.neighborhood, 30) || corto(n.city, 30)}) — ${prom ? `${prom} estrellas con ${notas.length} reseñas` : 'sin reseñas'}${n.deposit_enabled ? `, pide seña de ${money(n.deposit_amount)}` : ''} — ${corto(n.description, 110)}`,
      );
    }
  }

  const { data: promos } = await supabase
    .from('promotions')
    .select('title, description, business:businesses(name)')
    .eq('active', true)
    .limit(10);

  if (promos && promos.length > 0) {
    partes.push('', '## Promociones vigentes');
    for (const p of promos) {
      const b = (p.business as Nombrable)?.name;
      partes.push(
        `- "${corto(p.title, 60)}" en ${corto(b, 40)} — ${corto(p.description, 80)}`,
      );
    }
  }
}
