/**
 * Tipos del schema `tesisreserva`.
 *
 * Se mantienen a mano para no depender de la CLI de Supabase (esta instancia
 * es self-hosted). Si más adelante querés generarlos automáticamente:
 *
 *   npx supabase gen types typescript \
 *     --db-url "$DATABASE_URL" --schema tesisreserva > src/types/database.types.ts
 */

export type UserRole = 'client' | 'owner' | 'admin';

export type ReservationStatus =
  | 'pending'
  | 'confirmed'
  | 'rejected'
  | 'cancelled'
  | 'completed'
  | 'no_show';

export type DepositStatus = 'none' | 'pending' | 'paid' | 'refunded' | 'failed';

export type PaymentStatus = 'pending' | 'paid' | 'refunded' | 'failed';

export type ItemType = 'product' | 'service';

export type ReservationType = 'table' | 'service';

export type NotificationType =
  | 'general'
  | 'reservation_created'
  | 'reservation_confirmed'
  | 'reservation_rejected'
  | 'reservation_cancelled'
  | 'review_reply';

export interface Profile {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  role: UserRole;
  /**
   * Habilita el panel de negocio. Es independiente del rol: una cuenta
   * `client` con `is_owner` en true puede reservar Y gestionar sus locales.
   */
  is_owner: boolean;
  city: string | null;
  created_at: string;
  updated_at: string;
}

export interface BusinessCategory {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  sort_order: number;
  active: boolean;
  created_at: string;
}

export interface Business {
  id: string;
  owner_id: string;
  category_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  address: string | null;
  neighborhood: string | null;
  city: string;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  whatsapp: string | null;
  cover_url: string | null;
  logo_url: string | null;
  active: boolean;
  deposit_enabled: boolean;
  deposit_amount: number;
  deposit_per_person: boolean;
  reservation_type: ReservationType;
  default_slot_duration_minutes: number;
  slot_step_minutes: number;
  max_concurrent_reservations: number;
  created_at: string;
  updated_at: string;
}

/** Negocio + datos derivados que la UI necesita (categoría, rating agregado). */
export interface BusinessWithMeta extends Business {
  category: BusinessCategory | null;
  rating_avg: number | null;
  reviews_count: number;
  /** Distancia en km respecto del usuario; null si no hay geolocalización. */
  distance_km: number | null;
}

export interface BusinessHourSlot {
  id: string;
  business_hour_id: string;
  opens_at: string;
  closes_at: string;
  sort_order: number;
  created_at: string;
}

export interface BusinessHour {
  id: string;
  business_id: string;
  day_of_week: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
  slots: BusinessHourSlot[];
}

export interface BusinessCapacity {
  id: string;
  business_id: string;
  party_size: number;
  quantity: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CatalogCategory {
  id: string;
  business_id: string;
  name: string;
  sort_order: number;
  active: boolean;
  created_at: string;
}

export interface CatalogItem {
  id: string;
  business_id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  price: number;
  item_type: ItemType;
  duration_minutes: number | null;
  image_url: string | null;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  category?: { name: string } | null;
}

export interface Promotion {
  id: string;
  business_id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  unlimited: boolean;
  active: boolean;
  image_url: string | null;
  created_at: string;
  updated_at: string;
  business?: Pick<Business, 'id' | 'name' | 'slug' | 'cover_url'> | null;
}

export interface Reservation {
  id: string;
  reservation_code: string;
  client_id: string;
  business_id: string;
  catalog_item_id: string | null;
  reservation_date: string;
  reservation_time: string;
  party_size: number | null;
  duration_minutes: number;
  status: ReservationStatus;
  notes: string | null;
  deposit_required: boolean;
  deposit_amount: number;
  deposit_status: DepositStatus;
  created_at: string;
  updated_at: string;
  cancelled_at: string | null;
  cancellation_reason: string | null;
}

/** Reserva con los datos relacionados que se muestran en las listas. */
export interface ReservationWithRelations extends Reservation {
  business: Pick<
    Business,
    'id' | 'name' | 'slug' | 'cover_url' | 'neighborhood' | 'reservation_type'
  > | null;
  catalog_item: Pick<CatalogItem, 'id' | 'name'> | null;
  client: Pick<Profile, 'id' | 'full_name' | 'phone'> | null;
}

export interface ReservationStatusHistory {
  id: string;
  reservation_id: string;
  previous_status: string | null;
  new_status: string;
  changed_by: string | null;
  created_at: string;
}

export interface Review {
  id: string;
  reservation_id: string | null;
  business_id: string;
  client_id: string;
  rating: number;
  comment: string | null;
  owner_reply: string | null;
  owner_replied_at: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ReviewWithClient extends Review {
  client: Pick<Profile, 'id' | 'full_name' | 'avatar_url'> | null;
  business?: Pick<Business, 'id' | 'name'> | null;
}

export interface ReservationPayment {
  id: string;
  reservation_id: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  provider: string | null;
  provider_reference: string | null;
  paid_at: string | null;
  refunded_at: string | null;
  created_at: string;
}

export interface AppNotification {
  id: string;
  user_id: string;
  title: string;
  body: string | null;
  type: NotificationType;
  reference_id: string | null;
  read_at: string | null;
  created_at: string;
}

/** Fila devuelta por `tesisreserva.get_availability`. */
export interface AvailabilitySlot {
  slot_time: string;
  remaining: number;
  available: boolean;
}

/** JSON devuelto por `tesisreserva.business_stats`. */
export interface BusinessStats {
  today_count: number;
  pending_count: number;
  confirmed_count: number;
  active_promotions: number;
  rating_avg: number | null;
  reviews_count: number;
  rating_breakdown: Record<string, number>;
  week_bars: { dow: number; count: number }[];
  peak_hour: string | null;
  total_reservations: number;
}
