import { useEffect } from 'react';
import { App } from '@capacitor/app';
import { useAuth } from '@/context/AuthContext';
import { fetchUpcomingForReminders } from '@/services/reservations';
import { sincronizarRecordatorios } from '@/services/recordatorios';

/**
 * Mantiene al día los recordatorios de las reservas próximas.
 *
 * Vive en los layouts y no en una pantalla suelta porque los avisos tienen que
 * quedar programados sin importar dónde estuvo la persona: si sólo se
 * programaran al entrar a "Mis reservas", quien nunca abre esa pantalla no
 * recibiría nada.
 *
 * Se vuelve a sincronizar cuando la app pasa a primer plano: es el momento en
 * que pudo haber cambiado algo desde otro dispositivo (el dueño aceptó, el
 * cliente canceló) y además es gratis, porque ya estaba abierta.
 */
export function useRecordatorios() {
  const { profile } = useAuth();
  const userId = profile?.id ?? null;

  useEffect(() => {
    if (!userId) return;

    let vivo = true;

    const sincronizar = async () => {
      try {
        const reservas = await fetchUpcomingForReminders();
        if (!vivo) return;

        // Cada fila se clasifica sola: si la reservó esta persona, el aviso le
        // habla como cliente; si es de su local, como dueño. Así una cuenta con
        // los dos modos recibe el texto que corresponde en cada caso.
        const comoCliente = reservas.filter((r) => r.client_id === userId);
        const comoDueno = reservas.filter((r) => r.client_id !== userId);

        await sincronizarRecordatorios(comoCliente, 'client');
        await sincronizarRecordatorios(comoDueno, 'owner');
      } catch {
        // Sin conexión no se puede reprogramar; los avisos ya programados
        // siguen en pie, que es lo importante.
      }
    };

    // Se espera un momento antes de la primera sincronización: nadie mira los
    // recordatorios, pero su consulta competiría por el ancho de banda con la
    // que sí está esperando la pantalla. Programar un aviso un segundo más
    // tarde no le cambia nada a nadie.
    const demora = setTimeout(() => void sincronizar(), 1200);

    const suscripcion = App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) void sincronizar();
    });

    return () => {
      vivo = false;
      clearTimeout(demora);
      void suscripcion.then((s) => s.remove());
    };
  }, [userId]);
}
