import { supabase, friendlyError } from '@/lib/supabase';
import type { Staff } from '@/types/db';

/**
 * El equipo de un negocio. El dueño ve a todos (también a quien pausó); los
 * clientes reciben sólo a los activos, y eso lo resuelve la política de la
 * base, no un filtro de acá.
 */
export async function fetchStaff(businessId: string): Promise<Staff[]> {
  const { data, error } = await supabase
    .from('staff')
    .select('*')
    .eq('business_id', businessId)
    .order('sort_order')
    .order('name');

  if (error) throw new Error(friendlyError(error, 'No pudimos cargar el equipo.'));
  return (data ?? []) as Staff[];
}

export async function addStaff(
  businessId: string,
  name: string,
  days: number[],
  sortOrder: number,
): Promise<Staff> {
  const { data, error } = await supabase
    .from('staff')
    .insert({ business_id: businessId, name: name.trim(), days, sort_order: sortOrder })
    .select()
    .single();

  if (error) throw new Error(friendlyError(error, 'No pudimos agregar a esa persona.'));
  return data as Staff;
}

export async function updateStaff(
  id: string,
  patch: Partial<Pick<Staff, 'name' | 'days' | 'active'>>,
): Promise<Staff> {
  const { data, error } = await supabase
    .from('staff')
    .update(patch)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(friendlyError(error, 'No pudimos guardar el cambio.'));
  return data as Staff;
}

/** Sus reservas quedan, sin nombre asignado. */
export async function deleteStaff(id: string): Promise<void> {
  const { error } = await supabase.from('staff').delete().eq('id', id);
  if (error) throw new Error(friendlyError(error, 'No pudimos quitar a esa persona.'));
}
