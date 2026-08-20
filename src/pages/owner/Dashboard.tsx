import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOwnerBusiness } from '@/context/OwnerBusinessContext';
import { useAsync } from '@/hooks/useAsync';
import { buildInsights, fetchBusinessStats } from '@/services/stats';
import { fetchBusinessReservations } from '@/services/reservations';
import { Loading, StateView, StatusChip } from '@/components/ui';
import { C } from '@/lib/theme';
import { dayShort, shortTime, todayISO } from '@/lib/format';
import { ICONS } from '@/components/BottomNav';

export function OwnerDashboard() {
  const { active, businesses, setActiveId } = useOwnerBusiness();
  const navigate = useNavigate();

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
  const insights = useMemo(() => (stats ? buildInsights(stats) : []), [stats]);

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
          <div style={{ fontSize: 13, color: C.sub }}>Tu negocio</div>
          {businesses.length > 1 ? (
            <select
              value={active.id}
              onChange={(e) => setActiveId(e.target.value)}
              style={{
                fontSize: 20,
                fontWeight: 800,
                border: 'none',
                background: 'transparent',
                padding: '8px 0',
                minHeight: 44,
                maxWidth: '100%',
              }}
            >
              {businesses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
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
          {/* Métricas */}
          <div style={{ display: 'flex', gap: 10, padding: '14px 20px 0' }}>
            <Metric value={String(stats.today_count)} label="Reservas hoy" />
            <Metric
              value={String(stats.pending_count)}
              label="Pendientes"
              accent={stats.pending_count > 0}
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
              Últimas 4 semanas
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
                Todavía no hay suficientes datos para generar recomendaciones.
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
                    r.party_size ? `${r.party_size} personas` : null,
                    r.catalog_item?.name,
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
    </div>
  );
}

function Metric({
  value,
  label,
  accent,
}: {
  value: string;
  label: string;
  accent?: boolean;
}) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        background: C.surface,
        border: `1px solid ${C.line}`,
        borderRadius: 14,
        padding: 12,
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
    </div>
  );
}
