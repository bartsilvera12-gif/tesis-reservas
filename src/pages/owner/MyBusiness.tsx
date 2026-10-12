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
  Sheet,
  Spinner,
  StateView,
  Stepper,
  Switch,
} from '@/components/ui';
import { C } from '@/lib/theme';
import { CIUDAD, NEMBY_CENTRO, dentroDeNemby } from '@/lib/nemby';
import { UbicacionNegocio } from '@/components/UbicacionNegocio';
import { guardarModo } from '@/lib/modo';
import { usaCantidadDePersonas } from '@/lib/rubros';
import { dayShort, money, shortTime } from '@/lib/format';
import { ICONS } from '@/components/BottomNav';
import type { BusinessHour, BusinessWithMeta, CatalogItem } from '@/types/db';

export function MyBusiness() {
  const { active, reload } = useOwnerBusiness();
  const toast = useToast();

  if (!active) return null;

  // Un hospedaje no tiene mesas ni carta: tiene alojamientos, y cada uno lleva
  // su precio, su descripción y cuántas unidades hay. Por eso las dos
  // secciones se funden en una sola.
  const esHospedaje = active.reservation_type === 'stay';

  return (
    <div style={{ paddingBottom: 28 }}>
      <PageTitle>Mi negocio</PageTitle>

      <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <IdentityCard onSaved={reload} toast={toast} />
        <DescriptionCard onSaved={reload} toast={toast} />
        <HoursCard toast={toast} />
        {esHospedaje ? (
          <AlojamientosCard toast={toast} />
        ) : (
          <>
            <CapacityCard toast={toast} />
            <CatalogCard toast={toast} />
          </>
        )}
        <DepositCard onSaved={reload} toast={toast} />
        <VisibilidadCard onSaved={reload} toast={toast} />
        <OtroNegocio />
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

        {/* Tiene que despejar el borde de la portada: la fila arranca 34px
            más arriba para que el logo la pise, y con menos margen el nombre
            quedaba encima de la foto, en tinta oscura sobre una imagen
            oscura. */}
        <div style={{ marginTop: 40, minWidth: 0 }}>
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
  // Sin coordenadas guardadas, el pin arranca en el centro de Ñemby.
  const [coords, setCoords] = useState(
    active?.latitude != null && active?.longitude != null
      ? { lat: active.latitude, lng: active.longitude }
      : NEMBY_CENTRO,
  );
  const [phone, setPhone] = useState(active?.phone ?? '');
  const [whatsapp, setWhatsapp] = useState(active?.whatsapp ?? '');

  if (!active) return null;

  async function save() {
    if (!active) return;
    if (!dentroDeNemby(coords)) {
      toast.fail(`La ubicación tiene que quedar dentro de ${CIUDAD}. Tocá el mapa para moverla.`);
      return;
    }
    setBusy(true);
    try {
      await updateBusiness(active.id, {
        description: description.trim() || null,
        address: address.trim() || null,
        neighborhood: neighborhood.trim() || null,
        city: CIUDAD,
        latitude: coords.lat,
        longitude: coords.lng,
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

  const faltaDireccion = !active.address?.trim();

  return (
    <>
      <Seccion
        titulo="Datos del negocio"
        alerta={faltaDireccion}
        resumen={
          faltaDireccion
            ? 'Falta la dirección'
            : [active.address, active.neighborhood, active.phone].filter(Boolean).join(' · ')
        }
      >
        <div style={{ fontSize: 13.5, color: '#5C5044', lineHeight: 1.5 }}>
          {active.description || 'Todavía no escribiste una descripción.'}
        </div>
        <button
          onClick={() => setOpen(true)}
          style={{
            fontSize: 12.5,
            fontWeight: 700,
            color: C.terracottaDark,
            marginTop: 10,
            padding: '12px 8px',
            margin: '-2px -8px',
            minHeight: 44,
          }}
        >
          Editar
        </button>
      </Seccion>

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
          <UbicacionNegocio
            barrio={neighborhood}
            onBarrio={setNeighborhood}
            coords={coords}
            onCoords={setCoords}
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

  const abiertos = hours.filter((h) => h.enabled).length;

  return (
    <>
      <Seccion
        titulo="Horarios de reserva"
        alerta={Boolean(query.data) && abiertos === 0}
        resumen={
          query.loading && !query.data
            ? 'Cargando…'
            : abiertos === 0
              ? 'Sin días de atención: nadie puede reservar'
              : `Abre ${abiertos} día${abiertos === 1 ? '' : 's'} por semana`
        }
      >
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
      </Seccion>

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

  // Lavaderos, peluquerías y spas trabajan con cupos simultáneos; los
  // restaurantes, con mesas. Los hospedajes no pasan por acá: sus alojamientos
  // tienen nombre y precio, así que viven en AlojamientosCard.
  if (active.reservation_type === 'service' || active.reservation_type === 'slot') {
    return (
      <Seccion
        titulo="Turnos simultáneos"
        resumen={`${concurrent} a la vez`}
      >
        <div style={{ fontSize: 12.5, color: C.sub, lineHeight: 1.45 }}>
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
      </Seccion>
    );
  }

  const capacities = query.data ?? [];
  const sizes = [2, 4, 6, 8];
  const totalMesas = capacities.reduce((a, c) => a + c.quantity, 0);

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
    <Seccion
      titulo="Mesas"
      alerta={Boolean(query.data) && totalMesas === 0}
      resumen={
        query.loading && !query.data
          ? 'Cargando…'
          : totalMesas === 0
            ? 'Sin mesas cargadas: nadie puede reservar'
            : `${totalMesas} mesa${totalMesas === 1 ? '' : 's'} en total`
      }
    >
      {query.loading && !query.data ? (
        <Loading label="" />
      ) : (
        <div>
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
    </Seccion>
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

  // 'service' y 'slot' venden servicios; el resto, productos de carta.
  const isService =
    active.reservation_type === 'service' || active.reservation_type === 'slot';
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

  const activos = items.filter((i) => i.active).length;

  return (
    <>
      <Seccion
        titulo={isService ? 'Servicios' : 'Carta de productos'}
        // Un spa sin servicios cargados no puede recibir reservas: ahí sí
        // conviene avisar. Un restaurante sin carta funciona igual.
        alerta={isService && Boolean(query.data) && activos === 0}
        resumen={
          query.loading && !query.data
            ? 'Cargando…'
            : activos === 0
              ? isService
                ? 'Sin servicios: no se puede reservar'
                : 'Todavía no cargaste nada'
              : `${activos} ${isService ? 'servicio' : 'producto'}${activos === 1 ? '' : 's'}`
        }
      >
        {query.loading && !query.data ? (
          <Loading label="" />
        ) : items.length === 0 ? (
          <div style={{ fontSize: 13, color: C.sub, padding: '4px 0 10px' }}>
            Todavía no cargaste nada.
          </div>
        ) : (
          <div>
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
                  <div style={{ fontSize: 11.5, color: C.sub, marginTop: 2 }}>
                    <span style={{ fontWeight: 700, color: C.terracottaDark }}>
                      {money(item.price)}
                    </span>
                    {item.duration_minutes ? ` · ${item.duration_minutes} min` : ''}
                  </div>
                </button>

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
      </Seccion>

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
  /**
   * "Por persona" sólo existe donde la reserva dice cuántos van (mesas y
   * hospedajes). En una peluquería o un lavadero el turno es uno: ahí el
   * interruptor no se muestra y la seña es siempre por reserva.
   */
  const porPersona =
    Boolean(active?.deposit_per_person) &&
    usaCantidadDePersonas(active?.reservation_type ?? 'slot');
  const [amount, setAmount] = useState(String(Math.round(active?.deposit_amount ?? 0)));
  const [busy, setBusy] = useState(false);

  // Datos de la cuenta a la que transferir. Se editan juntos y se guardan de
  // una: escribir un número de cuenta a medias y que se guarde solo sería
  // peor que no tenerlo.
  const [banco, setBanco] = useState(active?.deposit_bank_name ?? '');
  const [titular, setTitular] = useState(active?.deposit_account_holder ?? '');
  const [cuenta, setCuenta] = useState(active?.deposit_account_number ?? '');
  const [documento, setDocumento] = useState(active?.deposit_document_id ?? '');
  const [indicaciones, setIndicaciones] = useState(active?.deposit_instructions ?? '');
  const [guardandoBanco, setGuardandoBanco] = useState(false);

  if (!active) return null;

  async function patch(next: Partial<BusinessWithMeta>) {
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

  // La seña sólo se cobra si además hay un monto: con el monto en cero la
  // reserva sale igual, sin pedir comprobante.
  const cobraSena = active.deposit_enabled && active.deposit_amount > 0;
  // Pedir seña sin decir a qué cuenta transferir sí deja al cliente trabado:
  // ve el monto, tiene que subir el comprobante y no tiene dónde pagarlo.
  const faltaCuenta = cobraSena && !active.deposit_account_number?.trim();

  return (
    <Seccion
      titulo="Seña"
      alerta={faltaCuenta}
      resumen={
        !active.deposit_enabled
          ? 'Desactivada: se reserva sin seña'
          : !cobraSena
            ? 'Activada, pero sin monto: no se cobra nada'
            : faltaCuenta
              ? 'Falta cargar la cuenta para transferir'
              : `${money(active.deposit_amount)} ${porPersona ? 'por persona' : 'por reserva'}`
      }
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 800 }}>Pedir seña al reservar</div>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 2, lineHeight: 1.45 }}>
            {active.deposit_enabled
              ? `${money(active.deposit_amount)}${porPersona ? ' por persona' : ' por reserva'}`
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

          {usaCantidadDePersonas(active.reservation_type) && (
            <>
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
            </>
          )}

          <div style={{ borderTop: `1px solid ${C.lineSoft}`, paddingTop: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 3 }}>
              ¿A dónde te transfieren?
            </div>
            <div style={{ fontSize: 11.5, color: C.sub, lineHeight: 1.45, marginBottom: 10 }}>
              Esto se le muestra al cliente al reservar, para que pueda pagar la seña y
              subir el comprobante. Sin estos datos no sabe a dónde depositar.
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Field
                label="Banco o billetera"
                placeholder="Ej: Banco Itaú, Tigo Money"
                value={banco}
                onChange={(e) => setBanco(e.target.value)}
              />
              <Field
                label="Titular de la cuenta"
                placeholder="Nombre como figura en la cuenta"
                value={titular}
                onChange={(e) => setTitular(e.target.value)}
              />
              <Field
                label="Número de cuenta o alias"
                inputMode="numeric"
                placeholder="Ej: 123456789"
                value={cuenta}
                onChange={(e) => setCuenta(e.target.value)}
              />
              <Field
                label="Cédula o RUC (opcional)"
                inputMode="numeric"
                placeholder="Ej: 1234567-8"
                value={documento}
                onChange={(e) => setDocumento(e.target.value)}
              />
              <Field
                label="Aclaraciones (opcional)"
                multiline
                rows={2}
                placeholder="Ej: poné tu nombre en el concepto"
                value={indicaciones}
                onChange={(e) => setIndicaciones(e.target.value)}
              />

              <Button
                loading={guardandoBanco}
                onClick={async () => {
                  setGuardandoBanco(true);
                  try {
                    await patch({
                      deposit_bank_name: banco.trim() || null,
                      deposit_account_holder: titular.trim() || null,
                      deposit_account_number: cuenta.trim() || null,
                      deposit_document_id: documento.trim() || null,
                      deposit_instructions: indicaciones.trim() || null,
                    });
                    toast.success('Datos guardados.');
                  } finally {
                    setGuardandoBanco(false);
                  }
                }}
              >
                Guardar datos bancarios
              </Button>
            </div>
          </div>

          <div style={{ fontSize: 11.5, color: C.sub, lineHeight: 1.45 }}>
            La app no cobra pagos: la seña se transfiere directo a tu cuenta y vos
            revisás el comprobante al aceptar la reserva.
          </div>
        </div>
      )}
    </Seccion>
  );
}

/* ─────────────────────  Visibilidad  ───────────────────── */

/**
 * Sacar el negocio de circulación sin perderlo.
 *
 * No hay "eliminar" a propósito: borrar el local se llevaría por delante las
 * reservas y las reseñas de los clientes, que son datos de ELLOS y además el
 * historial que respalda cualquier reclamo. Pausar hace lo que uno realmente
 * quiere el 99% de las veces — cerrar por vacaciones, por refacción, o dejar
 * de recibir gente un tiempo — y se puede volver atrás.
 */
function VisibilidadCard({
  onSaved,
  toast,
}: {
  onSaved: () => Promise<void>;
  toast: Toast;
}) {
  const { active } = useOwnerBusiness();
  const { confirm, node: confirmNode } = useConfirm();
  const [busy, setBusy] = useState(false);

  if (!active) return null;

  async function cambiar(visible: boolean) {
    if (!visible) {
      const { ok } = await confirm({
        title: '¿Pausar el negocio?',
        message:
          'Deja de aparecer en las búsquedas y no vas a recibir reservas nuevas. Las que ya tenés siguen igual, y lo podés reactivar cuando quieras.',
        confirmLabel: 'Pausar',
      });
      if (!ok) return;
    }

    setBusy(true);
    try {
      await updateBusiness(active!.id, { active: visible });
      await onSaved();
      toast.success(visible ? 'Tu negocio vuelve a estar visible.' : 'Negocio pausado.');
    } catch (err) {
      toast.fail(err instanceof Error ? err.message : 'No pudimos guardar el cambio.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Seccion
        titulo="Visibilidad"
        alerta={!active.active}
        resumen={
          active.active
            ? 'Visible: puede recibir reservas'
            : 'Pausado: no aparece en las búsquedas'
        }
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 800 }}>Visible para los clientes</div>
            <div style={{ fontSize: 12, color: C.sub, marginTop: 2, lineHeight: 1.45 }}>
              Pausado seguís entrando al panel y viendo todo, pero nadie puede reservar.
            </div>
          </div>
          <Switch
            checked={active.active}
            disabled={busy}
            onChange={(next) => void cambiar(next)}
          />
        </div>

        <div style={{ fontSize: 11.5, color: C.sub, marginTop: 12, lineHeight: 1.5 }}>
          No hay opción de eliminar el negocio: se llevaría las reservas y las reseñas
          de tus clientes, que son el respaldo de lo que pasó. Si ya no lo vas a usar,
          pausalo: deja de aparecer para los clientes y su historial queda guardado.
        </div>
      </Seccion>

      {confirmNode}
    </>
  );
}

/* ─────────────────────  Otro negocio  ───────────────────── */

/**
 * Sumar un segundo local.
 *
 * La app siempre supo manejar varios — el panel tiene selector y cada local
 * lleva sus propias reservas, su carta y su seña — pero no había por dónde
 * cargar el segundo: el alta rebotaba a quien ya tenía uno. Va acá y no en el
 * inicio porque es una acción de configuración, no algo del día a día.
 */
function OtroNegocio() {
  const { businesses } = useOwnerBusiness();
  const navigate = useNavigate();

  return (
    <button
      onClick={() => navigate('/panel/configurar')}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        textAlign: 'left',
        minHeight: 56,
        padding: '12px 16px',
        borderRadius: 14,
        border: `1px dashed ${C.line}`,
        background: C.surface,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 30,
          height: 30,
          flexShrink: 0,
          borderRadius: 9,
          background: C.cream,
          color: C.terracottaDark,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 19,
          fontWeight: 700,
          lineHeight: 1,
        }}
      >
        +
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 13.5, fontWeight: 800 }}>
          Agregar otro negocio
        </span>
        <span style={{ display: 'block', fontSize: 12, color: C.sub, marginTop: 2 }}>
          {businesses.length === 1
            ? 'Con la misma cuenta, aparte de este.'
            : `Ya tenés ${businesses.length}. Cambiás entre ellos desde Inicio.`}
        </span>
      </span>
    </button>
  );
}

/* ─────────────────────  Cuenta  ───────────────────── */

function AccountCard() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <Seccion titulo="Tu cuenta" resumen={profile?.email ?? profile?.full_name}>
      <div style={{ fontSize: 13.5, color: '#5C5044' }}>{profile?.full_name}</div>
      <div style={{ fontSize: 11.5, color: C.sub, marginTop: 6, lineHeight: 1.45 }}>
        Este mismo correo te sirve para las dos cosas: gestionar tu negocio y reservar
        en otros locales.
      </div>

      <button
        onClick={() => {
          // Queda anotado: la próxima vez la app abre del lado del cliente.
          if (profile) guardarModo(profile.id, 'client');
          navigate('/app');
        }}
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
    </Seccion>
  );
}

/* ─────────────────────  Alojamientos (hospedajes)  ───────────────────── */

/**
 * Los alojamientos de un hospedaje.
 *
 * Antes esto eran dos secciones sueltas: una tabla de "cuántos tenés para 4
 * personas" y una carta de productos aparte. Pero un hospedaje no vende "un
 * lugar para 4": vende la Cabaña del Lago, que sale tanto la noche, tiene
 * parrilla y de la que hay tres iguales. Eso es una sola cosa, así que se
 * carga de una sola vez.
 *
 * De paso arregla algo que antes no se podía: dos alojamientos distintos para
 * la misma cantidad de personas eran indistinguibles, y el cliente no podía
 * elegir cuál quería ni ver cuánto costaba.
 */
function AlojamientosCard({ toast }: { toast: Toast }) {
  const { active } = useOwnerBusiness();
  const { confirm, node: confirmNode } = useConfirm();
  const [editando, setEditando] = useState<CatalogItem | 'nuevo' | null>(null);

  const query = useAsync(
    () => fetchCatalog(active!.id, false),
    [active?.id],
    { enabled: Boolean(active) },
  );

  if (!active) return null;

  const items = (query.data ?? []).filter((i) => i.item_type === 'room');
  const activos = items.filter((i) => i.active);
  const unidades = activos.reduce((total, i) => total + (i.units ?? 0), 0);

  async function alternar(item: CatalogItem) {
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

  async function borrar(item: CatalogItem) {
    const { ok } = await confirm({
      title: '¿Eliminar el alojamiento?',
      message: `"${item.name}" deja de mostrarse. Las reservas que ya lo tenían no se modifican.`,
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
      <Seccion
        titulo="Alojamientos"
        alerta={Boolean(query.data) && activos.length === 0}
        resumen={
          query.loading && !query.data
            ? 'Cargando…'
            : activos.length === 0
              ? 'Sin alojamientos: nadie puede reservar'
              : `${activos.length} tipo${activos.length === 1 ? '' : 's'} · ${unidades} unidad${
                  unidades === 1 ? '' : 'es'
                }`
        }
      >
        {query.loading && !query.data ? (
          <Loading label="" />
        ) : items.length === 0 ? (
          <div style={{ fontSize: 13, color: C.sub, lineHeight: 1.5, padding: '2px 0 6px' }}>
            Cargá cada tipo de habitación o cabaña con su precio por noche. Si tenés
            tres cabañas iguales, es un solo alojamiento con tres unidades.
          </div>
        ) : (
          <div>
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
                {/* El precio va en la línea de abajo y no al costado: en un
                    teléfono, un nombre como "Cabaña familiar con parrilla" se
                    cortaba a la mitad para dejarle lugar. */}
                <button
                  onClick={() => setEditando(item)}
                  style={{ flex: 1, minWidth: 0, textAlign: 'left', minHeight: 44 }}
                >
                  <div
                    style={{
                      fontSize: 13.5,
                      fontWeight: 700,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      textDecoration: item.active ? 'none' : 'line-through',
                    }}
                  >
                    {item.name}
                  </div>
                  <div style={{ fontSize: 11.5, color: C.sub, marginTop: 2 }}>
                    <span
                      style={{
                        fontWeight: 700,
                        color: item.price > 0 ? C.terracottaDark : C.muted,
                      }}
                    >
                      {item.price > 0 ? `${money(item.price)} / noche` : 'Sin precio'}
                    </span>
                    {' · '}
                    {[
                      item.capacity ? `hasta ${item.capacity}` : null,
                      `${item.units} unidad${item.units === 1 ? '' : 'es'}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                </button>

                <Switch checked={item.active} onChange={() => void alternar(item)} />

                <button
                  onClick={() => void borrar(item)}
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

        <Button onClick={() => setEditando('nuevo')} style={{ marginTop: 12 }}>
          Agregar alojamiento
        </Button>
      </Seccion>

      {confirmNode}

      <AlojamientoSheet
        businessId={active.id}
        item={editando}
        onClose={() => setEditando(null)}
        onSaved={() => {
          setEditando(null);
          query.reload();
        }}
        toast={toast}
      />
    </>
  );
}

/** Alta y edición de un alojamiento. Los mismos campos para los dos casos. */
function AlojamientoSheet({
  businessId,
  item,
  onClose,
  onSaved,
  toast,
}: {
  businessId: string;
  item: CatalogItem | 'nuevo' | null;
  onClose: () => void;
  onSaved: () => void;
  toast: Toast;
}) {
  const esNuevo = item === 'nuevo';
  const actual = item === 'nuevo' ? null : item;

  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [precio, setPrecio] = useState('');
  const [personas, setPersonas] = useState(2);
  const [unidades, setUnidades] = useState(1);
  const [busy, setBusy] = useState(false);
  const [cargado, setCargado] = useState<string | null>(null);

  // Sincroniza el formulario cuando la hoja se abre con otro alojamiento.
  const clave = esNuevo ? 'nuevo' : (actual?.id ?? null);
  if (item !== null && clave !== cargado) {
    setCargado(clave);
    setNombre(actual?.name ?? '');
    setDescripcion(actual?.description ?? '');
    setPrecio(actual ? String(Math.round(actual.price)) : '');
    setPersonas(actual?.capacity ?? 2);
    setUnidades(actual?.units ?? 1);
  }
  if (item === null && cargado !== null) setCargado(null);

  async function guardar() {
    if (!nombre.trim()) {
      toast.fail('Poné un nombre, por ejemplo "Cabaña familiar".');
      return;
    }

    setBusy(true);
    try {
      const datos = {
        name: nombre.trim(),
        description: descripcion.trim() || null,
        price: Number(String(precio).replace(/\D/g, '')) || 0,
        capacity: personas,
        units: unidades,
      };

      if (actual) {
        await updateCatalogItem(actual.id, datos);
      } else {
        // La categoría existe para que el alojamiento aparezca agrupado igual
        // que la carta de los demás rubros; `upsert` la reutiliza si ya está.
        const categoria = await createCatalogCategory(businessId, 'Alojamientos');
        await createCatalogItem({
          business_id: businessId,
          category_id: categoria.id,
          item_type: 'room',
          sort_order: personas,
          ...datos,
        });
      }

      toast.success(actual ? 'Guardado.' : 'Alojamiento agregado.');
      onSaved();
    } catch (err) {
      toast.fail(err instanceof Error ? err.message : 'No pudimos guardar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={item !== null}
      title={esNuevo ? 'Nuevo alojamiento' : 'Editar alojamiento'}
      onClose={onClose}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field
          label="Nombre"
          hint="Como lo va a ver el cliente."
          placeholder="Cabaña familiar"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
        />
        <Field
          label="Descripción"
          hint="Qué incluye: aire, wifi, desayuno, parrilla…"
          multiline
          rows={3}
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
        />
        <Field
          label="Precio por noche (₲)"
          hint="Dejalo en cero si preferís no publicarlo."
          inputMode="numeric"
          value={precio}
          onChange={(e) => setPrecio(e.target.value)}
        />

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700 }}>
              ¿Cuántas personas entran?
            </span>
            <span style={{ display: 'block', fontSize: 11.5, color: C.sub, marginTop: 2 }}>
              El máximo que admite.
            </span>
          </span>
          <Stepper value={personas} min={1} max={50} onChange={setPersonas} />
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700 }}>
              ¿Cuántos iguales tenés?
            </span>
            <span style={{ display: 'block', fontSize: 11.5, color: C.sub, marginTop: 2 }}>
              Cuántas reservas podés tomar de este tipo a la vez.
            </span>
          </span>
          <Stepper value={unidades} min={0} max={99} onChange={setUnidades} />
        </div>

        <Button loading={busy} onClick={() => void guardar()}>
          {esNuevo ? 'Agregar' : 'Guardar cambios'}
        </Button>
      </div>
    </Sheet>
  );
}

/**
 * Una sección plegable que muestra cómo está sin necesidad de abrirla.
 *
 * El panel eran seis tarjetas abiertas una debajo de la otra: para tocar la
 * seña había que pasar por los horarios, las mesas y la carta entera. Ahora el
 * negocio completo entra en una pantalla, cada línea dice cómo está esa parte
 * y se abre sólo la que se quiere tocar.
 *
 * `alerta` marca en ámbar lo que falta para poder recibir reservas: sin eso
 * habría que abrir cada sección para descubrir qué quedó a medias.
 */
function Seccion({
  titulo,
  resumen,
  alerta = false,
  children,
}: {
  titulo: string;
  resumen?: React.ReactNode;
  alerta?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      style={{
        background: C.surface,
        border: `1px solid ${alerta ? C.warnLine : C.line}`,
        borderRadius: 14,
        padding: '0 16px',
      }}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '14px 0',
          minHeight: 56,
          textAlign: 'left',
        }}
      >
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 13.5, fontWeight: 800 }}>{titulo}</span>
          {resumen != null && (
            <span
              style={{
                display: 'block',
                fontSize: 12,
                color: alerta ? C.warn : C.sub,
                marginTop: 2,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {resumen}
            </span>
          )}
        </span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          aria-hidden
          style={{
            flexShrink: 0,
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform .18s',
          }}
        >
          <path d="M7 10l5 5 5-5z" fill={C.muted} />
        </svg>
      </button>

      {open && <div style={{ paddingBottom: 14 }}>{children}</div>}
    </div>
  );
}
