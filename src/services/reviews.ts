import { supabase, friendlyError } from '@/lib/supabase';
import type { Review, ReviewWithClient } from '@/types/db';

const REVIEW_SELECT = `
  *,
  business:businesses ( id, name )
`;

/**
 * Los nombres de los autores NO salen de `profiles`: esa tabla sólo deja leer
 * el perfil propio, así que un cliente mirando las reseñas de otro recibiría
 * null. Se leen de la vista `review_authors`, que publica únicamente nombre y
 * avatar de quienes tienen una reseña visible.
 */
async function attachAuthors(reviews: ReviewWithClient[]): Promise<ReviewWithClient[]> {
  const ids = [...new Set(reviews.map((r) => r.client_id))];
  if (!ids.length) return reviews;

  const { data, error } = await supabase
    .from('review_authors')
    .select('id, full_name, avatar_url')
    .in('id', ids);

  // Si falla, mostramos las reseñas igual: perder el nombre es preferible a
  // dejar la pantalla vacía.
  if (error) return reviews;

  const byId = new Map(
    ((data ?? []) as { id: string; full_name: string; avatar_url: string | null }[]).map(
      (a) => [a.id, a],
    ),
  );

  return reviews.map((r) => ({ ...r, client: byId.get(r.client_id) ?? r.client }));
}

export async function fetchBusinessReviews(
  businessId: string,
): Promise<ReviewWithClient[]> {
  const { data, error } = await supabase
    .from('reviews')
    .select(REVIEW_SELECT)
    .eq('business_id', businessId)
    .eq('active', true)
    .order('created_at', { ascending: false });

  if (error) throw new Error(friendlyError(error, 'No pudimos cargar las reseñas.'));
  return attachAuthors((data ?? []) as ReviewWithClient[]);
}

export async function fetchMyReviews(clientId: string): Promise<ReviewWithClient[]> {
  const { data, error } = await supabase
    .from('reviews')
    .select(REVIEW_SELECT)
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(friendlyError(error, 'No pudimos cargar tus reseñas.'));
  return attachAuthors((data ?? []) as ReviewWithClient[]);
}

export async function createReview(payload: {
  business_id: string;
  client_id: string;
  rating: number;
  comment: string | null;
  reservation_id?: string | null;
}): Promise<Review> {
  if (payload.rating < 1 || payload.rating > 5) {
    throw new Error('La puntuación tiene que estar entre 1 y 5 estrellas.');
  }

  const { data, error } = await supabase
    .from('reviews')
    .insert({
      business_id: payload.business_id,
      client_id: payload.client_id,
      rating: Math.round(payload.rating),
      comment: payload.comment?.trim() || null,
      reservation_id: payload.reservation_id ?? null,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new Error('Ya dejaste una reseña para esta reserva.');
    }
    if (error.code === '42501') {
      throw new Error('Solo podés reseñar negocios donde hayas tenido una reserva.');
    }
    throw new Error(friendlyError(error, 'No pudimos publicar tu reseña.'));
  }

  return data as Review;
}

/** Respuesta del dueño (RPC: valida propiedad y notifica al cliente). */
export async function replyToReview(reviewId: string, reply: string): Promise<Review> {
  const { data, error } = await supabase.rpc('reply_to_review', {
    p_review_id: reviewId,
    p_reply: reply,
  });

  if (error) throw new Error(friendlyError(error, 'No pudimos publicar la respuesta.'));
  return (Array.isArray(data) ? data[0] : data) as Review;
}

/**
 * Reservas ya cumplidas que todavía no tienen reseña.
 * Es lo que habilita el botón "Escribir una reseña".
 */
export async function fetchReviewableReservations(clientId: string): Promise<
  {
    id: string;
    business_id: string;
    reservation_date: string;
    business: { id: string; name: string } | null;
  }[]
> {
  const { data, error } = await supabase
    .from('reservations')
    .select('id, business_id, reservation_date, business:businesses ( id, name )')
    .eq('client_id', clientId)
    .in('status', ['confirmed', 'completed'])
    .order('reservation_date', { ascending: false });

  if (error) throw new Error(friendlyError(error, 'No pudimos cargar tus reservas.'));

  const reservations = (data ?? []) as unknown as {
    id: string;
    business_id: string;
    reservation_date: string;
    business: { id: string; name: string } | null;
  }[];

  if (!reservations.length) return [];

  const { data: reviewed, error: revErr } = await supabase
    .from('reviews')
    .select('reservation_id')
    .eq('client_id', clientId);

  if (revErr) throw new Error(friendlyError(revErr, 'No pudimos cargar tus reseñas.'));

  const used = new Set(
    ((reviewed ?? []) as { reservation_id: string | null }[])
      .map((r) => r.reservation_id)
      .filter(Boolean) as string[],
  );

  return reservations.filter((r) => !used.has(r.id));
}
