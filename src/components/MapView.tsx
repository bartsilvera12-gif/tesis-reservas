import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { C } from '@/lib/theme';
import { distanceLabel } from '@/lib/format';
import type { BusinessWithMeta } from '@/types/db';
import type { Coords } from '@/services/businesses';
import { NEMBY_CENTRO, NEMBY_CONTORNO, NEMBY_LIMITES, dentroDeNemby } from '@/lib/nemby';

/**
 * Cuánto se puede mirar más allá del límite de Ñemby, en grados (~1,3 km).
 *
 * Sin nada de margen, los locales del borde quedaban pegados al canto del
 * mapa y su globo se cortaba. Con mucho, se volvía a ver medio Gran
 * Asunción, que es justo lo que se quiere evitar.
 */
const MARGEN_LIMITE = 0.012;

/**
 * Mapa de negocios.
 *
 * A diferencia de `reserva-map.js`, acá NO hay ningún pin hardcodeado:
 * los marcadores salen de `businesses.latitude` / `businesses.longitude`.
 */
export function MapView({
  businesses,
  center,
  radiusKm = null,
  onSelect,
  onMapClick,
  height = 250,
  hint = 'Tocá un pin para ver el negocio',
}: {
  businesses: BusinessWithMeta[];
  center?: Coords | null;
  /**
   * Hasta dónde mirar. Con radio, el mapa se abre alrededor de la persona y
   * dibuja el círculo; sin radio, encuadra todos los pines.
   */
  radiusKm?: number | null;
  onSelect: (businessId: string) => void;
  /** Si se pasa, tocar el mapa devuelve la coordenada (selector de ubicación). */
  onMapClick?: (coords: Coords) => void;
  height?: number;
  hint?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  /** Se guardan en refs para no recrear el mapa cada vez que cambian. */
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;

  const didFit = useRef(false);

  /** Aviso corto cuando se toca fuera de Ñemby en el selector de ubicación. */
  const [aviso, setAviso] = useState<string | null>(null);
  const avisoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Creación del mapa (una sola vez).
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const [[sur, oeste], [norte, este]] = NEMBY_LIMITES;
    const limites = L.latLngBounds(
      [sur - MARGEN_LIMITE, oeste - MARGEN_LIMITE],
      [norte + MARGEN_LIMITE, este + MARGEN_LIMITE],
    );

    const map = L.map(containerRef.current, {
      scrollWheelZoom: false,
      attributionControl: true,
      zoomControl: false,
      // Zoom fraccionado. Con los niveles enteros de siempre, encuadrar un
      // radio caía hasta un nivel entero para abajo y el área elegida ocupaba
      // la mitad del mapa: se veía más ciudad de la que se pidió, que es
      // justo lo que se quería evitar.
      zoomSnap: 0.25,
      // El mapa no sale de Ñemby: es la ciudad que delimita el trabajo. Con
      // viscosidad 1 el borde es firme; menos, deja arrastrar afuera y vuelve.
      maxBounds: limites,
      maxBoundsViscosity: 1,
      // Arranca en el centro de Ñemby; apenas llegan los negocios se
      // reencuadra con fitBounds().
    }).setView([NEMBY_CENTRO.lat, NEMBY_CENTRO.lng], 14);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);

    /**
     * Lo que no es Ñemby queda velado y el límite marcado.
     *
     * Es un polígono con agujero: el exterior cubre de sobra todo lo que el
     * mapa deja ver, y el agujero es el distrito. Así se entiende por qué el
     * mapa no deja ir más allá, en vez de sentirlo como una traba.
     */
    const exterior: L.LatLngTuple[] = [
      [sur - 1, oeste - 1],
      [sur - 1, este + 1],
      [norte + 1, este + 1],
      [norte + 1, oeste - 1],
    ];
    L.polygon([exterior, NEMBY_CONTORNO], {
      stroke: false,
      fillColor: C.bgDeep,
      fillOpacity: 0.78,
      interactive: false,
    }).addTo(map);
    L.polygon(NEMBY_CONTORNO, {
      color: C.terracottaDark,
      weight: 2,
      opacity: 0.7,
      dashArray: '6 5',
      fill: false,
      interactive: false,
    }).addTo(map);

    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    map.on('click', (e: L.LeafletMouseEvent) => {
      if (!onMapClickRef.current) return;
      // 6 decimales son ~10 cm: más no aporta y no entraba en el campo.
      const punto = { lat: redondear(e.latlng.lat), lng: redondear(e.latlng.lng) };
      // En el selector, un local fuera de Ñemby no se puede guardar (la base
      // lo rechaza). Se avisa en el momento en vez de dejar mover el pin.
      if (!dentroDeNemby(punto)) {
        setAviso('Ese punto queda fuera de Ñemby');
        if (avisoTimer.current) clearTimeout(avisoTimer.current);
        avisoTimer.current = setTimeout(() => setAviso(null), 2500);
        return;
      }
      onMapClickRef.current(punto);
    });

    // Tocar el globo abre el negocio. Se engancha una sola vez sobre el globo
    // que Leaflet reutiliza, en vez de por marcador: así no quedan listeners
    // sueltos cada vez que se redibujan los pines.
    map.on('popupopen', (e: L.PopupEvent) => {
      const nodo = e.popup.getElement()?.querySelector('[data-negocio]');
      const id = nodo?.getAttribute('data-negocio');
      if (!nodo || !id) return;
      nodo.addEventListener('click', () => onSelectRef.current(id), { once: true });
    });

    // El contenedor arranca con tamaño 0 dentro de flex: hay que avisarle.
    // Recién con el tamaño real se sabe cuánto zoom hace falta para ver la
    // ciudad entera, que es el tope para alejarse.
    const timer = setTimeout(() => {
      map.invalidateSize();
      map.setMinZoom(map.getBoundsZoom(limites, false));
    }, 200);

    return () => {
      clearTimeout(timer);
      if (avisoTimer.current) clearTimeout(avisoTimer.current);
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  // Marcadores: se redibujan cuando cambia la lista.
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();

    const located = businesses.filter(
      (b) => b.latitude != null && b.longitude != null,
    );

    // En el selector de ubicación hay un solo pin y ES el dato que se está
    // eligiendo: ahí conviene la pastilla con el nombre. En el explorador hay
    // muchos y muy juntos, así que van como puntos.
    const eligiendoUbicacion = Boolean(onMapClickRef.current);

    for (const b of located) {
      const icon = eligiendoUbicacion
        ? L.divIcon({
            className: '',
            iconSize: undefined,
            html:
              '<div style="transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center">' +
              `<div style="background:${C.terracotta};color:#fff;font:700 12px Figtree,system-ui,sans-serif;border-radius:999px;padding:9px 12px;white-space:nowrap;box-shadow:0 4px 10px rgba(169,103,76,.45)">${escapeHtml(
                b.name,
              )}</div>` +
              `<div style="width:9px;height:9px;background:${C.terracottaDark};border:2px solid #fff;border-radius:50%;margin-top:2px;box-shadow:0 2px 5px rgba(0,0,0,.3)"></div>` +
              '</div>',
          })
        : /**
           * Un punto, no una pastilla con el nombre.
           *
           * Con los nombres puestos, cuatro locales de la misma zona se
           * tapaban entre sí y no se leía ninguno — justo donde más hace falta
           * el mapa. El nombre aparece al tocar, que además es lo que uno hace
           * para averiguar qué es ese punto.
           *
           * Los 34px de caja son el área tocable: apuntar a un punto chico en
           * un mapa que se mueve es difícil de por sí.
           */
          L.divIcon({
            className: '',
            iconSize: [34, 34],
            iconAnchor: [17, 17],
            html:
              '<div style="width:34px;height:34px;display:flex;align-items:center;justify-content:center;cursor:pointer">' +
              `<div style="width:15px;height:15px;background:${C.terracotta};border:3px solid #fff;border-radius:50%;box-shadow:0 2px 6px rgba(61,50,43,.4)"></div>` +
              '</div>',
          });

      const marker = L.marker([b.latitude as number, b.longitude as number], {
        icon,
        // El pin del selector no debe robarle el toque al mapa: mover el pin
        // es justamente lo que se está haciendo ahí.
        interactive: !eligiendoUbicacion,
      }).addTo(layer);

      if (eligiendoUbicacion) continue;

      const detalle = [b.category?.name, distanceLabel(b.distance_km)]
        .filter(Boolean)
        .join(' · ');

      marker.bindPopup(
        '<div data-negocio="' +
          b.id +
          '" style="cursor:pointer;min-width:130px">' +
          `<div style="font:800 13.5px Figtree,system-ui,sans-serif;color:${C.ink}">${escapeHtml(b.name)}</div>` +
          (detalle
            ? `<div style="font:600 11.5px Figtree,system-ui,sans-serif;color:${C.sub};margin-top:2px">${escapeHtml(detalle)}</div>`
            : '') +
          `<div style="font:800 12px Figtree,system-ui,sans-serif;color:${C.terracottaDark};margin-top:6px">Ver el negocio →</div>` +
          '</div>',
        { closeButton: false, offset: [0, -6] },
      );
    }

    // El área que se está mirando. Se dibuja antes que el punto azul para que
    // el relleno no le pase por encima.
    let circle: L.Circle | null = null;
    if (center && radiusKm) {
      circle = L.circle([center.lat, center.lng], {
        radius: radiusKm * 1000,
        color: C.terracottaDark,
        weight: 1.5,
        opacity: 0.5,
        fillColor: C.terracotta,
        fillOpacity: 0.07,
        interactive: false,
      }).addTo(layer);
    }

    // Marcador de la posición del usuario, si la autorizó.
    if (center) {
      L.circleMarker([center.lat, center.lng], {
        radius: 7,
        color: '#fff',
        weight: 3,
        fillColor: '#2F6FED',
        fillOpacity: 1,
      }).addTo(layer);
    }

    /**
     * En modo selector el usuario mueve el pin: reencuadrar en cada click
     * le pelearía el mapa. Sólo encuadramos la primera vez.
     */
    const shouldFit = !onMapClickRef.current || !didFit.current;

    // Selector: si el pin se movió fuera de la vista (escribiendo la latitud a
    // mano, o eligiendo un barrio), el mapa lo sigue. Antes se quedaba quieto
    // y el pin desaparecía, sin saber dónde había quedado.
    if (eligiendoUbicacion && didFit.current && located[0]) {
      const pin = L.latLng(located[0].latitude as number, located[0].longitude as number);
      if (!map.getBounds().pad(-0.1).contains(pin)) map.panTo(pin);
    }

    if (shouldFit) {
      if (circle) {
        /**
         * Con radio, el encuadre lo manda el círculo y NO los pines.
         *
         * Si lo mandaran los pines, el mapa haría lo contrario de lo que se
         * pide: con un solo local cerca se metería hasta la cuadra, y con uno
         * en la otra punta se abriría hasta ver medio país. Encuadrando el
         * radio, "3 km" se ve siempre igual, haya un local o veinte.
         */
        // Sin animación: esto no es un movimiento que la persona pidió sobre
        // el mapa, es el encuadre inicial de lo que acaba de elegir. Animarlo
        // sólo agrega un salto, y si la animación queda a medias (pestaña en
        // segundo plano) el mapa se queda en el zoom anterior.
        map.fitBounds(circle.getBounds(), { padding: [12, 12], animate: false });
      } else {
        const points: L.LatLngExpression[] = located.map((b) => [
          b.latitude as number,
          b.longitude as number,
        ]);
        if (center) points.push([center.lat, center.lng]);

        if (points.length > 1) {
          map.fitBounds(L.latLngBounds(points), {
            padding: [36, 36],
            maxZoom: 15,
            animate: false,
          });
        } else if (points.length === 1) {
          map.setView(points[0], 15, { animate: false });
        }
      }
      didFit.current = true;
    }

    setTimeout(() => map.invalidateSize(), 120);
  }, [businesses, center, radiusKm]);

  return (
    <div
      style={{
        // En horizontal (o pantallas bajas) el mapa no puede comerse toda la
        // altura útil: se achica para que la lista siga siendo usable.
        height: `min(${height}px, 38dvh)`,
        minHeight: 150,
        borderRadius: 16,
        position: 'relative',
        // Leaflet usa z-index hasta 1000 en sus capas. Sin un contexto propio
        // el mapa se dibujaba encima de la barra fija de "Reservar".
        zIndex: 0,
        isolation: 'isolate',
        overflow: 'hidden',
        border: `1px solid ${C.line}`,
        background: C.bgDeep,
      }}
    >
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      <div
        style={{
          position: 'absolute',
          bottom: 10,
          left: 12,
          fontSize: 10.5,
          color: C.sub,
          background: 'rgba(255,255,255,.85)',
          borderRadius: 6,
          padding: '3px 8px',
          zIndex: 500,
          pointerEvents: 'none',
        }}
      >
        {hint}
      </div>
      {aviso && (
        <div
          role="status"
          style={{
            position: 'absolute',
            top: 10,
            left: '50%',
            transform: 'translateX(-50%)',
            fontSize: 12,
            fontWeight: 700,
            color: '#fff',
            background: C.ink,
            borderRadius: 999,
            padding: '6px 12px',
            zIndex: 600,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}
        >
          {aviso}
        </div>
      )}
    </div>
  );
}

/** Los nombres van dentro de un divIcon con HTML: hay que escaparlos. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const redondear = (n: number) => Math.round(n * 1e6) / 1e6;
