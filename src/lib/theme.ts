/**
 * Tokens visuales extraídos tal cual de `App Reservas.dc.html`.
 * Son constantes de interfaz (permitido por el criterio de limpieza):
 * ningún dato de negocio vive acá.
 */

export const C = {
  /** Terracota principal — botones, chips activos */
  terracotta: '#D98E73',
  /** Terracota oscuro — textos de acento, iconos activos */
  terracottaDark: '#A9674C',
  /** Tinta — texto principal */
  ink: '#3D322B',
  /** Texto secundario */
  sub: '#8C7C6D',
  /** Bordes de cards */
  line: '#EAE0D0',
  /** Línea suave interna (separadores de lista) */
  lineSoft: '#F5EFE3',
  /** Fondo de la app */
  bg: '#FBF7EE',
  /** Fondo del lienzo/degradés */
  bgDeep: '#F1E9DA',
  /** Crema — chips, badges */
  cream: '#F6ECDD',
  /** Blanco de las cards */
  surface: '#FFFFFF',
  /** Dorado de las estrellas */
  gold: '#D99A2B',
  /** Texto deshabilitado / iconos inactivos */
  muted: '#B3A48F',
  mutedSoft: '#A99A86',
  disabled: '#CCBFA9',
  disabledBg: '#F5F0E6',
  /** Rojo de acciones destructivas */
  danger: '#C4554D',
  dangerBg: '#FBEDEC',
  /** Amarillo de la seña */
  warn: '#8A6A1F',
  warnBg: '#FBF6EC',
  warnLine: '#EBD9B4',
  /** Marrón oscuro del panel del dueño */
  brown: '#4E4237',
  sand: '#F2CDA8',
  /** Botón deshabilitado */
  inactive: '#E9D9C4',
  /** Fondo de barras del gráfico */
  bar: '#EBDFC9',
  barTrack: '#F2ECDF',
} as const;

export const FONT = {
  display: 'Marcellus, Georgia, serif',
  sans: 'Figtree, system-ui, -apple-system, sans-serif',
} as const;

/** Degradés por categoría, para negocios que todavía no cargaron portada. */
export const CATEGORY_GRADIENT: Record<string, string> = {
  restaurante: 'linear-gradient(135deg,#D98E73,#8A5A42)',
  cafeteria: 'linear-gradient(135deg,#E8A98C,#996044)',
  barberia: 'linear-gradient(135deg,#8FA98C,#4E6B4F)',
  spa: 'linear-gradient(135deg,#A9C0B8,#5E8378)',
};

export const FALLBACK_GRADIENT = 'linear-gradient(135deg,#D98E73,#8A5A42)';

export function gradientFor(slug?: string | null): string {
  if (!slug) return FALLBACK_GRADIENT;
  return CATEGORY_GRADIENT[slug] ?? FALLBACK_GRADIENT;
}
