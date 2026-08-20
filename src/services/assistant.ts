import { supabase } from '@/lib/supabase';

/**
 * Cliente del asistente.
 *
 * La app NUNCA habla con Anthropic directamente: la API key vive en el
 * servicio de `server/`, porque toda variable VITE_* termina dentro del APK.
 */

const URL_ASISTENTE = (import.meta.env.VITE_ASSISTANT_URL ?? '').replace(/\/+$/, '');

export const asistenteDisponible = Boolean(URL_ASISTENTE);

export interface MensajeChat {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Envía el hilo y va entregando la respuesta por partes.
 *
 * @param onFragmento se llama con cada pedacito de texto que llega
 * @param signal permite cancelar si el usuario cierra el chat
 */
export async function preguntarAlAsistente(
  mensajes: MensajeChat[],
  onFragmento: (texto: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (!URL_ASISTENTE) {
    throw new Error('El asistente no está configurado en esta instalación.');
  }

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Iniciá sesión para usar el asistente.');

  const res = await fetch(`${URL_ASISTENTE}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ messages: mensajes }),
    signal,
  });

  if (!res.ok) {
    const cuerpo = await res.json().catch(() => null);
    throw new Error(cuerpo?.error ?? 'El asistente no está disponible ahora.');
  }

  if (!res.body) throw new Error('El asistente no devolvió respuesta.');

  const lector = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await lector.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Server-Sent Events: los eventos se separan con una línea en blanco.
    const bloques = buffer.split('\n\n');
    buffer = bloques.pop() ?? '';

    for (const bloque of bloques) {
      let evento = 'message';
      const datos: string[] = [];

      for (const linea of bloque.split('\n')) {
        if (linea.startsWith('event:')) evento = linea.slice(6).trim();
        else if (linea.startsWith('data:')) datos.push(linea.slice(5).trim());
      }

      if (datos.length === 0) continue;

      let payload: unknown;
      try {
        payload = JSON.parse(datos.join('\n'));
      } catch {
        continue;
      }

      if (evento === 'texto' && typeof payload === 'string') {
        onFragmento(payload);
      } else if (evento === 'error') {
        throw new Error(
          (payload as { mensaje?: string })?.mensaje ?? 'El asistente tuvo un problema.',
        );
      }
    }
  }
}
