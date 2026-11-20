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
  // Algunos celulares entregan las fotos HEIC sin tipo o como
  // application/octet-stream, así que se mira también el contenido.
  const heic = await esHeic(file);
  if (!heic && !file.type.startsWith('image/')) {
    throw new ErrorImagen('Ese archivo no es una imagen.');
  }
  if (file.size > MAX_CRUDO) {
    throw new ErrorImagen('La imagen es demasiado grande. Probá con otra.');
  }

  let img: Decodificada;
  try {
    img = await decodificar(file, heic);
  } catch {
    // Ningún decodificador del WebView la pudo abrir. Si igual es un formato
    // que Storage acepta y no pesa demasiado, se sube tal cual: el que la mira
    // después (el dueño, en el navegador) sí suele poder abrirla.
    if (TIPOS_DIRECTOS.includes(file.type) && file.size <= MAX_DIRECTO) return file;
    throw new ErrorImagen(
      'No pudimos abrir esa imagen. Probá con otra foto o con una captura de pantalla.',
    );
  }

  try {
    const escala = Math.min(1, maxLado / Math.max(img.ancho, img.alto));
    const ancho = Math.max(1, Math.round(img.ancho * escala));
    const alto = Math.max(1, Math.round(img.alto * escala));

    const lienzo = document.createElement('canvas');
    lienzo.width = ancho;
    lienzo.height = alto;

    const ctx = lienzo.getContext('2d');
    if (!ctx) throw new ErrorImagen('No pudimos procesar la imagen en este dispositivo.');

    ctx.drawImage(img.fuente, 0, 0, ancho, alto);

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
    img.cerrar();
  }
}

/** Formatos que Storage acepta sin procesar, y su tope (el mismo de storage.ts). */
const TIPOS_DIRECTOS = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_DIRECTO = 5 * 1024 * 1024;

interface Decodificada {
  fuente: CanvasImageSource;
  ancho: number;
  alto: number;
  cerrar: () => void;
}

/**
 * ¿Es una foto HEIC/HEIF? Es el formato por defecto de muchos iPhone y de
 * varios Samsung, y el WebView de Android no lo sabe abrir. Se reconoce por
 * el tipo, por la extensión o, si ninguno sirve, por la cabecera del archivo
 * ("ftyp" + marca heic/heix/mif1...).
 */
async function esHeic(file: File): Promise<boolean> {
  if (/^image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name)) return true;
  try {
    const cab = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const txt = String.fromCharCode(...cab.slice(4, 12));
    return /^ftyp(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(txt);
  } catch {
    return false;
  }
}

/**
 * Pasa una HEIC a bitmap con libheif (WebAssembly). La librería pesa unos
 * 3 MB, así que se carga sólo la primera vez que alguien elige una HEIC.
 */
async function decodificarHeic(file: File): Promise<Decodificada> {
  const { heicTo } = await import('heic-to');
  const bitmap = await heicTo({ blob: file, type: 'bitmap' });
  return { fuente: bitmap, ancho: bitmap.width, alto: bitmap.height, cerrar: () => bitmap.close() };
}

/**
 * Decodifica el archivo para poder dibujarlo en un canvas.
 *
 * Primero con `createImageBitmap`, que trabaja fuera del hilo principal. En
 * algunos WebView de Android falla con fotos que el navegador sí abre (fotos
 * muy grandes, JPEG con perfiles de color raros), así que si falla se prueba
 * con un <img> común antes de rendirse. HEIC no lo abre ninguno de los dos:
 * esas van directo a libheif.
 */
async function decodificar(file: File, heic: boolean): Promise<Decodificada> {
  if (heic) return decodificarHeic(file);
  try {
    const bitmap = await createImageBitmap(file);
    return { fuente: bitmap, ancho: bitmap.width, alto: bitmap.height, cerrar: () => bitmap.close() };
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const el = new Image();
      el.decoding = 'async';
      el.src = url;
      await el.decode();
      if (!el.naturalWidth) throw new Error('sin tamaño');
      return { fuente: el, ancho: el.naturalWidth, alto: el.naturalHeight, cerrar: () => URL.revokeObjectURL(url) };
    } catch (e) {
      URL.revokeObjectURL(url);
      throw e;
    }
  }
}
