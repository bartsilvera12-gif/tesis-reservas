import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AppShell } from '@/layouts/AppShell';
import { Button, Field } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { C } from '@/lib/theme';
import { Wordmark } from '@/components/Wordmark';

/**
 * UN SOLO formulario de login para toda la app.
 * El rol se detecta leyendo `profiles.role` después de autenticar, y la
 * redirección la resuelve <PublicOnly> / <RoleRedirect>.
 */
export function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError('Completá tu email y tu contraseña.');
      return;
    }

    setBusy(true);
    try {
      await signIn(email, password);
      // El guard redirige solo según el rol; '/' resuelve el destino.
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos iniciar sesión.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell background="#fff">
      <div style={{ padding: '32px 24px 40px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <div>
            <Wordmark size={34} />
          </div>
          <div style={{ fontSize: 14.5, color: C.sub, marginTop: 6 }}>
            Ingresá para ver tus reservas.
          </div>
        </div>

        <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

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
                lineHeight: 1.45,
              }}
            >
              {error}
            </div>
          )}

          <Button type="submit" loading={busy}>
            Ingresar
          </Button>
        </form>

        <div style={{ textAlign: 'center' }}>
          <Link
            to="/recuperar"
            style={{ fontSize: 13, color: C.sub, fontWeight: 600, display: 'inline-block', padding: '13px 10px', margin: '-13px -2px', minHeight: 44 }}
          >
            Olvidé mi contraseña
          </Link>
        </div>

        <div
          style={{
            textAlign: 'center',
            fontSize: 13.5,
            color: C.sub,
            borderTop: `1px solid ${C.line}`,
            paddingTop: 18,
          }}
        >
          ¿No tenés cuenta?{' '}
          <Link to="/registro" style={{ color: C.terracottaDark, fontWeight: 700, display: 'inline-block', padding: '13px 10px', margin: '-13px -2px', minHeight: 44 }}>
            Creá una
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
