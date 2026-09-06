/**
 * Dónde abrir la app: como cliente o en el panel del negocio.
 *
 * Una cuenta puede tener los dos modos, así que hace falta saber en cuál
 * estaba la última vez. Sin esto, cualquiera que se registró tocando "Tengo un
 * negocio" y después decidió usar la app sólo para reservar volvía al panel en
 * cada ingreso, y si todavía no había cargado ningún local quedaba atrapado en
 * la pantalla de crearlo.
 *
 * Es una preferencia de pantalla y nada más: los permisos los decide la base
 * con RLS, así que un valor viejo o manipulado no habilita nada. Se guarda con
 * el id de la persona para que dos cuentas en el mismo teléfono no se pisen.
 */

const CLAVE = 'tesisreserva.modo';

export type Modo = 'client' | 'owner';

export function leerModo(userId: string): Modo | null {
  try {
    const crudo = localStorage.getItem(CLAVE);
    if (!crudo) return null;
    const guardado = JSON.parse(crudo) as { userId?: string; modo?: Modo };
    if (guardado?.userId !== userId) return null;
    return guardado.modo === 'owner' || guardado.modo === 'client' ? guardado.modo : null;
  } catch {
    return null;
  }
}

export function guardarModo(userId: string, modo: Modo): void {
  try {
    localStorage.setItem(CLAVE, JSON.stringify({ userId, modo }));
  } catch {
    // Sin almacenamiento se sigue igual: sólo se pierde en qué modo estaba.
  }
}

/**
 * A dónde mandar a alguien que acaba de entrar.
 *
 * Quien no tiene modo negocio va siempre a la app. Quien lo tiene va al panel,
 * salvo que la última vez haya elegido mirar como cliente.
 */
export function destinoInicial(userId: string, esDueno: boolean): string {
  if (!esDueno) return '/app';
  return leerModo(userId) === 'client' ? '/app' : '/panel';
}
