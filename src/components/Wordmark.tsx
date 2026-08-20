import { C, FONT } from '@/lib/theme';

/** Nombre de la app. Un solo lugar para que no se desincronice. */
export const APP_NAME = 'AJ Spots';

/**
 * Logotipo tipográfico.
 *
 * Mantiene el tratamiento del prototipo: Marcellus con el punto en terracota.
 */
export function Wordmark({
  size = 42,
  color = C.ink,
}: {
  size?: number;
  color?: string;
}) {
  return (
    <span
      style={{
        fontFamily: FONT.display,
        fontSize: size,
        color,
        letterSpacing: '.5px',
        lineHeight: 1.1,
        whiteSpace: 'nowrap',
      }}
    >
      AJ Spots<span style={{ color: C.terracotta }}>.</span>
    </span>
  );
}
