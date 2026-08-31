import { useEffect, useMemo, useRef, useState } from 'react';
import { useOwnerBusiness } from '@/context/OwnerBusinessContext';
import { useAsync } from '@/hooks/useAsync';
import { useToast } from '@/hooks/useToast';
import { useConfirm } from '@/hooks/useConfirm';
import { fetchBusinessReservations, setReservationStatus } from '@/services/reservations';
import { signedProofUrl } from '@/services/storage';
import { Chip, Loading, PageTitle, StateView, StatusChip } from '@/components/ui';
import { C } from '@/lib/theme';
import { dayShort, money, shortTime, toISODate } from '@/lib/format';
import type { ReservationStatus } from '@/types/db';

/**
 * Días del filtro: una semana hacia atrás y una hacia adelante.
 *
 * Los días pasados no son un adorno. Marcar "asistió" / "no asistió" sólo se
 * puede hacer DESPUÉS de que la reserva ocurrió, así que sin acceso al pasado
 * las reservas de ayer quedaban confirmadas para siempre y no había forma de
 * cerrarlas desde la app.
 */
const DIAS_ATRAS = 7;
const DIAS_ADELANTE = 7;

function rangoDeDias(): Date[] {
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  return Array.from({ length: DIAS_ATRAS + 1 + DIAS_ADELANTE }, (_, i) => {
    const d = new Date(base);
    d.setDate(base.getDate() + i - DIAS_ATRAS);
    return d;
  });
}

/**
 * Espejo de la regla del servidor: la asistencia se marca recién cuando la
 * reserva ocurrió, con media hora de tolerancia para quien llega antes.
 *
 * Se repite acá para no ofrecer un botón que la base va a rechazar. La
 * validación de verdad sigue siendo la de `set_reservation_status`; esto es
 * sólo para no mostrarle al dueño una acción que no puede hacer todavía.
 */
const TOLERANCIA_MIN = 30;

function yaOcurrio(fecha: string, hora: string): boolean {
  const inicio = new Date(`${fecha}T${hora}`);
  if (Number.isNaN(inicio.getTime())) return false;
  return Date.now() >= inicio.getTime() - TOLERANCIA_MIN * 60_000;
}

/** Lo que se le dice al dueño según lo que acaba de hacer. */
const AVISO: Partial<Record<ReservationStatus, string>> = {
  confirmed: 'Reserva confirmada.',
  rejected: 'Reserva rechazada.',
  cancelled: 'Reserva cancelada.',
  completed: 'Marcada como asistida.',
  no_show: 'Marcada como no asistió.',
};

export function OwnerReservations() {
  const { active } = useOwnerBusiness();
  const toast = useToast();
  const { confirm, node: confirmNode } = useConfirm();

  // Comprobante que se está mirando. Se guarda la URL firmada, no la ruta.
  const [comprobante, setComprobante] = useState<string | null>(null);

  async function verComprobante(ruta: string) {
    try {
      setComprobante(await signedProofUrl(ruta));
    } catch (err) {
      toast.fail(err instanceof Error ? err.message : 'No pudimos abrir el comprobante.');
    }
  }

  const days = useMemo(() => rangoDeDias(), []);
  const hoy = useMemo(() => toISODate(new Date()), []);
  const [date, setDate] = useState(hoy);
  const [working, setWorking] = useState<string | null>(null);

  // La tira arranca una semana atrás, así que sin esto el dueño entra mirando
  // el lunes pasado. Se lleva "Hoy" al centro apenas se monta la pantalla.
  const tira = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const chip = tira.current?.children[DIAS_ATRAS] as HTMLElement | undefined;
    chip?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, []);

  const query = useAsync(
    () => fetchBusinessReservations(active!.id, date),
    [active?.id, date],
    { enabled: Boolean(active) },
  );

  const list = query.data ?? [];

  /**
   * Rechazar le llega al cliente como una notificación. Sin motivo se entera
   * de que no hay lugar pero no de por qué, así que se le ofrece al dueño
   * escribirlo. Es opcional: no queremos frenar a quien sólo quiere rechazar.
   */
  async function rechazar(id: string) {
    const { ok, texto } = await confirm({
      title: '¿Rechazar la reserva?',
      message: 'El cliente recibe un aviso. Contarle el motivo evita que vuelva a intentar lo mismo.',
      confirmLabel: 'Rechazar',
      cancelLabel: 'Volver',
      danger: true,
      prompt: {
        label: 'Motivo (opcional)',
        placeholder: 'Ej: no tenemos mesa para ese horario',
        maxLength: 200,
      },
    });
    if (!ok) return;
    await act(id, 'rejected', texto || undefined);
  }

  async function act(id: string, status: ReservationStatus, reason?: string) {
    setWorking(id);
    try {
      await setReservationStatus(id, status, reason);

      // Refresco inmediato en pantalla tras la respuesta correcta del servidor.
      query.setData((prev) =>
        prev ? prev.map((r) => (r.id === id ? { ...r, status } : r)) : prev,
      );

      toast.success(AVISO[status] ?? 'Reserva actualizada.');
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

      <div ref={tira} className="hscroll" style={{ padding: '0 20px 12px' }}>
        {days.map((d) => {
          const iso = toISODate(d);
          return (
            <Chip
              key={iso}
              label={
                iso === hoy
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
                  // El dueño de un hospedaje necesita ver hasta cuándo se
                  // queda el huésped, no a qué hora entra.
                  r.check_out_date
                    ? `hasta el ${new Date(`${r.check_out_date}T00:00:00`).getDate()}`
                    : `${shortTime(r.reservation_time)} h`,
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
                <div
                  style={{
                    marginTop: 8,
                    background: C.warnBg,
                    border: `1px solid ${C.warnLine}`,
                    borderRadius: 10,
                    padding: '9px 11px',
                  }}
                >
                  <div style={{ fontSize: 11.5, color: C.warn, fontWeight: 700 }}>
                    Seña {money(r.deposit_amount)} ·{' '}
                    {r.deposit_status === 'paid' ? 'confirmada' : 'a verificar'}
                  </div>

                  {/* El comprobante es lo que el dueño necesita mirar antes de
                      aceptar. La URL se firma al momento porque el archivo vive
                      en un bucket privado. */}
                  {r.deposit_proof_url ? (
                    <button
                      onClick={() => void verComprobante(r.deposit_proof_url!)}
                      style={{
                        marginTop: 6,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 7,
                        color: C.terracottaDark,
                        fontSize: 12.5,
                        fontWeight: 800,
                        background: 'none',
                        padding: '9px 0',
                        minHeight: 40,
                      }}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          d="M12 4.5C6.5 4.5 2.4 7.6 1 12c1.4 4.4 5.5 7.5 11 7.5S21.6 16.4 23 12c-1.4-4.4-5.5-7.5-11-7.5zm0 12c-3.8 0-7-2.4-8.3-4.5C5 9.4 8.2 7 12 7s7 2.4 8.3 4.5C19 13.6 15.8 16.5 12 16.5zm0-7.5a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"
                          fill={C.terracottaDark}
                        />
                      </svg>
                      Ver el comprobante
                    </button>
                  ) : (
                    <div style={{ fontSize: 11.5, color: C.danger, marginTop: 4 }}>
                      Sin comprobante cargado.
                    </div>
                  )}
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
                    onClick={() => void rechazar(r.id)}
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

              {r.status === 'confirmed' && !yaOcurrio(r.reservation_date, r.reservation_time) && (
                <div style={{ fontSize: 11.5, color: C.sub, marginTop: 10, lineHeight: 1.45 }}>
                  Vas a poder marcar la asistencia cuando llegue el horario.
                </div>
              )}

              {r.status === 'confirmed' && yaOcurrio(r.reservation_date, r.reservation_time) && (
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

      {comprobante && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setComprobante(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1100,
            background: 'rgba(45,34,26,.82)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            gap: 14,
          }}
        >
          <img
            src={comprobante}
            alt="Comprobante de la seña"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '100%',
              maxHeight: '78dvh',
              objectFit: 'contain',
              borderRadius: 12,
              background: '#fff',
            }}
          />
          <button
            onClick={() => setComprobante(null)}
            style={{
              minHeight: 46,
              padding: '0 26px',
              borderRadius: 14,
              background: C.surface,
              color: C.ink,
              fontSize: 14.5,
              fontWeight: 800,
            }}
          >
            Cerrar
          </button>
        </div>
      )}

      {confirmNode}
      {toast.node}
    </div>
  );
}
