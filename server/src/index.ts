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

  let contexto;
  try {
    contexto = await construirContexto(jwt);
  } catch (err) {
    console.error('Error armando el contexto:', err);
    res.status(502).json({ error: 'No pudimos leer tus datos. Probá de nuevo.' });
    return;
  }

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

  try {
    const stream = anthropic.messages.stream({
      model: MODELO,
      max_tokens: 2000,
      // El asistente resume datos y da consejos cortos: no hace falta más.
      output_config: { effort: 'low' },
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

    stream.on('text', (fragmento) => enviar('texto', fragmento));

    const final = await stream.finalMessage();

    if (final.stop_reason === 'refusal') {
      enviar('error', { mensaje: 'No puedo ayudarte con eso. Probá con otra consulta.' });
    }

    enviar('fin', { uso: final.usage?.output_tokens ?? 0 });
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
  console.log(`Asistente de AJ Spots escuchando en :${PUERTO} · modelo ${MODELO}`);
});
