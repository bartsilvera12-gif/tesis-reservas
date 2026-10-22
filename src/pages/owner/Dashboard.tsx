import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOwnerBusiness } from '@/context/OwnerBusinessContext';
import { useAsync } from '@/hooks/useAsync';
import { buildInsights, fetchBusinessStats } from '@/services/stats';
import { fetchBusinessHours, fetchCatalog } from '@/services/businesses';
import { catalogoDe } from '@/lib/rubros';
import { fetchBusinessReservations, fetchPendingByBusiness } from '@/services/reservations';
import { Loading, Sheet, StateView, StatusChip } from '@/components/ui';
import { C } from '@/lib/theme';
import { dayShort, personas, shortTime, todayISO } from '@/lib/format';
import { ICONS } from '@/components/BottomNav';
import type { BusinessWithMeta } from '@/types/db';

export function OwnerDashboard() {
  const { active, businesses, setActiveId } = useOwnerBusiness();
  const navigate = useNavigate();
  const [eligiendo, setEligiendo] = useState(false);

  /**
   * Qué está esperando en CADA local, no sólo en el que estás mirando.
   *
   * El panel trabaja sobre un negocio por vez, así que una reserva que entra
   * en el segundo local era invisible hasta que se te ocurriera ir a mirarlo.
   * Se pide una sola vez para todos.
   */
  const pendientesQuery = useAsync(
    () => fetchPendingByBusiness(),
    [businesses.length],
    { enabled: businesses.length > 1 },
  );

  const pendientesPorId = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const p of pendientesQuery.data ?? []) mapa.set(p.business_id, p.pending);
    return mapa;
  }, [pendientesQuery.data]);

  // Lo que espera en los OTROS locales. Es el dato que no tenías forma de ver.
  const enOtros = useMemo(
    () =>
      businesses
        .filter((b) => b.id !== active?.id && (pendientesPorId.get(b.id) ?? 0) > 0)
        .map((b) => ({ negocio: b, pendientes: pendientesPorId.get(b.id) ?? 0 })),
    [businesses, active?.id, pendientesPorId],
  );

  const statsQuery = useAsync(
    () => fetchBusinessStats(active!.id),
    [active?.id],
    { enabled: Boolean(active) },
  );

  const upcomingQuery = useAsync(
    () => fetchBusinessReservations(active!.id, todayISO()),
    [active?.id],
    { enabled: Boolean(active) },
  );

  const stats = statsQuery.data;
  const insights = useMemo(
    () => (stats && active ? buildInsights(stats, active) : []),
    [stats, active],
  );

  const upcoming = useMemo(
    () =>
      (upcomingQuery.data ?? [])
        .filter((r) => r.status === 'pending' || r.status === 'confirmed')
        .slice(0, 3),
    [upcomingQuery.data],
  );

  if (!active) return null;

  const maxBar = Math.max(1, ...(stats?.week_bars ?? []).map((b) => b.count));

  return (
    <div style={{ paddingBottom: 24 }}>
      {/* Cabecera con selector de negocio */}
      <div
        style={{
          padding: '18px 20px 0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, color: C.sub }}>
            {businesses.length > 1 ? `Tus negocios (${businesses.length})` : 'Tu negocio'}
          </div>
          {/* Antes era un <select> nativo: mostraba los nombres y nada más.
              Ahora abre una hoja donde cada local dice qué tiene esperando,
              que es lo que uno necesita para decidir a cuál entrar. */}
          {businesses.length > 1 ? (
            <button
              onClick={() => setEligiendo(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                maxWidth: '100%',
                minHeight: 44,
                padding: '4px 0',
                textAlign: 'left',
              }}
            >
              <span
                style={{
                  fontSize: 20,
                  fontWeight: 800,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {active.name}
              </span>
              <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden style={{ flexShrink: 0 }}>
                <path d="M7 10l5 5 5-5z" fill={C.muted} />
              </svg>
            </button>
          ) : (
            <div
              style={{
                fontSize: 20,
                fontWeight: 800,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {active.name}
            </div>
          )}
        </div>

        <div
          onClick={() => navigate('/panel/negocio')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && navigate('/panel/negocio')}
          style={{
            width: 42,
            height: 42,
            flexShrink: 0,
            borderRadius: 12,
            border: `1px solid ${C.line}`,
            cursor: 'pointer',
            background: active.logo_url
              ? `url(${active.logo_url}) center/cover`
              : C.cream,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {!active.logo_url && (
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path d={ICONS.store} fill={C.terracottaDark} />
            </svg>
          )}
        </div>
      </div>

      {/* Lo que llegó a los otros locales. Sin esto, con dos negocios había
          que entrar a cada uno para enterarse. */}
      {enOtros.length > 0 && (
        <div style={{ padding: '12px 20px 0' }}>
          {enOtros.map(({ negocio, pendientes }) => (
            <button
              key={negocio.id}
              onClick={() => setActiveId(negocio.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                textAlign: 'left',
                minHeight: 48,
                padding: '10px 14px',
                marginBottom: 8,
                borderRadius: 12,
                background: C.warnBg,
                border: `1px solid ${C.warnLine}`,
              }}
            >
              <span
                aria-hidden
                style={{
                  flexShrink: 0,
                  minWidth: 22,
                  height: 22,
                  padding: '0 6px',
                  borderRadius: 999,
                  background: C.terracotta,
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {pendientes}
              </span>
              <span style={{ fontSize: 13, color: C.warn, fontWeight: 600, minWidth: 0 }}>
                {pendientes === 1 ? 'Reserva sin responder' : 'Reservas sin responder'} en{' '}
                <strong>{negocio.name}</strong>
              </span>
            </button>
          ))}
        </div>
      )}

      {statsQuery.loading && !stats ? (
        <Loading label="Calculando…" />
      ) : statsQuery.error ? (
        <StateView
          tone="error"
          title="No pudimos cargar las estadísticas."
          detail={statsQuery.error}
          actionLabel="Reintentar"
          onAction={statsQuery.reload}
        />
      ) : stats ? (
        <>
          {active && <CompletaTuNegocio negocio={active} />}

          {/* Lo único que el dueño TIENE que hacer va primero. Antes estaba
              sólo el número en una tarjeta que no se podía tocar, y abajo
              decía "No hay reservas para hoy": parecía que no había nada. */}
          {stats.pending_count > 0 && (
            <button
              onClick={() => navigate('/panel/reservas?ver=pendientes')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                width: 'calc(100% - 40px)',
                margin: '14px 20px 0',
                padding: '14px 16px',
                borderRadius: 16,
                background: C.warnBg,
                border: `1px solid ${C.warn}33`,
                textAlign: 'left',
              }}
            >
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 14.5, fontWeight: 800, color: C.ink }}>
                  {stats.pending_count === 1
                    ? '1 reserva espera tu respuesta'
                    : `${stats.pending_count} reservas esperan tu respuesta`}
                </span>
                <span style={{ display: 'block', fontSize: 12, color: C.sub, marginTop: 2 }}>
                  Aceptalas o rechazalas para que el cliente sepa si tiene lugar.
                </span>
              </span>
              <span style={{ fontSize: 13, fontWeight: 800, color: C.terracottaDark, flexShrink: 0 }}>
                Responder →
              </span>
            </button>
          )}

          {/* Métricas */}
          <div style={{ display: 'flex', gap: 10, padding: '14px 20px 0' }}>
            <Metric value={String(stats.today_count)} label="Reservas hoy" />
            <Metric
              value={String(stats.pending_count)}
              label="Pendientes"
              accent={stats.pending_count > 0}
              onClick={() => navigate('/panel/reservas?ver=pendientes')}
            />
            <Metric
              value={stats.rating_avg != null ? `★ ${stats.rating_avg}` : '—'}
              label={`${stats.reviews_count} reseñas`}
            />
          </div>

          <div style={{ display: 'flex', gap: 10, padding: '10px 20px 0' }}>
            <Metric value={String(stats.confirmed_count)} label="Confirmadas" />
            <Metric value={String(stats.active_promotions)} label="Promos activas" />
            <Metric value={String(stats.total_reservations)} label="Reservas totales" />
          </div>

          {/* Reservas por día */}
          <div
            style={{
              margin: '14px 20px 0',
              background: C.surface,
              border: `1px solid ${C.line}`,
              borderRadius: 16,
              padding: 16,
            }}
          >
            <div style={{ fontSize: 13.5, fontWeight: 800, marginBottom: 4 }}>
              Reservas por día de la semana
            </div>
            <div style={{ fontSize: 11.5, color: C.sub, marginBottom: 12 }}>
              Últimas 4 semanas y lo que ya está reservado
            </div>

            {stats.total_reservations === 0 ? (
              <div style={{ fontSize: 13, color: C.sub, padding: '8px 0' }}>
                Todavía no recibiste reservas.
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 92 }}>
                {[1, 2, 3, 4, 5, 6, 0].map((dow) => {
                  const bar = stats.week_bars.find((b) => b.dow === dow);
                  const count = bar?.count ?? 0;
                  const pct = Math.round((count / maxBar) * 100);
                  const strong = count === maxBar && count > 0;

                  return (
                    <div
                      key={dow}
                      style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 4,
                        height: '100%',
                        justifyContent: 'flex-end',
                      }}
                    >
                      <div style={{ fontSize: 10, color: C.sub, fontWeight: 700 }}>
                        {count || ''}
                      </div>
                      <div
                        style={{
                          width: '100%',
                          maxWidth: 26,
                          height: `${Math.max(pct, 4)}%`,
                          borderRadius: 6,
                          background: strong ? C.terracotta : C.bar,
                          minHeight: 6,
                        }}
                      />
                      <div
                        style={{
                          fontSize: 10.5,
                          fontWeight: strong ? 800 : 600,
                          color: strong ? C.terracottaDark : C.sub,
                        }}
                      >
                        {dayShort(dow)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recomendaciones por reglas sobre datos reales */}
          <div
            style={{
              margin: '14px 20px 0',
              background: 'linear-gradient(135deg,#4E4237,#A9674C)',
              borderRadius: 16,
              padding: 16,
              color: '#fff',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <svg width="16" height="16" viewBox="0 0 24 24">
                <path d={ICONS.sparkle} fill={C.sand} />
              </svg>
              <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: '.3px' }}>
                Recomendaciones
              </span>
            </div>

            {insights.length === 0 ? (
              <div style={{ fontSize: 12.5, lineHeight: 1.55, opacity: 0.9 }}>
                Por ahora está todo en orden. Con más reservas vas a ver acá qué días y
                horarios te conviene reforzar.
              </div>
            ) : (
              insights.map((insight) => (
                <div
                  key={insight.title}
                  style={{
                    background: 'rgba(255,255,255,.08)',
                    border: '1px solid rgba(255,255,255,.14)',
                    borderRadius: 12,
                    padding: '11px 13px',
                    marginBottom: 8,
                  }}
                >
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: C.sand }}>
                    {insight.title}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      lineHeight: 1.5,
                      opacity: 0.92,
                      marginTop: 3,
                    }}
                  >
                    {insight.text}
                  </div>
                  {insight.accion && (
                    <button
                      onClick={() => navigate(insight.accion!.to)}
                      style={{
                        marginTop: 8,
                        minHeight: 34,
                        padding: '0 12px',
                        borderRadius: 999,
                        background: C.sand,
                        color: '#4E4237',
                        fontSize: 12,
                        fontWeight: 800,
                      }}
                    >
                      {insight.accion.label} ›
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </>
      ) : null}

      {/* Próximas reservas */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          margin: '18px 20px 8px',
        }}
      >
        <span style={{ fontSize: 15.5, fontWeight: 800 }}>Reservas de hoy</span>
        <button
          onClick={() => navigate('/panel/reservas')}
          style={{
            fontSize: 12.5,
            fontWeight: 700,
            color: C.terracottaDark,
            padding: '12px 8px',
            margin: '-12px -8px',
            minHeight: 44,
          }}
        >
          Gestionar
        </button>
      </div>

      {upcomingQuery.loading && !upcomingQuery.data ? (
        <Loading label="" />
      ) : upcoming.length === 0 ? (
        <div
          style={{
            fontSize: 13,
            color: C.sub,
            padding: '4px 20px 8px',
            lineHeight: 1.5,
          }}
        >
          No hay reservas para hoy.
        </div>
      ) : (
        <div
          style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0 20px' }}
        >
          {upcoming.map((r) => (
            <div
              key={r.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                background: C.surface,
                border: `1px solid ${C.line}`,
                borderRadius: 12,
                padding: '11px 14px',
              }}
            >
              <div style={{ width: 46, textAlign: 'center', flexShrink: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: C.terracottaDark }}>
                  {shortTime(r.reservation_time)}
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {r.client?.full_name || 'Cliente'}
                </div>
                <div style={{ fontSize: 11.5, color: C.sub }}>
                  {[
                    r.party_size ? personas(r.party_size) : null,
                    r.catalog_item?.name,
                    r.staff ? `con ${r.staff.name}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ') || r.reservation_code}
                </div>
              </div>
              <StatusChip status={r.status} />
            </div>
          ))}
        </div>
      )}

      <SelectorDeNegocio
        open={eligiendo}
        onClose={() => setEligiendo(false)}
        negocios={businesses}
        activoId={active.id}
        pendientesPorId={pendientesPorId}
        onElegir={(id) => {
          setActiveId(id);
          setEligiendo(false);
        }}
        onAgregar={() => {
          setEligiendo(false);
          navigate('/panel/configurar');
        }}
      />
    </div>
  );
}

function Metric({
  value,
  label,
  accent,
  onClick,
}: {
  value: string;
  label: string;
  accent?: boolean;
  /** Si se pasa, la tarjeta lleva a donde se resuelve lo que cuenta. */
  onClick?: () => void;
}) {
  const Caja = onClick ? 'button' : 'div';
  return (
    <Caja
      onClick={onClick}
      style={{
        flex: 1,
        minWidth: 0,
        background: C.surface,
        border: `1px solid ${C.line}`,
        borderRadius: 14,
        padding: 12,
        textAlign: 'left',
      }}
    >
      <div
        style={{
          fontSize: 21,
          fontWeight: 800,
          color: accent ? C.terracottaDark : C.ink,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 11, color: C.sub, marginTop: 1 }}>{label}</div>
    </Caja>
  );
}

/**
 * Cambiar de negocio, sabiendo qué espera en cada uno.
 *
 * Antes era un `<select>` nativo con los nombres y nada más. El dato que hace
 * falta para elegir a cuál entrar no es el nombre: es cuántas reservas están
 * esperando respuesta ahí.
 */
export function SelectorDeNegocio({
  open,
  onClose,
  negocios,
  activoId,
  pendientesPorId,
  onElegir,
  onAgregar,
}: {
  open: boolean;
  onClose: () => void;
  negocios: BusinessWithMeta[];
  activoId: string;
  pendientesPorId: Map<string, number>;
  onElegir: (id: string) => void;
  onAgregar: () => void;
}) {
  return (
        <Sheet open={open} title="Tus negocios" onClose={onClose}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {negocios.map((b) => {
              const pendientes = pendientesPorId.get(b.id) ?? 0;
              const on = b.id === activoId;
              return (
                <button
                  key={b.id}
                  onClick={() => onElegir(b.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    width: '100%',
                    textAlign: 'left',
                    minHeight: 58,
                    padding: '10px 14px',
                    borderRadius: 12,
                    background: on ? C.cream : C.surface,
                    border: `1.5px solid ${on ? C.terracotta : C.line}`,
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 34,
                      height: 34,
                      flexShrink: 0,
                      borderRadius: 10,
                      background: b.logo_url ? `url(${b.logo_url}) center/cover` : C.bgDeep,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {!b.logo_url && (
                      <svg width="17" height="17" viewBox="0 0 24 24">
                        <path d={ICONS.store} fill={C.muted} />
                      </svg>
                    )}
                  </span>

                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span
                      style={{
                        display: 'block',
                        fontSize: 14,
                        fontWeight: 700,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {b.name}
                    </span>
                    <span style={{ display: 'block', fontSize: 11.5, color: C.sub, marginTop: 1 }}>
                      {[b.category?.name, b.neighborhood].filter(Boolean).join(' · ')}
                    </span>
                  </span>

                  {pendientes > 0 && (
                    <span
                      style={{
                        flexShrink: 0,
                        minWidth: 22,
                        height: 22,
                        padding: '0 6px',
                        borderRadius: 999,
                        background: C.terracotta,
                        color: '#fff',
                        fontSize: 12,
                        fontWeight: 800,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {pendientes}
                    </span>
                  )}
                </button>
              );
            })}

            <button
              onClick={onAgregar}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                width: '100%',
                minHeight: 48,
                marginTop: 4,
                borderRadius: 12,
                border: `1px dashed ${C.line}`,
                fontSize: 13.5,
                fontWeight: 700,
                color: C.terracottaDark,
              }}
            >
              + Agregar otro negocio
            </button>
          </div>
        </Sheet>
  );
}

/**
 * Qué le falta a un negocio para estar listo.
 *
 * Un dueño recién llegado entraba a un panel con todo en cero y sin pistas:
 * no sabía que tenía que cargar servicios ni revisar la seña. La tarjeta
 * aparece sólo mientras falte algo, y cada punto lleva a donde se resuelve.
 */
function CompletaTuNegocio({ negocio }: { negocio: BusinessWithMeta }) {
  const navigate = useNavigate();
  const datos = useAsync(
    async () => {
      const [catalogo, horarios] = await Promise.all([
        fetchCatalog(negocio.id, false),
        fetchBusinessHours(negocio.id),
      ]);
      return {
        items: catalogo.filter((i) => i.active).length,
        diasAbiertos: horarios.filter((h) => h.enabled).length,
      };
    },
    [negocio.id],
  );

  if (!datos.data) return null;

  const catalogo = catalogoDe(negocio.reservation_type);
  const pasos = [
    {
      hecho: Boolean(negocio.cover_url),
      texto: 'Subí una foto de portada',
      ayuda: 'Es lo primero que ven los clientes.',
    },
    {
      hecho: datos.data.items > 0,
      texto: `Cargá al menos un ${catalogo.singular}`,
      ayuda: 'Con precio, para que sepan qué ofrecés.',
    },
    {
      hecho: datos.data.diasAbiertos > 0,
      texto: 'Revisá tus horarios',
      ayuda: 'Sin días abiertos nadie puede reservar.',
    },
    ...(negocio.deposit_enabled
      ? [
          {
            hecho: negocio.deposit_amount > 0 && Boolean(negocio.deposit_account_number?.trim()),
            texto: 'Completá la seña',
            ayuda: 'El monto y la cuenta a la que te transfieren.',
          },
        ]
      : []),
  ];

  const faltan = pasos.filter((p) => !p.hecho).length;
  if (faltan === 0) return null;

  return (
    <div
      style={{
        margin: '14px 20px 0',
        background: C.surface,
        border: `1px solid ${C.line}`,
        borderRadius: 16,
        padding: '14px 16px',
      }}
    >
      <div style={{ fontSize: 14.5, fontWeight: 800 }}>Completá tu negocio</div>
      <div style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>
        {faltan === 1 ? 'Te falta 1 paso' : `Te faltan ${faltan} pasos`} para estar listo.
      </div>
      <div style={{ marginTop: 8 }}>
        {pasos.map((p) => (
          <button
            key={p.texto}
            onClick={() => navigate('/panel/negocio')}
            disabled={p.hecho}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              width: '100%',
              textAlign: 'left',
              padding: '8px 0',
              borderTop: `1px solid ${C.lineSoft}`,
              minHeight: 44,
            }}
          >
            <span
              aria-hidden
              style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 13,
                fontWeight: 800,
                background: p.hecho ? C.cream : 'transparent',
                border: `1.5px solid ${p.hecho ? C.cream : C.line}`,
                color: C.terracottaDark,
              }}
            >
              {p.hecho ? '✓' : ''}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span
                style={{
                  display: 'block',
                  fontSize: 13.5,
                  fontWeight: 700,
                  color: p.hecho ? C.sub : C.ink,
                  textDecoration: p.hecho ? 'line-through' : 'none',
                }}
              >
                {p.texto}
              </span>
              {!p.hecho && (
                <span style={{ display: 'block', fontSize: 11.5, color: C.sub, marginTop: 1 }}>
                  {p.ayuda}
                </span>
              )}
            </span>
            {!p.hecho && (
              <span style={{ fontSize: 13, fontWeight: 800, color: C.terracottaDark }}>→</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
