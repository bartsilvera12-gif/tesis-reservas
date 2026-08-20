import { useMemo, useState } from 'react';
import { useOwnerBusiness } from '@/context/OwnerBusinessContext';
import { useAsync } from '@/hooks/useAsync';
import { useToast } from '@/hooks/useToast';
import { fetchBusinessReservations, setReservationStatus } from '@/services/reservations';
import { Chip, Loading, PageTitle, StateView, StatusChip } from '@/components/ui';
import { C } from '@/lib/theme';
import { dayShort, money, shortTime, toISODate } from '@/lib/format';
import type { ReservationStatus } from '@/types/db';

/** Próximos 7 días para el filtro por fecha. */
function nextDays(count = 7): Date[] {
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    return d;
  });
}

export function OwnerReservations() {
  const { active } = useOwnerBusiness();
  const toast = useToast();

  const days = useMemo(() => nextDays(7), []);
  const [date, setDate] = useState(() => toISODate(days[0]));
  const [working, setWorking] = useState<string | null>(null);

  const query = useAsync(
    () => fetchBusinessReservations(active!.id, date),
    [active?.id, date],
    { enabled: Boolean(active) },
  );

  const list = query.data ?? [];

  async function act(id: string, status: ReservationStatus) {
    setWorking(id);
    try {
      await setReservationStatus(id, status);

      // Refresco inmediato en pantalla tras la respuesta correcta del servidor.
      query.setData((prev) =>
        prev ? prev.map((r) => (r.id === id ? { ...r, status } : r)) : prev,
      );

      toast.success(status === 'confirmed' ? 'Reserva confirmada.' : 'Reserva rechazada.');
    } catch (err) {
      toast.fail(err instanceof Error ? err.message : 'No pudimos actualizar la reserva.');
      query.reload();
    } finally {
      setWorking(null);
    }
  }

  if (!active) return null;

  return (
    <div style={{ paddingBottom: 24 }}>
      <PageTitle>Reservas</PageTitle>

      <div className="hscroll" style={{ padding: '0 20px 12px' }}>
        {days.map((d) => {
          const iso = toISODate(d);
          return (
            <Chip
              key={iso}
              label={
                iso === toISODate(days[0])
                  ? `Hoy · ${dayShort(d.getDay())} ${d.getDate()}`
                  : `${dayShort(d.getDay())} ${d.getDate()}`
              }
              active={date === iso}
              onClick={() => setDate(iso)}
            />
          );
        })}
      </div>

      {query.loading && !query.data ? (
        <Loading label="" />
      ) : query.error ? (
        <StateView
          tone="error"
          title="No pudimos cargar las reservas."
          detail={query.error}
          actionLabel="Reintentar"
          onAction={query.reload}
        />
      ) : list.length === 0 ? (
        <StateView
          title="No hay reservas todavía."
          detail="Cuando alguien reserve para este día lo vas a ver acá."
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
                padding: '13px 15px',
                opacity: working === r.id ? 0.6 : 1,
                transition: 'opacity .2s',
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
                  style={{
                    fontSize: 15,
                    fontWeight: 800,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {r.client?.full_name || 'Cliente'}
                </div>
                <StatusChip status={r.status} />
              </div>

              <div style={{ fontSize: 12.5, color: C.sub, marginTop: 4, lineHeight: 1.5 }}>
                {[
                  `${shortTime(r.reservation_time)} h`,
                  r.party_size ? `${r.party_size} personas` : null,
                  r.catalog_item?.name,
                  r.reservation_code,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </div>

              {r.notes && (
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
                  “{r.notes}”
                </div>
              )}

              {r.deposit_required && (
                <div style={{ fontSize: 11.5, color: C.warn, fontWeight: 600, marginTop: 6 }}>
                  Seña {money(r.deposit_amount)} · {r.deposit_status === 'paid' ? 'pagada' : 'pendiente'}
                </div>
              )}

              {r.client?.phone && (
                <a
                  href={`tel:${r.client.phone}`}
                  style={{
                    display: 'inline-block',
                    fontSize: 12.5,
                    fontWeight: 700,
                    color: C.terracottaDark,
                    marginTop: 6,
                  }}
                >
                  {r.client.phone}
                </a>
              )}

              {r.status === 'pending' && (
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button
                    disabled={working === r.id}
                    onClick={() => void act(r.id, 'confirmed')}
                    style={{
                      flex: 1,
                      background: C.terracotta,
                      color: '#fff',
                      textAlign: 'center',
                      borderRadius: 10,
                      padding: '11px',
                      fontSize: 13,
                      fontWeight: 800,
                      minHeight: 44,
                    }}
                  >
                    Aceptar
                  </button>
                  <button
                    disabled={working === r.id}
                    onClick={() => void act(r.id, 'rejected')}
                    style={{
                      flex: 1,
                      border: `1.5px solid ${C.line}`,
                      color: C.danger,
                      textAlign: 'center',
                      borderRadius: 10,
                      padding: '11px',
                      fontSize: 13,
                      fontWeight: 700,
                      minHeight: 44,
                    }}
                  >
                    Rechazar
                  </button>
                </div>
              )}

              {r.status === 'confirmed' && (
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button
                    disabled={working === r.id}
                    onClick={() => void act(r.id, 'completed')}
                    style={{
                      flex: 1,
                      border: `1.5px solid ${C.line}`,
                      color: C.terracottaDark,
                      borderRadius: 10,
                      padding: '10px',
                      fontSize: 12.5,
                      fontWeight: 700,
                      minHeight: 42,
                    }}
                  >
                    Marcar asistida
                  </button>
                  <button
                    disabled={working === r.id}
                    onClick={() => void act(r.id, 'no_show')}
                    style={{
                      flex: 1,
                      border: `1.5px solid ${C.line}`,
                      color: C.sub,
                      borderRadius: 10,
                      padding: '10px',
                      fontSize: 12.5,
                      fontWeight: 700,
                      minHeight: 42,
                    }}
                  >
                    No asistió
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {toast.node}
    </div>
  );
}
