import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useOwnerBusiness } from '@/context/OwnerBusinessContext';
import { useAsync } from '@/hooks/useAsync';
import { useToast } from '@/hooks/useToast';
import { useConfirm } from '@/hooks/useConfirm';
import {
  createCatalogCategory,
  createCatalogItem,
  deactivateCatalogItem,
  fetchBusinessHours,
  fetchCapacity,
  fetchCatalog,
  replaceDaySlots,
  setCapacity,
  setDayEnabled,
  updateBusiness,
  updateCatalogItem,
} from '@/services/businesses';
import { uploadBusinessImage } from '@/services/storage';
import { LADO_LOGO, LADO_PORTADA, prepararImagen } from '@/lib/image';
import {
  Button,
  Field,
  Loading,
  PageTitle,
  SectionLabel,
  Sheet,
  Spinner,
  StateView,
  Stepper,
  Switch,
} from '@/components/ui';
import { C } from '@/lib/theme';
import { dayShort, money, shortTime } from '@/lib/format';
import { ICONS } from '@/components/BottomNav';
import type { BusinessHour, CatalogItem } from '@/types/db';

export function MyBusiness() {
  const { active, reload } = useOwnerBusiness();
  const toast = useToast();

  if (!active) return null;

  return (
    <div style={{ paddingBottom: 28 }}>
      <PageTitle>Mi negocio</PageTitle>

      <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <IdentityCard onSaved={reload} toast={toast} />
        <DescriptionCard onSaved={reload} toast={toast} />
        <HoursCard toast={toast} />
        <CapacityCard toast={toast} />
        <CatalogCard toast={toast} />
        <DepositCard onSaved={reload} toast={toast} />
        <AccountCard />
      </div>

      {toast.node}
    </div>
  );
}

type Toast = ReturnType<typeof useToast>;

/* ─────────────────────  Portada / logo  ───────────────────── */

function IdentityCard({ onSaved, toast }: { onSaved: () => Promise<void>; toast: Toast }) {
  const { active } = useOwnerBusiness();
  const coverRef = useRef<HTMLInputElement | null>(null);
  const logoRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState<'cover' | 'logo' | null>(null);

  if (!active) return null;

  async function upload(file: File | undefined, kind: 'cover' | 'logo') {
    if (!file || !active) return;
    setBusy(kind);
    try {
      // Se achica antes de subir: una foto de celular pesa varios MB y por
      // datos móviles la subida cruda parece que se colgó.
      const listo = await prepararImagen(file, kind === 'cover' ? LADO_PORTADA : LADO_LOGO);
      const url = await uploadBusinessImage(active.id, listo, kind);
      await updateBusiness(active.id, kind === 'cover' ? { cover_url: url } : { logo_url: url });
      await onSaved();
      toast.success('Imagen actualizada.');
    } catch (err) {
      toast.fail(err instanceof Error ? err.message : 'No pudimos subir la imagen.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div
        onClick={() => coverRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && coverRef.current?.click()}
        style={{
          height: 128,
          borderRadius: 16,
          overflow: 'hidden',
          cursor: 'pointer',
          position: 'relative',
          background: active.cover_url
            ? `url(${active.cover_url}) center/cover`
            : C.cream,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: `1.5px dashed ${active.cover_url ? 'transparent' : C.line}`,
        }}
      >
        {!active.cover_url && !busy && (
          <span style={{ fontSize: 12.5, color: C.sub, fontWeight: 600 }}>
            Tocá para subir la portada
          </span>
        )}
        {busy === 'cover' && (
          <span
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(255,255,255,.7)',
            }}
          >
            <Spinner />
          </span>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          marginTop: -34,
          paddingLeft: 14,
          position: 'relative',
          zIndex: 5,
        }}
      >
        <div
          onClick={() => logoRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && logoRef.current?.click()}
          style={{
            width: 68,
            height: 68,
            flexShrink: 0,
            borderRadius: 18,
            border: `3px solid ${C.bg}`,
            cursor: 'pointer',
            background: active.logo_url
              ? `${C.surface} url(${active.logo_url}) center/cover`
              : C.surface,
            boxShadow: '0 4px 12px rgba(61,50,43,.18)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {busy === 'logo' ? (
            <Spinner size={18} />
          ) : !active.logo_url ? (
            <svg width="22" height="22" viewBox="0 0 24 24">
              <path d={ICONS.store} fill={C.muted} />
            </svg>
          ) : null}
        </div>

        <div style={{ marginTop: 22, minWidth: 0 }}>
          <div
            style={{
              fontSize: 17,
              fontWeight: 800,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {active.name}
          </div>
          <div style={{ fontSize: 12, color: C.sub }}>
            {[active.category?.name, active.neighborhood].filter(Boolean).join(' · ')}
          </div>
        </div>
      </div>

      <input
        ref={coverRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          void upload(e.target.files?.[0], 'cover');
          e.target.value = '';
        }}
      />
      <input
        ref={logoRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          void upload(e.target.files?.[0], 'logo');
          e.target.value = '';
        }}
      />
    </div>
  );
}

/* ─────────────────────  Descripción y contacto  ───────────────────── */

function DescriptionCard({
  onSaved,
  toast,
}: {
  onSaved: () => Promise<void>;
  toast: Toast;
}) {
  const { active } = useOwnerBusiness();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [description, setDescription] = useState(active?.description ?? '');
  const [address, setAddress] = useState(active?.address ?? '');
  const [neighborhood, setNeighborhood] = useState(active?.neighborhood ?? '');
  const [phone, setPhone] = useState(active?.phone ?? '');
  const [whatsapp, setWhatsapp] = useState(active?.whatsapp ?? '');

  if (!active) return null;

  async function save() {
    if (!active) return;
    setBusy(true);
    try {
      await updateBusiness(active.id, {
        description: description.trim() || null,
        address: address.trim() || null,
        neighborhood: neighborhood.trim() || null,
        phone: phone.trim() || null,
        whatsapp: whatsapp.trim() || null,
      });
      await onSaved();
      toast.success('Datos guardados.');
      setOpen(false);
    } catch (err) {
      toast.fail(err instanceof Error ? err.message : 'No pudimos guardar los cambios.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Card>
        <SectionLabel>Descripción</SectionLabel>
        <div
          style={{
            fontSize: 13.5,
            color: '#5C5044',
            lineHeight: 1.5,
            marginTop: 5,
          }}
        >
          {active.description || 'Todavía no escribiste una descripción.'}
        </div>
        <button
          onClick={() => setOpen(true)}
          style={{
            fontSize: 12.5,
            fontWeight: 700,
            color: C.terracottaDark,
            marginTop: 8,
            padding: '12px 8px',
            margin: '-12px -8px',
            minHeight: 44,
          }}
        >
          Editar
        </button>
      </Card>

      <Sheet open={open} title="Datos del negocio" onClose={() => setOpen(false)}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field
            label="Descripción"
            multiline
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <Field label="Dirección" value={address} onChange={(e) => setAddress(e.target.value)} />
          <Field
            label="Barrio / Zona"
            value={neighborhood}
            onChange={(e) => setNeighborhood(e.target.value)}
          />
          <Field
            label="Teléfono"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <Field
            label="WhatsApp"
            type="tel"
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
          />
          <Button loading={busy} onClick={() => void save()}>
            Guardar
          </Button>
        </div>
      </Sheet>
    </>
  );
}

/* ─────────────────────  Horarios  ───────────────────── */

function HoursCard({ toast }: { toast: Toast }) {
  const { active } = useOwnerBusiness();
  const [editing, setEditing] = useState<BusinessHour | null>(null);
  const [opensAt, setOpensAt] = useState('11:30');
  const [closesAt, setClosesAt] = useState('23:00');
  const [second, setSecond] = useState(false);
  const [opensAt2, setOpensAt2] = useState('19:00');
  const [closesAt2, setClosesAt2] = useState('23:00');
  const [busy, setBusy] = useState(false);

  const query = useAsync(
    () => fetchBusinessHours(active!.id),
    [active?.id],
    { enabled: Boolean(active) },
  );

  const hours = query.data ?? [];

  async function toggle(hour: BusinessHour) {
    // Optimista: el switch responde ya; si falla, se revierte.
    query.setData((prev) =>
      prev ? prev.map((h) => (h.id === hour.id ? { ...h, enabled: !h.enabled } : h)) : prev,
    );
    try {
      await setDayEnabled(hour.id, !hour.enabled);
    } catch (err) {
      query.setData((prev) =>
        prev ? prev.map((h) => (h.id === hour.id ? { ...h, enabled: hour.enabled } : h)) : prev,
      );
      toast.fail(err instanceof Error ? err.message : 'No pudimos actualizar el día.');
    }
  }

  function openEditor(hour: BusinessHour) {
    const slots = hour.slots ?? [];
    setOpensAt(shortTime(slots[0]?.opens_at) || '11:30');
    setClosesAt(shortTime(slots[0]?.closes_at) || '23:00');
    setSecond(slots.length > 1);
    setOpensAt2(shortTime(slots[1]?.opens_at) || '19:00');
    setClosesAt2(shortTime(slots[1]?.closes_at) || '23:00');
    setEditing(hour);
  }

  async function saveSlots() {
    if (!editing) return;

    if (closesAt <= opensAt) {
      toast.fail('El cierre tiene que ser después de la apertura.');
      return;
    }
    if (second && closesAt2 <= opensAt2) {
      toast.fail('La segunda franja tiene un horario inválido.');
      return;
    }
    if (second && opensAt2 < closesAt) {
      toast.fail('La segunda franja tiene que empezar después de la primera.');
      return;
    }

    setBusy(true);
    try {
      const slots = [{ opens_at: opensAt, closes_at: closesAt }];
      if (second) slots.push({ opens_at: opensAt2, closes_at: closesAt2 });

      await replaceDaySlots(editing.id, slots);
      query.reload();
      toast.success('Horario actualizado.');
      setEditing(null);
    } catch (err) {
      toast.fail(err instanceof Error ? err.message : 'No pudimos guardar el horario.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Card>
        <SectionLabel>Horarios de reserva</SectionLabel>

        {query.loading && !query.data ? (
          <Loading label="" />
        ) : query.error ? (
          <StateView
            tone="error"
            title="No pudimos cargar los horarios."
            actionLabel="Reintentar"
            onAction={query.reload}
          />
        ) : (
          <div style={{ marginTop: 6 }}>
            {[1, 2, 3, 4, 5, 6, 0].map((dow) => {
              const hour = hours.find((h) => h.day_of_week === dow);
              if (!hour) return null;

              const text =
                hour.enabled && hour.slots?.length
                  ? hour.slots
                      .map((s) => `${shortTime(s.opens_at)}–${shortTime(s.closes_at)}`)
                      .join(' · ')
                  : 'Cerrado';

              return (
                <div
                  key={hour.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 0',
                    borderTop: `1px solid ${C.lineSoft}`,
                  }}
                >
                  <div style={{ width: 40, fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                    {dayShort(dow)}
                  </div>
                  <button
                    onClick={() => openEditor(hour)}
                    disabled={!hour.enabled}
                    style={{
                      flex: 1,
                      textAlign: 'left',
                      fontSize: 12,
                      color: hour.enabled ? C.sub : C.disabled,
                      minHeight: 44,
                      padding: '4px 8px',
                      textDecoration: hour.enabled ? 'underline' : 'none',
                      textDecorationColor: C.line,
                    }}
                  >
                    {text}
                  </button>
                  <Switch checked={hour.enabled} onChange={() => void toggle(hour)} />
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Sheet
        open={editing !== null}
        title={editing ? `Horario · ${dayShort(editing.day_of_week)}` : ''}
        onClose={() => setEditing(null)}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 130px', minWidth: 0 }}>
              <Field
                label="Abre"
                type="time"
                value={opensAt}
                onChange={(e) => setOpensAt(e.target.value)}
              />
            </div>
            <div style={{ flex: '1 1 130px', minWidth: 0 }}>
              <Field
                label="Cierra"
                type="time"
                value={closesAt}
                onChange={(e) => setClosesAt(e.target.value)}
              />
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              background: C.surface,
              border: `1px solid ${C.line}`,
              borderRadius: 12,
              padding: '12px 14px',
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700 }}>Horario partido</div>
              <div style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>
                Ej: mediodía y noche
              </div>
            </div>
            <Switch checked={second} onChange={setSecond} />
          </div>

          {second && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 130px', minWidth: 0 }}>
                <Field
                  label="Reabre"
                  type="time"
                  value={opensAt2}
                  onChange={(e) => setOpensAt2(e.target.value)}
                />
              </div>
              <div style={{ flex: '1 1 130px', minWidth: 0 }}>
                <Field
                  label="Cierra"
                  type="time"
                  value={closesAt2}
                  onChange={(e) => setClosesAt2(e.target.value)}
                />
              </div>
            </div>
          )}

          <Button loading={busy} onClick={() => void saveSlots()}>
            Guardar horario
          </Button>
        </div>
      </Sheet>
    </>
  );
}

/* ─────────────────────  Capacidad / mesas  ───────────────────── */

function CapacityCard({ toast }: { toast: Toast }) {
  const { active, reload } = useOwnerBusiness();
  const [concurrent, setConcurrent] = useState(active?.max_concurrent_reservations ?? 1);

  const query = useAsync(
    () => fetchCapacity(active!.id),
    [active?.id],
    { enabled: Boolean(active) },
  );

  if (!active) return null;

  // Barberías y spas usan cupos simultáneos, no mesas.
  if (active.reservation_type === 'service') {
    return (
      <Card>
        <SectionLabel>Turnos simultáneos</SectionLabel>
        <div style={{ fontSize: 12.5, color: C.sub, marginTop: 4, lineHeight: 1.45 }}>
          Cuántas personas podés atender al mismo tiempo.
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 10,
          }}
        >
          <span style={{ fontSize: 13.5, fontWeight: 600 }}>Cupos en paralelo</span>
          <Stepper
            value={concurrent}
            min={1}
            max={50}
            onChange={(next) => {
              setConcurrent(next);
              void updateBusiness(active.id, { max_concurrent_reservations: next })
                .then(reload)
                .catch((err: unknown) => {
                  setConcurrent(active.max_concurrent_reservations);
                  toast.fail(
                    err instanceof Error ? err.message : 'No pudimos guardar el cambio.',
                  );
                });
            }}
          />
        </div>
      </Card>
    );
  }

  const capacities = query.data ?? [];
  const sizes = [2, 4, 6, 8];

  async function change(size: number, quantity: number) {
    // Optimista para que el +/- responda al instante.
    query.setData((prev) => {
      const rows = prev ? [...prev] : [];
      const found = rows.find((c) => c.party_size === size);
      if (found) found.quantity = quantity;
      return rows;
    });

    try {
      await setCapacity(active!.id, size, quantity);
    } catch (err) {
      query.reload();
      toast.fail(err instanceof Error ? err.message : 'No pudimos actualizar las mesas.');
    }
  }

  return (
    <Card>
      <SectionLabel>Mesas por tamaño</SectionLabel>

      {query.loading && !query.data ? (
        <Loading label="" />
      ) : (
        <div style={{ marginTop: 4 }}>
          {sizes.map((size) => {
            const row = capacities.find((c) => c.party_size === size);
            const quantity = row?.quantity ?? 0;

            return (
              <div
                key={size}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 0',
                  borderTop: `1px solid ${C.lineSoft}`,
                }}
              >
                <span style={{ fontSize: 13.5, fontWeight: 600 }}>Mesa para {size}</span>
                <Stepper
                  value={quantity}
                  min={0}
                  max={99}
                  onChange={(next) => void change(size, next)}
                />
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/* ─────────────────────  Carta / servicios  ───────────────────── */

function CatalogCard({ toast }: { toast: Toast }) {
  const { active } = useOwnerBusiness();
  const { confirm, node: confirmNode } = useConfirm();
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<CatalogItem | null>(null);

  const query = useAsync(
    () => fetchCatalog(active!.id, false),
    [active?.id],
    { enabled: Boolean(active) },
  );

  if (!active) return null;

  const isService = active.reservation_type === 'service';
  const items = query.data ?? [];

  async function add() {
    if (!name.trim()) {
      toast.fail('Poné un nombre.');
      return;
    }
    setBusy(true);
    try {
      const category = await createCatalogCategory(
        active!.id,
        isService ? 'Servicios' : 'General',
      );

      await createCatalogItem({
        business_id: active!.id,
        category_id: category.id,
        name: name.trim(),
        price: Number(String(price).replace(/\D/g, '')) || 0,
        item_type: isService ? 'service' : 'product',
        duration_minutes: isService ? active!.default_slot_duration_minutes : null,
        sort_order: items.length + 1,
      });

      setName('');
      setPrice('');
      query.reload();
      toast.success(isService ? 'Servicio agregado.' : 'Producto agregado.');
    } catch (err) {
      toast.fail(err instanceof Error ? err.message : 'No pudimos agregar el producto.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(item: CatalogItem) {
    query.setData((prev) =>
      prev ? prev.map((i) => (i.id === item.id ? { ...i, active: !i.active } : i)) : prev,
    );
    try {
      await updateCatalogItem(item.id, { active: !item.active });
    } catch (err) {
      query.reload();
      toast.fail(err instanceof Error ? err.message : 'No pudimos actualizar.');
    }
  }

  async function remove(item: CatalogItem) {
    const { ok } = await confirm({
      title: '¿Eliminar del catálogo?',
      message: `"${item.name}" deja de mostrarse a los clientes. Las reservas que ya lo tenían no se modifican.`,
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    try {
      await deactivateCatalogItem(item.id);
      query.reload();
      toast.success('Eliminado.');
    } catch (err) {
      toast.fail(err instanceof Error ? err.message : 'No pudimos eliminar.');
    }
  }

  return (
    <>
      <Card>
        <SectionLabel>{isService ? 'Servicios' : 'Carta de productos'}</SectionLabel>

        {query.loading && !query.data ? (
          <Loading label="" />
        ) : items.length === 0 ? (
          <div style={{ fontSize: 13, color: C.sub, padding: '10px 0' }}>
            Todavía no cargaste nada.
          </div>
        ) : (
          <div style={{ marginTop: 4 }}>
            {items.map((item) => (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 0',
                  borderTop: `1px solid ${C.lineSoft}`,
                  opacity: item.active ? 1 : 0.5,
                }}
              >
                <button
                  onClick={() => setEditing(item)}
                  style={{ flex: 1, minWidth: 0, textAlign: 'left', minHeight: 44 }}
                >
                  <div
                    style={{
                      fontSize: 13.5,
                      fontWeight: 600,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      textDecoration: item.active ? 'none' : 'line-through',
                    }}
                  >
                    {item.name}
                  </div>
                  {item.duration_minutes && (
                    <div style={{ fontSize: 11.5, color: C.sub }}>
                      {item.duration_minutes} min
                    </div>
                  )}
                </button>

                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: C.terracottaDark,
                    flexShrink: 0,
                  }}
                >
                  {money(item.price)}
                </span>

                <Switch checked={item.active} onChange={() => void toggleActive(item)} />

                <button
                  onClick={() => void remove(item)}
                  aria-label={`Eliminar ${item.name}`}
                  style={{
                    flexShrink: 0,
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
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={isService ? 'Nuevo servicio' : 'Nuevo producto'}
            style={{
              flex: 2,
              minWidth: 0,
              border: `1.5px solid ${C.line}`,
              borderRadius: 10,
              padding: '11px 12px',
              fontSize: 14,
            }}
          />
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            inputMode="numeric"
            placeholder="₲"
            style={{
              flex: 1,
              minWidth: 0,
              border: `1.5px solid ${C.line}`,
              borderRadius: 10,
              padding: '11px 12px',
              fontSize: 14,
            }}
          />
          <button
            onClick={() => void add()}
            disabled={busy}
            style={{
              background: C.terracotta,
              color: '#fff',
              borderRadius: 10,
              padding: '11px 15px',
              fontSize: 13,
              fontWeight: 800,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {busy && <Spinner size={13} color="#fff" />}
            Añadir
          </button>
        </div>
      </Card>

      {confirmNode}

      <EditItemSheet
        item={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          query.reload();
        }}
        toast={toast}
      />
    </>
  );
}

function EditItemSheet({
  item,
  onClose,
  onSaved,
  toast,
}: {
  item: CatalogItem | null;
  onClose: () => void;
  onSaved: () => void;
  toast: Toast;
}) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [duration, setDuration] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadedId, setLoadedId] = useState<string | null>(null);

  // Sincroniza el formulario cuando se abre con otro item.
  if (item && item.id !== loadedId) {
    setLoadedId(item.id);
    setName(item.name);
    setPrice(String(Math.round(item.price)));
    setDescription(item.description ?? '');
    setDuration(item.duration_minutes ? String(item.duration_minutes) : '');
  }

  async function save() {
    if (!item) return;
    if (!name.trim()) {
      toast.fail('El nombre no puede estar vacío.');
      return;
    }

    setBusy(true);
    try {
      await updateCatalogItem(item.id, {
        name: name.trim(),
        price: Number(String(price).replace(/\D/g, '')) || 0,
        description: description.trim() || null,
        duration_minutes: duration ? Number(duration) : null,
      });
      toast.success('Guardado.');
      onSaved();
    } catch (err) {
      toast.fail(err instanceof Error ? err.message : 'No pudimos guardar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={item !== null} title="Editar" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Nombre" value={name} onChange={(e) => setName(e.target.value)} />
        <Field
          label="Precio (₲)"
          inputMode="numeric"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
        <Field
          label="Descripción"
          multiline
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        {item?.item_type === 'service' && (
          <Field
            label="Duración (minutos)"
            inputMode="numeric"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
          />
        )}
        <Button loading={busy} onClick={() => void save()}>
          Guardar cambios
        </Button>
      </div>
    </Sheet>
  );
}

/* ─────────────────────  Seña  ───────────────────── */

function DepositCard({ onSaved, toast }: { onSaved: () => Promise<void>; toast: Toast }) {
  const { active } = useOwnerBusiness();
  const [amount, setAmount] = useState(String(Math.round(active?.deposit_amount ?? 0)));
  const [busy, setBusy] = useState(false);

  if (!active) return null;

  async function patch(next: Partial<{ deposit_enabled: boolean; deposit_amount: number; deposit_per_person: boolean }>) {
    setBusy(true);
    try {
      await updateBusiness(active!.id, next);
      await onSaved();
    } catch (err) {
      toast.fail(err instanceof Error ? err.message : 'No pudimos guardar el cambio.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 800 }}>Pedir seña al reservar</div>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 2, lineHeight: 1.45 }}>
            {active.deposit_enabled
              ? `${money(active.deposit_amount)}${
                  active.deposit_per_person ? ' por persona' : ' por reserva'
                }`
              : 'Las reservas se hacen sin seña.'}
          </div>
        </div>
        <Switch
          checked={active.deposit_enabled}
          disabled={busy}
          onChange={(next) => void patch({ deposit_enabled: next })}
        />
      </div>

      {active.deposit_enabled && (
        <div
          style={{
            marginTop: 12,
            paddingTop: 12,
            borderTop: `1px solid ${C.lineSoft}`,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <Field
                label="Monto (₲)"
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <Button
              block={false}
              loading={busy}
              onClick={() =>
                void patch({
                  deposit_amount: Number(String(amount).replace(/\D/g, '')) || 0,
                })
              }
              style={{ padding: '13px 18px', fontSize: 14 }}
            >
              Guardar
            </Button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>
              Cobrar por persona
            </div>
            <Switch
              checked={active.deposit_per_person}
              disabled={busy}
              onChange={(next) => void patch({ deposit_per_person: next })}
            />
          </div>

          <div style={{ fontSize: 11.5, color: C.sub, lineHeight: 1.45 }}>
            Por ahora la seña se coordina directamente con el cliente: la app todavía no
            cobra pagos.
          </div>
        </div>
      )}
    </Card>
  );
}

/* ─────────────────────  Cuenta  ───────────────────── */

function AccountCard() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <Card>
      <SectionLabel>Tu cuenta</SectionLabel>
      <div style={{ fontSize: 13.5, color: '#5C5044', marginTop: 5 }}>
        {profile?.full_name}
      </div>
      <div style={{ fontSize: 12, color: C.sub, marginTop: 1 }}>{profile?.email}</div>
      <div style={{ fontSize: 11.5, color: C.sub, marginTop: 6, lineHeight: 1.45 }}>
        Este mismo correo te sirve para las dos cosas: gestionar tu negocio y reservar
        en otros locales.
      </div>

      <button
        onClick={() => navigate('/app')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          marginTop: 12,
          minHeight: 46,
          borderRadius: 12,
          border: `1px solid ${C.terracotta}`,
          background: C.cream,
          color: C.terracottaDark,
          fontSize: 13.5,
          fontWeight: 800,
          padding: '0 14px',
        }}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 2 2 8.5V21h7v-6h6v6h7V8.5z"
            fill="none"
            stroke={C.terracottaDark}
            strokeWidth="2"
          />
        </svg>
        Explorar como cliente
      </button>

      <button
        onClick={() => void signOut()}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginTop: 12,
          paddingTop: 12,
          borderTop: `1px solid ${C.lineSoft}`,
          width: '100%',
          minHeight: 48,
          fontSize: 13.5,
          fontWeight: 700,
          color: C.danger,
        }}
      >
        <svg width="17" height="17" viewBox="0 0 24 24">
          <path
            d="M17 7l-1.4 1.4L18.2 11H8v2h10.2l-2.6 2.6L17 17l5-5zM4 5h8V3H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8v-2H4z"
            fill={C.danger}
          />
        </svg>
        Cerrar sesión
      </button>
    </Card>
  );
}

/* ─────────────────────  Card local  ───────────────────── */

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: C.surface,
        border: `1px solid ${C.line}`,
        borderRadius: 14,
        padding: '14px 16px',
      }}
    >
      {children}
    </div>
  );
}
