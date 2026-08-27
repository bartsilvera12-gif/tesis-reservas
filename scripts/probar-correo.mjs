/**
 * Comprueba si el Supabase autohospedado puede enviar correos.
 *
 *   npm run auth:probar-correo -- tucorreo@gmail.com
 *
 * Dispara una recuperación de contraseña real contra esa dirección y reporta
 * qué contestó el servidor. NO cambia ninguna contraseña: sólo pide el envío.
 *
 * Ojo: manda un correo de verdad. Usá una casilla tuya.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
for (const f of ['.env.local', '.env']) {
  const p = join(__dirname, '..', f);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const API = (process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
const KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const correo = process.argv[2];

if (!API || !KEY) {
  console.error('\n  Faltan VITE_SUPABASE_URL y la key pública en .env.local\n');
  process.exit(1);
}

if (!correo || !correo.includes('@')) {
  console.error('\n  Uso: npm run auth:probar-correo -- tucorreo@gmail.com\n');
  process.exit(1);
}

console.log(`\n  Pidiendo una recuperación para ${correo}...`);

const res = await fetch(`${API}/auth/v1/recover`, {
  method: 'POST',
  headers: { apikey: KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: correo }),
});

const cuerpo = await res.text();

if (res.ok) {
  console.log(`
  El servidor aceptó el pedido (HTTP ${res.status}).

  Ahora revisá esa casilla, incluida la carpeta de spam.

    · Si llegó un correo CON un código de 6 dígitos, está todo listo.
    · Si llegó pero SIN código, falta poner {{ .Token }} en la plantilla
      (Authentication -> Email Templates -> Reset Password).
    · Si no llegó nada, el SMTP no está configurado o está rechazando.
      Mirá los registros:  docker compose logs auth --tail 50

  Nota: el servidor contesta que sí aunque ese correo no tenga cuenta.
  Es a propósito, para no revelar quién está registrado.
`);
} else {
  console.log(`
  El servidor NO pudo procesarlo (HTTP ${res.status}).
  Respuesta: ${cuerpo.slice(0, 300)}

  Un 500 acá casi siempre significa que falta configurar el SMTP.
  Ver docs/RECUPERAR_CONTRASENA.md
`);
  process.exit(1);
}
