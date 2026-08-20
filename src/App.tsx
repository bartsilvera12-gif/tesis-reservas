import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import {
  ClientRoute,
  OwnerRoute,
  PublicOnly,
  RequireAuth,
  RoleRedirect,
} from '@/routes/guards';
import { ClientLayout } from '@/layouts/ClientLayout';
import { OwnerLayout } from '@/layouts/OwnerLayout';
import { AppShell } from '@/layouts/AppShell';
import { StateView } from '@/components/ui';

// Auth
import { Welcome } from '@/pages/auth/Welcome';
import { Login } from '@/pages/auth/Login';
import { Register } from '@/pages/auth/Register';
import { ForgotPassword } from '@/pages/auth/ForgotPassword';
import { ResetPassword } from '@/pages/auth/ResetPassword';

// Cliente
import { Home } from '@/pages/client/Home';
import { Explore } from '@/pages/client/Explore';
import { BusinessDetail } from '@/pages/client/BusinessDetail';
import { Reserve } from '@/pages/client/Reserve';
import { ReservationConfirmed } from '@/pages/client/ReservationConfirmed';
import { MyBookings } from '@/pages/client/MyBookings';
import { Profile } from '@/pages/client/Profile';
import { WriteReview } from '@/pages/client/WriteReview';
import { MyReviews } from '@/pages/client/MyReviews';
import { Notifications } from '@/pages/client/Notifications';

// Dueño
import { OwnerOnboarding } from '@/pages/owner/Onboarding';
import { OwnerDashboard } from '@/pages/owner/Dashboard';
import { OwnerReservations } from '@/pages/owner/OwnerReservations';
import { MyBusiness } from '@/pages/owner/MyBusiness';
import { OwnerReviews } from '@/pages/owner/OwnerReviews';
import { OwnerPromos } from '@/pages/owner/OwnerPromos';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Raíz: redirige según el rol del profile */}
          <Route path="/" element={<RoleRedirect />} />

          {/* Públicas — si ya hay sesión, se salta al panel correspondiente */}
          <Route element={<PublicOnly />}>
            <Route path="/bienvenida" element={<Welcome />} />
            <Route path="/ingresar" element={<Login />} />
            <Route path="/registro" element={<Register />} />
            <Route path="/recuperar" element={<ForgotPassword />} />
          </Route>

          {/* Llega desde el correo: puede tener sesión abierta */}
          <Route path="/auth/nueva-clave" element={<ResetPassword />} />

          {/* Privadas */}
          <Route element={<RequireAuth />}>
            {/* ── Cliente ── */}
            <Route element={<ClientRoute />}>
              <Route path="/app" element={<ClientLayout />}>
                <Route index element={<Home />} />
                <Route path="explorar" element={<Explore />} />
                <Route path="reservas" element={<MyBookings />} />
                <Route path="perfil" element={<Profile />} />
                <Route path="mis-resenas" element={<MyReviews />} />
                <Route path="notificaciones" element={<Notifications />} />
                <Route path="negocio/:id" element={<BusinessDetail />} />
                <Route path="negocio/:id/reservar" element={<Reserve />} />
                <Route path="negocio/:id/resena" element={<WriteReview />} />
                <Route
                  path="reserva/:id/confirmada"
                  element={<ReservationConfirmed />}
                />
              </Route>
            </Route>

            {/* ── Dueño ── */}
            <Route element={<OwnerRoute />}>
              {/* Sin nav inferior, pero SÍ dentro del shell: es lo que reserva
                  el alto de la barra de estado y hace que el formulario
                  scrollee. Colgado directo del router quedaba recortado por el
                  `overflow:hidden` de #root y no se podía llegar al final. */}
              <Route
                path="/panel/configurar"
                element={
                  <AppShell>
                    <OwnerOnboarding />
                  </AppShell>
                }
              />

              <Route path="/panel" element={<OwnerLayout />}>
                <Route index element={<OwnerDashboard />} />
                <Route path="reservas" element={<OwnerReservations />} />
                <Route path="negocio" element={<MyBusiness />} />
                <Route path="resenas" element={<OwnerReviews />} />
                <Route path="promos" element={<OwnerPromos />} />
                <Route
                  path="notificaciones"
                  element={<Notifications backTo="/panel" />}
                />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

function NotFound() {
  return (
    <AppShell>
      <StateView
        title="No encontramos esta pantalla"
        detail="Puede que el enlace esté desactualizado."
        actionLabel="Ir al inicio"
        onAction={() => window.location.replace('/')}
      />
    </AppShell>
  );
}
