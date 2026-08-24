import { supabase, friendlyError } from '@/lib/supabase';
import type { Profile } from '@/types/db';

/**
 * Activa el modo negocio en la cuenta propia.
 *
 * Va por RPC y no por un UPDATE a `profiles` porque la política de la tabla
 * bloquea el cambio de `is_owner` a propósito: así hay un único camino para
 * activarlo. La RPC no toca `role`, o sea que nadie se asciende a `admin`
 * por acá.
 */
export async function becomeOwner(): Promise<Profile> {
  const { data, error } = await supabase.rpc('become_owner');

  if (error) {
    throw new Error(friendlyError(error, 'No pudimos activar el modo negocio.'));
  }
  return (Array.isArray(data) ? data[0] : data) as Profile;
}
