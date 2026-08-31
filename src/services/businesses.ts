import { supabase, friendlyError } from '@/lib/supabase';
import { haversineKm } from '@/lib/format';
import type {
  Business,
  BusinessCapacity,
  BusinessCategory,
  BusinessHour,
  BusinessWithMeta,
  CatalogCategory,
  CatalogItem,
  Promotion,
} from '@/types/db';

/** Columnas que la app necesita de un negocio + su categoría y sus reseñas. */
const BUSINESS_SELECT = `
  *,
  category:business_categories ( id, name, slug, icon, sort_order, active, created_at ),
  reviews ( rating )
`;

type RawBusiness = Business & {
  category: BusinessCategory | null;
  reviews: { rating: number }[] | null;
};

export interface Coords {
  lat: number;
  lng: number;
}

/**
 * Calcula rating promedio y distancia. Se hace acá y no en la base porque
 * `reviews` ya viene embebido en la misma consulta (evita un round-trip extra).
 */
function decorate(row: RawBusiness, here: Coords | null): BusinessWithMeta {
  const ratings = (row.reviews ?? []).map((r) => r.rating);
  const count = ratings.length;
  const avg = count ? ratings.reduce((a, b) => a + b, 0) / count : null;

  const distance =
    here && row.latitude != null && row.longitude != null
      ? haversineKm(here.lat, here.lng, row.latitude, row.longitude)
      : null;

  const { reviews: _reviews, ...business } = row;
  void _reviews;

  return {
    ...business,
    category: row.category,
    rating_avg: avg,
    reviews_count: count,
    distance_km: distance,
  };
}

export async function fetchCategories(): Promise<BusinessCategory[]> {
  const { data, error } = await supabase
    .from('business_categories')
    .select('*')
    .eq('active', true)
    .order('sort_order');

  if (error) throw new Error(friendlyError(error, 'No pudimos cargar las categorías.'));
  return (data ?? []) as BusinessCategory[];
}

export interface BusinessQuery {
  search?: string;
  categoryId?: string | null;
  city?: string | null;
  coords?: Coords | null;
  limit?: number;
}

/** Búsqueda real: nombre, barrio, ciudad y descripción. */
export async function fetchBusinesses({
  search,
  categoryId,
  city,
  coords = null,
  limit = 50,
}: BusinessQuery = {}): Promise<BusinessWithMeta[]> {
  let query = supabase
    .from('businesses')
    .select(BUSINESS_SELECT)
    .eq('active', true)
    .limit(limit);

  if (categoryId) query = query.eq('category_id', categoryId);
  if (city) query = query.eq('city', city);

  const term = search?.trim();
  if (term) {
    // `or` de PostgREST: escapamos comas y paréntesis para no romper el filtro.
    const safe = term.replace(/[,()]/g, ' ').trim();
    query = query.or(
      `name.ilike.%${safe}%,neighborhood.ilike.%${safe}%,city.ilike.%${safe}%,description.ilike.%${safe}%`,
    );
  }

  const { data, error } = await query;
  if (error) throw new Error(friendlyError(error, 'No pudimos cargar los negocios.'));

  const list = ((data ?? []) as RawBusiness[]).map((row) => decorate(row, coords));

  // Cerca primero cuando hay ubicación; si no, por puntaje.
  list.sort((a, b) => {
    if (a.distance_km != null && b.distance_km != null) return a.distance_km - b.distance_km;
    return (b.rating_avg ?? 0) - (a.rating_avg ?? 0);
  });

  return list;
}

/**
 * Todo lo de un negocio en UN viaje.
 *
 * La pantalla de reserva y la de detalle necesitan negocio, categoría,
 * capacidad, carta, horarios y promociones. Pedirlos por separado eran cinco
 * viajes a un servidor que está a ~100 ms; peor todavía si alguno depende del
 * anterior, porque entonces se encadenan. PostgREST los trae embebidos de una.
 */
export interface BusinessFull {
  business: BusinessWithMeta;
  capacity: BusinessCapacity[];
  catalog: CatalogItem[];
  hours: BusinessHour[];
  promotions: Promotion[];
}

const FULL_SELECT = `
  *,
  category:business_categories ( id, name, slug, icon, sort_order, active, created_at ),
  reviews ( rating ),
  capacity:business_capacity ( * ),
  catalog:catalog_items ( *, category:catalog_categories ( name ) ),
  hours:business_hours ( *, slots:business_hour_slots ( * ) ),
  promotions ( * )
`;

export async function fetchBusinessFull(
  id: string,
  coords: Coords | null = null,
): Promise<BusinessFull | null> {
  const { data, error } = await supabase
    .from('businesses')
    .select(FULL_SELECT)
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(friendlyError(error, 'No pudimos cargar el negocio.'));
  if (!data) return null;

  const row = data as RawBusiness & {
    capacity?: BusinessCapacity[] | null;
    catalog?: CatalogItem[] | null;
    hours?: BusinessHour[] | null;
    promotions?: Promotion[] | null;
  };

  const ahora = Date.now();

  return {
    business: decorate(row, coords),
    capacity: (row.capacity ?? [])
      .filter((c) => c.active)
      .sort((a, b) => a.party_size - b.party_size),
    catalog: (row.catalog ?? [])
      .filter((i) => i.active)
      .sort((a, b) => a.sort_order - b.sort_order),
    hours: (row.hours ?? []).sort((a, b) => a.day_of_week - b.day_of_week),
    // El filtro de vigencia se hace acá y no en el embed: PostgREST no deja
    // condicionar una tabla embebida por fecha sin complicar la consulta.
    promotions: (row.promotions ?? []).filter(
      (p) =>
        p.active &&
        new Date(p.starts_at).getTime() <= ahora &&
        (p.unlimited || !p.ends_at || new Date(p.ends_at).getTime() > ahora),
    ),
  };
}

export async function fetchBusinessById(
  id: string,
  coords: Coords | null = null,
): Promise<BusinessWithMeta | null> {
  const { data, error } = await supabase
    .from('businesses')
    .select(BUSINESS_SELECT)
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(friendlyError(error, 'No pudimos cargar el negocio.'));
  if (!data) return null;
  return decorate(data as RawBusiness, coords);
}

/** Negocios del dueño autenticado (incluye los inactivos). */
export async function fetchMyBusinesses(ownerId: string): Promise<BusinessWithMeta[]> {
  const { data, error } = await supabase
    .from('businesses')
    .select(BUSINESS_SELECT)
    .eq('owner_id', ownerId)
    .order('created_at');

  if (error) throw new Error(friendlyError(error, 'No pudimos cargar tus negocios.'));
  return ((data ?? []) as RawBusiness[]).map((row) => decorate(row, null));
}

export async function createBusiness(
  payload: Partial<Business> & { owner_id: string; name: string; slug: string },
): Promise<Business> {
  const { data, error } = await supabase
    .from('businesses')
    .insert(payload)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new Error('Ya existe un negocio con ese nombre. Probá con otro.');
    }
    throw new Error(friendlyError(error, 'No pudimos crear el negocio.'));
  }
  return data as Business;
}

export async function updateBusiness(
  id: string,
  patch: Partial<Business>,
): Promise<Business> {
  const { data, error } = await supabase
    .from('businesses')
    .update(patch)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(friendlyError(error, 'No pudimos guardar los cambios.'));
  return data as Business;
}

/* ─────────────────────────────  Horarios  ───────────────────────────── */

export async function fetchBusinessHours(businessId: string): Promise<BusinessHour[]> {
  const { data, error } = await supabase
    .from('business_hours')
    .select('*, slots:business_hour_slots ( * )')
    .eq('business_id', businessId)
    .order('day_of_week');

  if (error) throw new Error(friendlyError(error, 'No pudimos cargar los horarios.'));

  const rows = (data ?? []) as BusinessHour[];
  for (const row of rows) {
    row.slots = (row.slots ?? []).sort((a, b) => a.opens_at.localeCompare(b.opens_at));
  }
  return rows;
}

/** Crea las 7 filas de horario si el negocio todavía no las tiene. */
export async function ensureBusinessHours(
  businessId: string,
  defaults: { enabledDays: number[]; opensAt: string; closesAt: string },
): Promise<void> {
  const rows = [0, 1, 2, 3, 4, 5, 6].map((dow) => ({
    business_id: businessId,
    day_of_week: dow,
    enabled: defaults.enabledDays.includes(dow),
  }));

  const { data, error } = await supabase
    .from('business_hours')
    .upsert(rows, { onConflict: 'business_id,day_of_week' })
    .select();

  if (error) throw new Error(friendlyError(error, 'No pudimos crear los horarios.'));

  const created = (data ?? []) as BusinessHour[];
  const slots = created
    .filter((h) => defaults.enabledDays.includes(h.day_of_week))
    .map((h) => ({
      business_hour_id: h.id,
      opens_at: defaults.opensAt,
      closes_at: defaults.closesAt,
      sort_order: 1,
    }));

  if (slots.length) {
    const { error: slotErr } = await supabase.from('business_hour_slots').insert(slots);
    if (slotErr) throw new Error(friendlyError(slotErr, 'No pudimos crear las franjas horarias.'));
  }
}

export async function setDayEnabled(hourId: string, enabled: boolean): Promise<void> {
  const { error } = await supabase
    .from('business_hours')
    .update({ enabled })
    .eq('id', hourId);
  if (error) throw new Error(friendlyError(error, 'No pudimos actualizar el día.'));
}

/** Reemplaza todas las franjas de un día (soporta horario partido). */
export async function replaceDaySlots(
  hourId: string,
  slots: { opens_at: string; closes_at: string }[],
): Promise<void> {
  const { error: delErr } = await supabase
    .from('business_hour_slots')
    .delete()
    .eq('business_hour_id', hourId);
  if (delErr) throw new Error(friendlyError(delErr, 'No pudimos actualizar el horario.'));

  if (!slots.length) return;

  const { error } = await supabase.from('business_hour_slots').insert(
    slots.map((s, i) => ({ business_hour_id: hourId, ...s, sort_order: i + 1 })),
  );
  if (error) throw new Error(friendlyError(error, 'No pudimos guardar el horario.'));
}

/* ─────────────────────────────  Capacidad  ───────────────────────────── */

export async function fetchCapacity(businessId: string): Promise<BusinessCapacity[]> {
  const { data, error } = await supabase
    .from('business_capacity')
    .select('*')
    .eq('business_id', businessId)
    .order('party_size');

  if (error) throw new Error(friendlyError(error, 'No pudimos cargar la capacidad.'));
  return (data ?? []) as BusinessCapacity[];
}

export async function setCapacity(
  businessId: string,
  partySize: number,
  quantity: number,
): Promise<void> {
  const { error } = await supabase
    .from('business_capacity')
    .upsert(
      { business_id: businessId, party_size: partySize, quantity, active: true },
      { onConflict: 'business_id,party_size' },
    );
  if (error) throw new Error(friendlyError(error, 'No pudimos actualizar las mesas.'));
}

/* ────────────────────────  Carta / servicios  ──────────────────────── */

export async function fetchCatalog(
  businessId: string,
  onlyActive = true,
): Promise<CatalogItem[]> {
  let query = supabase
    .from('catalog_items')
    .select('*, category:catalog_categories ( name )')
    .eq('business_id', businessId)
    .order('sort_order');

  if (onlyActive) query = query.eq('active', true);

  const { data, error } = await query;
  if (error) throw new Error(friendlyError(error, 'No pudimos cargar la carta.'));
  return (data ?? []) as CatalogItem[];
}

export async function fetchCatalogCategories(
  businessId: string,
): Promise<CatalogCategory[]> {
  const { data, error } = await supabase
    .from('catalog_categories')
    .select('*')
    .eq('business_id', businessId)
    .order('sort_order');

  if (error) throw new Error(friendlyError(error, 'No pudimos cargar las categorías.'));
  return (data ?? []) as CatalogCategory[];
}

export async function createCatalogCategory(
  businessId: string,
  name: string,
): Promise<CatalogCategory> {
  const { data, error } = await supabase
    .from('catalog_categories')
    .upsert(
      { business_id: businessId, name: name.trim() },
      { onConflict: 'business_id,name' },
    )
    .select()
    .single();

  if (error) throw new Error(friendlyError(error, 'No pudimos crear la categoría.'));
  return data as CatalogCategory;
}

export async function createCatalogItem(
  payload: Omit<Partial<CatalogItem>, 'id'> & { business_id: string; name: string },
): Promise<CatalogItem> {
  const { data, error } = await supabase
    .from('catalog_items')
    .insert(payload)
    .select('*, category:catalog_categories ( name )')
    .single();

  if (error) throw new Error(friendlyError(error, 'No pudimos agregar el producto.'));
  return data as CatalogItem;
}

export async function updateCatalogItem(
  id: string,
  patch: Partial<CatalogItem>,
): Promise<CatalogItem> {
  const { data, error } = await supabase
    .from('catalog_items')
    .update(patch)
    .eq('id', id)
    .select('*, category:catalog_categories ( name )')
    .single();

  if (error) throw new Error(friendlyError(error, 'No pudimos guardar el producto.'));
  return data as CatalogItem;
}

/** Baja lógica: nunca se borra físicamente (mantiene el historial de reservas). */
export async function deactivateCatalogItem(id: string): Promise<void> {
  const { error } = await supabase
    .from('catalog_items')
    .update({ active: false })
    .eq('id', id);
  if (error) throw new Error(friendlyError(error, 'No pudimos eliminar el producto.'));
}
