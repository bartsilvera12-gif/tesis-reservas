import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAsync } from '@/hooks/useAsync';
import { fetchBusinessFull } from '@/services/businesses';
import {
  createReservation,
  fetchAvailability,
  fetchStayAvailability,
} from '@/services/reservations';
import { uploadDepositProof } from '@/services/storage';
import { useAuth } from '@/context/AuthContext';
import { esPorNoches, exigeServicio, usaCantidadDePersonas } from '@/lib/rubros';
import { LADO_PORTADA, prepararImagen, ErrorImagen } from '@/lib/image';
import { Button, Field, Loading, StateView, TopBar } from '@/components/ui';
import { C } from '@/lib/theme';
import { dayShort, money, shortTime, toISODate } from '@/lib/format';

/** Próximos 14 días para elegir fecha. */
function nextDays(count = 14): Date[] {
  const out: Date[] = [];
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  for (let i = 0; i < count; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    out.push(d);
  }
  return out;
}

export function Reserve() {
  const { id = '' } = useParams();
  const navigate = useNavigate();

  const days = useMemo(() => nextDays(14), []);
  const [date, setDate] = useState(() => toISODate(days[0]));
  const [time, setTime] = useState<string | null>(null);
  const [partySize, setPartySize] = useState<number | null>(null);
  const [itemId, setItemId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Hospedaje: se reserva por noches, así que hace falta el día de salida.
  const [checkOut, setCheckOut] = useState('');

  // Comprobante de la seña. Se elige acá y se sube al confirmar.
  const [comprobante, setComprobante] = useState<File | null>(null);
  const [falloComprobante, setFalloComprobante] = useState<string | null>(null);

  const { profile } = useAuth();

  // Un solo viaje trae negocio, capacidad y carta. Pedirlos por separado
  // encadenaba: la capacidad no se podía pedir hasta saber el rubro, o sea
  // hasta que volviera el negocio.
  const bizQuery = useAsync(() => fetchBusinessFull(id), [id]);
  const business = bizQuery.data?.business ?? null;

  const tipo = business?.reservation_type ?? 'table';
  const isTableMode = tipo === 'table';
  const porNoches = esPorNoches(tipo);
  const necesitaServicio = exigeServicio(tipo);
  const usaPersonas = usaCantidadDePersonas(tipo);

  /** Sólo los tamaños de mesa que el negocio realmente tiene configurados. */
  const partyOptions = useMemo(
    () => (bizQuery.data?.capacity ?? []).filter((c) => c.quantity > 0),
    [bizQuery.data],
  );

  const services = useMemo(
    () => (bizQuery.data?.catalog ?? []).filter((i) => i.item_type === 'service'),
    [bizQuery.data],
  );

  /**
   * Disponibilidad real. En modo mesa hace falta el tamaño primero,
   * porque la capacidad se cuenta por tamaño de mesa.
   */
  const canQuerySlots =
    Boolean(business) && !porNoches && (!isTableMode || partySize !== null);

  const slotsQuery = useAsync(
    () => fetchAvailability(id, date, partySize),
    [id, date, partySize],
    { enabled: canQuerySlots },
  );

  const slots = useMemo(() => slotsQuery.data ?? [], [slotsQuery.data]);

  // Hospedaje: cuántos alojamientos de cada tamaño quedan libres en el rango.
  const estadiaQuery = useAsync(
    () => fetchStayAvailability(id, date, checkOut),
    [id, date, checkOut],
    { enabled: porNoches && Boolean(checkOut) && checkOut > date },
  );
  const alojamientos = useMemo(
    () => (estadiaQuery.data ?? []).filter((a) => a.total > 0),
    [estadiaQuery.data],
  );

  if (bizQuery.loading && !business) return <Loading label="Cargando…" />;

  if (bizQuery.error || !business) {
    return (
      <StateView
        tone="error"
        title="No pudimos abrir la reserva."
        detail={bizQuery.error ?? 'El negocio ya no está disponible.'}
        actionLabel="Volver"
        onAction={() => navigate(-1)}
      />
    );
  }

  const depositTotal =
    business.deposit_enabled && business.deposit_amount > 0
      ? business.deposit_amount * (business.deposit_per_person ? (partySize ?? 1) : 1)
      : 0;

  /**
   * Qué falta para poder confirmar.
   *
   * Se arma como lista y no como un booleano suelto para poder decirle a la
   * persona qué le falta, en vez de dejarle un botón apagado sin explicación.
   */
  const faltan: string[] = [];
  if (porNoches) {
    if (!checkOut || checkOut <= date) faltan.push('la fecha de salida');
    if (partySize === null) faltan.push('el alojamiento');
  } else {
    if (!time) faltan.push('un horario');
    if (usaPersonas && partySize === null) faltan.push('para cuántas personas');
  }
  if (necesitaServicio && !itemId) faltan.push('el servicio');
  // El servidor también lo exige; acá es para no dejar avanzar en falso.
  if (depositTotal > 0 && !comprobante) faltan.push('el comprobante de la seña');

  const ready = faltan.length === 0;

  /** Procesa la imagen al elegirla, igual que en el resto de la app. */
  async function elegirComprobante(archivo: File | undefined) {
    if (!archivo) return;
    setFalloComprobante(null);
    try {
      setComprobante(await prepararImagen(archivo, LADO_PORTADA));
    } catch (err) {
      setComprobante(null);
      setFalloComprobante(
        err instanceof ErrorImagen ? err.message : 'No pudimos usar esa imagen.',
      );
    }
  }

  async function onConfirm() {
    if (!ready) return;
    setError(null);
    setBusy(true);

    try {
      // El comprobante se sube ANTES de crear la reserva: si fallara después,
      // quedaría una reserva sin comprobante justo donde es obligatorio.
      let rutaComprobante: string | null = null;
      if (comprobante && profile) {
        rutaComprobante = await uploadDepositProof(profile.id, comprobante);
      }

      const reservation = await createReservation({
        businessId: id,
        date,
        // En hospedaje la hora es la de entrada del local, no la elige el
        // cliente: lo que importa son las noches.
        time: porNoches ? (time ?? '14:00') : time!,
        partySize: usaPersonas ? partySize : null,
        catalogItemId: itemId,
        notes: notes.trim() || null,
        checkOut: porNoches ? checkOut : null,
        depositProof: rutaComprobante,
      });

      // La confirmación sólo se muestra si la base creó la reserva.
      navigate(`/app/reserva/${reservation.id}/confirmada`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos crear la reserva.');
      // Pudo ocuparse mientras elegías: se refresca lo que corresponda.
      if (porNoches) {
        estadiaQuery.reload();
        setPartySize(null);
      } else {
        slotsQuery.reload();
        setTime(null);
      }
    } finally {
      setBusy(false);
    }
  }

  const summaryLine = porNoches
    ? `${business.name} · ${formatChipDate(date)}${
        checkOut && checkOut > date ? ` al ${formatChipDate(checkOut)}` : ''
      }`
    : `${business.name} · ${
        date === toISODate(days[0]) ? 'Hoy' : formatChipDate(date)
      }${time ? ` · ${shortTime(time)} h` : ''}`;

  const summarySub = porNoches
    ? checkOut && checkOut > date
      ? `${noches(date, checkOut)} noche${noches(date, checkOut) === 1 ? '' : 's'}${
          partySize ? ` · para ${partySize} persona${partySize === 1 ? '' : 's'}` : ''
        }`
      : 'Elegí las fechas'
    : isTableMode
      ? `${partySize ? `Mesa para ${partySize} personas` : 'Elegí una mesa'}${
          time ? '' : ' y un horario'
        }`
      : time
        ? 'Turno individual'
        : 'Elegí un horario';

  return (
    <div style={{ background: C.surface, minHeight: '100%' }}>
      <TopBar
        title={`Reservar en ${business.name}`}
        subtitle={[business.category?.name, business.neighborhood].filter(Boolean).join(' · ')}
        onBack={() => navigate(-1)}
      />

      <div style={{ padding: '8px 20px 24px' }}>
        {/* Hospedaje: se reserva por noches, no por turno */}
        {porNoches && (
          <>
            <div style={{ fontSize: 13.5, fontWeight: 800, margin: '14px 0 8px' }}>
              ¿Qué noches?
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 130 }}>
                <Field
                  label="Entrada"
                  type="date"
                  value={date}
                  min={toISODate(days[0])}
                  onChange={(e) => {
                    setDate(e.target.value);
                    setPartySize(null);
                    // Una salida anterior a la nueva entrada no tiene sentido.
                    if (checkOut && checkOut <= e.target.value) setCheckOut('');
                  }}
                />
              </div>
              <div style={{ flex: 1, minWidth: 130 }}>
                <Field
                  label="Salida"
                  type="date"
                  value={checkOut}
                  min={date}
                  onChange={(e) => {
                    setCheckOut(e.target.value);
                    setPartySize(null);
                  }}
                />
              </div>
            </div>

            {checkOut && checkOut > date && (
              <div style={{ fontSize: 12.5, color: C.sub, marginTop: 6 }}>
                {noches(date, checkOut)} noche{noches(date, checkOut) === 1 ? '' : 's'} ·
                se libera el día de salida
              </div>
            )}

            <div style={{ fontSize: 13.5, fontWeight: 800, margin: '18px 0 8px' }}>
              ¿Qué alojamiento?
            </div>
            {!checkOut || checkOut <= date ? (
              <div style={{ fontSize: 13, color: C.sub, lineHeight: 1.45 }}>
                Elegí las fechas y te mostramos qué hay libre.
              </div>
            ) : estadiaQuery.loading && !estadiaQuery.data ? (
              <Loading label="" />
            ) : alojamientos.length === 0 ? (
              <div
                style={{
                  fontSize: 13,
                  color: C.sub,
                  background: C.warnBg,
                  border: `1px solid ${C.warnLine}`,
                  borderRadius: 12,
                  padding: '12px 14px',
                  lineHeight: 1.45,
                }}
              >
                Este hospedaje todavía no cargó sus habitaciones.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {alojamientos.map((a) => {
                  const libre = a.remaining > 0;
                  const on = partySize === a.party_size;
                  return (
                    <button
                      key={a.party_size}
                      disabled={!libre}
                      onClick={() => setPartySize(a.party_size)}
                      style={{
                        textAlign: 'left',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 10,
                        borderRadius: 12,
                        padding: '13px 15px',
                        minHeight: 46,
                        background: on ? C.cream : C.surface,
                        border: `1.5px solid ${on ? C.terracotta : C.line}`,
                        opacity: libre ? 1 : 0.5,
                      }}
                    >
                      <span style={{ fontSize: 14, fontWeight: 700 }}>
                        Para {a.party_size} persona{a.party_size === 1 ? '' : 's'}
                      </span>
                      <span style={{ fontSize: 12.5, color: libre ? C.sub : C.danger }}>
                        {libre ? `${a.remaining} disponible${a.remaining === 1 ? '' : 's'}` : 'Sin lugar'}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* Fecha */}
        {!porNoches && (
        <>
        <div style={{ fontSize: 13.5, fontWeight: 800, margin: '14px 0 8px' }}>¿Qué día?</div>
        <div className="hscroll">
          {days.map((d) => {
            const iso = toISODate(d);
            const on = iso === date;
            return (
              <button
                key={iso}
                onClick={() => {
                  setDate(iso);
                  setTime(null);
                }}
                style={{
                  flexShrink: 0,
                  width: 58,
                  textAlign: 'center',
                  borderRadius: 12,
                  padding: '9px 0',
                  background: on ? C.terracotta : C.surface,
                  color: on ? '#fff' : C.ink,
                  border: `1.5px solid ${on ? C.terracotta : C.line}`,
                  scrollSnapAlign: 'start',
                }}
              >
                <div style={{ fontSize: 10.5, opacity: 0.75 }}>
                  {iso === toISODate(days[0]) ? 'Hoy' : dayShort(d.getDay())}
                </div>
                <div style={{ fontSize: 15, fontWeight: 800, marginTop: 1 }}>
                  {d.getDate()}
                </div>
              </button>
            );
          })}
        </div>

        {/* Cantidad de personas (sólo si el negocio trabaja con mesas) */}
        {isTableMode && (
          <>
            <div style={{ fontSize: 13.5, fontWeight: 800, margin: '18px 0 8px' }}>
              ¿Cuántas personas?
            </div>
            {bizQuery.loading && !bizQuery.data ? (
              <Loading label="" />
            ) : partyOptions.length === 0 ? (
              <div
                style={{
                  fontSize: 13,
                  color: C.sub,
                  background: C.warnBg,
                  border: `1px solid ${C.warnLine}`,
                  borderRadius: 12,
                  padding: '12px 14px',
                  lineHeight: 1.45,
                }}
              >
                Este negocio todavía no configuró sus mesas, así que no podemos tomar
                reservas por ahora.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
                {partyOptions.map((opt) => {
                  const on = partySize === opt.party_size;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => {
                        setPartySize(opt.party_size);
                        setTime(null);
                      }}
                      style={{
                        textAlign: 'center',
                        borderRadius: 10,
                        padding: '10px 0 8px',
                        background: on ? C.terracotta : C.surface,
                        color: on ? '#fff' : C.ink,
                        border: `1.5px solid ${on ? C.terracotta : C.line}`,
                      }}
                    >
                      <div style={{ fontSize: 17, fontWeight: 800 }}>{opt.party_size}</div>
                      <div style={{ fontSize: 10, opacity: 0.8 }}>
                        {opt.quantity} mesa{opt.quantity === 1 ? '' : 's'}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* Servicio (barberías / spas) */}
        {!isTableMode && services.length > 0 && (
          <>
            <div style={{ fontSize: 13.5, fontWeight: 800, margin: '18px 0 8px' }}>
              ¿Qué servicio?
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {services.map((s) => {
                const on = itemId === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => {
                      setItemId(on ? null : s.id);
                      setTime(null);
                    }}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 12,
                      textAlign: 'left',
                      borderRadius: 12,
                      padding: '12px 14px',
                      background: on ? C.cream : C.surface,
                      border: `1.5px solid ${on ? C.terracotta : C.line}`,
                    }}
                  >
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 14, fontWeight: 700 }}>
                        {s.name}
                      </span>
                      {s.duration_minutes && (
                        <span style={{ display: 'block', fontSize: 12, color: C.sub }}>
                          {s.duration_minutes} min
                        </span>
                      )}
                    </span>
                    <span
                      style={{ fontSize: 13.5, fontWeight: 700, color: C.terracottaDark }}
                    >
                      {money(s.price)}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* Horarios disponibles */}
        <div style={{ fontSize: 13.5, fontWeight: 800, margin: '18px 0 8px' }}>
          ¿A qué hora?
        </div>

        {!canQuerySlots ? (
          <div style={{ fontSize: 13, color: C.sub, padding: '6px 0' }}>
            Elegí primero para cuántas personas es la reserva.
          </div>
        ) : slotsQuery.loading ? (
          <Loading label="" />
        ) : slotsQuery.error ? (
          <StateView
            tone="error"
            title="No pudimos cargar los horarios."
            detail={slotsQuery.error}
            actionLabel="Reintentar"
            onAction={slotsQuery.reload}
          />
        ) : slots.length === 0 ? (
          <div
            style={{
              fontSize: 13,
              color: C.sub,
              background: C.disabledBg,
              borderRadius: 12,
              padding: '14px 16px',
              lineHeight: 1.45,
            }}
          >
            Ese día el local no atiende. Probá con otra fecha.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
            {slots.map((slot) => {
              const label = shortTime(slot.slot_time);
              const on = time === slot.slot_time;
              const off = !slot.available;

              return (
                <button
                  key={slot.slot_time}
                  disabled={off}
                  onClick={() => setTime(slot.slot_time)}
                  style={{
                    textAlign: 'center',
                    borderRadius: 10,
                    padding: '11px 0',
                    fontSize: 13,
                    fontWeight: 700,
                    background: off ? C.disabledBg : on ? C.terracotta : C.surface,
                    color: off ? C.disabled : on ? '#fff' : C.ink,
                    border: `1.5px solid ${
                      off ? 'transparent' : on ? C.terracotta : C.line
                    }`,
                    textDecoration: off ? 'line-through' : 'none',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}

        </>
        )}

        {/* Seña: a dónde transferir y el comprobante */}
        {depositTotal > 0 && (
          <div
            style={{
              marginTop: 18,
              background: C.warnBg,
              border: `1px solid ${C.warnLine}`,
              borderRadius: 12,
              padding: '13px 15px',
            }}
          >
            <div style={{ fontSize: 13.5, fontWeight: 800, color: C.warn }}>
              Seña de {money(depositTotal)}
            </div>
            <div
              style={{ fontSize: 12, color: C.warn, opacity: 0.9, lineHeight: 1.45, marginTop: 3 }}
            >
              Este local pide una seña para confirmar. Transferila y subí el comprobante:
              sin eso no se puede completar la reserva.
            </div>

            {/* Datos de la cuenta del local */}
            {business.deposit_account_number || business.deposit_bank_name ? (
              <div
                style={{
                  marginTop: 11,
                  background: C.surface,
                  borderRadius: 10,
                  padding: '11px 13px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                {[
                  ['Banco', business.deposit_bank_name],
                  ['Titular', business.deposit_account_holder],
                  ['Cuenta', business.deposit_account_number],
                  ['Documento', business.deposit_document_id],
                ]
                  .filter(([, v]) => Boolean(v))
                  .map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', gap: 8, fontSize: 12.5 }}>
                      <span style={{ color: C.sub, minWidth: 68 }}>{k}</span>
                      <span style={{ fontWeight: 700, wordBreak: 'break-all' }}>{v}</span>
                    </div>
                  ))}
                {business.deposit_instructions && (
                  <div style={{ fontSize: 12, color: C.sub, lineHeight: 1.45, marginTop: 3 }}>
                    {business.deposit_instructions}
                  </div>
                )}
              </div>
            ) : (
              <div
                style={{
                  marginTop: 11,
                  fontSize: 12.5,
                  color: C.warn,
                  fontWeight: 600,
                  lineHeight: 1.45,
                }}
              >
                El local todavía no cargó sus datos bancarios. Escribile antes de
                transferir para saber a dónde.
              </div>
            )}

            {/* Comprobante */}
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                marginTop: 11,
                background: C.surface,
                border: `1.5px dashed ${comprobante ? C.terracotta : C.warnLine}`,
                borderRadius: 10,
                padding: '12px 13px',
                minHeight: 46,
              }}
            >
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  void elegirComprobante(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M19 13v6H5v-6H3v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6zM13 3h-2v9.2L8.4 9.6 7 11l5 5 5-5-1.4-1.4L13 12.2z"
                  fill={comprobante ? C.terracottaDark : C.warn}
                />
              </svg>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700 }}>
                {comprobante ? 'Comprobante listo · tocá para cambiarlo' : 'Subir el comprobante'}
              </span>
            </label>

            {falloComprobante && (
              <div style={{ fontSize: 12, color: C.danger, marginTop: 6, lineHeight: 1.45 }}>
                {falloComprobante}
              </div>
            )}
          </div>
        )}

        <div style={{ marginTop: 18 }}>
          <Field
            label="Comentario (opcional)"
            multiline
            rows={2}
            placeholder="Ej: mesa cerca de la ventana"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {/* Resumen */}
        <div
          style={{
            marginTop: 18,
            background: C.bg,
            border: `1px solid ${C.line}`,
            borderRadius: 14,
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 800,
              color: C.sub,
              letterSpacing: '.5px',
            }}
          >
            TU RESERVA
          </div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{summaryLine}</div>
          <div style={{ fontSize: 12.5, color: C.sub }}>{summarySub}</div>
        </div>

        {error && (
          <div
            role="alert"
            style={{
              marginTop: 14,
              background: C.dangerBg,
              color: C.danger,
              borderRadius: 12,
              padding: '11px 14px',
              fontSize: 13,
              fontWeight: 600,
              lineHeight: 1.45,
            }}
          >
            {error}
          </div>
        )}

        <div style={{ marginTop: 16 }}>
          {/* Un botón apagado sin explicación obliga a adivinar qué falta. */}
          {!ready && (
            <div
              style={{
                fontSize: 12.5,
                color: C.sub,
                marginBottom: 8,
                lineHeight: 1.45,
                textAlign: 'center',
              }}
            >
              Falta {faltan.length === 1 ? faltan[0] : `${faltan.slice(0, -1).join(', ')} y ${faltan[faltan.length - 1]}`}.
            </div>
          )}
          <Button onClick={onConfirm} disabled={!ready} loading={busy}>
            Confirmar reserva
          </Button>
        </div>
      </div>
    </div>
  );
}

function formatChipDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${dayShort(date.getDay())} ${date.getDate()}`;
}

/** Noches entre dos fechas ISO. La de salida no se cuenta. */
function noches(desde: string, hasta: string): number {
  const a = new Date(`${desde}T00:00:00`);
  const b = new Date(`${hasta}T00:00:00`);
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86_400_000));
}
