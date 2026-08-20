import type { CSSProperties } from 'react';
import { C, FONT, gradientFor } from '@/lib/theme';
import { distanceLabel, initials } from '@/lib/format';
import { RatingBadge } from '@/components/ui';
import type { BusinessWithMeta } from '@/types/db';

/**
 * Fondo de la portada: la imagen real si el negocio la cargó, y si no
 * el degradé de su categoría (nunca una URL externa hardcodeada).
 */
export function coverStyle(
  business: Pick<BusinessWithMeta, 'cover_url'> & { category?: { slug: string } | null },
  overlay?: string,
): CSSProperties {
  if (business.cover_url) {
    return {
      backgroundImage: `${overlay ? overlay + ',' : ''}url(${business.cover_url})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    };
  }
  return { background: gradientFor(business.category?.slug) };
}

/**
 * Logo del negocio.
 *
 * Muchos locales todavía no subieron uno, así que el fallback tiene que
 * verse intencional y no como una imagen rota: se muestra el monograma
 * sobre el degradé de la categoría, igual que hacen los avatares.
 */
export function BusinessLogo({
  business,
  size = 56,
  radius = 16,
  border,
}: {
  business: Pick<BusinessWithMeta, 'name' | 'logo_url'> & {
    category?: { slug: string } | null;
  };
  size?: number;
  radius?: number;
  border?: string;
}) {
  const base: CSSProperties = {
    width: size,
    height: size,
    flexShrink: 0,
    borderRadius: radius,
    border,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  };

  if (business.logo_url) {
    return (
      <div
        style={{
          ...base,
          backgroundImage: `url(${business.logo_url})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />
    );
  }

  return (
    <div style={{ ...base, background: gradientFor(business.category?.slug) }}>
      <span
        style={{
          color: '#fff',
          fontFamily: FONT.display,
          fontSize: Math.round(size * 0.38),
          letterSpacing: 0.5,
          textShadow: '0 1px 2px rgba(0,0,0,.25)',
        }}
      >
        {initials(business.name)}
      </span>
    </div>
  );
}

/** Card grande con portada — el bloque "Cerca de vos" del Home. */
export function BusinessCard({
  business,
  onOpen,
}: {
  business: BusinessWithMeta;
  onOpen: () => void;
}) {
  const dist = distanceLabel(business.distance_km);
  const meta = [business.category?.name, business.neighborhood, dist]
    .filter(Boolean)
    .join(' · ');

  return (
    <div
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
      style={{
        background: C.surface,
        border: `1px solid ${C.line}`,
        borderRadius: 16,
        overflow: 'hidden',
        cursor: 'pointer',
      }}
    >
      <div style={{ height: 96, ...coverStyle(business) }} />
      <div
        style={{
          padding: '12px 14px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 15.5,
              fontWeight: 700,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {business.name}
          </div>
          <div style={{ fontSize: 12.5, color: C.sub, marginTop: 2 }}>{meta}</div>
        </div>
        <RatingBadge rating={business.rating_avg} />
      </div>
    </div>
  );
}

/** Fila compacta con miniatura — la lista de "Explorar". */
export function BusinessRow({
  business,
  onOpen,
}: {
  business: BusinessWithMeta;
  onOpen: () => void;
}) {
  const dist = distanceLabel(business.distance_km);

  return (
    <div
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
      style={{
        display: 'flex',
        gap: 12,
        background: C.surface,
        border: `1px solid ${C.line}`,
        borderRadius: 14,
        padding: 10,
        cursor: 'pointer',
        alignItems: 'center',
      }}
    >
      <BusinessLogo business={business} size={56} radius={12} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 15,
            fontWeight: 700,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {business.name}
        </div>
        <div style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>
          {[business.category?.name, business.neighborhood].filter(Boolean).join(' · ')}
        </div>
        {dist && (
          <div style={{ fontSize: 12, color: C.terracottaDark, fontWeight: 600, marginTop: 2 }}>
            {dist} de tu ubicación
          </div>
        )}
      </div>
      <RatingBadge rating={business.rating_avg} />
    </div>
  );
}
