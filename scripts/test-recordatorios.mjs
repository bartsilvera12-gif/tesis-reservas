/**
 * Verificación de las reglas de los recordatorios.
 *
 *   npm run test:recordatorios
 *
 * Las notificaciones sólo suenan dentro del APK, así que la lógica de CUÁNDO
 * y A QUIÉN avisar se probó separada del plugin: sin esto habría que tener un
 * teléfono en la mano y esperar una hora para comprobar cada regla.
 *
 * Corre el TypeScript real de `src/services/recordatorios.ts` compilándolo al
 * vuelo, para que la prueba no se desincronice de lo que usa la app.
 */
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let pass = 0;
let fail = 0;
const fallos = [];

const ok = (nombre, cond, extra = '') => {
  if (cond) {
    pass++;
    console.log(`  OK    ${nombre}`);
  } else {
    fail++;
    fallos.push(nombre);
    console.log(`  FALLA ${nombre} ${extra}`);
  }
};

// El módulo importa Capacitor, que no existe fuera del navegador. Se compila
// con esos import reemplazados por objetos vacíos: lo que se prueba es la
// función pura, que no los toca.
const dir = mkdtempSync(join(tmpdir(), 'recordatorios-'));
const salida = join(dir, 'recordatorios.mjs');

await build({
  entryPoints: ['src/services/recordatorios.ts'],
  outfile: salida,
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  external: ['@capacitor/core', '@capacitor/local-notifications'],
  logLevel: 'silent',
});

// Se cortan los imports nativos: no hacen falta para la función pura.
let codigo = readFileSync(salida, 'utf8');
codigo = codigo
  .replace(/import\s*\{[^}]*\}\s*from\s*"@capacitor\/core";/g, 'const Capacitor = { isNativePlatform: () => false };')
  .replace(/import\s*\{[^}]*\}\s*from\s*"@capacitor\/local-notifications";/g, 'const LocalNotifications = {};');
writeFileSync(salida, codigo);

const { calcularAvisos, ANTELACIONES } = await import(`file://${salida}`);

/** Una reserva a X minutos de ahora. */
const enMinutos = (min, extra = {}) => {
  const d = new Date(Date.now() + min * 60_000);
  const p = (n) => String(n).padStart(2, '0');
  return {
    id: extra.id ?? '11111111-2222-3333-4444-555555555555',
    client_id: 'cli-1',
    status: 'confirmed',
    reservation_date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
    reservation_time: `${p(d.getHours())}:${p(d.getMinutes())}:00`,
    check_out_date: null,
    party_size: 2,
    business: { name: 'La Cabaña' },
    client: { full_name: 'Marta González' },
    ...extra,
  };
};

const ahora = Date.now();

console.log('\n--- 1. Se avisa a 1 hora, 30 y 15 minutos ---');
ok('las antelaciones son 60, 30 y 15', JSON.stringify([...ANTELACIONES]) === '[60,30,15]');

const lejana = enMinutos(240);
const avisos = calcularAvisos([lejana], 'client', ahora);
ok('una reserva lejana genera los tres avisos', avisos.length === 3, `(${avisos.length})`);

const faltan = avisos
  .map((a) => Math.round((new Date(lejana.reservation_date + 'T' + lejana.reservation_time).getTime() - a.schedule.at.getTime()) / 60_000))
  .sort((x, y) => y - x);
ok('caen exactamente 60, 30 y 15 minutos antes', JSON.stringify(faltan) === '[60,30,15]', `(${faltan})`);

console.log('\n--- 2. No se avisa de lo que ya pasó ---');
const cerca = calcularAvisos([enMinutos(20)], 'client', ahora);
ok('a 20 minutos sólo queda el aviso de 15', cerca.length === 1, `(${cerca.length})`);

const encima = calcularAvisos([enMinutos(5)], 'client', ahora);
ok('a 5 minutos ya no se avisa nada', encima.length === 0, `(${encima.length})`);

const pasada = calcularAvisos([enMinutos(-30)], 'client', ahora);
ok('una reserva que ya ocurrió no genera avisos', pasada.length === 0);

console.log('\n--- 3. Sólo las reservas vigentes ---');
for (const estado of ['cancelled', 'rejected', 'completed', 'no_show']) {
  const r = calcularAvisos([enMinutos(240, { status: estado })], 'client', ahora);
  ok(`una reserva ${estado} no avisa`, r.length === 0, `(${r.length})`);
}
ok('una pendiente sí avisa', calcularAvisos([enMinutos(240, { status: 'pending' })], 'client', ahora).length === 3);

console.log('\n--- 4. Los hospedajes quedan afuera ---');
const estadia = calcularAvisos([enMinutos(240, { check_out_date: '2026-12-31' })], 'client', ahora);
ok('una estadía por noches no avisa "faltan 15 minutos"', estadia.length === 0, `(${estadia.length})`);

console.log('\n--- 5. Cada rol recibe su texto ---');
const alCliente = calcularAvisos([lejana], 'client', ahora)[0];
const alDueno = calcularAvisos([lejana], 'owner', ahora)[0];
ok('al cliente le habla de dónde reservó', alCliente.body.includes('La Cabaña'), `(${alCliente.body})`);
ok('al dueño le dice quién viene', alDueno.body.includes('Marta González'), `(${alDueno.body})`);
ok('los títulos son distintos', alCliente.title !== alDueno.title);
console.log(`    cliente: "${alCliente.title}" · ${alCliente.body}`);
console.log(`    dueño  : "${alDueno.title}" · ${alDueno.body}`);

console.log('\n--- 6. Los identificadores no chocan ---');
const ids = calcularAvisos([lejana], 'client', ahora).map((a) => a.id);
ok('los tres avisos de una reserva tienen ids distintos', new Set(ids).size === 3);
ok('son enteros de 32 bits', ids.every((i) => Number.isInteger(i) && i > 0 && i < 2 ** 31));

const otra = enMinutos(240, { id: '99999999-8888-7777-6666-555555555555' });
const idsOtra = calcularAvisos([otra], 'client', ahora).map((a) => a.id);
ok('dos reservas distintas no comparten ids', ids.every((i) => !idsOtra.includes(i)));

const repetido = calcularAvisos([lejana], 'client', ahora).map((a) => a.id);
ok('el mismo aviso siempre da el mismo id (reprogramar no duplica)', JSON.stringify(ids) === JSON.stringify(repetido));

console.log('\n--- 7. Varias reservas a la vez ---');
const varias = calcularAvisos(
  [lejana, otra, enMinutos(240, { id: 'aaaa1111-2222-3333-4444-555555555555' })],
  'client',
  ahora,
);
ok('tres reservas dan nueve avisos', varias.length === 9, `(${varias.length})`);
ok('sin ids repetidos entre ellas', new Set(varias.map((a) => a.id)).size === 9);

console.log(`\n==========  ${pass} OK  /  ${fail} FALLA  ==========`);
if (fallos.length) {
  console.log('\nFallaron:');
  fallos.forEach((f) => console.log('  - ' + f));
}
process.exit(fail ? 1 : 0);
