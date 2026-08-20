import { useNavigate, useParams } from 'react-router-dom';
import { useAsync } from '@/hooks/useAsync';
import { supabase, friendlyError } from '@/lib/supabase';
import { Button, Loading, StateView } from '@/components/ui';
import { C, FONT } from '@/lib/theme';
import { friendlyDate, money, shortTime } from '@/lib/format';
import type { ReservationWithRelations } from '@/types/db';

/**
 * Pantalla de éxito. Se llega acá SOLO después de que la base creó la
 * reserva; los datos se releen para mostrar el código real.
 */
export function ReservationConfirmed() {
  const { id = '' } = useParams();
  const navigate = useNavigate();

  const query = useAsync(async () => {
    const { data, error } = await supabase
      .from('reservations')
      .select('*, business:businesses ( id, name, slug, cover_url, neighborhood, reservation_type ), catalog_item:catalog_items ( id, name ), client:profiles ( id, full_name, phone )')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(friendlyError(error, 'No pudimos cargar la reserva.'));
    return data as ReservationWithRelations | null;
  }, [id]);

  if (query.loading && !query.data) return <Loading label="" />;

  if (query.error || !query.data) {
    return (
      <StateView
        tone="error"
        title="No pudimos mostrar la reserva"
        detail={query.error ?? 'Puede que ya no exista.'}
        actionLabel="Ver mis reservas"
        onAction={() => navigate('/app/reservas', { replace: true })}
      />
    );
  }

  const r = query.data;

  const detail = [
    r.business?.name,
    friendlyDate(r.reservation_date),
    `${shortTime(r.reservation_time)} h`,
    r.party_size ? `${r.party_size} personas` : null,
    r.catalog_item?.name,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div
      style={{
        minHeight: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        background: C.surface,
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: 84,
          height: 84,
          borderRadius: '50%',
          background: C.terracotta,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          animation: 'pop .5s cubic-bezier(.2,1.4,.4,1) both',
          boxShadow: '0 12px 32px rgba(217,142,115,.4)',
        }}
      >
        <svg width="44" height="44" viewBox="0 0 24 24">
          <path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" fill="#fff" />
        </svg>
      </div>

      <div
        style={{
          fontFamily: FONT.display,
          fontSize: 26,
          marginTop: 22,
          animation: 'fadeUp .5s .15s both',
        }}
      >
        ¡Reserva creada!
      </div>

      <div
        style={{
          fontSize: 14,
          color: C.sub,
          marginTop: 8,
          lineHeight: 1.5,
          animation: 'fadeUp .5s .25s both',
        }}
      >
        {detail}
      </div>

      <div
        style={{
          marginTop: 16,
          background: C.bg,
          border: `1px solid ${C.line}`,
          borderRadius: 12,
          padding: '10px 16px',
          animation: 'fadeUp .5s .3s both',
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 800, color: C.sub, letterSpacing: '.5px' }}>
          CÓDIGO DE RESERVA
        </div>
        <div
          style={{
            fontSize: 19,
            fontWeight: 800,
            color: C.terracottaDark,
            letterSpacing: '1px',
            marginTop: 2,
          }}
        >
          {r.reservation_code}
        </div>
      </div>

      <div
        style={{
          fontSize: 12.5,
          color: C.sub,
          marginTop: 14,
          lineHeight: 1.5,
          maxWidth: 300,
          animation: 'fadeUp .5s .33s both',
        }}
      >
        Queda <strong>pendiente</strong> hasta que el negocio la confirme. Te avisamos
        cuando responda.
        {r.deposit_required && (
          <>
            <br />
            Seña a coordinar: <strong>{money(r.deposit_amount)}</strong>
          </>
        )}
      </div>

      <div
        style={{
          marginTop: 26,
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          animation: 'fadeUp .5s .35s both',
        }}
      >
        <Button onClick={() => navigate('/app/reservas', { replace: true })}>
          Ver mis reservas
        </Button>
        <Button variant="outline" onClick={() => navigate('/app', { replace: true })}>
          Volver al inicio
        </Button>
      </div>
    </div>
  );
}
