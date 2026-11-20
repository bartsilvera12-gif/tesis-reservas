import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { C, FONT } from '@/lib/theme';
import { BusinessLogo } from '@/components/BusinessCard';
import { RatingBadge } from '@/components/ui';
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
  conTarjeta = true,
  enfocar = null,
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
  /**
   * Al tocar un pin se abre una tarjeta con el negocio. En la ficha del
   * propio negocio no tiene sentido (ya se está viendo), y se apaga.
   */
  conTarjeta?: boolean;
  /**
   * Negocio a mostrar apenas abre el mapa: se acerca a su pin y abre su
   * tarjeta. Lo usa el enlace "Ver en el mapa" del asistente.
   */
  enfocar?: string | null;
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

  /** Negocio tocado: se muestra en la tarjeta de abajo y su pin se agranda. */
  const [elegido, setElegido] = useState<string | null>(null);
  const marcadores = useRef(new Map<string, L.Marker>());
  const conTarjetaRef = useRef(conTarjeta);
  conTarjetaRef.current = conTarjeta;
  /** Encuadre de todos los pines, para el botón de volver a verlos. */
  const encuadreRef = useRef<L.LatLngBounds | null>(null);

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

    // Mapa de OpenStreetMap. Los colores se suavizan por CSS (.leaflet-tile-pane
    // en index.css) para que el fondo acompañe la paleta y los pines resalten.
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
      if (!onMapClickRef.current) {
        // Tocar el mapa fuera de un pin cierra la tarjeta.
        setElegido(null);
        return;
      }
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

    marcadores.current.clear();

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
        : iconoPin(b.category?.slug, false);

      const marker = L.marker([b.latitude as number, b.longitude as number], {
        icon,
        // El pin del selector no debe robarle el toque al mapa: mover el pin
        // es justamente lo que se está haciendo ahí.
        interactive: !eligiendoUbicacion,
        keyboard: !eligiendoUbicacion,
        title: b.name,
      }).addTo(layer);

      if (eligiendoUbicacion) continue;

      marcadores.current.set(b.id, marker);
      marker.on('click', () => {
        if (!conTarjetaRef.current) return;
        setElegido(b.id);
        // Acerca un poco (en el centro hay pines muy juntos) y deja el pin
        // por encima del medio, para que la tarjeta de abajo no lo tape.
        const zoom = Math.max(map.getZoom(), 15);
        const alto = map.getSize().y;
        const punto = map.project(marker.getLatLng(), zoom).add([0, alto * 0.18]);
        map.flyTo(map.unproject(punto, zoom), zoom, { duration: 0.45 });
      });
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
          encuadreRef.current = L.latLngBounds(points);
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

    if (circle) encuadreRef.current = circle.getBounds();

    setTimeout(() => map.invalidateSize(), 120);
  }, [businesses, center, radiusKm]);

  // Si el negocio elegido deja de estar en la lista (cambió el filtro), se
  // cierra la tarjeta.
  useEffect(() => {
    if (elegido && !businesses.some((b) => b.id === elegido)) setElegido(null);
  }, [businesses, elegido]);

  // El pin elegido se agranda y pasa al frente; los demás vuelven a su tamaño.
  useEffect(() => {
    for (const [id, marker] of marcadores.current) {
      const b = businesses.find((x) => x.id === id);
      const activo = id === elegido;
      marker.setIcon(iconoPin(b?.category?.slug, activo));
      marker.setZIndexOffset(activo ? 1000 : 0);
    }
  }, [elegido, businesses]);

  // Enfocar un negocio pedido desde afuera (el asistente). Se espera a que el
  // mapa tenga su tamaño real: antes de eso el acercamiento cae corrido.
  useEffect(() => {
    if (!enfocar) return;
    const timer = setTimeout(() => {
      const map = mapRef.current;
      const marker = marcadores.current.get(enfocar);
      if (!map || !marker) return;
      map.invalidateSize();
      setElegido(enfocar);
      const zoom = 16;
      const punto = map.project(marker.getLatLng(), zoom).add([0, map.getSize().y * 0.18]);
      map.setView(map.unproject(punto, zoom), zoom, { animate: false });
    }, 300);
    return () => clearTimeout(timer);
  }, [enfocar, businesses]);

  const negocioElegido = elegido ? businesses.find((b) => b.id === elegido) ?? null : null;

  const verTodos = () => {
    const map = mapRef.current;
    if (!map || !encuadreRef.current) return;
    setElegido(null);
    map.flyToBounds(encuadreRef.current, { padding: [36, 36], maxZoom: 15, duration: 0.5 });
  };

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
      {!negocioElegido && hint && (
        <div
          style={{
            position: 'absolute',
            bottom: 10,
            left: 10,
            fontSize: 11.5,
            fontWeight: 600,
            color: C.ink,
            background: 'rgba(255,255,255,.94)',
            borderRadius: 999,
            padding: '6px 11px',
            zIndex: 500,
            pointerEvents: 'none',
            boxShadow: '0 2px 8px rgba(61,50,43,.12)',
          }}
        >
          {hint}
        </div>
      )}

      {!onMapClick && businesses.length > 1 && (
        <button
          type="button"
          onClick={verTodos}
          aria-label="Ver todos los negocios"
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            zIndex: 500,
            width: 36,
            height: 36,
            borderRadius: 12,
            border: 'none',
            background: 'rgba(255,255,255,.96)',
            boxShadow: '0 2px 8px rgba(61,50,43,.16)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.ink} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" />
          </svg>
        </button>
      )}

      {negocioElegido && (
        <TarjetaNegocio
          negocio={negocioElegido}
          onAbrir={() => onSelect(negocioElegido.id)}
          onCerrar={() => setElegido(null)}
        />
      )}
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

/**
 * Tarjeta del negocio tocado, flotando sobre la parte de abajo del mapa.
 *
 * Reemplaza al globo de Leaflet, que era chico, tapaba los pines vecinos y
 * había que acertarle al texto para entrar. Muestra lo que se mira para
 * decidir (logo, rubro, barrio, puntaje) y las dos cosas que se hacen después:
 * entrar al negocio o abrir el recorrido en la app de mapas del teléfono.
 */
function TarjetaNegocio({
  negocio,
  onAbrir,
  onCerrar,
}: {
  negocio: BusinessWithMeta;
  onAbrir: () => void;
  onCerrar: () => void;
}) {
  const detalle = [negocio.category?.name, negocio.neighborhood, distanceLabel(negocio.distance_km)]
    .filter(Boolean)
    .join(' · ');
  // Abre la app de mapas del teléfono con el recorrido hasta el local.
  const comoLlegar = `https://www.google.com/maps/dir/?api=1&destination=${negocio.latitude},${negocio.longitude}`;
  const boton = {
    flex: 1,
    minHeight: 40,
    borderRadius: 11,
    fontFamily: FONT.sans,
    fontSize: 13,
    fontWeight: 800,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    cursor: 'pointer',
    textDecoration: 'none',
  } as const;
  return (
    <div
      className="tarjeta-mapa"
      style={{
        position: 'absolute',
        left: 10,
        right: 10,
        bottom: 20,
        zIndex: 600,
        background: C.surface,
        borderRadius: 16,
        boxShadow: '0 8px 24px rgba(61,50,43,.22)',
        padding: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <BusinessLogo business={negocio} size={48} radius={12} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: FONT.sans,
              fontSize: 15,
              fontWeight: 800,
              color: C.ink,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {negocio.name}
          </div>
          {detalle && <div style={{ fontSize: 12, color: C.sub, marginTop: 1 }}>{detalle}</div>}
          <div style={{ marginTop: 3 }}>
            <RatingBadge rating={negocio.rating_avg} />
          </div>
        </div>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar"
          style={{
            alignSelf: 'flex-start',
            width: 28,
            height: 28,
            flexShrink: 0,
            borderRadius: 999,
            border: 'none',
            background: C.cream,
            color: C.sub,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button
          type="button"
          onClick={onAbrir}
          style={{ ...boton, border: 'none', background: C.terracotta, color: '#fff' }}
        >
          Ver el negocio
        </button>
        <a
          href={comoLlegar}
          target="_blank"
          rel="noopener noreferrer"
          style={{ ...boton, border: `1.5px solid ${C.line}`, background: C.surface, color: C.terracottaDark }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 11l18-8-8 18-2-8z" />
          </svg>
          Cómo llegar
        </a>
      </div>
    </div>
  );
}

/**
 * Color e ícono de cada rubro, para reconocerlos en el mapa sin tocarlos.
 * Los íconos son trazos simples en SVG (24x24), dibujados en blanco.
 */
const RUBRO: Record<string, { color: string; icono: string }> = {
  restaurantes: {
    color: '#C46F52',
    icono: '<path d="M7 3v8a2 2 0 0 0 2 2v8M11 3v8a2 2 0 0 1-2 2M9 3v6"/><path d="M17 21V3c-2 1.5-3 4-3 7v3h3"/>',
  },
  peluquerias: {
    color: '#8A5E86',
    icono: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/>',
  },
  'spa-de-unas': {
    color: '#4F8A7C',
    icono: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 17l.7 1.8 1.8.7-1.8.7L19 22l-.7-1.8-1.8-.7 1.8-.7z"/>',
  },
  lavaderos: {
    color: '#3F7AA8',
    icono: '<path d="M5 17h14v-4l-2-5H7l-2 5z"/><path d="M5 13h14"/><circle cx="8" cy="17" r="2"/><circle cx="16" cy="17" r="2"/>',
  },
  hospedajes: {
    color: '#B07F2E',
    icono: '<path d="M3 20V6M3 16h18v4M21 16v-4a3 3 0 0 0-3-3h-7v7"/><circle cx="7" cy="11.5" r="2"/>',
  },
};

const RUBRO_GENERICO = {
  color: C.terracottaDark,
  icono: '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
};

/**
 * Pin en forma de gota con el ícono del rubro.
 *
 * La caja es más grande que el dibujo a propósito: es el área tocable, y
 * acertarle a un pin chico en un mapa que se mueve cuesta. El elegido se
 * agranda para que se note cuál es el de la tarjeta.
 */
function iconoPin(slug: string | null | undefined, activo: boolean): L.DivIcon {
  const { color, icono } = (slug && RUBRO[slug]) || RUBRO_GENERICO;
  const lado = activo ? 42 : 32;
  const glifo = activo ? 20 : 16;
  const caja = lado + 12;
  return L.divIcon({
    className: 'pin-negocio' + (activo ? ' pin-negocio--activo' : ''),
    iconSize: [caja, caja + 4],
    // La punta de la gota (cuadrado girado 45°) queda a lado/2 + lado·0,707 del borde de arriba.
    iconAnchor: [caja / 2, Math.round(2 + lado / 2 + lado * 0.707)],
    html:
      `<div class="pin-negocio__caja" style="width:${caja}px;height:${caja + 4}px;display:flex;align-items:flex-start;justify-content:center;cursor:pointer">` +
      `<div style="width:${lado}px;height:${lado}px;margin-top:2px;background:${color};border:${activo ? 3 : 2.5}px solid #fff;border-radius:50% 50% 50% 4px;transform:rotate(-45deg);box-shadow:0 ${activo ? 6 : 3}px ${activo ? 14 : 8}px rgba(61,50,43,${activo ? 0.45 : 0.35});display:flex;align-items:center;justify-content:center">` +
      `<svg width="${glifo}" height="${glifo}" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="transform:rotate(45deg)">${icono}</svg>` +
      '</div></div>',
  });
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
