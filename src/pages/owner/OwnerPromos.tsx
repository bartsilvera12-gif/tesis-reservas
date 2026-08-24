import { useState } from 'react';
import { useOwnerBusiness } from '@/context/OwnerBusinessContext';
import { useAsync } from '@/hooks/useAsync';
import { useToast } from '@/hooks/useToast';
import { useConfirm } from '@/hooks/useConfirm';
import {
  createPromotion,
  deletePromotion,
  fetchBusinessPromotions,
  updatePromotion,
} from '@/services/promotions';
import {
  Button,
  Field,
  Loading,
  PageTitle,
  StateView,
  Switch,
} from '@/components/ui';
import { C } from '@/lib/theme';
import { toISODate } from '@/lib/format';
import type { Promotion } from '@/types/db';

export function OwnerPromos() {
  const { active } = useOwnerBusiness();
  const toast = useToast();
  const { confirm, node: confirmNode } = useConfirm();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [unlimited, setUnlimited] = useState(false);
  const [startsAt, setStartsAt] = useState(() => toISODate(new Date()));
  const [endsAt, setEndsAt] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return toISODate(d);
  });
  const [busy, setBusy] = useState(false);

  const query = useAsync(
    () => fetchBusinessPromotions(active!.id, false),
    [active?.id],
    { enabled: Boolean(active) },
  );

  const promos = query.data ?? [];

  async function create() {
    if (!title.trim()) {
      toast.fail('Poné un título para la promoción.');
      return;
    }
    if (!unlimited && endsAt <= startsAt) {
      toast.fail('La fecha de fin tiene que ser posterior a la de inicio.');
      return;
    }

    setBusy(true);
    try {
      await createPromotion({
        business_id: active!.id,
        title,
        description,
        // Se guarda en hora local del negocio, no a medianoche UTC.
        starts_at: new Date(`${startsAt}T00:00:00`).toISOString(),
        ends_at: unlimited ? null : new Date(`${endsAt}T23:59:59`).toISOString(),
        unlimited,
      });

      setTitle('');
      setDescription('');
      query.reload();
      toast.success('Promoción publicada.');
    } catch (err) {
      toast.fail(err instanceof Error ? err.message : 'No pudimos crear la promoción.');
    } finally {
      setBusy(false);
    }
  }

  async function toggle(promo: Promotion) {
    query.setData((prev) =>
      prev ? prev.map((p) => (p.id === promo.id ? { ...p, active: !p.active } : p)) : prev,
    );
    try {
      await updatePromotion(promo.id, { active: !promo.active });
    } catch (err) {
      query.reload();
      toast.fail(err instanceof Error ? err.message : 'No pudimos actualizar la promoción.');
    }
  }

  async function remove(promo: Promotion) {
    const { ok } = await confirm({
      title: '¿Eliminar la promoción?',
      message: `"${promo.title}" se borra para siempre. Si sólo querés sacarla del inicio por un tiempo, pausala.`,
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    try {
      await deletePromotion(promo.id);
      query.reload();
      toast.success('Promoción eliminada.');
    } catch (err) {
      toast.fail(err instanceof Error ? err.message : 'No pudimos eliminar la promoción.');
    }
  }

  if (!active) return null;

  return (
    <div style={{ paddingBottom: 24 }}>
      <PageTitle>Promociones</PageTitle>

      {/* Alta */}
      <div
        style={{
          margin: '0 20px',
          background: C.surface,
          border: `1.5px dashed ${C.terracotta}`,
          borderRadius: 16,
          padding: 16,
        }}
      >
        <div
          style={{
            fontSize: 13.5,
            fontWeight: 800,
            color: C.terracottaDark,
            marginBottom: 10,
          }}
        >
          Nueva promoción
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Field
            placeholder="Ej: 2x1 en cortes premium"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Field
            placeholder="Detalle (ej: martes y miércoles)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setUnlimited(false)}
              style={typeStyle(!unlimited)}
            >
              Tiempo limitado
            </button>
            <button onClick={() => setUnlimited(true)} style={typeStyle(unlimited)}>
              Sin vencimiento
            </button>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 130px', minWidth: 0 }}>
              <Field
                label="Empieza"
                type="date"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </div>
            {!unlimited && (
              <div style={{ flex: '1 1 130px', minWidth: 0 }}>
                <Field
                  label="Termina"
                  type="date"
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                />
              </div>
            )}
          </div>

          <Button loading={busy} onClick={() => void create()}>
            Publicar promoción
          </Button>

          <div
            style={{
              fontSize: 11.5,
              color: C.sub,
              textAlign: 'center',
              lineHeight: 1.45,
            }}
          >
            Se muestra automáticamente en el inicio de los clientes.
          </div>
        </div>
      </div>

      {/* Listado */}
      {query.loading && !query.data ? (
        <Loading label="" />
      ) : query.error ? (
        <StateView
          tone="error"
          title="No pudimos cargar las promociones."
          detail={query.error}
          actionLabel="Reintentar"
          onAction={query.reload}
        />
      ) : promos.length === 0 ? (
        <div
          style={{
            fontSize: 13,
            color: C.sub,
            textAlign: 'center',
            padding: '24px 28px',
            lineHeight: 1.5,
          }}
        >
          Todavía no publicaste ninguna promoción.
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            padding: '14px 20px 8px',
          }}
        >
          {promos.map((p) => {
            const expired =
              !p.unlimited && p.ends_at != null && new Date(p.ends_at) < new Date();

            return (
              <div
                key={p.id}
                style={{
                  background: C.surface,
                  border: `1px solid ${C.line}`,
                  borderRadius: 14,
                  padding: '13px 15px',
                  opacity: p.active && !expired ? 1 : 0.55,
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
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 14.5,
                        fontWeight: 800,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {p.title}
                    </div>
                    <div style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>
                      {p.description ||
                        (p.unlimited || !p.ends_at
                          ? 'Sin vencimiento'
                          : `Hasta el ${new Date(p.ends_at).toLocaleDateString('es-PY')}`)}
                    </div>
                  </div>

                  <span
                    style={{
                      background: expired ? C.disabledBg : p.active ? C.cream : C.disabledBg,
                      color: expired ? C.sub : p.active ? C.terracottaDark : C.sub,
                      borderRadius: 999,
                      padding: '4px 10px',
                      fontSize: 11,
                      fontWeight: 800,
                      flexShrink: 0,
                    }}
                  >
                    {expired ? 'Vencida' : p.active ? 'Activa' : 'Pausada'}
                  </span>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    marginTop: 12,
                    paddingTop: 10,
                    borderTop: `1px solid ${C.lineSoft}`,
                  }}
                >
                  <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: C.sub }}>
                    {p.active ? 'Visible para clientes' : 'Oculta'}
                  </span>
                  <Switch checked={p.active} onChange={() => void toggle(p)} />
                  <button
                    onClick={() => void remove(p)}
                    aria-label={`Eliminar ${p.title}`}
                    style={{
                      width: 40,
                      height: 40,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24">
                      <path
                        d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6zM19 4h-3.5l-1-1h-5l-1 1H5v2h14z"
                        fill={C.muted}
                      />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {toast.node}
      {confirmNode}
    </div>
  );
}

function typeStyle(on: boolean) {
  return {
    flex: 1,
    textAlign: 'center' as const,
    borderRadius: 10,
    minHeight: 44,
    padding: '0 8px',
    fontSize: 12.5,
    fontWeight: 700,
    background: on ? C.cream : C.surface,
    color: on ? C.terracottaDark : C.sub,
    border: `1.5px solid ${on ? C.terracotta : C.line}`,
  };
}
