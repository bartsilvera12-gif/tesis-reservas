import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { OwnerBusinessProvider, useOwnerBusiness } from '@/context/OwnerBusinessContext';
import { AppShell } from '@/layouts/AppShell';
import { Loading, StateView, Button } from '@/components/ui';
import { Wordmark } from '@/components/Wordmark';

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
 * Zona del dueño. Exige tener el modo negocio activado y, además, valida el
 * onboarding: si todavía no tiene ningún local, lo manda a configurarlo.
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

  // Primer ingreso del dueño: onboarding obligatorio.
  if (!businesses.length && !isOnboarding) {
    return <Navigate to="/panel/configurar" replace />;
  }

  // Ya configuró: no tiene sentido volver al onboarding.
  if (businesses.length > 0 && isOnboarding) {
    return <Navigate to="/panel" replace />;
  }

  return <Outlet />;
}

/** Redirige la raíz según el rol del usuario ya autenticado. */
export function RoleRedirect() {
  const { session, profile, loading } = useAuth();

  if (loading) return <Splash />;
  if (!session) return <Navigate to="/bienvenida" replace />;
  if (!profile) return <Splash />;

  return <Navigate to={profile.is_owner ? '/panel' : '/app'} replace />;
}

/** Pantallas de auth: si ya hay sesión, no tiene sentido mostrarlas. */
export function PublicOnly() {
  const { session, profile, loading } = useAuth();

  if (loading) return <Splash />;
  if (session && profile) {
    return <Navigate to={profile.is_owner ? '/panel' : '/app'} replace />;
  }
  return <Outlet />;
}
