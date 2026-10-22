import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useAsync } from '@/hooks/useAsync';
import { useToast } from '@/hooks/useToast';
import { useConfirm } from '@/hooks/useConfirm';
import { fetchMyReservations, setReservationStatus } from '@/services/reservations';
import {
  Button,
  Loading,
  PageTitle,
  StateView,
  StatusChip,
  Chip,
} from '@/components/ui';
import { C } from '@/lib/theme';
import { cuandoVence, estadoVisible, friendlyDate, money, shortTime } from '@/lib/format';
import type { DepositStatus, ReservationWithRelations } from '@/types/db';

/** Cómo está la seña, dicho para quien reservó. */
const SENA: Partial<Record<DepositStatus, string>> = {
  pending: 'comprobante enviado',
  paid: 'verificada',
  to_refund: 'el negocio te la tiene que devolver',
  refunded: 'te la devolvieron',
};

type Filter = 'upcoming' | 'past';

export function MyBookings() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const { confirm, node: confirmNode } = useConfirm();

  const [filter, setFilter] = useState<Filter>('upcoming');
  const [cancelling, setCancelling] = useState<string | null>(null);

  const query = useAsync(
    () => fetchMyReservations(profile!.id),
    [profile?.id],
    { enabled: Boolean(profile?.id) },
  );

  const all = useMemo(() => query.data ?? [], [query.data]);

  const { upcoming, past } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const up: ReservationWithRelations[] = [];
    const old: ReservationWithRelations[] = [];

    for (const r of all) {
      const [y, m, d] = r.reservation_date.split('-').map(Number);
      const when = new Date(y, m - 1, d);
      const estado = estadoVisible(r);
      const isActive = estado === 'pending' || estado === 'confirmed';
      if (when >= today && isActive) up.push(r);
      else old.push(r);
    }

    // Las próximas, de la más cercana a la más lejana.
    up.sort(
      (a, b) =>
        a.reservation_date.localeCompare(b.reservation_date) ||
        a.reservation_time.localeCompare(b.reservation_time),
    );

    return { upcoming: up, past: old };
  }, [all]);

  const list = filter === 'upcoming' ? upcoming : past;

  async function onCancel(reservation: ReservationWithRelations) {
    const { ok } = await confirm({
      title: '¿Cancelar la reserva?',
      message: `Vas a cancelar tu reserva en ${reservation.business?.name ?? 'este negocio'}. No se puede deshacer.`,
      confirmLabel: 'Sí, cancelar',
      cancelLabel: 'No, mantenerla',
      danger: true,
    });
    if (!ok) return;

    setCancelling(reservation.id);
    try {
      await setReservationStatus(reservation.id, 'cancelled');
      toast.success('Reserva cancelada.');
      query.reload();
    } catch (err) {
      toast.fail(err instanceof Error ? err.message : 'No pudimos cancelar la reserva.');
    } finally {
      setCancelling(null);
    }
  }

  return (
    <div style={{ paddingBottom: 24 }}>
      <PageTitle>Mis reservas</PageTitle>

      <div className="hscroll" style={{ padding: '0 20px 12px' }}>
        <Chip
          label={`Próximas${upcoming.length ? ` (${upcoming.length})` : ''}`}
          active={filter === 'upcoming'}
          onClick={() => setFilter('upcoming')}
        />
        <Chip label="Historial" active={filter === 'past'} onClick={() => setFilter('past')} />
      </div>

      {query.loading && !query.data ? (
        <Loading label="Cargando tus reservas…" />
      ) : query.error ? (
        <StateView
          tone="error"
          title="No pudimos cargar tus reservas."
          detail={query.error}
          actionLabel="Reintentar"
          onAction={query.reload}
        />
      ) : list.length === 0 ? (
        <StateView
          title={
            filter === 'upcoming'
              ? past.length > 0
                ? 'No tenés reservas próximas.'
                : 'No hay reservas todavía.'
              : 'Sin historial'
          }
          detail={
            filter === 'upcoming'
              ? past.length > 0
                ? 'Las anteriores están en Historial.'
                : 'Cuando reserves un lugar te va a aparecer acá.'
              : 'Tus reservas pasadas van a quedar guardadas en esta sección.'
          }
          actionLabel={filter === 'upcoming' ? 'Explorar lugares' : undefined}
          onAction={filter === 'upcoming' ? () => navigate('/app/explorar') : undefined}
        />
      ) : (
        <div
          style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0 20px' }}
        >
          {list.map((r) => (
            <div
              key={r.id}
              style={{
                background: C.surface,
                border: `1px solid ${C.line}`,
                borderRadius: 14,
                padding: '14px 16px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <div
                  onClick={() =>
                    r.business && navigate(`/app/negocio/${r.business.id}`)
                  }
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) =>
                    e.key === 'Enter' && r.business && navigate(`/app/negocio/${r.business.id}`)
                  }
                  style={{
                    fontSize: 15,
                    fontWeight: 800,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    cursor: 'pointer',
                    // Área tocable cómoda sin mover el diseño.
                    padding: '12px 0',
                    margin: '-12px 0',
                  }}
                >
                  {r.business?.name ?? 'Negocio'}
                </div>
                <StatusChip status={estadoVisible(r)} />
              </div>

              <div style={{ fontSize: 13, color: C.sub, marginTop: 5, lineHeight: 1.5 }}>
                {/* Una estadía se cuenta en noches: mostrarle sólo el día de
                    entrada y una hora haría pensar que es una reserva de un
                    rato, y no diría cuándo hay que dejar el lugar. */}
                {(r.check_out_date
                  ? [
                      `${friendlyDate(r.reservation_date)} al ${friendlyDate(r.check_out_date)}`,
                      `${noches(r.reservation_date, r.check_out_date)} noche${
                        noches(r.reservation_date, r.check_out_date) === 1 ? '' : 's'
                      }`,
                      // Qué alojamiento es: en un hospedaje con varias cabañas
                      // es el dato que distingue una reserva de otra.
                      r.catalog_item?.name,
                      r.party_size ? `${r.party_size} personas` : null,
                    ]
                  : [
                      friendlyDate(r.reservation_date),
                      `${shortTime(r.reservation_time)} h`,
                      r.party_size ? `${r.party_size} personas` : null,
                      r.catalog_item?.name,
                    ]
                )
                  .filter(Boolean)
                  .join(' · ')}
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  marginTop: 8,
                }}
              >
                <span
                  style={{
                    fontSize: 11.5,
                    fontWeight: 700,
                    color: C.terracottaDark,
                    background: C.cream,
                    borderRadius: 6,
                    padding: '3px 8px',
                    letterSpacing: '.5px',
                  }}
                >
                  {r.reservation_code}
                </span>
                {r.deposit_required && (
                  <span
                    style={{
                      fontSize: 11.5,
                      // Con el comprobante subido ya no es algo pendiente del
                      // cliente: deja de verse como aviso. Sí lo es una seña
                      // que el negocio le tiene que devolver.
                      color: r.deposit_status === 'to_refund' ? C.warn : C.sub,
                      fontWeight: 600,
                      textAlign: 'right',
                    }}
                  >
                    Seña {money(r.deposit_amount)}
                    {SENA[r.deposit_status] ? ` · ${SENA[r.deposit_status]}` : ''}
                  </span>
                )}
              </div>

              {/* Cuando el negocio explica por qué rechazó o canceló, el cliente
                  tiene que poder leerlo: el chip de estado solo no alcanza. */}
              {r.cancellation_reason &&
                (r.status === 'rejected' || r.status === 'cancelled' || r.status === 'expired') && (
                  <div
                    style={{
                      fontSize: 12.5,
                      color: '#5C5044',
                      background: C.bg,
                      borderRadius: 8,
                      padding: '8px 10px',
                      marginTop: 8,
                      lineHeight: 1.45,
                    }}
                  >
                    <strong style={{ fontWeight: 700 }}>Motivo:</strong> {r.cancellation_reason}
                  </div>
                )}

              {/* Que el cliente sepa que "pendiente" no es para siempre. */}
              {estadoVisible(r) === 'pending' && r.expires_at && (
                <div style={{ fontSize: 12, color: C.sub, marginTop: 8, lineHeight: 1.45 }}>
                  El negocio tiene hasta {cuandoVence(r.expires_at)} para responder. Si no
                  responde, la reserva vence y se libera el lugar.
                </div>
              )}

              {estadoVisible(r) === 'expired' && !r.cancellation_reason && (
                <div style={{ fontSize: 12, color: C.sub, marginTop: 8, lineHeight: 1.45 }}>
                  El negocio no respondió a tiempo y la reserva venció.
                </div>
              )}

              {/* Cancelar tiene sentido antes de la hora; reseñar, después.
                  Antes se ofrecía "Reseñar" en una reserva para mañana, y una
                  ya asistida en el historial no tenía cómo reseñarse. */}
              {(puedeCancelar(r) || puedeResenar(r)) && (
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  {puedeCancelar(r) && (
                    <Button
                      variant="danger"
                      loading={cancelling === r.id}
                      onClick={() => void onCancel(r)}
                      style={{ padding: '10px', fontSize: 13, minHeight: 42 }}
                    >
                      Cancelar
                    </Button>
                  )}
                  {puedeResenar(r) && (
                    <Button
                      variant="ghost"
                      onClick={() => navigate(`/app/negocio/${r.business?.id}/resena`)}
                      style={{ padding: '10px', fontSize: 13, minHeight: 42 }}
                    >
                      Reseñar
                    </Button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {toast.node}
      {confirmNode}
    </div>
  );
}

/** Si ya llegó la hora de la reserva. */
function yaPaso(r: ReservationWithRelations): boolean {
  return new Date(`${r.reservation_date}T${r.reservation_time}`).getTime() <= Date.now();
}

function puedeCancelar(r: ReservationWithRelations): boolean {
  const estado = estadoVisible(r);
  return (estado === 'pending' || estado === 'confirmed') && !yaPaso(r);
}

function puedeResenar(r: ReservationWithRelations): boolean {
  return (r.status === 'confirmed' || r.status === 'completed') && yaPaso(r);
}

/** Noches entre dos fechas ISO. La de salida no se cuenta. */
function noches(desde: string, hasta: string): number {
  const a = new Date(`${desde}T00:00:00`);
  const b = new Date(`${hasta}T00:00:00`);
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86_400_000));
}
