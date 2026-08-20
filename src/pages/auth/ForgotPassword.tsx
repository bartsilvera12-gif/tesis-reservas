import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AppShell } from '@/layouts/AppShell';
import { Button, Field, TopBar } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { C, FONT } from '@/lib/theme';

export function ForgotPassword() {
  const { resetPassword } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim()) return setError('Escribí tu email.');

    setBusy(true);
    try {
      await resetPassword(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos enviar el correo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell background="#fff">
      <TopBar title="Recuperar contraseña" onBack={() => navigate('/ingresar')} />

      <div style={{ padding: '10px 24px 40px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {sent ? (
          <>
            <div style={{ fontFamily: FONT.display, fontSize: 24 }}>Revisá tu correo</div>
            <div style={{ fontSize: 14, color: C.sub, lineHeight: 1.55 }}>
              Si <strong>{email.trim()}</strong> tiene una cuenta, te llegó un enlace para
              elegir una contraseña nueva.
            </div>
            <Button onClick={() => navigate('/ingresar')}>Volver a ingresar</Button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 14, color: C.sub, lineHeight: 1.5 }}>
              Escribí tu email y te mandamos un enlace para crear una contraseña nueva.
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

              <Button type="submit" loading={busy}>
                Enviar enlace
              </Button>
            </form>

            <div style={{ textAlign: 'center', fontSize: 13.5, color: C.sub }}>
              <Link to="/ingresar" style={{ color: C.terracottaDark, fontWeight: 700, display: 'inline-block', padding: '13px 10px', margin: '-13px -2px', minHeight: 44 }}>
                Volver
              </Link>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
