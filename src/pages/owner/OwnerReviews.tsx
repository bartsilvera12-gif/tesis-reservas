import { useMemo, useState } from 'react';
import { useOwnerBusiness } from '@/context/OwnerBusinessContext';
import { useAsync } from '@/hooks/useAsync';
import { useToast } from '@/hooks/useToast';
import { fetchBusinessReviews, replyToReview } from '@/services/reviews';
import {
  Button,
  Field,
  Loading,
  PageTitle,
  StateView,
  Stars,
} from '@/components/ui';
import { C } from '@/lib/theme';
import { initials, timeAgo } from '@/lib/format';

export function OwnerReviews() {
  const { active } = useOwnerBusiness();
  const toast = useToast();

  const [replyFor, setReplyFor] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [busy, setBusy] = useState(false);

  const query = useAsync(
    () => fetchBusinessReviews(active!.id),
    [active?.id],
    { enabled: Boolean(active) },
  );

  const reviews = useMemo(() => query.data ?? [], [query.data]);

  const summary = useMemo(() => {
    if (!reviews.length) return null;
    const total = reviews.reduce((sum, r) => sum + r.rating, 0);
    const breakdown: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const r of reviews) breakdown[r.rating] = (breakdown[r.rating] ?? 0) + 1;
    return { avg: total / reviews.length, count: reviews.length, breakdown };
  }, [reviews]);

  async function publish(reviewId: string) {
    if (!replyText.trim()) {
      toast.fail('Escribí una respuesta.');
      return;
    }

    setBusy(true);
    try {
      const updated = await replyToReview(reviewId, replyText);

      query.setData((prev) =>
        prev
          ? prev.map((r) =>
              r.id === reviewId
                ? {
                    ...r,
                    owner_reply: updated.owner_reply,
                    owner_replied_at: updated.owner_replied_at,
                  }
                : r,
            )
          : prev,
      );

      setReplyFor(null);
      setReplyText('');
      toast.success('Respuesta publicada.');
    } catch (err) {
      toast.fail(err instanceof Error ? err.message : 'No pudimos publicar la respuesta.');
    } finally {
      setBusy(false);
    }
  }

  if (!active) return null;

  return (
    <div style={{ paddingBottom: 24 }}>
      <PageTitle>Reseñas</PageTitle>

      {query.loading && !query.data ? (
        <Loading label="" />
      ) : query.error ? (
        <StateView
          tone="error"
          title="No pudimos cargar las reseñas."
          detail={query.error}
          actionLabel="Reintentar"
          onAction={query.reload}
        />
      ) : !summary ? (
        <StateView
          title="Todavía no tenés reseñas"
          detail="Cuando tus clientes dejen su opinión la vas a ver acá y vas a poder responderles."
        />
      ) : (
        <>
          {/* Resumen */}
          <div
            style={{
              margin: '0 20px',
              background: C.surface,
              border: `1px solid ${C.line}`,
              borderRadius: 16,
              padding: 16,
              display: 'flex',
              gap: 18,
              alignItems: 'center',
            }}
          >
            <div style={{ textAlign: 'center', flexShrink: 0 }}>
              <div style={{ fontSize: 34, fontWeight: 800 }}>{summary.avg.toFixed(1)}</div>
              <Stars rating={summary.avg} size={12} />
              <div style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>
                {summary.count} reseña{summary.count === 1 ? '' : 's'}
              </div>
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {[5, 4, 3, 2, 1].map((n) => {
                const count = summary.breakdown[n] ?? 0;
                const pct = Math.round((count / summary.count) * 100);
                return (
                  <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, color: C.sub, width: 8 }}>{n}</span>
                    <div
                      style={{
                        flex: 1,
                        height: 6,
                        background: C.barTrack,
                        borderRadius: 3,
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${pct}%`,
                          height: '100%',
                          background: n >= 4 ? C.terracotta : C.gold,
                          borderRadius: 3,
                        }}
                      />
                    </div>
                    <span style={{ fontSize: 10.5, color: C.muted, width: 18 }}>{count}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Listado */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              padding: '14px 20px 8px',
            }}
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
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: '50%',
                      background: C.cream,
                      color: C.terracottaDark,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 12.5,
                      fontWeight: 800,
                      flexShrink: 0,
                    }}
                  >
                    {initials(r.client?.full_name)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700 }}>
                      {r.client?.full_name || 'Cliente'}
                    </div>
                    <Stars rating={r.rating} />
                  </div>
                  <div style={{ fontSize: 11, color: C.mutedSoft, flexShrink: 0 }}>
                    {timeAgo(r.created_at)}
                  </div>
                </div>

                {r.comment && (
                  <div
                    style={{
                      fontSize: 13,
                      color: '#5C5044',
                      lineHeight: 1.5,
                      marginTop: 7,
                    }}
                  >
                    {r.comment}
                  </div>
                )}

                {r.owner_reply ? (
                  <div
                    style={{
                      marginTop: 9,
                      background: C.bg,
                      borderLeft: `2.5px solid ${C.terracotta}`,
                      borderRadius: '0 10px 10px 0',
                      padding: '9px 12px',
                    }}
                  >
                    <div style={{ fontSize: 11, fontWeight: 800, color: C.terracottaDark }}>
                      TU RESPUESTA
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
                ) : replyFor === r.id ? (
                  <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <Field
                      multiline
                      rows={2}
                      autoFocus
                      placeholder="Escribí tu respuesta…"
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      style={{ borderColor: C.terracotta }}
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Button
                        loading={busy}
                        onClick={() => void publish(r.id)}
                        style={{ padding: '11px', fontSize: 13.5, minHeight: 44 }}
                      >
                        Publicar
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setReplyFor(null);
                          setReplyText('');
                        }}
                        style={{ padding: '11px', fontSize: 13.5, minHeight: 44 }}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setReplyFor(r.id);
                      setReplyText('');
                    }}
                    style={{
                      fontSize: 12.5,
                      fontWeight: 800,
                      color: C.terracottaDark,
                      marginTop: 9,
                    }}
                  >
                    Responder
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {toast.node}
    </div>
  );
}
