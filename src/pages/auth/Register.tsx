import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AppShell } from '@/layouts/AppShell';
import { Button, Field } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { C, FONT } from '@/lib/theme';

type AccountType = 'client' | 'owner';

export function Register() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  // Viene de la bienvenida como ?tipo=. Si alguien entra directo a /registro
  // sin pasar por ahí, se asume cliente: es lo que hace la mayoría, y el modo
  // negocio se activa después desde el perfil sin crear otra cuenta.
  const preset = params.get('tipo');
  const role: AccountType = preset === 'owner' ? 'owner' : 'client';

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!fullName.trim()) return setError('Decinos cómo te llamás.');
    if (!email.trim()) return setError('Necesitamos tu email.');
    if (password.length < 6) return setError('La contraseña necesita al menos 6 caracteres.');

    setBusy(true);
    try {
      const { needsEmailConfirmation } = await signUp({
        fullName,
        email,
        password,
        role,
      });

      if (needsEmailConfirmation) {
        setNotice(
          'Te enviamos un correo para confirmar tu cuenta. Confirmala y después ingresá.',
        );
        return;
      }

      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos crear tu cuenta.');
    } finally {
      setBusy(false);
    }
  }

  if (notice) {
    return (
      <AppShell background="#fff">
        <div style={{ padding: '48px 28px', textAlign: 'center' }}>
          <div
            style={{
              width: 74,
              height: 74,
              borderRadius: '50%',
              background: C.terracotta,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto',
              animation: 'pop .5s cubic-bezier(.2,1.4,.4,1) both',
            }}
          >
            <svg width="38" height="38" viewBox="0 0 24 24">
              <path
                d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 4-8 5-8-5V6l8 5 8-5z"
                fill="#fff"
              />
            </svg>
          </div>
          <div style={{ fontFamily: FONT.display, fontSize: 25, marginTop: 20 }}>
            Revisá tu correo
          </div>
          <div style={{ fontSize: 14, color: C.sub, marginTop: 10, lineHeight: 1.55 }}>
            {notice}
          </div>
          <div style={{ marginTop: 26 }}>
            <Button onClick={() => navigate('/ingresar')}>Ir a ingresar</Button>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell background="#fff">
      <div style={{ padding: '28px 24px 40px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <div style={{ fontFamily: FONT.display, fontSize: 30, color: C.ink }}>
            Creá tu cuenta
          </div>
          <div style={{ fontSize: 14, color: C.sub, marginTop: 5 }}>
            Es gratis y toma un minuto.
          </div>
        </div>

        <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field
            label="Nombre y apellido"
            autoComplete="name"
            placeholder="Andrea Villalba"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
          <Field
            label="Email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            placeholder="tucorreo@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Field
            label="Contraseña"
            type="password"
            autoComplete="new-password"
            placeholder="Mínimo 6 caracteres"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {/* El tipo de cuenta ya se eligió en la bienvenida ("Soy Cliente" /
              "Tengo un negocio"), que llega como ?tipo=. Volver a preguntarlo
              acá era pedir dos veces lo mismo. Se muestra qué se eligió y un
              atajo para cambiarlo, en vez de un formulario nuevo. */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: C.cream,
              border: `1px solid ${C.line}`,
              borderRadius: 12,
              padding: '12px 14px',
            }}
          >
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: 1.45 }}>
              Vas a crear una cuenta{' '}
              <strong>{role === 'owner' ? 'para tu negocio' : 'de cliente'}</strong>.
              {role === 'owner'
                ? ' Después vas a poder cargar tu local.'
                : ' Si más adelante tenés un negocio, lo activás desde tu perfil.'}
            </span>
            <button
              type="button"
              onClick={() => navigate('/bienvenida')}
              style={{
                flexShrink: 0,
                color: C.terracottaDark,
                fontWeight: 700,
                fontSize: 12.5,
                background: 'none',
                padding: '11px 6px',
                margin: '-11px -6px',
                minHeight: 44,
              }}
            >
              Cambiar
            </button>
          </div>

          {error && (
            <div
              role="alert"
              style={{
                background: C.dangerBg,
                color: C.danger,
                borderRadius: 12,
                padding: '11px 14px',
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {error}
            </div>
          )}

          <Button type="submit" loading={busy} disabled={!role}>
            Crear cuenta
          </Button>
        </form>

        <div
          style={{
            textAlign: 'center',
            fontSize: 13.5,
            color: C.sub,
            borderTop: `1px solid ${C.line}`,
            paddingTop: 18,
          }}
        >
          ¿Ya tenés cuenta?{' '}
          <Link to="/ingresar" style={{ color: C.terracottaDark, fontWeight: 700, display: 'inline-block', padding: '13px 10px', margin: '-13px -2px', minHeight: 44 }}>
            Ingresá
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
