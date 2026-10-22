import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useAsync } from '@/hooks/useAsync';
import { fetchNotifications, markAllRead } from '@/services/notifications';
import { supabase } from '@/lib/supabase';
import type { AppNotification } from '@/types/db';
import { Loading, StateView, TopBar } from '@/components/ui';
import { C } from '@/lib/theme';
import { timeAgo } from '@/lib/format';
import { ICONS } from '@/components/BottomNav';

const ICON_BY_TYPE: Record<string, string> = {
  reservation_created: ICONS.calendar,
  reservation_confirmed: ICONS.calendar,
  reservation_rejected: ICONS.calendar,
  reservation_cancelled: ICONS.calendar,
  reservation_expired: ICONS.calendar,
  review_reply: ICONS.reviews,
  general: ICONS.bell,
};

export function Notifications({ backTo = '/app/perfil' }: { backTo?: string }) {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const query = useAsync(() => fetchNotifications(profile!.id), [profile?.id], {
    enabled: Boolean(profile?.id),
  });

  const items = query.data ?? [];

  /**
   * De quién es cada reserva avisada: si es mía como cliente, el aviso lleva
   * a "Mis reservas"; si es de mi negocio, al panel. Con una sola cuenta para
   * los dos modos, el tipo de aviso no alcanza para saberlo.
   */
  const refs = items.map((n) => n.reference_id).filter((x): x is string => Boolean(x));
  const propiasQuery = useAsync(
    async () => {
      if (!refs.length) return new Set<string>();
      const { data } = await supabase
        .from('reservations')
        .select('id')
        .in('id', refs)
        .eq('client_id', profile!.id);
      return new Set((data ?? []).map((r: { id: string }) => r.id));
    },
    [refs.join(',')],
    { enabled: Boolean(profile?.id) && refs.length > 0 },
  );

  function destino(n: AppNotification): string | null {
    if (n.type === 'review_reply') return '/app/mis-resenas';
    if (!n.reference_id) return null;
    const mia = propiasQuery.data?.has(n.reference_id) ?? false;
    if (mia) return '/app/reservas';
    if (!profile?.is_owner) return null;
    return n.type === 'reservation_created' && !n.title.includes('confirmada')
      ? '/panel/reservas?ver=pendientes'
      : '/panel/reservas';
  }

  // Al abrir la pantalla se dan por leídas.
  useEffect(() => {
    if (!profile?.id || !items.length) return;
    if (!items.some((n) => n.read_at === null)) return;
    void markAllRead(profile.id).catch(() => {
      /* el badge no debe romper la pantalla */
    });
  }, [profile?.id, items]);

  return (
    <div style={{ paddingBottom: 24 }}>
      <TopBar title="Notificaciones" onBack={() => navigate(backTo)} />

      {query.loading && !query.data ? (
        <Loading label="" />
      ) : query.error ? (
        <StateView
          tone="error"
          title="No pudimos cargar las notificaciones."
          detail={query.error}
          actionLabel="Reintentar"
          onAction={query.reload}
        />
      ) : items.length === 0 ? (
        <StateView
          title="No hay notificaciones"
          detail="Acá te vamos a avisar cuando confirmen tus reservas o respondan tus reseñas."
        />
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            padding: '4px 20px',
          }}
        >
          {items.map((n) => {
            const ir = destino(n);
            return (
              <div
                key={n.id}
                // Tocar el aviso lleva a donde se resuelve: antes era texto suelto.
                role={ir ? 'button' : undefined}
                tabIndex={ir ? 0 : undefined}
                onClick={ir ? () => navigate(ir) : undefined}
                onKeyDown={ir ? (e) => e.key === 'Enter' && navigate(ir) : undefined}
                style={{
                  display: 'flex',
                  gap: 12,
                  background: n.read_at ? C.surface : C.cream,
                  border: `1px solid ${C.line}`,
                  borderRadius: 12,
                  padding: '13px 15px',
                  cursor: ir ? 'pointer' : 'default',
                }}
              >
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: '50%',
                    background: C.bg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <svg width="17" height="17" viewBox="0 0 24 24">
                    <path d={ICON_BY_TYPE[n.type] ?? ICONS.bell} fill={C.terracottaDark} />
                  </svg>
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 8,
                      alignItems: 'baseline',
                    }}
                  >
                    <span style={{ fontSize: 14, fontWeight: 800 }}>{n.title}</span>
                    <span
                      style={{
                        fontSize: 11,
                        color: C.mutedSoft,
                        flexShrink: 0,
                      }}
                    >
                      {timeAgo(n.created_at)}
                    </span>
                  </div>
                  {n.body && (
                    <div
                      style={{
                        fontSize: 12.5,
                        color: C.sub,
                        marginTop: 3,
                        lineHeight: 1.45,
                      }}
                    >
                      {n.body}
                    </div>
                  )}
                </div>
                {ir && (
                  <span aria-hidden style={{ color: C.sub, fontSize: 18, alignSelf: 'center' }}>
                    ›
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
