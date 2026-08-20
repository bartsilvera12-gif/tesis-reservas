import { supabase, friendlyError } from '@/lib/supabase';
import type { AppNotification } from '@/types/db';

export async function fetchNotifications(userId: string): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw new Error(friendlyError(error, 'No pudimos cargar las notificaciones.'));
  return (data ?? []) as AppNotification[];
}

export async function countUnread(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('read_at', null);

  if (error) return 0; // el badge nunca debe romper la pantalla
  return count ?? 0;
}

export async function markAllRead(userId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('read_at', null);

  if (error) throw new Error(friendlyError(error, 'No pudimos marcar como leídas.'));
}
