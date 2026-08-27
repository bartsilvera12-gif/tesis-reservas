import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AppShell } from '@/layouts/AppShell';
import { Button, Field, TopBar } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { C, FONT } from '@/lib/theme';

/**
 * Recuperación de contraseña con un código de 6 dígitos.
 *
 * No se usa el enlace del correo a propósito: dentro del APK la app corre en
 * `https://localhost` (el servidor interno de Capacitor), así que un enlace
 * de vuelta abría el navegador del teléfono en una dirección inexistente.
 * Con el código, la persona nunca sale de AJ Spots.
 */
export function ForgotPassword() {
  const { resetPassword, recoverWithCode } = useAuth();
  const navigate = useNavigate();

  const [paso, setPaso] = useState<'correo' | 'codigo'>('correo');
  const [email, setEmail] = useState('');
  const [codigo, setCodigo] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reenviado, setReenviado] = useState(false);

  async function pedirCodigo(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim()) return setError('Escribí tu email.');

    setBusy(true);
    try {
      await resetPassword(email);
      setPaso('codigo');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos enviar el correo.');
    } finally {
      setBusy(false);
    }
  }

  async function reenviar() {
    setError(null);
    setBusy(true);
    try {
      await resetPassword(email);
      setReenviado(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos reenviar el código.');
    } finally {
      setBusy(false);
    }
  }

  async function cambiar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (codigo.trim().length !== 6) return setError('El código tiene 6 dígitos.');
    if (password.length < 6) return setError('La contraseña necesita al menos 6 caracteres.');

    setBusy(true);
    try {
      await recoverWithCode(email, codigo, password);
      // Al canjear el código queda la sesión abierta: se entra derecho.
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos cambiar la contraseña.');
    } finally {
      setBusy(false);
    }
  }

  const cajaError = error && (
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
  );

  return (
    <AppShell background="#fff">
      <TopBar
        title="Recuperar contraseña"
        onBack={() => (paso === 'codigo' ? setPaso('correo') : navigate('/ingresar'))}
      />

      <div style={{ padding: '10px 24px 40px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {paso === 'correo' ? (
          <>
            <div style={{ fontSize: 14, color: C.sub, lineHeight: 1.5 }}>
              Escribí tu email y te mandamos un código para crear una contraseña nueva.
            </div>

            <form onSubmit={pedirCodigo} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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

              {cajaError}

              <Button type="submit" loading={busy}>
                Enviarme el código
              </Button>
            </form>
          </>
        ) : (
          <>
            <div style={{ fontFamily: FONT.display, fontSize: 24 }}>Revisá tu correo</div>
            <div style={{ fontSize: 14, color: C.sub, lineHeight: 1.55 }}>
              {/* Se habla en condicional para no confirmarle a un desconocido
                  si ese email tiene cuenta o no. */}
              Si <strong>{email.trim()}</strong> tiene una cuenta, le mandamos un código de
              6 dígitos. Vence en una hora.
            </div>

            <form onSubmit={cambiar} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Field
                label="Código de 6 dígitos"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                maxLength={6}
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
                style={{ letterSpacing: '6px', fontSize: 20, fontWeight: 800, textAlign: 'center' }}
              />

              <Field
                label="Contraseña nueva"
                type="password"
                autoComplete="new-password"
                placeholder="Mínimo 6 caracteres"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />

              {cajaError}

              <Button type="submit" loading={busy}>
                Cambiar la contraseña
              </Button>
            </form>

            <div style={{ textAlign: 'center', fontSize: 13.5, color: C.sub }}>
              {reenviado ? (
                <span>Te mandamos otro código.</span>
              ) : (
                <button
                  onClick={() => void reenviar()}
                  disabled={busy}
                  style={{
                    color: C.terracottaDark,
                    fontWeight: 700,
                    fontSize: 13.5,
                    padding: '13px 10px',
                    minHeight: 44,
                    background: 'none',
                  }}
                >
                  No me llegó, reenviar
                </button>
              )}
            </div>
          </>
        )}

        <div style={{ textAlign: 'center', fontSize: 13.5, color: C.sub }}>
          <Link
            to="/ingresar"
            style={{
              color: C.terracottaDark,
              fontWeight: 700,
              display: 'inline-block',
              padding: '13px 10px',
              margin: '-13px -2px',
              minHeight: 44,
            }}
          >
            Volver
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
