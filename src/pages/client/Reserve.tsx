import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAsync } from '@/hooks/useAsync';
import {
  fetchBusinessById,
  fetchCapacity,
  fetchCatalog,
} from '@/services/businesses';
import { createReservation, fetchAvailability } from '@/services/reservations';
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

  const bizQuery = useAsync(() => fetchBusinessById(id), [id]);
  const business = bizQuery.data;

  const capacityQuery = useAsync(() => fetchCapacity(id), [id]);
  const catalogQuery = useAsync(() => fetchCatalog(id), [id]);

  const isTableMode = business?.reservation_type === 'table';

  /** Sólo los tamaños de mesa que el negocio realmente tiene configurados. */
  const partyOptions = useMemo(
    () => (capacityQuery.data ?? []).filter((c) => c.active && c.quantity > 0),
    [capacityQuery.data],
  );

  const services = useMemo(
    () => (catalogQuery.data ?? []).filter((i) => i.item_type === 'service'),
    [catalogQuery.data],
  );

  /**
   * Disponibilidad real. En modo mesa hace falta el tamaño primero,
   * porque la capacidad se cuenta por tamaño de mesa.
   */
  const canQuerySlots = Boolean(business) && (!isTableMode || partySize !== null);

  const slotsQuery = useAsync(
    () => fetchAvailability(id, date, partySize),
    [id, date, partySize],
    { enabled: canQuerySlots },
  );

  const slots = useMemo(() => slotsQuery.data ?? [], [slotsQuery.data]);

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

  const ready = Boolean(time) && (!isTableMode || partySize !== null);

  const depositTotal =
    business.deposit_enabled && business.deposit_amount > 0
      ? business.deposit_amount * (business.deposit_per_person ? (partySize ?? 1) : 1)
      : 0;

  async function onConfirm() {
    if (!ready || !time) return;
    setError(null);
    setBusy(true);

    try {
      const reservation = await createReservation({
        businessId: id,
        date,
        time,
        partySize: isTableMode ? partySize : null,
        catalogItemId: itemId,
        notes: notes.trim() || null,
      });

      // La confirmación sólo se muestra si la base creó la reserva.
      navigate(`/app/reserva/${reservation.id}/confirmada`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos crear la reserva.');
      // El horario pudo haberse ocupado mientras elegías: refrescamos.
      slotsQuery.reload();
      setTime(null);
    } finally {
      setBusy(false);
    }
  }

  const summaryLine = `${business.name} · ${
    date === toISODate(days[0]) ? 'Hoy' : formatChipDate(date)
  }${time ? ` · ${shortTime(time)} h` : ''}`;

  const summarySub = isTableMode
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
        {/* Fecha */}
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
            {capacityQuery.loading && !capacityQuery.data ? (
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

        {/* Seña */}
        {depositTotal > 0 && time && (
          <div
            style={{
              marginTop: 18,
              background: C.warnBg,
              border: `1px solid ${C.warnLine}`,
              borderRadius: 12,
              padding: '12px 14px',
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 800, color: C.warn }}>
              Seña de {money(depositTotal)}
            </div>
            <div
              style={{
                fontSize: 12,
                color: C.warn,
                opacity: 0.85,
                lineHeight: 1.45,
                marginTop: 3,
              }}
            >
              Este local pide una seña reembolsable para confirmar. Vas a coordinar el pago
              directamente con el negocio.
            </div>
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
