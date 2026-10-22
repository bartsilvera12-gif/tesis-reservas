import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useOwnerBusiness } from '@/context/OwnerBusinessContext';
import { useAsync } from '@/hooks/useAsync';
import { useToast } from '@/hooks/useToast';
import { useConfirm } from '@/hooks/useConfirm';
import {
  fetchBusinessReservations,
  fetchDepositsToRefund,
  markDepositRefunded,
  setReservationStatus,
} from '@/services/reservations';
import { signedProofUrl } from '@/services/storage';
import { Chip, Loading, PageTitle, StateView, StatusChip } from '@/components/ui';
import { C } from '@/lib/theme';
import {
  compactDate,
  cuandoVence,
  dayShort,
  estadoVisible,
  money,
  shortTime,
  toISODate,
} from '@/lib/format';
import { usaCantidadDePersonas } from '@/lib/rubros';
import type { DepositStatus, ReservationStatus, ReservationWithRelations } from '@/types/db';

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

/**
 * El filtro de "por responder": todas las pendientes, de cualquier fecha.
 *
 * Mirando sólo día por día, el dueño entraba a "Hoy", veía "No hay reservas
 * todavía" y no tenía cómo saber que mañana lo esperaban dos. Y la tira llega
 * a una semana: una reserva de hospedaje para dentro de un mes no aparecía en
 * ningún día y no había forma de aceptarla.
 */
const PENDIENTES = 'pendientes';

/** Filtro de las señas que hay que devolver (rechazadas, canceladas o vencidas). */
const DEVOLVER = 'devolver';

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

/** Cómo está la seña, dicho para el dueño. */
const SENA: Partial<Record<DepositStatus, string>> = {
  pending: 'a verificar',
  paid: 'verificada',
  to_refund: 'a devolver al cliente',
  refunded: 'devuelta',
};

/**
 * Si corresponde ofrecer "Ya le devolví la seña". Siempre cuando la reserva
 * no se concretó; si el cliente canceló una ya confirmada, devolver o no
 * depende de lo que acuerden, así que el botón está pero no es obligatorio.
 */
const puedeDevolver = (r: ReservationWithRelations) =>
  r.deposit_status === 'to_refund' || (r.deposit_status === 'paid' && r.status === 'cancelled');

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
  // Desde el inicio del panel se llega con ?ver=pendientes.
  const [params] = useSearchParams();
  const [date, setDate] = useState(() => {
    const ver = params.get('ver');
    return ver === PENDIENTES || ver === DEVOLVER ? ver : hoy;
  });
  const [working, setWorking] = useState<string | null>(null);

  const pendientesQuery = useAsync(
    async () =>
      (await fetchBusinessReservations(active!.id, null)).filter(
        (r) => estadoVisible(r) === 'pending',
      ),
    [active?.id],
    { enabled: Boolean(active) },
  );
  const pendientes = pendientesQuery.data ?? [];
  const porResponder = pendientes.filter((r) => r.status === 'pending');

  const devolverQuery = useAsync(() => fetchDepositsToRefund(active!.id), [active?.id], {
    enabled: Boolean(active),
  });
  const aDevolver = devolverQuery.data ?? [];
  const sinDevolver = aDevolver.filter((r) => r.deposit_status === 'to_refund').length;

  /**
   * Si hay algo por responder, la pantalla abre ahí. Es lo único que el dueño
   * TIENE que hacer; lo demás es consulta. Sólo la primera vez: si después
   * elige otro día, no se lo cambiamos de abajo.
   */
  const yaEligio = useRef(params.get('ver') === PENDIENTES || params.get('ver') === DEVOLVER);
  useEffect(() => {
    if (yaEligio.current || !pendientesQuery.data) return;
    yaEligio.current = true;
    if (pendientesQuery.data.length > 0) setDate(PENDIENTES);
  }, [pendientesQuery.data]);

  // La tira arranca una semana atrás, así que sin esto el dueño entra mirando
  // el lunes pasado. Se lleva "Hoy" al centro apenas se monta la pantalla.
  const tira = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    // Se busca por el texto: antes de "Hoy" van los filtros, y cuántos hay
    // depende de si hay señas por devolver.
    const chip = [...(tira.current?.children ?? [])].find((c) =>
      c.textContent?.startsWith('Hoy'),
    ) as HTMLElement | undefined;
    chip?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, []);

  const verPendientes = date === PENDIENTES;
  const verDevolver = date === DEVOLVER;

  // Abriendo en "Por responder", ese chip tiene que verse: centrar "Hoy" lo
  // dejaba fuera de la pantalla, a la izquierda, y no se entendía qué filtro
  // estaba puesto.
  useEffect(() => {
    if (verPendientes || verDevolver) tira.current?.scrollTo({ left: 0 });
  }, [verPendientes, verDevolver]);

  const query = useAsync(
    () => fetchBusinessReservations(active!.id, date),
    [active?.id, date],
    { enabled: Boolean(active) && !verPendientes && !verDevolver },
  );

  const filtro = verPendientes ? pendientesQuery : verDevolver ? devolverQuery : query;
  const list = verPendientes ? pendientes : verDevolver ? aDevolver : (query.data ?? []);
  const cargando = filtro.loading && !filtro.data;
  const errorDeCarga = filtro.error;

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
        placeholder:
          active?.reservation_type === 'table'
            ? 'Ej: no tenemos mesa para ese horario'
            : active?.reservation_type === 'stay'
              ? 'Ej: no tenemos lugar en esas fechas'
              : 'Ej: ese horario ya está ocupado',
        maxLength: 200,
      },
    });
    if (!ok) return;
    await act(id, 'rejected', texto || undefined);
  }

  /** Lo que devolvió el servidor reemplaza a la tarjeta: estado y seña. */
  function reflejar(id: string, cambios: Partial<ReservationWithRelations>) {
    const aplicar = (prev: ReservationWithRelations[] | null) =>
      prev ? prev.map((r) => (r.id === id ? { ...r, ...cambios } : r)) : prev;
    query.setData(aplicar);
    // En "Por responder" la tarjeta queda a la vista con su nuevo estado
    // hasta que se cambie de filtro: que desaparezca de golpe desorienta.
    pendientesQuery.setData(aplicar);
    devolverQuery.setData(aplicar);
  }

  async function devolverSena(r: ReservationWithRelations) {
    const { ok } = await confirm({
      title: '¿Ya devolviste la seña?',
      message: `Marcalo cuando le hayas transferido ${money(r.deposit_amount)} al cliente. Le avisamos que se la devolviste.`,
      confirmLabel: 'Sí, ya la devolví',
      cancelLabel: 'Todavía no',
    });
    if (!ok) return;
    setWorking(r.id);
    try {
      const nueva = await markDepositRefunded(r.id);
      reflejar(r.id, { deposit_status: nueva.deposit_status });
      toast.success('Listo: le avisamos al cliente.');
    } catch (err) {
      toast.fail(err instanceof Error ? err.message : 'No pudimos registrar la devolución.');
    } finally {
      setWorking(null);
    }
  }

  async function act(id: string, status: ReservationStatus, reason?: string) {
    setWorking(id);
    try {
      const nueva = await setReservationStatus(id, status, reason);
      // Refresco inmediato en pantalla tras la respuesta correcta del servidor.
      reflejar(id, { status, deposit_status: nueva.deposit_status, expires_at: null });

      toast.success(AVISO[status] ?? 'Reserva actualizada.');
    } catch (err) {
      toast.fail(err instanceof Error ? err.message : 'No pudimos actualizar la reserva.');
      query.reload();
      pendientesQuery.reload();
      devolverQuery.reload();
    } finally {
      setWorking(null);
    }
  }

  if (!active) return null;

  return (
    <div style={{ paddingBottom: 24 }}>
      <PageTitle>Reservas</PageTitle>

      <div ref={tira} className="hscroll" style={{ padding: '0 20px 12px' }}>
        <Chip
          label={`Por responder · ${porResponder.length}`}
          active={verPendientes}
          onClick={() => setDate(PENDIENTES)}
        />
        {/* Sólo cuando hay algo para devolver: es un pendiente de plata del
            dueño con el cliente, no una vista de todos los días. */}
        {(sinDevolver > 0 || verDevolver) && (
          <Chip
            label={`Señas a devolver · ${sinDevolver}`}
            active={verDevolver}
            onClick={() => setDate(DEVOLVER)}
          />
        )}
        {days.map((d) => {
          const iso = toISODate(d);
          const n = porResponder.filter((r) => r.reservation_date === iso).length;
          return (
            <Chip
              key={iso}
              label={
                (iso === hoy
                  ? `Hoy · ${dayShort(d.getDay())} ${d.getDate()}`
                  : `${dayShort(d.getDay())} ${d.getDate()}`) +
                // El número avisa en qué día hay algo por responder, sin
                // tener que entrar uno por uno a buscarlo.
                (n > 0 ? ` (${n})` : '')
              }
              active={date === iso}
              onClick={() => setDate(iso)}
            />
          );
        })}
      </div>

      {cargando ? (
        <Loading label="" />
      ) : errorDeCarga ? (
        <StateView
          tone="error"
          title="No pudimos cargar las reservas."
          detail={errorDeCarga}
          actionLabel="Reintentar"
          onAction={filtro.reload}
        />
      ) : list.length === 0 ? (
        verDevolver ? (
          <StateView
            title="No hay señas para devolver."
            detail="Si una reserva con seña se rechaza, se cancela antes de confirmarla o vence, aparece acá."
          />
        ) : verPendientes ? (
          <StateView
            title="Nada por responder."
            detail="Cuando entre una reserva nueva la vas a ver primero acá."
          />
        ) : porResponder.length > 0 ? (
          <StateView
            title="No hay reservas este día."
            detail={`Tenés ${porResponder.length} por responder en otros días.`}
            actionLabel="Ver las que esperan respuesta"
            onAction={() => setDate(PENDIENTES)}
          />
        ) : (
          <StateView
            title="No hay reservas este día."
            detail="Cuando alguien reserve para este día lo vas a ver acá."
          />
        )
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
                <StatusChip status={estadoVisible(r)} />
              </div>

              <div style={{ fontSize: 12.5, color: C.sub, marginTop: 4, lineHeight: 1.5 }}>
                {[
                  // Mezclando días, cada tarjeta tiene que decir de cuándo es.
                  verPendientes || verDevolver ? compactDate(r.reservation_date) : null,
                  // El dueño de un hospedaje necesita ver hasta cuándo se
                  // queda el huésped, no a qué hora entra.
                  r.check_out_date
                    ? `hasta el ${new Date(`${r.check_out_date}T00:00:00`).getDate()}`
                    : `${shortTime(r.reservation_time)} h`,
                  // En un lavadero o una peluquería la cantidad de personas no
                  // dice nada: el turno es uno.
                  r.party_size && usaCantidadDePersonas(active.reservation_type)
                    ? `${r.party_size} ${r.party_size === 1 ? 'persona' : 'personas'}`
                    : null,
                  r.catalog_item?.name,
                  r.staff ? `con ${r.staff.name}` : null,
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
                    Seña {money(r.deposit_amount)} · {SENA[r.deposit_status] ?? 'a verificar'}
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

                  {puedeDevolver(r) && (
                    <button
                      disabled={working === r.id}
                      onClick={() => void devolverSena(r)}
                      style={{
                        marginTop: 4,
                        width: '100%',
                        minHeight: 42,
                        borderRadius: 10,
                        border: `1.5px solid ${C.warnLine}`,
                        background: C.surface,
                        color: C.terracottaDark,
                        fontSize: 12.5,
                        fontWeight: 800,
                      }}
                    >
                      Ya le devolví la seña
                    </button>
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

              {/* Pasado este momento la reserva vence sola y el lugar se
                  libera: el dueño tiene que saber hasta cuándo puede decidir. */}
              {estadoVisible(r) === 'pending' && r.expires_at && (
                <div style={{ fontSize: 11.5, color: C.warn, fontWeight: 700, marginTop: 8 }}>
                  Respondé antes de {cuandoVence(r.expires_at)}
                </div>
              )}

              {estadoVisible(r) === 'expired' && (
                <div style={{ fontSize: 11.5, color: C.sub, marginTop: 8, lineHeight: 1.45 }}>
                  Venció sin respuesta y el lugar se liberó.
                </div>
              )}

              {estadoVisible(r) === 'pending' && (
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
