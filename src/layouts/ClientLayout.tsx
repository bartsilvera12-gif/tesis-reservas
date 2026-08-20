import { Outlet } from 'react-router-dom';
import { AppShell } from './AppShell';
import { BottomNav, ICONS, type NavItem } from '@/components/BottomNav';
import { HelpBubble } from '@/components/HelpBubble';

/** Navegación del cliente: Inicio · Explorar · Reservas · Perfil */
const ITEMS: NavItem[] = [
  { label: 'Inicio', to: '/app', d: ICONS.home, end: true },
  { label: 'Explorar', to: '/app/explorar', d: ICONS.search },
  { label: 'Reservas', to: '/app/reservas', d: ICONS.calendar },
  { label: 'Perfil', to: '/app/perfil', d: ICONS.person },
];

export function ClientLayout() {
  return (
    <AppShell nav={<BottomNav items={ITEMS} />}>
      <Outlet />
      <HelpBubble />
    </AppShell>
  );
}
