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
      titulo: 'Alojamientos por capacidad',
      ayuda: 'Cuántas habitaciones o cabañas tenés para cada cantidad de personas.',
      unidad: (n) => `Para ${n} persona${n === 1 ? '' : 's'}`,
    },
  },
};

/** Rubro de una categoría. Si el slug no está mapeado, cae en turno simple. */
export function rubroDe(slug: string | null | undefined): Rubro {
  return (slug && RUBROS[slug]) || TURNO_SIMPLE(60, 'personas');
}

/** Los tamaños que se ofrecen por defecto según el rubro. */
export function tamanosIniciales(tipo: ReservationType): Record<number, number> {
  if (tipo === 'table') return { 2: 4, 4: 3, 6: 1, 8: 0 };
  if (tipo === 'stay') return { 2: 2, 4: 1, 6: 0 };
  return {};
}

/** ¿Este rubro reserva por noches en vez de por horario? */
export const esPorNoches = (tipo: ReservationType) => tipo === 'stay';

/** ¿Hay que elegir un servicio del catálogo para poder reservar? */
export const exigeServicio = (tipo: ReservationType) => tipo === 'service';

/** ¿La reserva necesita saber para cuántas personas es? */
export const usaCantidadDePersonas = (tipo: ReservationType) =>
  tipo === 'table' || tipo === 'stay';
