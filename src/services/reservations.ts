import { supabase, friendlyError } from '@/lib/supabase';
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
  else query = query.gte('reservation_date', new Date().toISOString().slice(0, 10));

  const { data, error } = await query
    .order('reservation_date')
    .order('reservation_time');

  if (error) throw new Error(friendlyError(error, 'No pudimos cargar las reservas.'));
  return (data ?? []) as ReservationWithRelations[];
}
