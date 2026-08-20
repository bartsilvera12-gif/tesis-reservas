import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import type { Coords } from '@/services/businesses';

/**
 * Ubicación del usuario, si la autoriza.
 *
 * Nunca bloquea la app: si el permiso se rechaza o falla, devuelve null y
 * las pantallas simplemente no muestran distancias.
 */
export function useGeolocation(): { coords: Coords | null; denied: boolean } {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function locate() {
      try {
        if (Capacitor.isNativePlatform()) {
          // Import dinámico: en web el plugin nativo no hace falta.
          const { Geolocation } = await import('@capacitor/geolocation');

          const status = await Geolocation.checkPermissions();
          if (status.location !== 'granted') {
            const asked = await Geolocation.requestPermissions();
            if (asked.location !== 'granted') {
              if (!cancelled) setDenied(true);
              return;
            }
          }

          const pos = await Geolocation.getCurrentPosition({
            enableHighAccuracy: false,
            timeout: 10_000,
          });
          if (!cancelled) {
            setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          }
          return;
        }

        if (!('geolocation' in navigator)) {
          if (!cancelled) setDenied(true);
          return;
        }

        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (!cancelled) {
              setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
            }
          },
          () => {
            if (!cancelled) setDenied(true);
          },
          { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
        );
      } catch {
        if (!cancelled) setDenied(true);
      }
    }

    void locate();
    return () => {
      cancelled = true;
    };
  }, []);

  return { coords, denied };
}
