import { useEffect, useMemo, useState, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useOwnerBusiness } from '@/context/OwnerBusinessContext';
import { useAsync } from '@/hooks/useAsync';
import {
  createBusiness,
  ensureBusinessHours,
  fetchCategories,
  setCapacity,
  updateBusiness,
} from '@/services/businesses';
import { uploadBusinessImage } from '@/services/storage';
import { Button, Field, Loading, Spinner } from '@/components/ui';
import { C, FONT } from '@/lib/theme';
import { dayShort, slugify } from '@/lib/format';
import { rubroDe, tamanosIniciales } from '@/lib/rubros';
import { ErrorImagen, LADO_LOGO, LADO_PORTADA, prepararImagen } from '@/lib/image';
import type { BusinessWithMeta, ReservationType } from '@/types/db';

/**
 * El mapa se carga aparte, sólo cuando se va a ver.
 *
 * Leaflet pesa como un tercio del paquete y no lo necesita casi nadie: en el
 * teléfono, ese peso es tiempo de arranque en TODAS las pantallas, aunque
 * nunca se abra el mapa.
 */
const MapView = lazy(() =>
  import('@/components/MapView').then((m) => ({ default: m.MapView })),
);

/**
 * Posición inicial del pin en el selector de ubicación (centro de Asunción).
 * No es el dato de ningún negocio: es sólo desde dónde arranca a arrastrar
 * el dueño, que después queda guardado en businesses.latitude/longitude.
 */
const DEFAULT_CENTER = { lat: -25.2967, lng: -57.5759 };

const STEPS = ['Tu negocio', 'Ubicación', 'Reservas'] as const;

export function OwnerOnboarding() {
  const { profile } = useAuth();
  const { reload } = useOwnerBusiness();
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<'logo' | 'cover' | null>(null);

  // Paso 1
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);

  // Paso 2
  const [address, setAddress] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [city, setCity] = useState('Asunción');
  const [coords, setCoords] = useState(DEFAULT_CENTER);

  // Paso 3
  const [reservationType, setReservationType] = useState<ReservationType>('table');
  const [duration, setDuration] = useState(90);
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [opensAt, setOpensAt] = useState('11:30');
  const [closesAt, setClosesAt] = useState('23:00');
  const [maxConcurrent, setMaxConcurrent] = useState(2);
  const [tables, setTables] = useState<Record<number, number>>({ 2: 4, 4: 3, 6: 1, 8: 0 });

  const categoriesQuery = useAsync(() => fetchCategories(), []);
  const categories = useMemo(() => categoriesQuery.data ?? [], [categoriesQuery.data]);

  // Todo el paso de reservas se rotula según el rubro elegido.
  const rubro = useMemo(
    () => rubroDe(categories.find((c) => c.id === categoryId)?.slug),
    [categories, categoryId],
  );

  function next() {
    setError(null);

    if (step === 0) {
      if (!name.trim()) return setError('Poné el nombre de tu negocio.');
      if (!categoryId) return setError('Elegí una categoría.');
    }
    if (step === 1) {
      if (!address.trim()) return setError('Escribí la dirección.');
      if (!city.trim()) return setError('Escribí la ciudad.');
    }

    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  async function onFinish() {
    setError(null);

    if (reservationType === 'table' || reservationType === 'stay') {
      const total = Object.values(tables).reduce((a, b) => a + b, 0);
      if (total === 0) {
        setError(
          reservationType === 'stay'
            ? 'Configurá al menos un alojamiento para poder recibir reservas.'
            : 'Configurá al menos una mesa para poder recibir reservas.',
        );
        return;
      }
    }
    if (!days.length) {
      setError('Elegí al menos un día de atención.');
      return;
    }
    if (closesAt <= opensAt) {
      setError('El horario de cierre tiene que ser posterior al de apertura.');
      return;
    }

    setBusy(true);
    try {
      // Un sufijo corto evita chocar con el slug de otro negocio homónimo.
      const slug = `${slugify(name)}-${Math.random().toString(36).slice(2, 7)}`;

      const business = await createBusiness({
        owner_id: profile!.id,
        category_id: categoryId,
        name: name.trim(),
        slug,
        description: description.trim() || null,
        address: address.trim(),
        neighborhood: neighborhood.trim() || null,
        city: city.trim(),
        latitude: coords.lat,
        longitude: coords.lng,
        phone: phone.trim() || null,
        whatsapp: whatsapp.trim() || null,
        active: true,
        reservation_type: reservationType,
        default_slot_duration_minutes: duration,
        slot_step_minutes: rubro.paso,
        // 'table' y 'stay' llevan la capacidad en business_capacity (por
        // tamaño); 'slot' y 'service' con un solo número de turnos a la vez.
        max_concurrent_reservations:
          reservationType === 'slot' || reservationType === 'service' ? maxConcurrent : 1,
      });

      await ensureBusinessHours(business.id, {
        enabledDays: days,
        opensAt,
        closesAt,
      });

      if (reservationType === 'table' || reservationType === 'stay') {
        for (const [size, quantity] of Object.entries(tables)) {
          if (quantity > 0) await setCapacity(business.id, Number(size), quantity);
        }
      }

      // Las imágenes van después: la política de Storage exige que el
      // negocio exista para validar que quien sube es el dueño.
      const patch: Record<string, string> = {};
      if (logoFile) {
        setUploading('logo');
        patch.logo_url = await uploadBusinessImage(business.id, logoFile, 'logo');
      }
      if (coverFile) {
        setUploading('cover');
        patch.cover_url = await uploadBusinessImage(business.id, coverFile, 'cover');
      }
      setUploading(null);

      if (Object.keys(patch).length) await updateBusiness(business.id, patch);

      await reload();
      navigate('/panel', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos crear tu negocio.');
    } finally {
      setBusy(false);
      setUploading(null);
    }
  }

  if (categoriesQuery.loading && !categoriesQuery.data) return <Loading label="" />;

  return (
    <div style={{ paddingBottom: 32 }}>
      <div style={{ padding: '22px 20px 6px' }}>
        <div style={{ fontFamily: FONT.display, fontSize: 27 }}>Configurá tu negocio</div>
        <div style={{ fontSize: 13.5, color: C.sub, marginTop: 5, lineHeight: 1.5 }}>
          Sólo una vez. Después podés cambiar todo desde “Negocio”.
        </div>

        {/* Progreso */}
        <div style={{ display: 'flex', gap: 6, marginTop: 16 }}>
          {STEPS.map((label, i) => (
            <div key={label} style={{ flex: 1 }}>
              <div
                style={{
                  height: 4,
                  borderRadius: 2,
                  background: i <= step ? C.terracotta : C.line,
                  transition: 'background .25s',
                }}
              />
              <div
                style={{
                  fontSize: 10.5,
                  fontWeight: i === step ? 800 : 600,
                  color: i <= step ? C.terracottaDark : C.muted,
                  marginTop: 5,
                }}
              >
                {label}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: '14px 20px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {step === 0 && (
          <>
            <Field
              label="Nombre del negocio"
              placeholder="La Cabaña"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <div>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Categoría</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {categories.map((cat) => {
                  const on = categoryId === cat.id;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => {
                        setCategoryId(cat.id);
                        // El rubro define cómo se reserva: no hace falta
                        // preguntárselo aparte al dueño.
                        const r = rubroDe(cat.slug);
                        setReservationType(r.tipo);
                        setDuration(r.duracion);
                        const iniciales = tamanosIniciales(r.tipo);
                        if (Object.keys(iniciales).length) setTables(iniciales);
                      }}
                      style={{
                        borderRadius: 999,
                        padding: '10px 16px',
                        fontSize: 13,
                        fontWeight: 700,
                        background: on ? C.terracottaDark : C.surface,
                        color: on ? '#fff' : C.sub,
                        border: `1.5px solid ${on ? C.terracottaDark : C.line}`,
                      }}
                    >
                      {cat.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <Field
              label="Descripción"
              multiline
              rows={3}
              placeholder="Contá en pocas líneas qué ofrece tu negocio."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />

            <Field
              label="Teléfono"
              type="tel"
              inputMode="tel"
              placeholder="+595 21 000 000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <Field
              label="WhatsApp"
              type="tel"
              inputMode="tel"
              placeholder="+595 9xx xxx xxx"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
            />

            <ImagePicker
              label="Logo"
              maxLado={LADO_LOGO}
              file={logoFile}
              onPick={setLogoFile}
              busy={uploading === 'logo'}
              aspect={1}
            />
            <ImagePicker
              label="Portada"
              maxLado={LADO_PORTADA}
              file={coverFile}
              onPick={setCoverFile}
              busy={uploading === 'cover'}
              aspect={2.4}
            />
          </>
        )}

        {step === 1 && (
          <>
            <Field
              label="Dirección"
              placeholder="Av. Mcal. López 1234"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
            <Field
              label="Barrio / Zona"
              placeholder="Villa Morra"
              value={neighborhood}
              onChange={(e) => setNeighborhood(e.target.value)}
            />
            <Field
              label="Ciudad"
              placeholder="Asunción"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />

            <div>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
                Ubicación en el mapa
              </div>
              <LocationPicker value={coords} onChange={setCoords} />
              <div style={{ fontSize: 12, color: C.sub, marginTop: 8, lineHeight: 1.45 }}>
                Tocá el mapa para mover el pin. Es lo que ven tus clientes al buscarte.
              </div>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <Field
              label="Duración de cada reserva (minutos)"
              type="number"
              inputMode="numeric"
              min={15}
              max={480}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value) || 60)}
            />

            <div>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
                Días que atendés
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {[1, 2, 3, 4, 5, 6, 0].map((dow) => {
                  const on = days.includes(dow);
                  return (
                    <button
                      key={dow}
                      onClick={() =>
                        setDays((prev) =>
                          prev.includes(dow) ? prev.filter((d) => d !== dow) : [...prev, dow],
                        )
                      }
                      style={{
                        flex: 1,
                        borderRadius: 10,
                        padding: '10px 0',
                        fontSize: 12,
                        fontWeight: 700,
                        background: on ? C.terracotta : C.surface,
                        color: on ? '#fff' : C.sub,
                        border: `1.5px solid ${on ? C.terracotta : C.line}`,
                      }}
                    >
                      {dayShort(dow)}
                    </button>
                  );
                })}
              </div>
            </div>

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

            {reservationType === 'table' || reservationType === 'stay' ? (
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                  {rubro.capacidad.titulo}
                </div>
                <div style={{ fontSize: 12, color: C.sub, marginBottom: 8, lineHeight: 1.45 }}>
                  {rubro.capacidad.ayuda}
                </div>
                <div
                  style={{
                    background: C.surface,
                    border: `1px solid ${C.line}`,
                    borderRadius: 14,
                    padding: '6px 16px',
                  }}
                >
                  {Object.keys(tables)
                    .map(Number)
                    .sort((a, b) => a - b)
                    .map((size) => (
                    <div
                      key={size}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 0',
                        borderTop: size === 2 ? 'none' : `1px solid ${C.lineSoft}`,
                      }}
                    >
                      <span style={{ fontSize: 13.5, fontWeight: 600 }}>
                        {rubro.capacidad.unidad(size)}
                      </span>
                      <Field
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={99}
                        value={tables[size] ?? 0}
                        onChange={(e) =>
                          setTables((prev) => ({
                            ...prev,
                            [size]: Math.max(0, Number(e.target.value) || 0),
                          }))
                        }
                        style={{ width: 74, textAlign: 'center', padding: '9px 8px' }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <Field
                label={rubro.capacidad.titulo}
                hint={rubro.capacidad.ayuda}
                type="number"
                inputMode="numeric"
                min={1}
                max={50}
                value={maxConcurrent}
                onChange={(e) => setMaxConcurrent(Math.max(1, Number(e.target.value) || 1))}
              />
            )}
          </>
        )}

        {error && (
          <div
            role="alert"
            style={{
              background: C.dangerBg,
              color: C.danger,
              borderRadius: 12,
              padding: '11px 14px',
              fontSize: 13,
              fontWeight: 600,
              lineHeight: 1.45,
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          {step > 0 && (
            <Button variant="ghost" onClick={() => setStep((s) => s - 1)} disabled={busy}>
              Atrás
            </Button>
          )}
          {step < STEPS.length - 1 ? (
            <Button onClick={next}>Continuar</Button>
          ) : (
            <Button loading={busy} onClick={() => void onFinish()}>
              {uploading ? 'Subiendo imágenes…' : 'Crear mi negocio'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────  Selector de imagen  ───────────────────── */

function ImagePicker({
  label,
  file,
  onPick,
  busy,
  aspect,
  maxLado,
}: {
  label: string;
  file: File | null;
  onPick: (file: File | null) => void;
  busy: boolean;
  aspect: number;
  maxLado: number;
}) {
  const [procesando, setProcesando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);

  // La URL se crea y se libera dentro del mismo efecto a propósito. Con
  // `useMemo` para crearla y un efecto aparte para liberarla, React puede
  // descartar el valor memorizado (o reejecutar el efecto en StrictMode) y
  // queda una URL revocada apuntada por el `background`: la vista previa se
  // ve en blanco y parece que la app se colgó. Sin liberarla, cada imagen
  // probada queda retenida en memoria.
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  /**
   * Se procesa apenas se elige, no al enviar el formulario: así el error de
   * una foto que no sirve aparece en el momento y no después de haber
   * completado los tres pasos.
   */
  async function elegir(elegido: File | undefined) {
    if (!elegido) return;
    setFallo(null);
    setProcesando(true);
    try {
      onPick(await prepararImagen(elegido, maxLado));
    } catch (err) {
      onPick(null);
      setFallo(
        err instanceof ErrorImagen
          ? err.message
          : 'No pudimos usar esa imagen. Probá con otra.',
      );
    } finally {
      setProcesando(false);
    }
  }

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>{label}</div>
      <label
        style={{
          display: 'block',
          width: '100%',
          aspectRatio: String(aspect),
          maxHeight: 150,
          borderRadius: 14,
          border: `1.5px dashed ${C.line}`,
          background: preview ? `url(${preview}) center/cover` : C.surface,
          cursor: 'pointer',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <input
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            void elegir(e.target.files?.[0]);
            // Se limpia para que elegir la misma foto otra vez vuelva a disparar.
            e.target.value = '';
          }}
        />
        {!preview && !busy && !procesando && (
          <span
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12.5,
              color: C.sub,
              fontWeight: 600,
            }}
          >
            Tocá para elegir una imagen
          </span>
        )}
        {(busy || procesando) && (
          <span
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 7,
              background: 'rgba(255,255,255,.7)',
            }}
          >
            <Spinner />
            <span style={{ fontSize: 11.5, color: C.sub, fontWeight: 600 }}>
              {procesando ? 'Preparando la imagen…' : 'Subiendo…'}
            </span>
          </span>
        )}
      </label>

      {fallo && (
        <div style={{ marginTop: 6, fontSize: 12, color: C.danger, lineHeight: 1.45 }}>
          {fallo}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────  Selector de ubicación  ───────────────────── */

function LocationPicker({
  value,
  onChange,
}: {
  value: { lat: number; lng: number };
  onChange: (next: { lat: number; lng: number }) => void;
}) {
  /**
   * Se reutiliza MapView tratando el pin como un "negocio" temporal.
   * Los ajustes finos de lat/lng quedan disponibles debajo por si el
   * usuario prefiere escribirlos.
   */
  const pseudo = useMemo(
    () =>
      [
        {
          id: 'picker',
          name: 'Tu negocio',
          latitude: value.lat,
          longitude: value.lng,
        } as unknown as BusinessWithMeta,
      ],
    [value],
  );

  return (
    <>
      <Suspense fallback={<Loading label="Abriendo el mapa…" />}>
        <MapView
          businesses={pseudo}
          center={null}
          onSelect={() => {}}
          onMapClick={onChange}
          height={200}
          hint="Tocá el mapa para mover el pin"
        />
      </Suspense>
      <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
        <div style={{ flex: 1 }}>
          <Field
            label="Latitud"
            type="number"
            step="0.0001"
            value={value.lat}
            onChange={(e) => onChange({ ...value, lat: Number(e.target.value) })}
          />
        </div>
        <div style={{ flex: 1 }}>
          <Field
            label="Longitud"
            type="number"
            step="0.0001"
            value={value.lng}
            onChange={(e) => onChange({ ...value, lng: Number(e.target.value) })}
          />
        </div>
      </div>
      <UseMyLocation onChange={onChange} />
    </>
  );
}

function UseMyLocation({
  onChange,
}: {
  onChange: (next: { lat: number; lng: number }) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);

  return (
    <div style={{ marginTop: 8 }}>
      <button
        onClick={() => {
          setBusy(true);
          setDenied(false);
          navigator.geolocation?.getCurrentPosition(
            (pos) => {
              onChange({ lat: pos.coords.latitude, lng: pos.coords.longitude });
              setBusy(false);
            },
            () => {
              setDenied(true);
              setBusy(false);
            },
            { enableHighAccuracy: true, timeout: 10_000 },
          );
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 13,
          fontWeight: 700,
          color: C.terracottaDark,
        }}
      >
        {busy ? <Spinner size={14} /> : null}
        Usar mi ubicación actual
      </button>
      {denied && (
        <div style={{ fontSize: 12, color: C.sub, marginTop: 5 }}>
          No pudimos obtener tu ubicación. Podés moverla a mano.
        </div>
      )}
    </div>
  );
}
