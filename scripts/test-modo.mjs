/**
 * Verificación de dónde abre la app cada cuenta.
 *
 *   npm run test:modo
 *
 * Es una regla chica pero silenciosa: si se rompe, nadie ve un error, sólo
 * gente que entra a la pantalla equivocada. Y ya pasó una vez — quien se
 * registró tocando "Tengo un negocio" y todavía no había cargado ningún local
 * volvía en cada ingreso al alta del negocio, sin salida.
 *
 * Corre el TypeScript real de `src/lib/modo.ts` compilándolo al vuelo, para
 * que la prueba no se desincronice de lo que usa la app.
 */
import { build } from 'esbuild';
import { mkdtempSync } from 'node:fs';
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

// El módulo guarda en localStorage, que no existe fuera del navegador.
const almacen = new Map();
globalThis.localStorage = {
  getItem: (k) => (almacen.has(k) ? almacen.get(k) : null),
  setItem: (k, v) => almacen.set(k, String(v)),
  removeItem: (k) => almacen.delete(k),
};

const salida = join(mkdtempSync(join(tmpdir(), 'modo-')), 'modo.mjs');
await build({
  entryPoints: ['src/lib/modo.ts'],
  outfile: salida,
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  logLevel: 'silent',
});

const { destinoInicial, guardarModo, leerModo } = await import(`file://${salida}`);

const ANA = 'aaaaaaaa-1111-2222-3333-444444444444';
const BETO = 'bbbbbbbb-1111-2222-3333-444444444444';

console.log('\n--- 1. Sin nada guardado ---');
ok('un cliente entra a la app', destinoInicial(ANA, false) === '/app');
ok('un dueño entra al panel', destinoInicial(ANA, true) === '/panel');

console.log('\n--- 2. Se recuerda el último modo ---');
guardarModo(ANA, 'client');
ok('el dueño que eligió mirar como cliente vuelve a la app',
   destinoInicial(ANA, true) === '/app', `(${destinoInicial(ANA, true)})`);
guardarModo(ANA, 'owner');
ok('y si vuelve al panel, vuelve a abrir ahí',
   destinoInicial(ANA, true) === '/panel', `(${destinoInicial(ANA, true)})`);

console.log('\n--- 3. El modo negocio manda sobre lo guardado ---');
guardarModo(ANA, 'owner');
ok('sin modo negocio no hay panel, aunque esté guardado',
   destinoInicial(ANA, false) === '/app', `(${destinoInicial(ANA, false)})`);

console.log('\n--- 4. Dos cuentas en el mismo teléfono no se pisan ---');
guardarModo(ANA, 'client');
ok('lo de Ana no le aplica a Beto', leerModo(BETO) === null, `(${leerModo(BETO)})`);
ok('Beto, que es dueño, entra al panel', destinoInicial(BETO, true) === '/panel');
guardarModo(BETO, 'client');
ok('guardar lo de Beto pisa la preferencia anterior', leerModo(ANA) === null);

console.log('\n--- 5. Un valor roto no rompe la app ---');
almacen.set('tesisreserva.modo', '{no es json');
ok('con basura guardada, no explota', leerModo(ANA) === null);
ok('y el dueño cae en el panel, que es lo esperable',
   destinoInicial(ANA, true) === '/panel');
almacen.set('tesisreserva.modo', JSON.stringify({ userId: ANA, modo: 'admin' }));
ok('un modo inventado se ignora', leerModo(ANA) === null);

console.log('\n--- 6. Sin almacenamiento la app sigue andando ---');
globalThis.localStorage = {
  getItem: () => { throw new Error('bloqueado'); },
  setItem: () => { throw new Error('bloqueado'); },
  removeItem: () => {},
};
ok('leer no propaga el error', leerModo(ANA) === null);
guardarModo(ANA, 'client');
ok('guardar tampoco', true);
ok('y se cae en el destino por defecto', destinoInicial(ANA, true) === '/panel');

console.log(`\n==========  ${pass} OK  /  ${fail} FALLA  ==========`);
if (fallos.length) {
  console.log('\nFallaron:');
  fallos.forEach((f) => console.log('  - ' + f));
}
process.exit(fail ? 1 : 0);
