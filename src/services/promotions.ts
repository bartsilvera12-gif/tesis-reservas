import { supabase, friendlyError } from '@/lib/supabase';
import type { Promotion } from '@/types/db';

const PROMO_SELECT = `
  *,
  business:businesses ( id, name, slug, cover_url )
`;

/** Promociones vigentes de todos los negocios — alimenta el banner del Home. */
export async function fetchActivePromotions(limit = 8): Promise<Promotion[]> {
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from('promotions')
    .select(PROMO_SELECT)
    .eq('active', true)
    .lte('starts_at', nowIso)
    .or(`unlimited.eq.true,ends_at.is.null,ends_at.gt.${nowIso}`)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(friendlyError(error, 'No pudimos cargar las promociones.'));
  return (data ?? []) as Promotion[];
}

/** Promociones de un negocio (el dueño ve también las vencidas/inactivas). */
export async function fetchBusinessPromotions(
  businessId: string,
  onlyActive = false,
): Promise<Promotion[]> {
  let query = supabase
    .from('promotions')
    .select('*')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false });

  if (onlyActive) {
    const nowIso = new Date().toISOString();
    query = query
      .eq('active', true)
      .lte('starts_at', nowIso)
      .or(`unlimited.eq.true,ends_at.is.null,ends_at.gt.${nowIso}`);
  }

  const { data, error } = await query;
  if (error) throw new Error(friendlyError(error, 'No pudimos cargar las promociones.'));
  return (data ?? []) as Promotion[];
}

export async function createPromotion(payload: {
  business_id: string;
  title: string;
  description?: string | null;
  starts_at?: string;
  ends_at?: string | null;
  unlimited: boolean;
}): Promise<Promotion> {
  const title = payload.title.trim();
  if (!title) throw new Error('Poné un título para la promoción.');

  const { data, error } = await supabase
    .from('promotions')
    .insert({
      business_id: payload.business_id,
      title,
      description: payload.description?.trim() || null,
      starts_at: payload.starts_at ?? new Date().toISOString(),
      // La restricción de la base exige ends_at nulo cuando es "sin vencimiento".
      ends_at: payload.unlimited ? null : (payload.ends_at ?? null),
      unlimited: payload.unlimited,
      active: true,
    })
    .select()
    .single();

  if (error) throw new Error(friendlyError(error, 'No pudimos crear la promoción.'));
  return data as Promotion;
}

export async function updatePromotion(
  id: string,
  patch: Partial<Promotion>,
): Promise<Promotion> {
  const { data, error } = await supabase
    .from('promotions')
    .update(patch)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(friendlyError(error, 'No pudimos actualizar la promoción.'));
  return data as Promotion;
}

/**
 * Borra la promoción.
 *
 * Es una baja real y no lógica porque el panel ya tiene un interruptor de
 * pausa: si "Eliminar" sólo pusiera `active = false` haría exactamente lo
 * mismo que pausar, la promo seguiría en la lista y el dueño no tendría
 * ninguna forma de sacarla. Nada referencia a `promotions`, así que borrarla
 * no deja huérfano a ningún dato histórico.
 */
export async function deletePromotion(id: string): Promise<void> {
  const { error } = await supabase.from('promotions').delete().eq('id', id);
  if (error) throw new Error(friendlyError(error, 'No pudimos eliminar la promoción.'));
}
