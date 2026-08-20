import { useCallback, useRef, useState } from 'react';
import { C, FONT } from '@/lib/theme';

interface Pedido {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

/**
 * Confirmación dentro de la app.
 *
 * Reemplaza a `window.confirm`, que en Android abre el diálogo nativo del
 * sistema: sale en inglés, ignora la tipografía y los colores, y corta la
 * sensación de app propia.
 */
export function useConfirm() {
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback((p: Pedido) => {
    setPedido(p);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const cerrar = useCallback((ok: boolean) => {
    setPedido(null);
    resolver.current?.(ok);
    resolver.current = null;
  }, []);

  const node = pedido ? (
    <div
      role="dialog"
      aria-modal="true"
      onClick={() => cerrar(false)}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1100,
        background: 'rgba(45,34,26,.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 340,
          background: C.surface,
          borderRadius: 20,
          padding: '22px 22px 18px',
          boxShadow: '0 18px 50px rgba(61,50,43,.32)',
          animation: 'fadeUp .2s ease-out forwards',
        }}
      >
        <div style={{ fontFamily: FONT.display, fontSize: 20, lineHeight: 1.3 }}>
          {pedido.title}
        </div>

        {pedido.message && (
          <div
            style={{
              fontSize: 13.5,
              color: C.sub,
              lineHeight: 1.5,
              marginTop: 8,
            }}
          >
            {pedido.message}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 20 }}>
          <button
            onClick={() => cerrar(true)}
            style={{
              width: '100%',
              minHeight: 48,
              borderRadius: 14,
              background: pedido.danger ? C.danger : C.terracotta,
              color: '#fff',
              fontSize: 15.5,
              fontWeight: 800,
            }}
          >
            {pedido.confirmLabel ?? 'Confirmar'}
          </button>

          <button
            onClick={() => cerrar(false)}
            style={{
              width: '100%',
              minHeight: 48,
              borderRadius: 14,
              border: `1.5px solid ${C.line}`,
              background: C.surface,
              color: C.sub,
              fontSize: 15,
              fontWeight: 700,
            }}
          >
            {pedido.cancelLabel ?? 'Volver'}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { confirm, node };
}
