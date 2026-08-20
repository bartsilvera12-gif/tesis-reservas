import express from 'express';
import cors from 'cors';
import Anthropic from '@anthropic-ai/sdk';
import { construirContexto } from './context.js';
import { construirSystem } from './prompt.js';

/**
 * Servicio del asistente de AJ Spots.
 *
 * Existe por una sola razón: la API key de Anthropic no puede vivir en el APK.
 * Vite embebe toda variable VITE_* en el bundle y un APK se descompila en
 * minutos, así que la app habla con este servicio y el servicio habla con
 * Claude.
 */

const PUERTO = Number(process.env.PORT ?? 8787);
const MODELO = process.env.ANTHROPIC_MODEL ?? 'claude-opus-5';

/**
 * `output_config.effort` no existe en los modelos previos a la familia 4.6:
 * Haiku 4.5 y Sonnet 4.5 devuelven 400 si se les manda. Se decide acá para
 * poder cambiar de modelo por variable de entorno sin tocar el código.
 */
const ACEPTA_EFFORT = !/(haiku-4-5|sonnet-4-5|opus-4-1|claude-3)/.test(MODELO);

for (const requerida of ['ANTHROPIC_API_KEY', 'SUPABASE_URL']) {
  if (!process.env[requerida]) {
    console.error(`Falta la variable de entorno ${requerida}.`);
    process.exit(1);
  }
}
if (!process.env.SUPABASE_PUBLISHABLE_KEY && !process.env.SUPABASE_ANON_KEY) {
  console.error('Falta SUPABASE_PUBLISHABLE_KEY (o SUPABASE_ANON_KEY).');
  process.exit(1);
}

const anthropic = new Anthropic();
const app = express();

app.use(express.json({ limit: '256kb' }));

/**
 * Orígenes permitidos. Dentro del APK Capacitor usa https://localhost, y en
 * desarrollo el navegador usa el puerto de Vite.
 */
const ORIGENES = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, cb) {
      // Sin origin: apps nativas y curl. La autorización real la da el JWT.
      if (!origin) return cb(null, true);
      if (ORIGENES.length === 0 || ORIGENES.includes(origin)) return cb(null, true);
      cb(new Error('Origen no permitido'));
    },
  }),
);

/**
 * Caché del contexto por usuario.
 *
 * Armarlo cuesta ~8 consultas a Supabase, que además vive en otra VPS. En una
 * conversación las preguntas llegan seguidas y los datos no cambian entre una
 * y otra, así que reusarlo saca ese tiempo de todas las repreguntas.
 *
 * La ventana es corta a propósito: si el usuario reserva algo y vuelve a
 * preguntar, no queremos que el asistente le conteste con datos viejos.
 */
const CACHE_MS = Number(process.env.CONTEXT_CACHE_MS ?? 60_000);
const cacheContexto = new Map<string, { en: number; ctx: Awaited<ReturnType<typeof construirContexto>> }>();

setInterval(() => {
  const ahora = Date.now();
  for (const [k, v] of cacheContexto) {
    if (ahora - v.en > CACHE_MS) cacheContexto.delete(k);
  }
}, CACHE_MS).unref();

/** Límite simple por usuario para que una sesión no se dispare en costo. */
const ventanas = new Map<string, { desde: number; usos: number }>();
const LIMITE = Number(process.env.RATE_LIMIT ?? 30);
const VENTANA_MS = 10 * 60 * 1000;

function superaLimite(userId: string): boolean {
  const ahora = Date.now();
  const v = ventanas.get(userId);
  if (!v || ahora - v.desde > VENTANA_MS) {
    ventanas.set(userId, { desde: ahora, usos: 1 });
    return false;
  }
  v.usos += 1;
  return v.usos > LIMITE;
}

// Se limpia cada tanto para no acumular usuarios viejos en memoria.
setInterval(() => {
  const ahora = Date.now();
  for (const [k, v] of ventanas) {
    if (ahora - v.desde > VENTANA_MS) ventanas.delete(k);
  }
}, VENTANA_MS).unref();

app.get('/health', (_req, res) => {
  res.json({ ok: true, modelo: MODELO });
});

interface Mensaje {
  role: 'user' | 'assistant';
  content: string;
}

app.post('/chat', async (req, res) => {
  const auth = req.header('authorization') ?? '';
  const jwt = auth.startsWith('Bearer ') ? auth.slice(7) : '';

  if (!jwt) {
    res.status(401).json({ error: 'Necesitás iniciar sesión.' });
    return;
  }

  const mensajes = req.body?.messages as Mensaje[] | undefined;
  if (!Array.isArray(mensajes) || mensajes.length === 0) {
    res.status(400).json({ error: 'Falta el mensaje.' });
    return;
  }

  // Sólo se conservan los últimos turnos: alcanza para el hilo y acota el costo.
  const historial = mensajes
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));

  if (historial.length === 0 || historial[historial.length - 1].role !== 'user') {
    res.status(400).json({ error: 'El último mensaje tiene que ser del usuario.' });
    return;
  }

  const t0 = Date.now();
  const claveCache = jwt.slice(-32);
  const enCache = cacheContexto.get(claveCache);
  const reusado = Boolean(enCache && Date.now() - enCache.en < CACHE_MS);

  let contexto;
  try {
    if (reusado) {
      contexto = enCache!.ctx;
    } else {
      contexto = await construirContexto(jwt);
      cacheContexto.set(claveCache, { en: Date.now(), ctx: contexto });
    }
  } catch (err) {
    console.error('Error armando el contexto:', err);
    res.status(502).json({ error: 'No pudimos leer tus datos. Probá de nuevo.' });
    return;
  }
  const msContexto = Date.now() - t0;

  if (!contexto) {
    res.status(401).json({ error: 'Tu sesión expiró. Volvé a iniciar sesión.' });
    return;
  }

  // El id sale del JWT ya validado por construirContexto.
  const userId = JSON.parse(
    Buffer.from(jwt.split('.')[1] ?? '', 'base64').toString('utf8') || '{}',
  ).sub as string | undefined;

  if (userId && superaLimite(userId)) {
    res.status(429).json({ error: 'Muchas consultas seguidas. Esperá unos minutos.' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  // Sin esto, un proxy intermedio puede bufferear y el streaming se pierde.
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const enviar = (evento: string, datos: unknown) => {
    res.write(`event: ${evento}\ndata: ${JSON.stringify(datos)}\n\n`);
  };

  // Se manda apenas están los datos, antes de que Claude devuelva el primer
  // token: al front le sirve para dejar de mostrar "pensando" en seco.
  enviar('listo', { contextoMs: msContexto, cache: reusado });

  try {
    const stream = anthropic.messages.stream({
      model: MODELO,
      max_tokens: 2000,
      // El asistente resume datos y da consejos cortos: no hace falta más.
      ...(ACEPTA_EFFORT ? { output_config: { effort: 'low' as const } } : {}),
      system: [
        {
          type: 'text',
          text: construirSystem(contexto),
          // El contexto se repite en cada turno del hilo: cachearlo abarata mucho.
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: historial,
    });

    let msPrimerToken = 0;
    stream.on('text', (fragmento) => {
      if (!msPrimerToken) msPrimerToken = Date.now() - t0;
      enviar('texto', fragmento);
    });

    const final = await stream.finalMessage();

    if (final.stop_reason === 'refusal') {
      enviar('error', { mensaje: 'No puedo ayudarte con eso. Probá con otra consulta.' });
    }

    enviar('fin', {
      uso: final.usage?.output_tokens ?? 0,
      contextoMs: msContexto,
      primerTokenMs: msPrimerToken,
      totalMs: Date.now() - t0,
      cache: reusado,
    });
    res.end();
  } catch (err) {
    console.error('Error de la API:', err);

    let mensaje = 'El asistente no está disponible ahora mismo.';
    if (err instanceof Anthropic.RateLimitError) {
      mensaje = 'El asistente está saturado. Probá en un minuto.';
    } else if (err instanceof Anthropic.AuthenticationError) {
      mensaje = 'El asistente está mal configurado. Avisale al administrador.';
    }

    // Si ya empezamos a streamear, el error viaja como evento SSE.
    if (res.headersSent) {
      enviar('error', { mensaje });
      res.end();
    } else {
      res.status(502).json({ error: mensaje });
    }
  }
});

app.listen(PUERTO, () => {
  console.log(
    `Asistente de AJ Spots escuchando en :${PUERTO} · modelo ${MODELO}` +
      (ACEPTA_EFFORT ? " · effort low" : " · sin effort"),
  );
});
