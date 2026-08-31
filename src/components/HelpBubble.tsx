import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import {
  asistenteDisponible,
  preguntarAlAsistente,
  type MensajeChat,
} from '@/services/assistant';
import { Spinner } from '@/components/ui';
import { C, FONT } from '@/lib/theme';

/** Arranques rápidos, distintos según el rol. */
const SUGERENCIAS: Record<'client' | 'owner', string[]> = {
  client: [
    '¿Cómo funcionan las señas?',
    '¿Cuál es mi próxima reserva?',
    'Recomendame un lugar para cenar',
    '¿Puedo cancelar una reserva?',
  ],
  owner: [
    '¿Cómo viene mi semana?',
    '¿Tengo reseñas sin responder?',
    'Ayudame a redactar una promoción',
    '¿Cómo configuro el horario partido?',
  ],
};

/**
 * Burbuja de ayuda con el asistente.
 *
 * Flota sobre la navegación inferior en todas las pantallas. Se oculta sola
 * si el servicio del asistente no está configurado, así la app sigue andando
 * igual sin él.
 */
export function HelpBubble() {
  const { profile } = useAuth();
  const location = useLocation();
  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState<MensajeChat[]>([]);
  const [entrada, setEntrada] = useState('');
  const [pensando, setPensando] = useState(false);
  const [etapa, setEtapa] = useState<'datos' | 'redactando'>('datos');
  const [error, setError] = useState<string | null>(null);

  const finRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Se mira la ruta y no la cuenta: quien tiene los dos modos espera
  // atajos de negocio en el panel y de cliente cuando está explorando.
  const rol: 'client' | 'owner' = location.pathname.startsWith('/panel')
    ? 'owner'
    : 'client';

  // Cada mensaje nuevo lleva la vista al final.
  useEffect(() => {
    finRef.current?.scrollIntoView({ block: 'end' });
  }, [mensajes, pensando]);

  // Si se cierra el chat mientras responde, se corta el pedido.
  useEffect(() => {
    if (!abierto) {
      abortRef.current?.abort();
      abortRef.current = null;
    }
  }, [abierto]);

  useEffect(() => () => abortRef.current?.abort(), []);

  if (!asistenteDisponible || !profile) return null;

  async function enviar(texto: string) {
    const pregunta = texto.trim();
    if (!pregunta || pensando) return;

    setError(null);
    setEntrada('');

    const hilo: MensajeChat[] = [...mensajes, { role: 'user', content: pregunta }];
    // Se agrega la burbuja vacía del asistente y se va llenando con el stream.
    setMensajes([...hilo, { role: 'assistant', content: '' }]);
    setEtapa('datos');
    setPensando(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await preguntarAlAsistente(
        hilo,
        // El mismo `rol` que decide los atajos decide de qué te habla: en el
        // panel responde como asesor del negocio, en la app como cliente.
        rol,
        (fragmento) => {
          setMensajes((prev) => {
            const copia = [...prev];
            const ultimo = copia[copia.length - 1];
            if (ultimo?.role === 'assistant') {
              copia[copia.length - 1] = { ...ultimo, content: ultimo.content + fragmento };
            }
            return copia;
          });
        },
        controller.signal,
        () => setEtapa('redactando'),
      );
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'El asistente tuvo un problema.');
      // Se saca la burbuja vacía para no dejar un globo en blanco.
      setMensajes((prev) => {
        const ultimo = prev[prev.length - 1];
        return ultimo?.role === 'assistant' && !ultimo.content ? prev.slice(0, -1) : prev;
      });
    } finally {
      setPensando(false);
      abortRef.current = null;
    }
  }

  return (
    <>
      {/* Botón flotante */}
      <button
        onClick={() => setAbierto(true)}
        aria-label="Abrir el asistente"
        style={{
          position: 'fixed',
          right: 16,
          bottom: `calc(78px + var(--safe-bottom))`,
          zIndex: 800,
          width: 54,
          height: 54,
          borderRadius: '50%',
          background: C.terracotta,
          boxShadow: '0 8px 22px rgba(169,103,76,.45)',
          display: abierto ? 'none' : 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z"
            fill="#fff"
          />
          <path d="M12 6l1.3 3.7L17 11l-3.7 1.3L12 16l-1.3-3.7L7 11l3.7-1.3z" fill={C.terracotta} />
        </svg>
      </button>

      {abierto && (
        <div
          onClick={() => setAbierto(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: 'rgba(45,34,26,.45)',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 520,
              height: '82dvh',
              background: C.bg,
              borderRadius: '22px 22px 0 0',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Cabecera */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '14px 16px',
                borderBottom: `1px solid ${C.line}`,
                background: C.surface,
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: '50%',
                  background: C.cream,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path d="M12 2l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" fill={C.terracotta} />
                </svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 800 }}>Asistente</div>
                <div style={{ fontSize: 11.5, color: C.sub }}>
                  Responde sobre tus datos en la app
                </div>
              </div>
              <button
                onClick={() => setAbierto(false)}
                aria-label="Cerrar"
                style={{
                  width: 40,
                  height: 40,
                  flexShrink: 0,
                  borderRadius: '50%',
                  border: `1px solid ${C.line}`,
                  background: C.surface,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24">
                  <path
                    d="M19 6.4 17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12z"
                    fill={C.ink}
                  />
                </svg>
              </button>
            </div>

            {/* Conversación */}
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px' }}>
              {mensajes.length === 0 && (
                <div>
                  <div
                    style={{
                      fontFamily: FONT.display,
                      fontSize: 21,
                      marginBottom: 6,
                    }}
                  >
                    ¿En qué te ayudo?
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: C.sub,
                      lineHeight: 1.5,
                      marginBottom: 16,
                    }}
                  >
                    Puedo responder sobre tus reservas, los negocios y cómo usar la app.
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {SUGERENCIAS[rol].map((s) => (
                      <button
                        key={s}
                        onClick={() => void enviar(s)}
                        style={{
                          textAlign: 'left',
                          background: C.surface,
                          border: `1px solid ${C.line}`,
                          borderRadius: 12,
                          padding: '13px 15px',
                          fontSize: 13.5,
                          color: C.ink,
                          minHeight: 46,
                        }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {mensajes.map((m, i) => (
                  <div
                    key={i}
                    style={{
                      alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                      maxWidth: '86%',
                      background: m.role === 'user' ? C.terracotta : C.surface,
                      color: m.role === 'user' ? '#fff' : C.ink,
                      border: m.role === 'user' ? 'none' : `1px solid ${C.line}`,
                      borderRadius:
                        m.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                      padding: '11px 14px',
                      fontSize: 14,
                      lineHeight: 1.5,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {m.content ||
                      (pensando && i === mensajes.length - 1 ? (
                        <span
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            color: C.sub,
                            fontSize: 13,
                          }}
                        >
                          <Spinner size={14} />
                          {etapa === 'datos' ? 'Revisando tus datos…' : 'Escribiendo…'}
                        </span>
                      ) : null)}
                  </div>
                ))}
              </div>

              {error && (
                <div
                  role="alert"
                  style={{
                    marginTop: 12,
                    background: C.dangerBg,
                    color: C.danger,
                    borderRadius: 12,
                    padding: '11px 14px',
                    fontSize: 13,
                    fontWeight: 600,
                    lineHeight: 1.45,
                  }}
                >
                  {error}
                </div>
              )}

              <div ref={finRef} />
            </div>

            {/* Entrada */}
            <div
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'flex-end',
                padding: `10px 12px calc(10px + var(--safe-bottom))`,
                borderTop: `1px solid ${C.line}`,
                background: C.surface,
                flexShrink: 0,
              }}
            >
              <textarea
                value={entrada}
                onChange={(e) => setEntrada(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void enviar(entrada);
                  }
                }}
                rows={1}
                placeholder="Escribí tu consulta…"
                style={{
                  flex: 1,
                  minWidth: 0,
                  minHeight: 46,
                  maxHeight: 120,
                  resize: 'none',
                  border: `1.5px solid ${C.line}`,
                  borderRadius: 14,
                  padding: '12px 14px',
                  fontSize: 16,
                  fontFamily: FONT.sans,
                  background: C.bg,
                }}
              />
              <button
                onClick={() => void enviar(entrada)}
                disabled={pensando || !entrada.trim()}
                aria-label="Enviar"
                style={{
                  width: 46,
                  height: 46,
                  flexShrink: 0,
                  borderRadius: 14,
                  background: pensando || !entrada.trim() ? C.inactive : C.terracotta,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {pensando ? (
                  <Spinner size={17} color="#fff" />
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24">
                    <path d="M2 21l21-9L2 3v7l15 2-15 2z" fill="#fff" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
