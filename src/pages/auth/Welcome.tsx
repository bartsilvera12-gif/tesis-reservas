import { useNavigate } from 'react-router-dom';
import { AppShell } from '@/layouts/AppShell';
import { C } from '@/lib/theme';
import { Wordmark } from '@/components/Wordmark';

/**
 * Bienvenida. Mismo diseño que el prototipo, pero ahora los dos caminos
 * llevan al registro real con el rol preseleccionado (un único login).
 */
export function Welcome() {
  const navigate = useNavigate();

  return (
    <AppShell background="#fff">
      <div
        style={{
          minHeight: '100%',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: 32,
          gap: 12,
          background: 'linear-gradient(180deg,#FFFFFF 0%,#F6ECDD 100%)',
        }}
      >
        <div>
          <Wordmark size={42} />
        </div>
        <div
          style={{
            fontSize: 15,
            color: C.sub,
            lineHeight: 1.5,
            marginBottom: 20,
          }}
        >
          Tu mesa, tu turno, tu momento.
          <br />
          Reservas fáciles en todo Paraguay.
        </div>

        <button
          onClick={() => navigate('/registro?tipo=client')}
          style={{
            textAlign: 'left',
            background: C.terracotta,
            color: '#fff',
            borderRadius: 16,
            padding: '18px 20px',
            boxShadow: '0 8px 24px rgba(217,142,115,.35)',
          }}
        >
          <div style={{ fontSize: 17, fontWeight: 700 }}>Soy Cliente</div>
          <div style={{ fontSize: 13, opacity: 0.85, marginTop: 2 }}>
            Descubrí y reservá lugares cerca tuyo
          </div>
        </button>

        <button
          onClick={() => navigate('/registro?tipo=owner')}
          style={{
            textAlign: 'left',
            background: '#fff',
            border: `1.5px solid ${C.line}`,
            borderRadius: 16,
            padding: '18px 20px',
          }}
        >
          <div style={{ fontSize: 17, fontWeight: 700, color: C.terracottaDark }}>
            Tengo un negocio
          </div>
          <div style={{ fontSize: 13, color: C.sub, marginTop: 2 }}>
            Administrá reservas, carta y promociones
          </div>
        </button>

        <div
          style={{
            textAlign: 'center',
            fontSize: 13,
            color: C.sub,
            marginTop: 16,
          }}
        >
          ¿Ya tenés cuenta?{' '}
          <button
            onClick={() => navigate('/ingresar')}
            style={{ color: C.terracottaDark, fontWeight: 700, fontSize: 13, display: 'inline-block', padding: '13px 10px', margin: '-13px -2px', minHeight: 44 }}
          >
            Ingresá
          </button>
        </div>
      </div>
    </AppShell>
  );
}
