import {
  supabase,
  friendlyError,
  BUCKET_AVATARS,
  BUCKET_BUSINESSES,
} from '@/lib/supabase';

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

function validate(file: File) {
  if (!ALLOWED.includes(file.type)) {
    throw new Error('Formato no soportado. Usá JPG, PNG o WEBP.');
  }
  if (file.size > MAX_BYTES) {
    throw new Error('La imagen es muy pesada. El máximo es 5 MB.');
  }
}

function extensionOf(file: File): string {
  const fromName = file.name.split('.').pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName;
  return file.type.split('/')[1] ?? 'jpg';
}

/**
 * Sube una imagen del negocio.
 * La ruta DEBE empezar con el business_id: la política de Storage valida
 * contra esa carpeta que quien sube sea el dueño.
 */
export async function uploadBusinessImage(
  businessId: string,
  file: File,
  kind: 'logo' | 'cover' | 'item',
): Promise<string> {
  validate(file);

  const path = `${businessId}/${kind}-${Date.now()}.${extensionOf(file)}`;

  const { error } = await supabase.storage
    .from(BUCKET_BUSINESSES)
    .upload(path, file, { upsert: true, contentType: file.type });

  if (error) throw new Error(friendlyError(error, 'No pudimos subir la imagen.'));

  const { data } = supabase.storage.from(BUCKET_BUSINESSES).getPublicUrl(path);
  return data.publicUrl;
}

/** Avatar del usuario. La ruta empieza con su propio user_id. */
export async function uploadAvatar(userId: string, file: File): Promise<string> {
  validate(file);

  const path = `${userId}/avatar-${Date.now()}.${extensionOf(file)}`;

  const { error } = await supabase.storage
    .from(BUCKET_AVATARS)
    .upload(path, file, { upsert: true, contentType: file.type });

  if (error) throw new Error(friendlyError(error, 'No pudimos subir tu foto.'));

  const { data } = supabase.storage.from(BUCKET_AVATARS).getPublicUrl(path);
  return data.publicUrl;
}
