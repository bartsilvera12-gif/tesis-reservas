import { Outlet } from 'react-router-dom';
import { useRecordatorios } from '@/hooks/useRecordatorios';
import { AppShell } from './AppShell';
import { BottomNav, ICONS, type NavItem } from '@/components/BottomNav';
import { HelpBubble } from '@/components/HelpBubble';

/** Navegación del dueño: Inicio · Reservas · Negocio · Reseñas · Promos */
const ITEMS: NavItem[] = [
  { label: 'Inicio', to: '/panel', d: ICONS.chart, end: true },
  { label: 'Reservas', to: '/panel/reservas', d: ICONS.calendar },
  { label: 'Negocio', to: '/panel/negocio', d: ICONS.store },
  { label: 'Reseñas', to: '/panel/resenas', d: ICONS.reviews },
  { label: 'Promos', to: '/panel/promos', d: ICONS.tag },
];

export function OwnerLayout() {
  // Deja programados los avisos previos a cada reserva.
  useRecordatorios();

  return (
    <AppShell nav={<BottomNav items={ITEMS} />}>
      <Outlet />
      <HelpBubble />
    </AppShell>
  );
}
