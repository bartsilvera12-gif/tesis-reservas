import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useAsync } from '@/hooks/useAsync';
import { useGeolocation } from '@/hooks/useGeolocation';
import { fetchBusinesses } from '@/services/businesses';
import { fetchActivePromotions } from '@/services/promotions';
import { supabase } from '@/lib/supabase';
import { BusinessCard, BusinessLogo } from '@/components/BusinessCard';
import { Loading, SectionHeader, StateView, RatingBadge } from '@/components/ui';
import { C, FONT, gradientFor } from '@/lib/theme';
import { greeting } from '@/lib/format';
import { ICONS } from '@/components/BottomNav';
import type { BusinessWithMeta, Promotion } from '@/types/db';

export function Home() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { coords } = useGeolocation();

  const businessesQuery = useAsync(
    () => fetchBusinesses({ coords, limit: 20 }),
    [coords?.lat, coords?.lng],
  );

  const promosQuery = useAsync(() => fetchActivePromotions(6), []);

  const businesses = useMemo(() => businessesQuery.data ?? [], [businessesQuery.data]);
  const promos = useMemo(() => promosQuery.data ?? [], [promosQuery.data]);

  /**
   * Recomendaciones "Para vos": reglas simples sobre datos reales
   * (categorías ya reservadas + mejor puntuados). Sin IA externa.
   */
  const recsQuery = useAsync(async () => {
    const { data, error } = await supabase.rpc('recommended_businesses', { p_limit: 2 });
    if (error) return [] as { business_id: string; reason: string }[];
    return (data ?? []) as { business_id: string; reason: string }[];
  }, []);

  const recs = useMemo(() => {
    const rows = recsQuery.data ?? [];
    return rows
      .map((r) => {
        const business = businesses.find((b) => b.id === r.business_id);
        return business ? { business, reason: r.reason } : null;
      })
      .filter((x): x is { business: BusinessWithMeta; reason: string } => x !== null);
  }, [recsQuery.data, businesses]);

  const openBusiness = useCallback(
    (id: string) => navigate(`/app/negocio/${id}`),
    [navigate],
  );

  const loading = businessesQuery.loading && !businessesQuery.data;

  return (
    <div style={{ paddingBottom: 24 }}>
      {/* Saludo con el nombre real del usuario */}
      <div
        style={{
          padding: '18px 20px 8px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, color: C.sub }}>{greeting()},</div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 800,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {profile?.full_name?.split(' ')[0] || 'Hola'}
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: C.cream,
            borderRadius: 999,
            padding: '7px 12px',
            flexShrink: 0,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24">
            <path d={ICONS.location} fill={C.terracottaDark} />
          </svg>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.terracottaDark }}>
            {profile?.city || 'Asunción'}
          </span>
        </div>
      </div>

      <PromoBanner promos={promos} onOpen={openBusiness} />

      {/* Recomendaciones */}
      {recs.length > 0 && (
        <div
          style={{
            margin: '20px 20px 0',
            background: C.surface,
            border: `1px solid ${C.line}`,
            borderRadius: 16,
            padding: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <svg width="16" height="16" viewBox="0 0 24 24">
              <path d={ICONS.sparkle} fill={C.terracotta} />
            </svg>
            <span
              style={{
                fontSize: 13,
                fontWeight: 800,
                color: C.terracottaDark,
                letterSpacing: '.3px',
              }}
            >
              Para vos
            </span>
          </div>

          {recs.map(({ business, reason }) => (
            <div
              key={business.id}
              onClick={() => openBusiness(business.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && openBusiness(business.id)}
              style={{
                display: 'flex',
                gap: 12,
                alignItems: 'center',
                padding: '9px 0',
                borderTop: `1px solid ${C.lineSoft}`,
                cursor: 'pointer',
              }}
            >
              <BusinessLogo business={business} size={42} radius={12} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 14.5,
                    fontWeight: 700,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {business.name}
                </div>
                <div style={{ fontSize: 12, color: C.sub, marginTop: 1 }}>{reason}</div>
              </div>
              <RatingBadge rating={business.rating_avg} />
            </div>
          ))}
        </div>
      )}

      <SectionHeader
        title="Cerca de vos"
        action="Ver todo"
        onAction={() => navigate('/app/explorar')}
      />

      {loading ? (
        <Loading label="Buscando lugares…" />
      ) : businessesQuery.error ? (
        <StateView
          tone="error"
          title="No pudimos cargar los negocios."
          detail={businessesQuery.error}
          actionLabel="Reintentar"
          onAction={businessesQuery.reload}
        />
      ) : businesses.length === 0 ? (
        <StateView
          title="Todavía no hay negocios"
          detail="Cuando se sumen locales a la plataforma los vas a ver acá."
        />
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            padding: '0 20px 8px',
          }}
        >
          {businesses.slice(0, 6).map((b) => (
            <BusinessCard key={b.id} business={b} onOpen={() => openBusiness(b.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Carrusel de promociones activas — reemplaza el banner hardcodeado. */
function PromoBanner({
  promos,
  onOpen,
}: {
  promos: Promotion[];
  onOpen: (businessId: string) => void;
}) {
  const [index, setIndex] = useState(0);
  const pistaRef = useRef<HTMLDivElement | null>(null);
  /** Mientras el dedo está apoyado no queremos que el autoplay pelee el scroll. */
  const tocando = useRef(false);

  const irA = useCallback((i: number) => {
    const pista = pistaRef.current;
    if (!pista) return;
    pista.scrollTo({ left: i * pista.clientWidth, behavior: 'smooth' });
  }, []);

  // Autoplay: avanza sólo si el usuario no está deslizando.
  useEffect(() => {
    if (promos.length <= 1) return;
    const timer = setInterval(() => {
      if (tocando.current) return;
      const pista = pistaRef.current;
      if (!pista) return;
      const siguiente = (Math.round(pista.scrollLeft / pista.clientWidth) + 1) % promos.length;
      pista.scrollTo({ left: siguiente * pista.clientWidth, behavior: 'smooth' });
    }, 4500);
    return () => clearInterval(timer);
  }, [promos.length]);

  // El indicador se sincroniza con el scroll real, venga del dedo o del autoplay.
  const onScroll = useCallback(() => {
    const pista = pistaRef.current;
    if (!pista || !pista.clientWidth) return;
    const i = Math.round(pista.scrollLeft / pista.clientWidth);
    setIndex((prev) => (prev === i ? prev : i));
  }, []);

  if (!promos.length) return null;

  return (
    <div
      style={{
        margin: '12px 20px 0',
        borderRadius: 18,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <div
        ref={pistaRef}
        onScroll={onScroll}
        onTouchStart={() => { tocando.current = true; }}
        onTouchEnd={() => { tocando.current = false; }}
        onTouchCancel={() => { tocando.current = false; }}
        style={{
          display: 'flex',
          // Scroll nativo con snap: deslizar con el dedo funciona igual que en
          // cualquier app, con inercia, en vez de depender sólo de los puntos.
          overflowX: 'auto',
          scrollSnapType: 'x mandatory',
          scrollBehavior: 'smooth',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {promos.map((p) => {
          const cover = p.image_url ?? p.business?.cover_url ?? null;
          const overlay =
            'linear-gradient(180deg,rgba(40,22,12,.35),rgba(40,22,12,.72))';

          return (
            <div
              key={p.id}
              onClick={() => p.business && onOpen(p.business.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && p.business && onOpen(p.business.id)}
              style={{
                minWidth: '100%',
                scrollSnapAlign: 'start',
                padding: '20px 22px 18px',
                color: '#fff',
                cursor: 'pointer',
                textShadow: '0 1px 2px rgba(0,0,0,.3)',
                ...(cover
                  ? {
                      backgroundImage: `${overlay},url(${cover})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }
                  : { background: gradientFor(undefined) }),
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '1px',
                  textTransform: 'uppercase',
                  opacity: 0.8,
                }}
              >
                {p.unlimited || !p.ends_at
                  ? 'Sin vencimiento'
                  : `Hasta el ${new Date(p.ends_at).getDate()}/${
                      new Date(p.ends_at).getMonth() + 1
                    }`}
              </div>
              <div style={{ fontFamily: FONT.display, fontSize: 24, marginTop: 6 }}>
                {p.title}
              </div>
              <div style={{ fontSize: 13, opacity: 0.9, marginTop: 4 }}>
                {p.description ?? p.business?.name ?? ''}
              </div>
              <div
                style={{
                  marginTop: 14,
                  display: 'inline-block',
                  background: 'rgba(255,255,255,.2)',
                  border: '1px solid rgba(255,255,255,.45)',
                  borderRadius: 999,
                  padding: '6px 14px',
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                Ver negocio
              </div>
            </div>
          );
        })}
      </div>

      {promos.length > 1 && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            right: 10,
            display: 'flex',
            gap: 0,
          }}
        >
          {promos.map((p, i) => (
            <button
              key={p.id}
              aria-label={`Promoción ${i + 1}`}
              onClick={() => irA(i)}
              // El punto se ve chico pero el área tocable es más grande: a 24px
              // de ancho el dedo cae seguido entre dos puntos.
              style={{
                width: 36,
                height: 44,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span
                style={{
                  display: 'block',
                  width: i === index ? 18 : 6,
                  height: 6,
                  borderRadius: 3,
                  background: i === index ? '#fff' : 'rgba(255,255,255,.5)',
                  transition: 'width .3s',
                }}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
