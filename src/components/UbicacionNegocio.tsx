import { lazy, Suspense, useMemo, useState } from 'react';
import { Chip, Field, Loading, Spinner } from '@/components/ui';
import { C } from '@/lib/theme';
import { BARRIOS, CIUDAD, dentroDeNemby } from '@/lib/nemby';
import type { Coords } from '@/services/businesses';
import type { BusinessWithMeta } from '@/types/db';

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
 * Dónde está el negocio: barrio y pin en el mapa.
 *
 * Lo usan el alta y "Datos del negocio". Antes la ubicación se elegía sólo al
 * crear el negocio y después no había forma de corregirla: un local guardado
 * en el lugar equivocado quedaba ahí para siempre.
 */
export function UbicacionNegocio({
  barrio,
  onBarrio,
  coords,
  onCoords,
}: {
  barrio: string;
  onBarrio: (barrio: string) => void;
  coords: Coords;
  onCoords: (coords: Coords) => void;
}) {
  return (
    <>
      <div>
        <Field
          label="Barrio"
          placeholder="Pa'i Ñu"
          value={barrio}
          onChange={(e) => onBarrio(e.target.value)}
        />
        {/* Tocar un barrio lo escribe y lleva el pin hasta ahí: el dueño sólo
            tiene que ajustarlo a su cuadra. */}
        <div className="hscroll" style={{ marginTop: 8 }}>
          {BARRIOS.map((b) => (
            <Chip
              key={b.nombre}
              label={b.nombre}
              active={barrio === b.nombre}
              onClick={() => {
                onBarrio(b.nombre);
                onCoords({ lat: b.lat, lng: b.lng });
              }}
            />
          ))}
        </div>
      </div>

      <div style={{ fontSize: 13, color: C.sub, lineHeight: 1.45 }}>
        Ciudad: <strong style={{ color: C.ink }}>{CIUDAD}</strong>
      </div>

      <div>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Ubicación en el mapa</div>
        <SelectorDeUbicacion value={coords} onChange={onCoords} />
        <div style={{ fontSize: 12, color: C.sub, marginTop: 8, lineHeight: 1.45 }}>
          Tocá el mapa donde está tu negocio. Es lo que ven tus clientes al buscarte.
        </div>
      </div>
    </>
  );
}

function SelectorDeUbicacion({
  value,
  onChange,
}: {
  value: Coords;
  onChange: (next: Coords) => void;
}) {
  // Las coordenadas a mano quedan guardadas detrás de un enlace: con el mapa,
  // los barrios y "usar mi ubicación" no hacen falta, y a la vista parecían
  // un dato que había que conseguir y pegar.
  const [aMano, setAMano] = useState(false);

  /** Se reutiliza MapView tratando el pin como un "negocio" temporal. */
  const pseudo = useMemo(
    () => [
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
          height={220}
          hint="Tocá el mapa para mover el pin"
        />
      </Suspense>

      <UsarMiUbicacion onChange={onChange} />

      {aMano ? (
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
      ) : (
        <button
          onClick={() => setAMano(true)}
          style={{ fontSize: 12, color: C.sub, marginTop: 6, padding: '6px 0', textDecoration: 'underline' }}
        >
          Escribir las coordenadas
        </button>
      )}
    </>
  );
}

function UsarMiUbicacion({ onChange }: { onChange: (next: Coords) => void }) {
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);
  const [fuera, setFuera] = useState(false);

  return (
    <div style={{ marginTop: 8 }}>
      <button
        onClick={() => {
          setBusy(true);
          setDenied(false);
          setFuera(false);
          navigator.geolocation?.getCurrentPosition(
            (pos) => {
              const aca = { lat: pos.coords.latitude, lng: pos.coords.longitude };
              setBusy(false);
              // Cargando el negocio desde la casa, en otra ciudad, el pin se
              // iría afuera del mapa. Mejor decirlo que moverlo a ciegas.
              if (!dentroDeNemby(aca)) {
                setFuera(true);
                return;
              }
              onChange(aca);
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
          minHeight: 40,
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
      {fuera && (
        <div style={{ fontSize: 12, color: C.sub, marginTop: 5 }}>
          Ahora estás fuera de {CIUDAD}. Elegí el barrio o tocá el mapa donde está tu negocio.
        </div>
      )}
    </div>
  );
}
