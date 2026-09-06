import type { ReservationType } from '@/types/db';

/**
 * Qué significa cada rubro a la hora de reservar.
 *
 * El dueño elige una categoría ("Peluquerías") y de ahí sale todo lo demás:
 * cómo se reserva, cuánto dura por defecto y cómo se llama su capacidad. Antes
 * había que elegir la categoría Y el tipo de reserva por separado, que es
 * pedirle a alguien que traduzca su propio negocio a un concepto interno.
 *
 * Los cuatro tipos:
 *
 *   slot     un turno y nada más          · lavaderos, peluquerías
 *   table    mesa según cuántos son       · restaurantes
 *   service  turno + el servicio elegido  · spa de uñas
 *   stay     por noches, entrada/salida   · hospedajes
 */
export interface Rubro {
  tipo: ReservationType;
  /** Minutos que ocupa una reserva si el servicio no dice otra cosa. */
  duracion: number;
  /** Cada cuántos minutos arranca un turno. */
  paso: number;
  /** Cómo se le llama a la capacidad en el panel del dueño. */
  capacidad: {
    titulo: string;
    ayuda: string;
    /** Etiqueta de cada fila; recibe el tamaño cuando aplica. */
    unidad: (tamano: number) => string;
  };
}

const TURNO_SIMPLE = (duracion: number, unidad: string): Rubro => ({
  tipo: 'slot',
  duracion,
  paso: 15,
  capacidad: {
    titulo: `¿Cuántos ${unidad} a la vez?`,
    ayuda: `Cuántas reservas podés atender en el mismo horario.`,
    unidad: () => unidad,
  },
});

const RUBROS: Record<string, Rubro> = {
  lavaderos: TURNO_SIMPLE(60, 'vehículos'),
  peluquerias: TURNO_SIMPLE(45, 'personas'),

  restaurantes: {
    tipo: 'table',
    duracion: 90,
    paso: 30,
    capacidad: {
      titulo: 'Mesas por tamaño',
      ayuda: 'Cuántas mesas tenés de cada capacidad.',
      unidad: (n) => `Mesa para ${n}`,
    },
  },

  'spa-de-unas': {
    tipo: 'service',
    duracion: 45,
    paso: 15,
    capacidad: {
      titulo: '¿Cuántas personas a la vez?',
      ayuda: 'Cuántos servicios podés atender en el mismo horario.',
      unidad: () => 'personas',
    },
  },

  hospedajes: {
    tipo: 'stay',
    // Una estadía se mide en noches, así que la duración en minutos no se usa.
    // Se deja el valor por defecto de la tabla para no dejarlo nulo.
    duracion: 90,
    paso: 60,
    capacidad: {
      titulo: 'Tus alojamientos',
      ayuda: 'Cargá cada tipo de habitación o cabaña con su precio por noche.',
      unidad: () => 'alojamientos',
    },
  },
};

/** Rubro de una categoría. Si el slug no está mapeado, cae en turno simple. */
export function rubroDe(slug: string | null | undefined): Rubro {
  return (slug && RUBROS[slug]) || TURNO_SIMPLE(60, 'personas');
}

/** Los tamaños de mesa que se ofrecen por defecto. Sólo los usa 'table'. */
export function tamanosIniciales(tipo: ReservationType): Record<number, number> {
  if (tipo === 'table') return { 2: 4, 4: 3, 6: 1, 8: 0 };
  return {};
}

/** ¿Este rubro reserva por noches en vez de por horario? */
export const esPorNoches = (tipo: ReservationType) => tipo === 'stay';

/** ¿Hay que elegir un servicio del catálogo para poder reservar? */
export const exigeServicio = (tipo: ReservationType) => tipo === 'service';

/**
 * ¿El local se organiza con alojamientos con nombre y precio?
 *
 * Un hospedaje no vende "un lugar para 4": vende la Cabaña del Lago, que
 * cuesta tanto la noche y tiene su descripción. Por eso sus alojamientos son
 * items del catálogo y no filas de capacidad anónimas.
 */
export const usaAlojamientos = (tipo: ReservationType) => tipo === 'stay';

/** ¿La reserva necesita saber para cuántas personas es? */
export const usaCantidadDePersonas = (tipo: ReservationType) =>
  tipo === 'table' || tipo === 'stay';

/** Qué vende el catálogo de este rubro. */
export function catalogoDe(tipo: ReservationType) {
  if (tipo === 'stay') {
    return {
      titulo: 'Alojamientos',
      singular: 'alojamiento',
      vacio: 'Cargá tu primera cabaña o habitación.',
      itemType: 'room' as const,
    };
  }
  if (tipo === 'service' || tipo === 'slot') {
    return {
      titulo: 'Servicios',
      singular: 'servicio',
      vacio: 'Todavía no cargaste ningún servicio.',
      itemType: 'service' as const,
    };
  }
  return {
    titulo: 'Carta de productos',
    singular: 'producto',
    vacio: 'Todavía no cargaste nada.',
    itemType: 'product' as const,
  };
}
