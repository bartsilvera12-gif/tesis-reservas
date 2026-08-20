import { createClient } from '@supabase/supabase-js';

/**
 * Cliente de Supabase apuntando directamente al schema `tesisreserva`.
 *
 * Todas las consultas (`supabase.from('businesses')`) resuelven contra
 * `tesisreserva.businesses`, nunca contra `public`.
 *
 * Recordá que el schema tiene que estar expuesto en PostgREST
 * (PGRST_DB_SCHEMAS). Ver docs/SUPABASE_SETUP.md
 */

const url = import.meta.env.VITE_SUPABASE_URL;

/**
 * Se prioriza la publishable key (formato nuevo `sb_publishable_...`).
 * Si la instancia todavía usa la anon key (JWT), se acepta como fallback.
 */
const key =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ||
  import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

if (!url || !key) {
  throw new Error(
    'Faltan las variables de entorno de Supabase. ' +
      'Copiá .env.example a .env.local y completá VITE_SUPABASE_URL y ' +
      'VITE_SUPABASE_PUBLISHABLE_KEY (o VITE_SUPABASE_ANON_KEY).',
  );
}

if (import.meta.env.PROD && /localhost|127\.0\.0\.1/.test(url)) {
  // En un APK instalado en un celular, localhost apunta al propio teléfono.
  console.warn(
    '[AJ Spots] VITE_SUPABASE_URL apunta a localhost. ' +
      'El APK no va a poder conectarse: usá la URL HTTPS pública.',
  );
}

export const SCHEMA = 'tesisreserva' as const;

export const supabase = createClient(url, key, {
  db: { schema: SCHEMA },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'tesisreserva.auth',
  },
});

/** Bucket para logos/portadas de negocios. Ruta: `<business_id>/<archivo>` */
export const BUCKET_BUSINESSES = 'tesisreserva-businesses';
/** Bucket para avatares. Ruta: `<user_id>/<archivo>` */
export const BUCKET_AVATARS = 'tesisreserva-avatars';

/**
 * Traduce los errores de Supabase/Postgres a mensajes que le sirvan
 * a una persona, no a un log.
 */
export function friendlyError(error: unknown, fallback: string): string {
  if (!error) return fallback;

  const err = error as { message?: string; code?: string; hint?: string };
  const raw = err.message ?? '';

  // El schema no está expuesto en PostgREST — error de configuración típico.
  if (err.code === 'PGRST106' || raw.includes('Invalid schema')) {
    return (
      'El schema "tesisreserva" no está expuesto en la API de Supabase. ' +
      'Agregalo a PGRST_DB_SCHEMAS y reiniciá el servicio REST.'
    );
  }

  if (err.code === 'PGRST301' || raw.includes('JWT')) {
    return 'Tu sesión expiró. Volvé a iniciar sesión.';
  }

  if (raw.includes('Failed to fetch') || raw.includes('NetworkError')) {
    return 'No pudimos conectarnos. Revisá tu conexión a internet.';
  }

  // Los `raise exception` de nuestras funciones ya vienen en castellano.
  if (raw && !raw.startsWith('{') && raw.length < 200) return raw;

  return fallback;
}
