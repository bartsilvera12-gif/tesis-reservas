import { useEffect, useMemo, useState, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAsync } from '@/hooks/useAsync';
import { useGeolocation } from '@/hooks/useGeolocation';
import { fetchBusinesses, fetchCategories } from '@/services/businesses';
import { BusinessRow } from '@/components/BusinessCard';
import { Chip, Loading, StateView } from '@/components/ui';
import { C } from '@/lib/theme';

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
 * Hasta dónde buscar. Arranca en 5 km: en Asunción es "mi zona y las de al
 * lado", que es lo que alguien tiene en la cabeza cuando abre el mapa.
 */
const RADIOS = [1, 3, 5, 10] as const;
const RADIO_INICIAL = 5;

export function Explore() {
  const navigate = useNavigate();
  const { coords, denied } = useGeolocation();

  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [mapMode, setMapMode] = useState(true);
  const [radio, setRadio] = useState<number | null>(RADIO_INICIAL);

  /**
   * Sin ubicación no hay "cerca": el filtro se apaga solo.
   *
   * Es distinto de que la persona elija "Todos". Acá no es una decisión suya,
   * es que no tenemos de dónde medir, y por eso se lo decimos en vez de
   * mostrarle una lista vacía.
   */
  const radioActivo = coords ? radio : null;

  // Buscar por nombre es buscar en toda la ciudad: si alguien escribe
  // "sushi" y el local está a 12 km, quiere verlo igual.
  const radioEfectivo = debounced ? null : radioActivo;

  // Evita disparar una consulta por cada tecla.
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Los filtros salen de la base, no de una lista fija.
  const categoriesQuery = useAsync(() => fetchCategories(), []);
  const categories = useMemo(() => categoriesQuery.data ?? [], [categoriesQuery.data]);

  const listQuery = useAsync(
    () => fetchBusinesses({ search: debounced, categoryId, coords, radiusKm: radioEfectivo }),
    [debounced, categoryId, coords?.lat, coords?.lng, radioEfectivo],
  );

  const businesses = useMemo(() => listQuery.data ?? [], [listQuery.data]);

  const segStyle = (on: boolean) => ({
    flex: 1,
    textAlign: 'center' as const,
    borderRadius: 10,
    // 44px es el minimo tactil recomendado; con 42 el dedo falla mas.
    minHeight: 44,
    padding: '0 8px',
    fontSize: 13,
    fontWeight: 700,
    background: on ? C.surface : 'transparent',
    color: on ? C.terracottaDark : C.sub,
    boxShadow: on ? '0 2px 6px rgba(169,103,76,.12)' : 'none',
  });

  return (
    <div style={{ paddingBottom: 24 }}>
      <div style={{ padding: '16px 20px 0' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: C.surface,
            border: `1.5px solid ${C.line}`,
            borderRadius: 14,
            padding: '0 14px',
            minHeight: 48,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
            <path
              d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14z"
              fill={C.sub}
            />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar restaurantes, barberías, spas…"
            aria-label="Buscar"
            style={{
              flex: 1,
              minWidth: 0,
              border: 'none',
              background: 'transparent',
              padding: '13px 0',
              fontSize: 16,
            }}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              aria-label="Limpiar"
              style={{ flexShrink: 0, color: C.sub, fontSize: 20, lineHeight: 1, width: 32, height: 44 }}
            >
              ×
            </button>
          )}
        </div>

        <div className="hscroll" style={{ marginTop: 12 }}>
          <Chip label="Todos" active={categoryId === null} onClick={() => setCategoryId(null)} />
          {categories.map((cat) => (
            <Chip
              key={cat.id}
              label={cat.name}
              active={categoryId === cat.id}
              onClick={() => setCategoryId(cat.id)}
            />
          ))}
        </div>

        {/* Distancia. Sólo aparece si sabemos desde dónde medir. */}
        {coords && !debounced && (
          <div className="hscroll" style={{ marginTop: 8 }}>
            {RADIOS.map((km) => (
              <Chip
                key={km}
                label={`${km} km`}
                active={radio === km}
                onClick={() => setRadio(km)}
              />
            ))}
            <Chip
              label="Toda la ciudad"
              active={radio === null}
              onClick={() => setRadio(null)}
            />
          </div>
        )}

        <div
          style={{
            display: 'flex',
            background: C.cream,
            borderRadius: 12,
            padding: 3,
            marginTop: 12,
          }}
        >
          <button onClick={() => setMapMode(true)} style={segStyle(mapMode)}>
            Mapa
          </button>
          <button onClick={() => setMapMode(false)} style={segStyle(!mapMode)}>
            Lista
          </button>
        </div>
      </div>

      {mapMode && (
        <div style={{ margin: '14px 20px 0' }}>
          <Suspense fallback={<Loading label="Abriendo el mapa…" />}>
            <MapView
              businesses={businesses}
              center={coords}
              radiusKm={radioEfectivo}
              onSelect={(id) => navigate(`/app/negocio/${id}`)}
              hint={
                radioEfectivo
                  ? `${businesses.length} a menos de ${radioEfectivo} km`
                  : 'Tocá un pin para ver el negocio'
              }
            />
          </Suspense>

          {denied && (
            <div
              style={{
                marginTop: 8,
                fontSize: 12,
                color: C.sub,
                lineHeight: 1.45,
                background: C.disabledBg,
                borderRadius: 10,
                padding: '9px 12px',
              }}
            >
              Sin permiso de ubicación no podemos saber qué te queda cerca, así que
              te mostramos todo. Podés activarlo desde los ajustes del teléfono.
            </div>
          )}
        </div>
      )}

      {listQuery.loading && !listQuery.data ? (
        <Loading label="Buscando…" />
      ) : listQuery.error ? (
        <StateView
          tone="error"
          title="No pudimos cargar los negocios."
          detail={listQuery.error}
          actionLabel="Reintentar"
          onAction={listQuery.reload}
        />
      ) : businesses.length === 0 ? (
        /* Sin nada cerca, lo que hace falta no es un cartel: es el botón que
           resuelve el problema, que casi siempre es mirar un poco más lejos. */
        <StateView
          title={radioEfectivo ? `Nada a menos de ${radioEfectivo} km` : 'Sin resultados'}
          detail={
            debounced
              ? `No encontramos nada para "${debounced}". Probá con otra búsqueda.`
              : radioEfectivo
                ? 'Probá ampliando la distancia.'
                : 'Todavía no hay negocios en esta categoría.'
          }
          actionLabel={
            debounced
              ? 'Limpiar búsqueda'
              : radioEfectivo
                ? siguienteRadio(radioEfectivo)
                  ? `Buscar hasta ${siguienteRadio(radioEfectivo)} km`
                  : 'Buscar en toda la ciudad'
                : undefined
          }
          onAction={
            debounced
              ? () => setSearch('')
              : radioEfectivo
                ? () => setRadio(siguienteRadio(radioEfectivo))
                : undefined
          }
        />
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            padding: '14px 20px 8px',
          }}
        >
          {businesses.map((b) => (
            <BusinessRow
              key={b.id}
              business={b}
              onOpen={() => navigate(`/app/negocio/${b.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** El próximo radio de la lista, o null cuando ya es el más grande. */
function siguienteRadio(actual: number): number | null {
  return RADIOS.find((km) => km > actual) ?? null;
}
