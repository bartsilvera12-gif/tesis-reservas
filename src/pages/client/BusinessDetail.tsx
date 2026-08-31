import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAsync } from '@/hooks/useAsync';
import { useGeolocation } from '@/hooks/useGeolocation';
import {
  fetchBusinessById,
  fetchBusinessHours,
  fetchCatalog,
} from '@/services/businesses';
import { fetchBusinessReviews } from '@/services/reviews';
import { fetchBusinessPromotions } from '@/services/promotions';
import { BusinessLogo, coverStyle } from '@/components/BusinessCard';
import { Button, Loading, StateView, Stars } from '@/components/ui';
import { C, FONT } from '@/lib/theme';
import {
  dayShort,
  distanceLabel,
  initials,
  money,
  shortTime,
  timeAgo,
} from '@/lib/format';
import { ICONS } from '@/components/BottomNav';
import type { BusinessHour, CatalogItem } from '@/types/db';

type Tab = 'carta' | 'resenas' | 'info';

export function BusinessDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { coords } = useGeolocation();
  const [tab, setTab] = useState<Tab>('carta');

  const bizQuery = useAsync(() => fetchBusinessById(id, coords), [id, coords?.lat]);
  const catalogQuery = useAsync(() => fetchCatalog(id), [id]);
  const reviewsQuery = useAsync(() => fetchBusinessReviews(id), [id]);
  const hoursQuery = useAsync(() => fetchBusinessHours(id), [id]);
  const promoQuery = useAsync(() => fetchBusinessPromotions(id, true), [id]);

  const business = bizQuery.data;
  const catalog = useMemo(() => catalogQuery.data ?? [], [catalogQuery.data]);
  const reviews = useMemo(() => reviewsQuery.data ?? [], [reviewsQuery.data]);
  const promo = (promoQuery.data ?? [])[0] ?? null;

  if (bizQuery.loading && !business) return <Loading label="Cargando negocio…" />;

  if (bizQuery.error) {
    return (
      <StateView
        tone="error"
        title="No pudimos cargar el negocio."
        detail={bizQuery.error}
        actionLabel="Reintentar"
        onAction={bizQuery.reload}
      />
    );
  }

  if (!business) {
    return (
      <StateView
        title="No encontramos este negocio"
        detail="Puede que ya no esté disponible."
        actionLabel="Volver"
        onAction={() => navigate('/app/explorar')}
      />
    );
  }

  const meta = [
    business.category?.name,
    business.neighborhood,
    distanceLabel(business.distance_km),
  ]
    .filter(Boolean)
    .join(' · ');

  const depositText = business.deposit_enabled
    ? `Seña de ${money(business.deposit_amount)}${
        business.deposit_per_person ? ' por persona' : ''
      } · reembolsable`
    : 'Reserva sin seña';

  const tabStyle = (on: boolean) => ({
    padding: '11px 2px',
    fontSize: 14,
    fontWeight: on ? 800 : 600,
    color: on ? C.terracottaDark : C.sub,
    borderBottom: `2.5px solid ${on ? C.terracotta : 'transparent'}`,
    marginBottom: -1.5,
  });

  return (
    <div style={{ background: C.surface, minHeight: '100%' }}>
      {/* Portada */}
      <div style={{ height: 170, position: 'relative', ...coverStyle(business) }}>
        <button
          onClick={() => navigate(-1)}
          aria-label="Volver"
          style={{
            position: 'absolute',
            top: 12,
            left: 12,
            width: 44,
            height: 44,
            borderRadius: '50%',
            background: 'rgba(255,255,255,.92)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path d="M15.4 7.4 14 6l-6 6 6 6 1.4-1.4L10.8 12z" fill={C.ink} />
          </svg>
        </button>
      </div>

      <div style={{ padding: '0 20px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            marginTop: -30,
            position: 'relative',
            zIndex: 5,
          }}
        >
          <div style={{ boxShadow: '0 4px 12px rgba(0,0,0,.12)', borderRadius: 16 }}>
            <BusinessLogo business={business} size={56} border="3px solid #fff" />
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              background: C.bg,
              border: `1px solid ${C.line}`,
              borderRadius: 999,
              padding: '6px 12px',
              fontSize: 13,
              fontWeight: 800,
            }}
          >
            {business.rating_avg != null ? (
              <>
                <span style={{ color: C.gold }}>★</span>
                {business.rating_avg.toFixed(1)}
                <span style={{ color: C.sub, fontWeight: 500 }}>
                  ({business.reviews_count})
                </span>
              </>
            ) : (
              <span style={{ color: C.sub, fontWeight: 600, fontSize: 12 }}>Sin reseñas</span>
            )}
          </div>
        </div>

        <div style={{ fontFamily: FONT.display, fontSize: 26, marginTop: 10 }}>
          {business.name}
        </div>
        <div style={{ fontSize: 13, color: C.sub, marginTop: 3 }}>{meta}</div>

        {business.description && (
          <div style={{ fontSize: 13.5, color: '#5C5044', lineHeight: 1.55, marginTop: 10 }}>
            {business.description}
          </div>
        )}

        {promo && (
          <div
            style={{
              marginTop: 12,
              display: 'flex',
              gap: 10,
              alignItems: 'center',
              background: C.cream,
              border: `1px dashed ${C.terracotta}`,
              borderRadius: 12,
              padding: '10px 14px',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
              <path d={ICONS.tag} fill={C.terracottaDark} />
            </svg>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: C.terracottaDark }}>
                {promo.title}
              </div>
              <div style={{ fontSize: 11.5, color: C.sub }}>
                {promo.description ??
                  (promo.unlimited || !promo.ends_at
                    ? 'Sin vencimiento'
                    : `Hasta el ${new Date(promo.ends_at).toLocaleDateString('es-PY')}`)}
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div
          style={{
            display: 'flex',
            gap: 22,
            borderBottom: `1.5px solid ${C.line}`,
            marginTop: 18,
          }}
        >
          <button onClick={() => setTab('carta')} style={tabStyle(tab === 'carta')}>
            {business.reservation_type === 'service' || business.reservation_type === 'slot'
              ? 'Servicios'
              : 'Carta'}
          </button>
          <button onClick={() => setTab('resenas')} style={tabStyle(tab === 'resenas')}>
            Reseñas
          </button>
          <button onClick={() => setTab('info')} style={tabStyle(tab === 'info')}>
            Info
          </button>
        </div>

        {tab === 'carta' && (
          <CatalogTab items={catalog} loading={catalogQuery.loading} />
        )}

        {tab === 'resenas' && (
          <div style={{ padding: '10px 0 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {reviewsQuery.loading && !reviewsQuery.data ? (
              <Loading label="" />
            ) : reviews.length === 0 ? (
              <div
                style={{
                  fontSize: 13.5,
                  color: C.sub,
                  textAlign: 'center',
                  padding: '20px 0',
                  lineHeight: 1.5,
                }}
              >
                Todavía no hay reseñas.
                <br />
                Si ya viniste, contanos cómo te fue.
              </div>
            ) : (
              reviews.map((r) => (
                <div key={r.id}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <div
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: '50%',
                        background: C.cream,
                        color: C.terracottaDark,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 12.5,
                        fontWeight: 800,
                        flexShrink: 0,
                      }}
                    >
                      {initials(r.client?.full_name)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700 }}>
                        {r.client?.full_name || 'Cliente'}
                      </div>
                      <Stars rating={r.rating} />
                    </div>
                    <div style={{ fontSize: 11, color: C.mutedSoft, flexShrink: 0 }}>
                      {timeAgo(r.created_at)}
                    </div>
                  </div>

                  {r.comment && (
                    <div
                      style={{
                        fontSize: 13,
                        color: '#5C5044',
                        lineHeight: 1.5,
                        marginTop: 6,
                      }}
                    >
                      {r.comment}
                    </div>
                  )}

                  {r.owner_reply && (
                    <div
                      style={{
                        margin: '8px 0 0 16px',
                        background: C.bg,
                        borderLeft: `2.5px solid ${C.terracotta}`,
                        borderRadius: '0 10px 10px 0',
                        padding: '9px 12px',
                      }}
                    >
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 800,
                          color: C.terracottaDark,
                          letterSpacing: '.5px',
                        }}
                      >
                        RESPUESTA DEL LOCAL
                      </div>
                      <div
                        style={{
                          fontSize: 12.5,
                          color: '#5C5044',
                          lineHeight: 1.5,
                          marginTop: 3,
                        }}
                      >
                        {r.owner_reply}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}

            <button
              onClick={() => navigate(`/app/negocio/${id}/resena`)}
              style={{
                textAlign: 'center',
                fontSize: 13,
                fontWeight: 700,
                color: C.terracottaDark,
                padding: 12,
                border: `1.5px solid ${C.line}`,
                borderRadius: 12,
                width: '100%',
              }}
            >
              Escribir una reseña
            </button>
          </div>
        )}

        {tab === 'info' && (
          <InfoTab
            hours={hoursQuery.data ?? []}
            loading={hoursQuery.loading}
            address={[business.address, business.neighborhood, business.city]
              .filter(Boolean)
              .join(', ')}
            phone={business.phone}
            depositText={depositText}
          />
        )}

        <div style={{ height: 20 }} />
      </div>

      {/* Barra fija de acción */}
      <div
        style={{
          position: 'sticky',
          bottom: 0,
          padding: '12px 20px',
          background: C.surface,
          borderTop: `1px solid ${C.line}`,
        }}
      >
        <Button onClick={() => navigate(`/app/negocio/${id}/reservar`)}>Reservar</Button>
      </div>
    </div>
  );
}

function CatalogTab({ items, loading }: { items: CatalogItem[]; loading: boolean }) {
  if (loading && !items.length) return <Loading label="" />;

  if (!items.length) {
    return (
      <div
        style={{
          fontSize: 13.5,
          color: C.sub,
          textAlign: 'center',
          padding: '28px 0',
        }}
      >
        Este negocio todavía no cargó su carta.
      </div>
    );
  }

  return (
    <div style={{ padding: '6px 0 16px' }}>
      {items.map((item) => (
        <div
          key={item.id}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            gap: 12,
            padding: '12px 0',
            borderBottom: `1px solid ${C.lineSoft}`,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 600 }}>{item.name}</div>
            <div style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>
              {[
                item.category?.name,
                item.duration_minutes ? `${item.duration_minutes} min` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </div>
          </div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: C.terracottaDark,
              flexShrink: 0,
            }}
          >
            {money(item.price)}
          </div>
        </div>
      ))}
    </div>
  );
}

function InfoTab({
  hours,
  loading,
  address,
  phone,
  depositText,
}: {
  hours: BusinessHour[];
  loading: boolean;
  address: string;
  phone: string | null;
  depositText: string;
}) {
  const rows: { icon: string; text: string }[] = [];

  if (address) rows.push({ icon: ICONS.location, text: address });
  if (phone) rows.push({ icon: 'M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.24 11.4 11.4 0 0 0 3.6.58 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 11.4 11.4 0 0 0 .58 3.6 1 1 0 0 1-.25 1z', text: phone });
  rows.push({ icon: ICONS.tag, text: depositText });

  return (
    <div style={{ padding: '14px 0 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <div
          style={{
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            fontSize: 13.5,
            color: '#5C5044',
            fontWeight: 700,
            marginBottom: 8,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24">
            <path d={ICONS.clock} fill={C.terracottaDark} />
          </svg>
          Horarios
        </div>

        {loading && !hours.length ? (
          <Loading label="" />
        ) : (
          <div style={{ paddingLeft: 26 }}>
            {[1, 2, 3, 4, 5, 6, 0].map((dow) => {
              const day = hours.find((h) => h.day_of_week === dow);
              const open = day?.enabled && (day.slots?.length ?? 0) > 0;
              const text = open
                ? day!.slots
                    .map((s) => `${shortTime(s.opens_at)}–${shortTime(s.closes_at)}`)
                    .join(' · ')
                : 'Cerrado';

              return (
                <div
                  key={dow}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 12,
                    padding: '5px 0',
                    fontSize: 13,
                  }}
                >
                  <span style={{ fontWeight: 600, width: 44, flexShrink: 0 }}>
                    {dayShort(dow)}
                  </span>
                  <span
                    style={{
                      color: open ? '#5C5044' : C.disabled,
                      textAlign: 'right',
                    }}
                  >
                    {text}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {rows.map((row, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            fontSize: 13.5,
            color: '#5C5044',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
            <path d={row.icon} fill={C.terracottaDark} />
          </svg>
          {row.text}
        </div>
      ))}
    </div>
  );
}
