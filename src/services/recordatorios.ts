import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { ReservationWithRelations } from '@/types/db';

/**
 * Avisos antes de la reserva, en el propio teléfono.
 *
 * Son notificaciones LOCALES y no push a propósito. Un push necesita FCM,
 * certificados y un servidor que despierte a cada rato; y una fila en la tabla
 * `notifications` sólo se ve si la persona abre la app, que es justo lo que un
 * recordatorio tiene que evitar. Las locales las programa el sistema operativo
 * y suenan con la app cerrada, sin nada del otro lado.
 *
 * Limitación honesta: viven en el dispositivo donde se programaron. Si alguien
 * reserva desde otro teléfono, el aviso no lo sigue. Por eso se reprograma todo
 * cada vez que la app abre y cada vez que cambian las reservas.
 */

/** Cuánto antes avisar, en minutos. */
export const ANTELACIONES = [60, 30, 15] as const;

const CANAL = 'recordatorios';

/** En el navegador el plugin no programa nada: sólo corre dentro del APK. */
const disponible = () => Capacitor.isNativePlatform();

/**
 * Un id numérico y estable por (reserva, antelación).
 *
 * El plugin exige enteros de 32 bits, así que no sirve el uuid. Se deriva del
 * uuid con un hash: siendo estable, reprogramar la misma reserva pisa el aviso
 * anterior en vez de duplicarlo.
 */
function idDeAviso(reservationId: string, minutos: number): number {
  let h = 0;
  for (let i = 0; i < reservationId.length; i++) {
    h = (h * 31 + reservationId.charCodeAt(i)) | 0;
  }
  // Se deja lugar para las tres antelaciones sin que se pisen entre sí.
  return Math.abs(h % 10_000_000) * 10 + ANTELACIONES.indexOf(minutos as 60) + 1;
}

/** Pide permiso si hace falta. Devuelve si quedó concedido. */
export async function pedirPermisoDeAvisos(): Promise<boolean> {
  if (!disponible()) return false;
  try {
    const actual = await LocalNotifications.checkPermissions();
    if (actual.display === 'granted') return true;
    if (actual.display === 'denied') return false;
    const pedido = await LocalNotifications.requestPermissions();
    return pedido.display === 'granted';
  } catch {
    return false;
  }
}

/** El momento exacto de la reserva, en la hora del teléfono. */
function momentoDe(r: ReservationWithRelations): Date {
  return new Date(`${r.reservation_date}T${r.reservation_time}`);
}

function textoCliente(r: ReservationWithRelations, minutos: number) {
  const donde = r.business?.name ?? 'tu reserva';
  return {
    title: minutos >= 60 ? `Falta una hora` : `Faltan ${minutos} minutos`,
    body: `Tu reserva en ${donde} es a las ${r.reservation_time.slice(0, 5)}.`,
  };
}

function textoDueno(r: ReservationWithRelations, minutos: number) {
  const quien = r.client?.full_name ?? 'Un cliente';
  return {
    title: minutos >= 60 ? 'Reserva en una hora' : `Reserva en ${minutos} minutos`,
    body: `${quien} · ${r.reservation_time.slice(0, 5)} h${
      r.party_size ? ` · ${r.party_size} personas` : ''
    }`,
  };
}

export interface AvisoProgramado {
  id: number;
  title: string;
  body: string;
  channelId: string;
  schedule: { at: Date; allowWhileIdle: boolean };
  extra: { reservationId: string };
}

/**
 * Qué avisos corresponden, dado un momento. Pura a propósito: sin esto habría
 * que tener un teléfono en la mano para comprobar que las reglas se cumplen.
 */
export function calcularAvisos(
  reservas: ReservationWithRelations[],
  rol: 'client' | 'owner',
  ahora: number,
): AvisoProgramado[] {
  // Sólo lo que todavía puede ocurrir. Una reserva rechazada o cancelada no
  // entra, y por lo tanto sus avisos quedan fuera y se borran al sincronizar.
  const vigentes = reservas.filter(
    (r) =>
      (r.status === 'pending' || r.status === 'confirmed') &&
      // Una estadía se reserva por noches: avisar "faltan 15 minutos" para
      // entrar a una cabaña no significa nada.
      !r.check_out_date &&
      momentoDe(r).getTime() > ahora,
  );

  const salida: AvisoProgramado[] = [];

  for (const r of vigentes) {
    const inicio = momentoDe(r).getTime();
    for (const minutos of ANTELACIONES) {
      const cuando = inicio - minutos * 60_000;
      // Si ese momento ya pasó no se programa: el sistema lo dispararía al
      // instante y la persona recibiría "faltan 30 minutos" tarde.
      if (cuando <= ahora) continue;

      const { title, body } = rol === 'owner' ? textoDueno(r, minutos) : textoCliente(r, minutos);
      salida.push({
        id: idDeAviso(r.id, minutos),
        title,
        body,
        channelId: CANAL,
        schedule: { at: new Date(cuando), allowWhileIdle: true },
        extra: { reservationId: r.id },
      });
    }
  }

  return salida;
}

/**
 * Deja programados los avisos de estas reservas y borra los que sobran.
 *
 * Se le pasa la lista COMPLETA de reservas vigentes, no los cambios: así una
 * reserva cancelada, rechazada o ya pasada pierde sus avisos sola, sin tener
 * que acordarse de borrarlos en cada lugar donde cambia un estado.
 */
export async function sincronizarRecordatorios(
  reservas: ReservationWithRelations[],
  rol: 'client' | 'owner',
): Promise<void> {
  if (!disponible()) return;

  try {
    if (!(await pedirPermisoDeAvisos())) return;

    // Android exige un canal para que la notificación suene y se agrupe.
    await LocalNotifications.createChannel({
      id: CANAL,
      name: 'Recordatorios de reservas',
      description: 'Avisos antes de que llegue el horario de tu reserva.',
      importance: 4,
      visibility: 1,
    }).catch(() => {
      // En Android viejo no existe el concepto de canal: se sigue igual.
    });

    const aProgramar = calcularAvisos(reservas, rol, Date.now());
    const idsQueQuedan = new Set(aProgramar.map((a) => a.id));

    // Se limpia lo que ya no corresponde: reservas canceladas, movidas o
    // pasadas. Sin esto sonaría un aviso de algo que ya no existe.
    const pendientes = await LocalNotifications.getPending();
    const sobran = pendientes.notifications.filter((n) => !idsQueQuedan.has(n.id));
    if (sobran.length) {
      await LocalNotifications.cancel({ notifications: sobran.map((n) => ({ id: n.id })) });
    }

    if (aProgramar.length) {
      await LocalNotifications.schedule({ notifications: aProgramar });
    }
  } catch {
    // Un recordatorio que no se pudo programar no debe romper la pantalla.
  }
}

/** Borra todos los avisos. Se usa al cerrar sesión. */
export async function limpiarRecordatorios(): Promise<void> {
  if (!disponible()) return;
  try {
    const pendientes = await LocalNotifications.getPending();
    if (pendientes.notifications.length) {
      await LocalNotifications.cancel({
        notifications: pendientes.notifications.map((n) => ({ id: n.id })),
      });
    }
  } catch {
    // Sin permisos no hay nada que limpiar.
  }
}
