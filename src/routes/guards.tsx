import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { OwnerBusinessProvider, useOwnerBusiness } from '@/context/OwnerBusinessContext';
import { AppShell } from '@/layouts/AppShell';
import { Loading, StateView, Button } from '@/components/ui';
import { Wordmark } from '@/components/Wordmark';
import { destinoInicial, guardarModo } from '@/lib/modo';
import { C } from '@/lib/theme';

/** Splash mientras se resuelve la sesión. Evita el parpadeo de login. */
function Splash() {
  return (
    <AppShell>
      <div
        style={{
          flex: 1,
          minHeight: '80dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 18,
        }}
      >
        <Wordmark size={38} />
        <Loading label="" />
      </div>
    </AppShell>
  );
}

/** El profile no cargó (típicamente: schema sin exponer en PostgREST). */
function ProfileError({ message }: { message: string }) {
  const { signOut } = useAuth();
  return (
    <AppShell>
      <StateView
        tone="error"
        title="No pudimos cargar tu perfil"
        detail={message}
        actionLabel="Reintentar"
        onAction={() => window.location.reload()}
      />
      <div style={{ padding: '0 24px' }}>
        <Button variant="ghost" onClick={() => void signOut()}>
          Cerrar sesión
        </Button>
      </div>
    </AppShell>
  );
}

/** Exige sesión iniciada. */
export function RequireAuth() {
  const { session, profile, loading, error } = useAuth();
  const location = useLocation();

  if (loading) return <Splash />;
  if (!session) return <Navigate to="/bienvenida" replace state={{ from: location }} />;
  if (error && !profile) return <ProfileError message={error} />;
  if (!profile) return <Splash />;

  return <Outlet />;
}

/**
 * Zona del cliente: la usa cualquiera con sesión.
 *
 * Ya no rebota a quien tiene negocio. Con un solo correo para las dos cosas,
 * un dueño entrando a /app está haciendo justamente lo que corresponde:
 * mirar la app como cliente.
 */
export function ClientRoute() {
  const { profile } = useAuth();
  if (!profile) return <Splash />;
  return <Outlet />;
}

/**
 * Zona del dueño. Exige tener el modo negocio activado; si todavía no cargó
 * ningún local, le ofrece crearlo o entrar a la app como cliente.
 */
export function OwnerRoute() {
  const { profile } = useAuth();
  if (!profile) return <Splash />;
  if (!profile.is_owner) return <Navigate to="/app" replace />;

  return (
    <OwnerBusinessProvider>
      <OwnerGate />
    </OwnerBusinessProvider>
  );
}

function OwnerGate() {
  const { businesses, loading, error, reload } = useOwnerBusiness();
  const location = useLocation();

  const isOnboarding = location.pathname.startsWith('/panel/configurar');

  if (loading) return <Splash />;

  if (error) {
    return (
      <AppShell>
        <StateView
          tone="error"
          title="No pudimos cargar tu negocio"
          detail={error}
          actionLabel="Reintentar"
          onAction={() => void reload()}
        />
      </AppShell>
    );
  }

  // Sin ningún local todavía no hay panel que mostrar, pero tampoco se lo
  // empuja a la fuerza: quien se registró tocando "Tengo un negocio" y después
  // decidió usar la app sólo para reservar quedaba encerrado acá, y en cada
  // ingreso volvía a la misma pantalla sin salida.
  if (!businesses.length && !isOnboarding) {
    return <SinNegocio />;
  }

  // Tener un local no cierra la puerta a cargar otro: la app ya sabe manejar
  // varios (el panel tiene selector y cada uno lleva sus propias reservas),
  // pero hasta acá el alta rebotaba a quien ya tenía uno y no había forma de
  // sumar el segundo desde el teléfono.
  return <Outlet />;
}

/**
 * Qué hacer con una cuenta con modo negocio que todavía no cargó ningún local.
 *
 * Antes esto era una redirección forzada al alta del negocio. Ahora es una
 * elección: el que quiere crearlo lo crea, y el que sólo quiere reservar entra
 * a la app y no vuelve a ver esta pantalla, porque queda anotado el modo.
 */
function SinNegocio() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  return (
    <AppShell>
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 12,
          padding: 32,
        }}
      >
        <div style={{ fontSize: 20, fontWeight: 800 }}>Todavía no cargaste tu negocio</div>
        <div style={{ fontSize: 14, color: C.sub, lineHeight: 1.5, marginBottom: 8 }}>
          Podés crearlo ahora o dejarlo para después y usar la app para reservar. El
          panel te espera en tu perfil cuando quieras volver.
        </div>

        <Button onClick={() => navigate('/panel/configurar')}>Crear mi negocio</Button>
        <Button
          variant="ghost"
          onClick={() => {
            if (profile) guardarModo(profile.id, 'client');
            navigate('/app', { replace: true });
          }}
        >
          Ahora no, quiero reservar
        </Button>
      </div>
    </AppShell>
  );
}

/** Redirige la raíz al modo en el que estaba esta cuenta. */
export function RoleRedirect() {
  const { session, profile, loading } = useAuth();

  if (loading) return <Splash />;
  if (!session) return <Navigate to="/bienvenida" replace />;
  if (!profile) return <Splash />;

  return <Navigate to={destinoInicial(profile.id, profile.is_owner)} replace />;
}

/** Pantallas de auth: si ya hay sesión, no tiene sentido mostrarlas. */
export function PublicOnly() {
  const { session, profile, loading } = useAuth();

  if (loading) return <Splash />;
  if (session && profile) {
    return <Navigate to={destinoInicial(profile.id, profile.is_owner)} replace />;
  }
  return <Outlet />;
}
