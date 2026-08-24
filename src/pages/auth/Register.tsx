import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AppShell } from '@/layouts/AppShell';
import { Button, Field } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { C, FONT } from '@/lib/theme';

type AccountType = 'client' | 'owner';

const OPTIONS: { value: AccountType; title: string; detail: string }[] = [
  {
    value: 'client',
    title: 'Cliente',
    detail: 'Quiero descubrir lugares y realizar reservas.',
  },
  {
    value: 'owner',
    title: 'Dueño de negocio',
    detail: 'Quiero gestionar mi negocio y recibir reservas.',
  },
];

export function Register() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  // La bienvenida puede preseleccionar el tipo, pero sigue siendo obligatorio.
  const preset = params.get('tipo');
  const [role, setRole] = useState<AccountType | null>(
    preset === 'client' || preset === 'owner' ? preset : null,
  );

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
    if (!role) return setError('Elegí cómo vas a usar la aplicación.');

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

          {/* Con qué intención se registra. No es una puerta cerrada: define
              dónde cae al entrar, y el modo negocio se puede activar
              después desde el perfil sin abrir otra cuenta. */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
              ¿Cómo vas a utilizar la aplicación?
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {OPTIONS.map((opt) => {
                const active = role === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setRole(opt.value)}
                    style={{
                      textAlign: 'left',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      background: active ? C.cream : '#fff',
                      border: `1.5px solid ${active ? C.terracotta : C.line}`,
                      borderRadius: 14,
                      padding: '14px 16px',
                      transition: 'background .18s, border-color .18s',
                    }}
                  >
                    <span
                      style={{
                        width: 20,
                        height: 20,
                        flexShrink: 0,
                        borderRadius: '50%',
                        border: `2px solid ${active ? C.terracotta : C.line}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {active && (
                        <span
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            background: C.terracotta,
                          }}
                        />
                      )}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span
                        style={{
                          display: 'block',
                          fontSize: 15,
                          fontWeight: 800,
                          color: active ? C.terracottaDark : C.ink,
                        }}
                      >
                        {opt.title}
                      </span>
                      <span
                        style={{
                          display: 'block',
                          fontSize: 12.5,
                          color: C.sub,
                          marginTop: 2,
                          lineHeight: 1.4,
                        }}
                      >
                        {opt.detail}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            <div style={{ fontSize: 11.5, color: C.sub, marginTop: 8, lineHeight: 1.45 }}>
              Podés cambiar de idea: si elegís cliente y más adelante querés publicar
              tu negocio, lo activás desde tu perfil con esta misma cuenta.
            </div>
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
