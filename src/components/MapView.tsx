import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { C } from '@/lib/theme';
import type { BusinessWithMeta } from '@/types/db';
import type { Coords } from '@/services/businesses';

/**
 * Mapa de negocios.
 *
 * A diferencia de `reserva-map.js`, acá NO hay ningún pin hardcodeado:
 * los marcadores salen de `businesses.latitude` / `businesses.longitude`.
 */
export function MapView({
  businesses,
  center,
  onSelect,
  onMapClick,
  height = 250,
  hint = 'Tocá un pin para ver el negocio',
}: {
  businesses: BusinessWithMeta[];
  center?: Coords | null;
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

  // Creación del mapa (una sola vez).
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      scrollWheelZoom: false,
      attributionControl: true,
      zoomControl: false,
      // Encuadre inicial sobre Asunción sólo para que el mapa no arranque en
      // el océano; apenas llegan los negocios se reencuadra con fitBounds().
    }).setView([-25.292, -57.6], 13);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);

    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    map.on('click', (e: L.LeafletMouseEvent) => {
      onMapClickRef.current?.({ lat: e.latlng.lat, lng: e.latlng.lng });
    });

    // El contenedor arranca con tamaño 0 dentro de flex: hay que avisarle.
    const timer = setTimeout(() => map.invalidateSize(), 200);

    return () => {
      clearTimeout(timer);
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

    for (const b of located) {
      // El pin es el area tocable: con la pastilla mas chica quedaba en 32px
      // y apuntar en un mapa ya es dificil de por si.
      const icon = L.divIcon({
        className: '',
        iconSize: undefined,
        html:
          '<div style="transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center;cursor:pointer">' +
          `<div style="background:${C.terracotta};color:#fff;font:700 12px Figtree,system-ui,sans-serif;border-radius:999px;padding:9px 12px;white-space:nowrap;box-shadow:0 4px 10px rgba(169,103,76,.45)">${escapeHtml(
            b.name,
          )}</div>` +
          `<div style="width:9px;height:9px;background:${C.terracottaDark};border:2px solid #fff;border-radius:50%;margin-top:2px;box-shadow:0 2px 5px rgba(0,0,0,.3)"></div>` +
          '</div>',
      });

      L.marker([b.latitude as number, b.longitude as number], { icon })
        .addTo(layer)
        .on('click', () => onSelectRef.current(b.id));
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

    // Encuadre: todos los pines visibles.
    const points: L.LatLngExpression[] = located.map((b) => [
      b.latitude as number,
      b.longitude as number,
    ]);
    if (center) points.push([center.lat, center.lng]);

    /**
     * En modo selector el usuario mueve el pin: reencuadrar en cada click
     * le pelearía el mapa. Sólo encuadramos la primera vez.
     */
    const shouldFit = !onMapClickRef.current || !didFit.current;

    if (shouldFit) {
      if (points.length > 1) {
        map.fitBounds(L.latLngBounds(points), { padding: [36, 36], maxZoom: 15 });
      } else if (points.length === 1) {
        map.setView(points[0], 15);
      }
      didFit.current = true;
    }

    setTimeout(() => map.invalidateSize(), 120);
  }, [businesses, center]);

  return (
    <div
      style={{
        // En horizontal (o pantallas bajas) el mapa no puede comerse toda la
        // altura útil: se achica para que la lista siga siendo usable.
        height: `min(${height}px, 38dvh)`,
        minHeight: 150,
        borderRadius: 16,
        position: 'relative',
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
