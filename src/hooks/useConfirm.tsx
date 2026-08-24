import { useCallback, useRef, useState } from 'react';
import { C, FONT } from '@/lib/theme';

interface Pedido {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  /** Si se define, el diálogo pide además un texto libre (ej. un motivo). */
  prompt?: { label: string; placeholder?: string; maxLength?: number };
}

/**
 * Lo que devuelve el diálogo.
 *
 * `texto` sólo viene cuando el pedido incluía `prompt`. Se deja vacío si el
 * usuario no escribió nada: el motivo es opcional, no queremos bloquear a
 * alguien que sólo quiere rechazar y seguir.
 */
export interface Respuesta {
  ok: boolean;
  texto: string;
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
  const [texto, setTexto] = useState('');
  const resolver = useRef<((r: Respuesta) => void) | null>(null);

  const confirm = useCallback((p: Pedido) => {
    setTexto('');
    setPedido(p);
    return new Promise<Respuesta>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const cerrar = useCallback(
    (ok: boolean) => {
      setPedido(null);
      resolver.current?.({ ok, texto: texto.trim() });
      resolver.current = null;
      setTexto('');
    },
    [texto],
  );

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

        {pedido.prompt && (
          <div style={{ marginTop: 14 }}>
            <label
              htmlFor="confirm-prompt"
              style={{ fontSize: 12.5, fontWeight: 700, display: 'block', marginBottom: 6 }}
            >
              {pedido.prompt.label}
            </label>
            <textarea
              id="confirm-prompt"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={3}
              maxLength={pedido.prompt.maxLength ?? 200}
              placeholder={pedido.prompt.placeholder}
              style={{
                width: '100%',
                resize: 'none',
                border: `1.5px solid ${C.line}`,
                borderRadius: 12,
                padding: '10px 12px',
                // 16px evita que iOS haga zoom al enfocar el campo.
                fontSize: 16,
                fontFamily: FONT.sans,
                background: C.bg,
                color: C.ink,
              }}
            />
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
