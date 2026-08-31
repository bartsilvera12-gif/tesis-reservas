import {
  supabase,
  friendlyError,
  BUCKET_AVATARS,
  BUCKET_BUSINESSES,
  BUCKET_PROOFS,
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

/**
 * Sube el comprobante de la seña y devuelve su RUTA, no una URL.
 *
 * El bucket es privado porque un comprobante muestra número de cuenta,
 * titular y monto. Por eso se guarda la ruta y la URL se pide después con
 * `signedProofUrl`, que caduca sola. La ruta empieza con el id del cliente:
 * la política de Storage valida contra esa carpeta que quien sube sea el
 * quien sube sea su dueño. Se sube ANTES de crear la reserva: al revés, una
 * subida fallida dejaría reservas sin comprobante justo cuando es obligatorio.
 */
export async function uploadDepositProof(
  userId: string,
  file: File,
): Promise<string> {
  validate(file);

  const path = `${userId}/comprobante-${Date.now()}.${extensionOf(file)}`;

  const { error } = await supabase.storage
    .from(BUCKET_PROOFS)
    .upload(path, file, { upsert: true, contentType: file.type });

  if (error) throw new Error(friendlyError(error, 'No pudimos subir el comprobante.'));
  return path;
}

/**
 * URL temporal para mirar un comprobante.
 *
 * Vale una hora: alcanza de sobra para verlo y evita que el enlace quede dando
 * vueltas. Sólo la consiguen el cliente que reservó y el dueño del local; a
 * cualquier otro, Storage le niega la firma.
 */
export async function signedProofUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET_PROOFS)
    .createSignedUrl(path, 60 * 60);

  if (error || !data) {
    throw new Error(friendlyError(error, 'No pudimos abrir el comprobante.'));
  }
  return data.signedUrl;
}
