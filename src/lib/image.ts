/**
 * Preparación de imágenes antes de subirlas.
 *
 * Una foto de celular viene en 4000x3000 y pesa entre 4 y 12 MB. Mandarla
 * así tiene dos problemas: el WebView de Android tiene que decodificar unos
 * 48 MB de bitmap para mostrar la vista previa (en un teléfono modesto eso
 * traba la pantalla), y después hay que subirla entera por datos móviles.
 *
 * Acá se decodifica una sola vez, se achica y se vuelve a comprimir. Lo que
 * sale pesa dos órdenes de magnitud menos y ya está en un formato que tanto
 * el WebView como Storage entienden.
 */

/** Lado máximo según para qué se use la imagen. */
export const LADO_PORTADA = 1600;
export const LADO_LOGO = 512;
export const LADO_AVATAR = 512;

/**
 * Tope sobre el archivo crudo, antes de intentar decodificarlo. No es el
 * límite de subida (después de procesar siempre queda mucho más chico):
 * es para no arrancar a decodificar algo que va a quedar sin memoria.
 */
const MAX_CRUDO = 25 * 1024 * 1024;

/** Error con un mensaje pensado para mostrarle al usuario tal cual. */
export class ErrorImagen extends Error {}

/**
 * Achica y recomprime la imagen elegida.
 *
 * @param maxLado lado mayor del resultado, en píxeles
 * @returns un File nuevo, listo para subir y para usar de vista previa
 */
export async function prepararImagen(file: File, maxLado: number): Promise<File> {
  if (!file.type.startsWith('image/')) {
    throw new ErrorImagen('Ese archivo no es una imagen.');
  }
  if (file.size > MAX_CRUDO) {
    throw new ErrorImagen('La imagen es demasiado grande. Probá con otra.');
  }

  const bitmap = await decodificar(file);

  try {
    const escala = Math.min(1, maxLado / Math.max(bitmap.width, bitmap.height));
    const ancho = Math.max(1, Math.round(bitmap.width * escala));
    const alto = Math.max(1, Math.round(bitmap.height * escala));

    const lienzo = document.createElement('canvas');
    lienzo.width = ancho;
    lienzo.height = alto;

    const ctx = lienzo.getContext('2d');
    if (!ctx) throw new ErrorImagen('No pudimos procesar la imagen en este dispositivo.');

    ctx.drawImage(bitmap, 0, 0, ancho, alto);

    // Los logos suelen ser PNG con fondo transparente y pasarlos a JPEG les
    // pone un fondo negro. Para esos se mantiene PNG; el resto (fotos) va a
    // JPEG, que para una portada pesa muchísimo menos.
    const tipo = file.type === 'image/png' ? 'image/png' : 'image/jpeg';

    const blob = await new Promise<Blob | null>((resolve) =>
      lienzo.toBlob(resolve, tipo, 0.85),
    );
    if (!blob) throw new ErrorImagen('No pudimos procesar la imagen. Probá con otra.');

    const extension = tipo === 'image/png' ? 'png' : 'jpg';
    return new File([blob], `imagen.${extension}`, { type: tipo });
  } finally {
    bitmap.close();
  }
}

/**
 * Decodifica el archivo a un bitmap.
 *
 * `createImageBitmap` trabaja fuera del hilo principal, así que la pantalla
 * sigue respondiendo mientras decodifica. Si el formato no se entiende (el
 * caso típico es HEIC, que algunos celulares graban por defecto y Chrome no
 * abre) se corta acá con un mensaje claro, en vez de dejar un recuadro vacío
 * que parece que la app se colgó.
 */
async function decodificar(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file);
  } catch {
    throw new ErrorImagen(
      'No pudimos abrir esa imagen. Si tu celular guarda las fotos en HEIC, ' +
        'cambiá el formato a JPG en los ajustes de la cámara o elegí otra.',
    );
  }
}
