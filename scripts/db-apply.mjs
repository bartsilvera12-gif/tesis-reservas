#!/usr/bin/env node
/**
 * Aplica la migración (y opcionalmente el seed) del schema `tesisreserva`.
 *
 *   node scripts/db-apply.mjs           -> supabase/migrations/*.sql
 *   node scripts/db-apply.mjs --seed    -> migraciones + supabase/seed.sql
 *
 * Requiere DATABASE_URL en el entorno o en .env.local
 * OJO: DATABASE_URL es una credencial de administrador. Nunca va al frontend
 * ni se commitea: sólo se usa desde tu máquina para crear/actualizar el schema.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// carga .env.local / .env sin dependencias
for (const f of ['.env.local', '.env']) {
  const p = join(root, f);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('\n  Falta DATABASE_URL.\n  Agregala a .env.local:\n' +
    '  DATABASE_URL=postgresql://usuario:clave@host:puerto/postgres?sslmode=disable\n');
  process.exit(1);
}

const withSeed = process.argv.includes('--seed');

const files = readdirSync(join(root, 'supabase', 'migrations'))
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => join(root, 'supabase', 'migrations', f));

if (withSeed) files.push(join(root, 'supabase', 'seed.sql'));

const client = new pg.Client({ connectionString: url });
await client.connect();

let failed = false;
for (const file of files) {
  const name = file.replace(root + '\\', '').replace(root + '/', '');
  process.stdout.write(`  -> ${name} ... `);
  const sql = readFileSync(file, 'utf8');
  try {
    await client.query('begin');
    await client.query(sql);
    await client.query('commit');
    console.log('OK');
  } catch (err) {
    await client.query('rollback').catch(() => {});
    console.log('ERROR');
    console.error(`\n     ${err.message}`);
    if (err.position) {
      const pos = Number(err.position);
      const upto = sql.slice(0, pos);
      const line = upto.split('\n').length;
      console.error(`     línea ~${line}: ${sql.split('\n')[line - 1]?.trim()}`);
    }
    if (err.hint) console.error(`     hint: ${err.hint}`);
    console.error('');
    failed = true;
    break;
  }
}

await client.end();
process.exit(failed ? 1 : 0);
