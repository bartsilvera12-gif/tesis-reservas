import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useAsync } from '@/hooks/useAsync';
import { fetchBusinessById } from '@/services/businesses';
import { createReview, fetchReviewableReservations } from '@/services/reviews';
import { Button, Field, Loading, StateView, TopBar } from '@/components/ui';
import { C } from '@/lib/theme';
import { compactDate } from '@/lib/format';

/**
 * Publicar una reseña.
 *
 * Sólo se habilita si el cliente tuvo una reserva confirmada/completada en
 * ese negocio — la misma regla que aplica RLS del lado del servidor.
 */
export function WriteReview() {
  const { id = '' } = useParams();
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [reservationId, setReservationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const bizQuery = useAsync(() => fetchBusinessById(id), [id]);

  const eligibleQuery = useAsync(
    () => fetchReviewableReservations(profile!.id),
    [profile?.id],
    { enabled: Boolean(profile?.id) },
  );

  /** Reservas de ESTE negocio que todavía no fueron reseñadas. */
  const options = useMemo(
    () => (eligibleQuery.data ?? []).filter((r) => r.business_id === id),
    [eligibleQuery.data, id],
  );

  const loading = bizQuery.loading || eligibleQuery.loading;

  if (loading && !bizQuery.data) return <Loading label="" />;

  const business = bizQuery.data;

  if (!business) {
    return (
      <StateView
        tone="error"
        title="No encontramos el negocio"
        actionLabel="Volver"
        onAction={() => navigate(-1)}
      />
    );
  }

  if (!options.length) {
    return (
      <div>
        <TopBar title="Escribir una reseña" onBack={() => navigate(-1)} />
        <StateView
          title="Todavía no podés reseñar"
          detail={`Para reseñar ${business.name} necesitás haber tenido una reserva confirmada que no hayas reseñado antes.`}
          actionLabel="Volver al negocio"
          onAction={() => navigate(`/app/negocio/${id}`)}
        />
      </div>
    );
  }

  const chosen = reservationId ?? options[0].id;

  async function onSubmit() {
    setError(null);

    if (rating < 1) {
      setError('Elegí de 1 a 5 estrellas.');
      return;
    }

    setBusy(true);
    try {
      await createReview({
        business_id: id,
        client_id: profile!.id,
        rating,
        comment: comment.trim() || null,
        reservation_id: chosen,
      });
      navigate(`/app/negocio/${id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos publicar tu reseña.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ background: C.surface, minHeight: '100%' }}>
      <TopBar title="Escribir una reseña" subtitle={business.name} onBack={() => navigate(-1)} />

      <div style={{ padding: '12px 20px 32px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* Estrellas */}
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 800, marginBottom: 10 }}>
            ¿Cómo te fue?
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                aria-label={`${n} estrellas`}
                onClick={() => setRating(n)}
                style={{
                  fontSize: 38,
                  lineHeight: 1,
                  color: n <= rating ? C.gold : C.line,
                  transition: 'color .15s, transform .15s',
                  transform: n <= rating ? 'scale(1.05)' : 'scale(1)',
                  padding: 4,
                }}
              >
                ★
              </button>
            ))}
          </div>
          {rating > 0 && (
            <div
              style={{
                textAlign: 'center',
                fontSize: 12.5,
                color: C.sub,
                marginTop: 6,
              }}
            >
              {['', 'Muy malo', 'Malo', 'Regular', 'Bueno', 'Excelente'][rating]}
            </div>
          )}
        </div>

        {/* Si tiene varias reservas sin reseñar, elige a cuál corresponde */}
        {options.length > 1 && (
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
              ¿Sobre qué visita?
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {options.map((opt) => {
                const on = chosen === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => setReservationId(opt.id)}
                    style={{
                      textAlign: 'left',
                      borderRadius: 12,
                      padding: '12px 14px',
                      fontSize: 13.5,
                      fontWeight: 600,
                      background: on ? C.cream : C.surface,
                      border: `1.5px solid ${on ? C.terracotta : C.line}`,
                      color: on ? C.terracottaDark : C.ink,
                    }}
                  >
                    {compactDate(opt.reservation_date)}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <Field
          label="Tu comentario (opcional)"
          multiline
          rows={4}
          placeholder="Contá cómo fue la atención, la comida, el ambiente…"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />

        {error && (
          <div
            role="alert"
            style={{
              background: C.dangerBg,
              color: C.danger,
              borderRadius: 12,
              padding: '11px 14px',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {error}
          </div>
        )}

        <Button loading={busy} disabled={rating < 1} onClick={() => void onSubmit()}>
          Publicar reseña
        </Button>
      </div>
    </div>
  );
}
