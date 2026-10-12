import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { TopBar } from '@/components/ui';
import { C, FONT } from '@/lib/theme';
import { AYUDA_CLIENTE, AYUDA_DUENIO, PREGUNTAS, type SeccionAyuda } from '@/lib/ayuda';

/**
 * "Cómo se usa": el manual de uso dentro de la app.
 *
 * Se abre desde el perfil del cliente y desde el panel del negocio. Las dos
 * partes están en la misma pantalla porque una cuenta puede ser las dos cosas,
 * pero arranca en la que corresponde a desde dónde se entró.
 *
 * Funciona sin internet: el texto viene en el código y las capturas en el APK.
 */
export function Ayuda({
  inicial,
  backTo,
}: {
  inicial: 'cliente' | 'duenio';
  backTo: string;
}) {
  const navigate = useNavigate();
  const [parte, setParte] = useState(inicial);
  // Una sección abierta por vez: con todas abiertas se pierde el hilo.
  const [abierta, setAbierta] = useState<string | null>(null);

  const secciones = parte === 'cliente' ? AYUDA_CLIENTE : AYUDA_DUENIO;

  const seg = (on: boolean) => ({
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    fontSize: 13,
    fontWeight: 700,
    background: on ? C.surface : 'transparent',
    color: on ? C.terracottaDark : C.sub,
    boxShadow: on ? '0 2px 6px rgba(169,103,76,.12)' : 'none',
  });

  return (
    <div style={{ paddingBottom: 24 }}>
      <TopBar title="Cómo se usa" onBack={() => navigate(backTo)} />

      <div style={{ padding: '4px 20px 0' }}>
        <div style={{ fontSize: 13, color: C.sub, lineHeight: 1.5 }}>
          Elegí qué querés hacer y tocá cada tema para ver los pasos.
        </div>
        <div
          style={{
            display: 'flex',
            background: C.cream,
            borderRadius: 12,
            padding: 3,
            marginTop: 12,
          }}
        >
          <button
            onClick={() => {
              setParte('cliente');
              setAbierta(null);
            }}
            style={seg(parte === 'cliente')}
          >
            Reservar
          </button>
          <button
            onClick={() => {
              setParte('duenio');
              setAbierta(null);
            }}
            style={seg(parte === 'duenio')}
          >
            Mi negocio
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 20px 0' }}>
        {secciones.map((s, i) => (
          <Tema
            key={s.id}
            numero={i + 1}
            seccion={s}
            abierta={abierta === s.id}
            onToggle={() => setAbierta(abierta === s.id ? null : s.id)}
          />
        ))}
      </div>

      <div style={{ padding: '22px 20px 0' }}>
        <div style={{ fontFamily: FONT.display, fontSize: 20, marginBottom: 8 }}>
          Preguntas frecuentes
        </div>
        {PREGUNTAS.map((p) => (
          <div key={p.pregunta} style={{ padding: '10px 0', borderTop: `1px solid ${C.line}` }}>
            <div style={{ fontSize: 13.5, fontWeight: 800 }}>{p.pregunta}</div>
            <div style={{ fontSize: 13, color: '#5C5044', marginTop: 3, lineHeight: 1.5 }}>
              <Formato texto={p.respuesta} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Tema({
  numero,
  seccion,
  abierta,
  onToggle,
}: {
  numero: number;
  seccion: SeccionAyuda;
  abierta: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      style={{
        background: C.surface,
        border: `1px solid ${abierta ? C.terracotta : C.line}`,
        borderRadius: 14,
        overflow: 'hidden',
      }}
    >
      <button
        onClick={onToggle}
        aria-expanded={abierta}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          width: '100%',
          textAlign: 'left',
          padding: '12px 14px',
          minHeight: 56,
        }}
      >
        <span
          aria-hidden
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: abierta ? C.terracotta : C.cream,
            color: abierta ? '#fff' : C.terracottaDark,
            fontSize: 13,
            fontWeight: 800,
          }}
        >
          {numero}
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 14.5, fontWeight: 800 }}>{seccion.titulo}</span>
          <span style={{ display: 'block', fontSize: 12, color: C.sub, marginTop: 1 }}>
            {seccion.resumen}
          </span>
        </span>
        <span
          aria-hidden
          style={{
            color: C.sub,
            fontSize: 18,
            transform: abierta ? 'rotate(90deg)' : 'none',
            transition: 'transform .2s',
          }}
        >
          ›
        </span>
      </button>

      {abierta && (
        <div style={{ padding: '0 14px 14px', borderTop: `1px solid ${C.lineSoft}` }}>
          {seccion.pasos && (
            <ol style={{ listStyle: 'none', padding: 0, margin: '12px 0 0' }}>
              {seccion.pasos.map((p, i) => (
                <li key={i} style={{ display: 'flex', gap: 10, marginBottom: 9 }}>
                  <span
                    aria-hidden
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      flexShrink: 0,
                      background: C.terracotta,
                      color: '#fff',
                      fontSize: 12,
                      fontWeight: 800,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginTop: 1,
                    }}
                  >
                    {i + 1}
                  </span>
                  <span style={{ fontSize: 13.5, lineHeight: 1.5 }}>
                    <Formato texto={p} />
                  </span>
                </li>
              ))}
            </ol>
          )}

          {seccion.puntos && (
            <ul style={{ margin: '12px 0 0', paddingLeft: 18 }}>
              {seccion.puntos.map((p, i) => (
                <li key={i} style={{ fontSize: 13.5, lineHeight: 1.5, marginBottom: 7 }}>
                  <Formato texto={p} />
                </li>
              ))}
            </ul>
          )}

          {seccion.nota && (
            <div
              style={{
                marginTop: 8,
                background: C.warnBg,
                border: `1px solid ${C.warnLine}`,
                borderRadius: 10,
                padding: '9px 12px',
                fontSize: 12.5,
                lineHeight: 1.5,
                color: '#5C5044',
              }}
            >
              <Formato texto={seccion.nota} />
            </div>
          )}

          {seccion.imagen && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
              <img
                src={`/ayuda/${seccion.imagen}.jpg`}
                alt={`Captura: ${seccion.titulo}`}
                loading="lazy"
                style={{
                  width: '62%',
                  maxWidth: 230,
                  borderRadius: 18,
                  border: `5px solid ${C.ink}`,
                  display: 'block',
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * **negrita** y *cursiva*, armado con elementos de React (nunca con HTML):
 * los textos son nuestros, pero así no hay forma de que algo se interprete.
 */
function Formato({ texto }: { texto: string }) {
  const partes: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let ultimo = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto))) {
    if (m.index > ultimo) partes.push(texto.slice(ultimo, m.index));
    partes.push(m[1] ? <strong key={m.index}>{m[1]}</strong> : <em key={m.index}>{m[2]}</em>);
    ultimo = re.lastIndex;
  }
  if (ultimo < texto.length) partes.push(texto.slice(ultimo));
  return <>{partes}</>;
}
