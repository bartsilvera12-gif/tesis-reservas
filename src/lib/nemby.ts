import type { Coords } from '@/services/businesses';

/**
 * Ñemby: la ciudad que delimita el trabajo.
 *
 * La app se pensó para los emprendimientos de Ñemby, así que el mapa, el
 * alta de negocios y la ciudad por defecto parten de acá. La base además
 * rechaza un negocio fuera del rectángulo de la ciudad (businesses_en_nemby).
 */
export const CIUDAD = 'Ñemby';

/** Centro del distrito, para abrir el mapa cuando no hay otra referencia. */
export const NEMBY_CENTRO: Coords = { lat: -25.3925, lng: -57.5471 };

/**
 * Límite del distrito, como [lat, lng].
 *
 * Sale del límite administrativo de OpenStreetMap (relación 6601487),
 * simplificado de 902 a 91 puntos: a la escala del mapa no se nota
 * la diferencia y así viaja liviano dentro de la app.
 */
export const NEMBY_CONTORNO: [number, number][] = [
  [-25.38418, -57.57204], [-25.38492, -57.57197], [-25.38865, -57.56766], [-25.39389, -57.56415],
  [-25.39527, -57.56256], [-25.39419, -57.55956], [-25.39733, -57.55707], [-25.40735, -57.55125],
  [-25.40715, -57.55072], [-25.41036, -57.54778], [-25.40959, -57.54687], [-25.40982, -57.54655],
  [-25.41209, -57.54589], [-25.41291, -57.54424], [-25.41037, -57.5412], [-25.41887, -57.53895],
  [-25.44205, -57.53575], [-25.44366, -57.53455], [-25.44312, -57.53155], [-25.44167, -57.53093],
  [-25.44027, -57.52887], [-25.43878, -57.52831], [-25.438, -57.52694], [-25.43623, -57.52674],
  [-25.43433, -57.52315], [-25.43155, -57.52063], [-25.42959, -57.51807], [-25.42639, -57.51506],
  [-25.42432, -57.51229], [-25.42399, -57.51101], [-25.40735, -57.51533], [-25.40833, -57.50879],
  [-25.40711, -57.50847], [-25.40654, -57.51163], [-25.40596, -57.51154], [-25.40515, -57.5167],
  [-25.40182, -57.51567], [-25.4032, -57.50682], [-25.40227, -57.50616], [-25.39364, -57.51275],
  [-25.3937, -57.5136], [-25.39094, -57.51532], [-25.39097, -57.51602], [-25.38945, -57.51665],
  [-25.38958, -57.51726], [-25.38822, -57.51747], [-25.38852, -57.51918], [-25.38746, -57.51907],
  [-25.38715, -57.51972], [-25.3861, -57.51931], [-25.38542, -57.52056], [-25.38672, -57.52129],
  [-25.38578, -57.52329], [-25.37974, -57.51974], [-25.37698, -57.52589], [-25.37636, -57.52558],
  [-25.37577, -57.52695], [-25.37258, -57.52524], [-25.37145, -57.5297], [-25.37057, -57.52942],
  [-25.36719, -57.54063], [-25.36593, -57.54026], [-25.3654, -57.54527], [-25.36572, -57.55002],
  [-25.36555, -57.55088], [-25.36389, -57.55095], [-25.36371, -57.55217], [-25.3638, -57.55332],
  [-25.36752, -57.55316], [-25.36766, -57.55683], [-25.36798, -57.55686], [-25.36531, -57.56312],
  [-25.36556, -57.56354], [-25.36098, -57.5668], [-25.36159, -57.56739], [-25.36349, -57.56718],
  [-25.36499, -57.56862], [-25.36689, -57.56899], [-25.36881, -57.56848], [-25.36987, -57.56901],
  [-25.37078, -57.5682], [-25.37231, -57.5682], [-25.37393, -57.56718], [-25.37616, -57.5673],
  [-25.37697, -57.56835], [-25.37904, -57.5678], [-25.37988, -57.56923], [-25.38115, -57.56924],
  [-25.38153, -57.57013], [-25.38224, -57.56987], [-25.38272, -57.57128],
];

/** El rectángulo que contiene al distrito: [[sur, oeste], [norte, este]]. */
export const NEMBY_LIMITES: [[number, number], [number, number]] = [
  [Math.min(...NEMBY_CONTORNO.map((p) => p[0])), Math.min(...NEMBY_CONTORNO.map((p) => p[1]))],
  [Math.max(...NEMBY_CONTORNO.map((p) => p[0])), Math.max(...NEMBY_CONTORNO.map((p) => p[1]))],
];

/**
 * Si un punto cae dentro del distrito.
 *
 * Es el test clásico del rayo: se traza una línea horizontal desde el punto y
 * se cuentan los bordes que cruza. Impar, adentro; par, afuera. Alcanza para
 * un polígono simple como este y no hace falta una librería de geometría.
 */
export function dentroDeNemby({ lat, lng }: Coords): boolean {
  let adentro = false;
  for (let i = 0, j = NEMBY_CONTORNO.length - 1; i < NEMBY_CONTORNO.length; j = i++) {
    const [latI, lngI] = NEMBY_CONTORNO[i];
    const [latJ, lngJ] = NEMBY_CONTORNO[j];
    const cruza =
      lngI > lng !== lngJ > lng && lat < ((latJ - latI) * (lng - lngI)) / (lngJ - lngI) + latI;
    if (cruza) adentro = !adentro;
  }
  return adentro;
}

/**
 * Barrios de Ñemby con un punto de referencia de cada uno (OpenStreetMap).
 *
 * Al cargar un negocio, elegir el barrio lleva el pin hasta ahí: el dueño
 * sólo tiene que ajustarlo a su cuadra en vez de buscar la ciudad entera.
 */
export const BARRIOS: { nombre: string; lat: number; lng: number }[] = [
  { nombre: 'Centro', lat: -25.3939, lng: -57.5455 },
  { nombre: "Pa'i Ñu", lat: -25.3767, lng: -57.5448 },
  { nombre: 'San Carlos', lat: -25.3878, lng: -57.5421 },
  { nombre: 'Los Naranjos', lat: -25.3985, lng: -57.5406 },
  { nombre: 'Salinas', lat: -25.3994, lng: -57.5521 },
  { nombre: 'Vista Alegre', lat: -25.4033, lng: -57.5455 },
  { nombre: 'Mbokajaty', lat: -25.3838, lng: -57.5615 },
  { nombre: 'Villa Anita', lat: -25.37, lng: -57.5643 },
  { nombre: 'Villa Concepción', lat: -25.3681, lng: -57.5486 },
  { nombre: 'Rincón', lat: -25.3921, lng: -57.5251 },
  { nombre: '3 de Mayo', lat: -25.4097, lng: -57.5439 },
  { nombre: 'Caaguazú', lat: -25.4085, lng: -57.5277 },
  { nombre: 'Cañadita', lat: -25.4269, lng: -57.5283 },
];
