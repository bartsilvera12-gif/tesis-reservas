import { supabase, friendlyError } from '@/lib/supabase';
import { todayISO } from '@/lib/format';
import type {
  AvailabilitySlot,
  Reservation,
  ReservationStatus,
  ReservationWithRelations,
} from '@/types/db';

const RESERVATION_SELECT = `
  *,
  business:businesses ( id, name, slug, cover_url, neighborhood, reservation_type ),
  catalog_item:catalog_items ( id, name ),
  client:profiles ( id, full_name, phone )
`;

/**
 * Horarios disponibles reales: sale de la RPC, que ya descuenta las reservas
 * pendientes/confirmadas contra la capacidad configurada.
 */
export async function fetchAvailability(
  businessId: string,
  date: string,
  partySize: number | null,
): Promise<AvailabilitySlot[]> {
  const { data, error } = await supabase.rpc('get_availability', {
    p_business_id: businessId,
    p_date: date,
    p_party_size: partySize,
  });

  if (error) throw new Error(friendlyError(error, 'No pudimos cargar los horarios.'));
  return (data ?? []) as AvailabilitySlot[];
}

export interface CreateReservationArgs {
  businessId: string;
  date: string;
  time: string;
  partySize: number | null;
  catalogItemId?: string | null;
  notes?: string | null;
  /** Sólo hospedajes: el día de salida. La noche de salida no se ocupa. */
  checkOut?: string | null;
  /** Ruta del comprobante en Storage, ya subido. */
  depositProof?: string | null;
}

export interface StaySlot {
  party_size: number;
  total: number;
  remaining: number;
}

/**
 * Alojamientos libres entre dos fechas.
 *
 * `fetchAvailability` no sirve para hospedajes: devuelve turnos de un día, y
 * una estadía ocupa un rango entero.
 */
export async function fetchStayAvailability(
  businessId: string,
  checkIn: string,
  checkOut: string,
): Promise<StaySlot[]> {
  const { data, error } = await supabase.rpc('get_stay_availability', {
    p_business_id: businessId,
    p_check_in: checkIn,
    p_check_out: checkOut,
  });

  if (error) throw new Error(friendlyError(error, 'No pudimos ver la disponibilidad.'));
  return (data ?? []) as StaySlot[];
}

/**
 * Alta transaccional. La validación de capacidad ocurre dentro de la base
 * (con advisory lock), así que dos personas no pueden tomar el último cupo.
 */
export async function createReservation(
  args: CreateReservationArgs,
): Promise<Reservation> {
  const { data, error } = await supabase.rpc('create_reservation', {
    p_business_id: args.businessId,
    p_date: args.date,
    p_time: args.time,
    p_party_size: args.partySize,
    p_catalog_item_id: args.catalogItemId ?? null,
    p_notes: args.notes ?? null,
    p_check_out: args.checkOut ?? null,
    p_deposit_proof: args.depositProof ?? null,
  });

  if (error) throw new Error(friendlyError(error, 'No pudimos crear la reserva.'));
  if (!data) throw new Error('No pudimos crear la reserva. Probá de nuevo.');

  return (Array.isArray(data) ? data[0] : data) as Reservation;
}

export async function setReservationStatus(
  reservationId: string,
  status: ReservationStatus,
  reason?: string,
): Promise<Reservation> {
  const { data, error } = await supabase.rpc('set_reservation_status', {
    p_reservation_id: reservationId,
    p_status: status,
    p_reason: reason ?? null,
  });

  if (error) throw new Error(friendlyError(error, 'No pudimos actualizar la reserva.'));
  return (Array.isArray(data) ? data[0] : data) as Reservation;
}

/** Reservas del cliente autenticado. */
export async function fetchMyReservations(
  clientId: string,
): Promise<ReservationWithRelations[]> {
  const { data, error } = await supabase
    .from('reservations')
    .select(RESERVATION_SELECT)
    .eq('client_id', clientId)
    .order('reservation_date', { ascending: false })
    .order('reservation_time', { ascending: false });

  if (error) throw new Error(friendlyError(error, 'No pudimos cargar tus reservas.'));
  return (data ?? []) as ReservationWithRelations[];
}

/** Reservas que recibió un negocio, opcionalmente filtradas por fecha. */
export async function fetchBusinessReservations(
  businessId: string,
  date?: string | null,
): Promise<ReservationWithRelations[]> {
  let query = supabase
    .from('reservations')
    .select(RESERVATION_SELECT)
    .eq('business_id', businessId);

  if (date) query = query.eq('reservation_date', date);
  // `toISOString()` da la fecha en UTC, que en Paraguay ya es mañana a partir
  // de las 20:00: justo a la hora pico se perdían las reservas de esa noche.
  else query = query.gte('reservation_date', todayISO());

  const { data, error } = await query
    .order('reservation_date')
    .order('reservation_time');

  if (error) throw new Error(friendlyError(error, 'No pudimos cargar las reservas.'));
  return (data ?? []) as ReservationWithRelations[];
}
