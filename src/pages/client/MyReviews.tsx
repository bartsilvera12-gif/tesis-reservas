import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useAsync } from '@/hooks/useAsync';
import { fetchMyReviews } from '@/services/reviews';
import { Loading, StateView, Stars, TopBar } from '@/components/ui';
import { C } from '@/lib/theme';
import { timeAgo } from '@/lib/format';

export function MyReviews() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const query = useAsync(
    () => fetchMyReviews(profile!.id),
    [profile?.id],
    { enabled: Boolean(profile?.id) },
  );

  const reviews = query.data ?? [];

  return (
    <div style={{ paddingBottom: 24 }}>
      <TopBar title="Mis reseñas" onBack={() => navigate('/app/perfil')} />

      {query.loading && !query.data ? (
        <Loading label="" />
      ) : query.error ? (
        <StateView
          tone="error"
          title="No pudimos cargar tus reseñas."
          detail={query.error}
          actionLabel="Reintentar"
          onAction={query.reload}
        />
      ) : reviews.length === 0 ? (
        <StateView
          title="Todavía no escribiste reseñas"
          detail="Después de una reserva confirmada vas a poder contar cómo te fue."
          actionLabel="Ver mis reservas"
          onAction={() => navigate('/app/reservas')}
        />
      ) : (
        <div
          style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 20px' }}
        >
          {reviews.map((r) => (
            <div
              key={r.id}
              style={{
                background: C.surface,
                border: `1px solid ${C.line}`,
                borderRadius: 14,
                padding: '14px 16px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <div
                  onClick={() => r.business && navigate(`/app/negocio/${r.business.id}`)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) =>
                    e.key === 'Enter' && r.business && navigate(`/app/negocio/${r.business.id}`)
                  }
                  style={{
                    fontSize: 14.5,
                    fontWeight: 800,
                    cursor: 'pointer',
                    minWidth: 0,
                    padding: '12px 0',
                    margin: '-12px 0',
                  }}
                >
                  {r.business?.name ?? 'Negocio'}
                </div>
                <span style={{ fontSize: 11, color: C.mutedSoft, flexShrink: 0 }}>
                  {timeAgo(r.created_at)}
                </span>
              </div>

              <div style={{ marginTop: 4 }}>
                <Stars rating={r.rating} />
              </div>

              {r.comment && (
                <div
                  style={{ fontSize: 13, color: '#5C5044', lineHeight: 1.5, marginTop: 7 }}
                >
                  {r.comment}
                </div>
              )}

              {r.owner_reply && (
                <div
                  style={{
                    marginTop: 9,
                    background: C.bg,
                    borderLeft: `2.5px solid ${C.terracotta}`,
                    borderRadius: '0 10px 10px 0',
                    padding: '9px 12px',
                  }}
                >
                  <div
                    style={{ fontSize: 11, fontWeight: 800, color: C.terracottaDark }}
                  >
                    RESPUESTA DEL LOCAL
                  </div>
                  <div
                    style={{
                      fontSize: 12.5,
                      color: '#5C5044',
                      lineHeight: 1.5,
                      marginTop: 3,
                    }}
                  >
                    {r.owner_reply}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
