import { NavLink } from 'react-router-dom';
import { C } from '@/lib/theme';

export interface NavItem {
  label: string;
  to: string;
  /** Path del icono (mismo set de SVGs que el prototipo). */
  d: string;
  end?: boolean;
}

/** Iconos tomados literalmente del prototipo. */
export const ICONS = {
  home: 'M12 3l9 8h-3v9h-5v-6h-2v6H6v-9H3z',
  search:
    'M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14z',
  calendar:
    'M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 16H5V10h14zM5 8V6h14v2z',
  person: 'M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5zm0 2c-3.33 0-10 1.67-10 5v3h20v-3c0-3.33-6.67-5-10-5z',
  chart: 'M4 20V10h3v10zm6.5 0V4h3v16zM17 20v-7h3v7z',
  store: 'M20 4H4v2h16zm1 6-1-5H4l-1 5v2h1v8h10v-8h4v8h2v-8h1zm-9 8H6v-6h6z',
  reviews: 'M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z',
  tag: 'M21.4 11.6l-9-9A2 2 0 0 0 11 2H4a2 2 0 0 0-2 2v7a2 2 0 0 0 .6 1.4l9 9a2 2 0 0 0 2.8 0l7-7a2 2 0 0 0 0-2.8zM6.5 8A1.5 1.5 0 1 1 8 6.5 1.5 1.5 0 0 1 6.5 8z',
  location:
    'M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 14.5 9 2.5 2.5 0 0 1 12 11.5z',
  clock: 'M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm4.2 14.2L11 13V7h1.5v5.3l4.5 2.7z',
  sparkle: 'M12 2l2 6 6 2-6 2-2 6-2-6-6-2 6-2z',
  bell: 'M12 22a2 2 0 0 0 2-2h-4a2 2 0 0 0 2 2zm6-6v-5a6 6 0 0 0-5-5.91V4a1 1 0 0 0-2 0v1.09A6 6 0 0 0 6 11v5l-2 2v1h16v-1z',
} as const;

export function BottomNav({ items }: { items: NavItem[] }) {
  return (
    <nav
      style={{
        display: 'flex',
        borderTop: `1px solid ${C.line}`,
        background: C.surface,
        /* La safe-area evita que la barra de gestos de Android tape los iconos */
        padding: `6px 2px calc(2px + var(--safe-bottom))`,
        flexShrink: 0,
      }}
    >
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
            padding: '6px 0',
            minHeight: 48,
            justifyContent: 'center',
          }}
        >
          {({ isActive }) => (
            <>
              <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
                <path d={item.d} fill={isActive ? C.terracottaDark : C.muted} />
              </svg>
              <span
                style={{
                  fontSize: items.length > 4 ? 10 : 10.5,
                  fontWeight: isActive ? 800 : 600,
                  color: isActive ? C.terracottaDark : C.muted,
                }}
              >
                {item.label}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
