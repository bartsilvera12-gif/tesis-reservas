import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '@/layouts/AppShell';
import { Button, Field } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { C, FONT } from '@/lib/theme';

/**
 * Destino del enlace del correo de recuperación.
 * Supabase deja la sesión iniciada al abrir el link, así que acá sólo
 * hace falta pedir la contraseña nueva.
 */
export function ResetPassword() {
  const { updatePassword, session } = useAuth();
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 6) return setError('La contraseña necesita al menos 6 caracteres.');
    if (password !== repeat) return setError('Las contraseñas no coinciden.');

    setBusy(true);
    try {
      await updatePassword(password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos cambiar la contraseña.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell background="#fff">
      <div style={{ padding: '32px 24px 40px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontFamily: FONT.display, fontSize: 28 }}>Nueva contraseña</div>

        {!session && (
          <div
            style={{
              background: C.warnBg,
              border: `1px solid ${C.warnLine}`,
              color: C.warn,
              borderRadius: 12,
              padding: '11px 14px',
              fontSize: 13,
              lineHeight: 1.45,
            }}
          >
            Abrí esta pantalla desde el enlace que te llegó por correo.
          </div>
        )}

        <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field
            label="Contraseña nueva"
            type="password"
            autoComplete="new-password"
            placeholder="Mínimo 6 caracteres"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Field
            label="Repetila"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
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

          <Button type="submit" loading={busy} disabled={!session}>
            Guardar contraseña
          </Button>
        </form>
      </div>
    </AppShell>
  );
}
