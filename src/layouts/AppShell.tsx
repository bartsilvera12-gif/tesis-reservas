import type { ReactNode } from 'react';
import { C } from '@/lib/theme';

/**
 * Contenedor único de la app.
 *
 * A diferencia del prototipo (que dibujaba dos teléfonos de 400x860 lado a
 * lado), acá hay UNA sola interfaz que ocupa toda la pantalla del dispositivo.
 * En pantallas anchas se centra con un ancho máximo para que siga leyéndose
 * como una app móvil.
 */
export function AppShell({
  children,
  nav,
  background = C.bg,
}: {
  children: ReactNode;
  nav?: ReactNode;
  background?: string;
}) {
  return (
    <div
      style={{
        width: '100%',
        // Altura fija (no minHeight): es lo que acota el alto del <main> para
        // que scrollee por dentro y la navegación quede clavada abajo.
        height: '100dvh',
        overflow: 'hidden',
        display: 'flex',
        justifyContent: 'center',
        background: C.bgDeep,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 520,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Respeta la barra de estado de Android */}
        <div style={{ height: 'var(--safe-top)', flexShrink: 0, background }} />

        <main
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            overflowX: 'hidden',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {children}
        </main>

        {nav}
      </div>
    </div>
  );
}
