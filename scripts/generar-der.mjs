/**
 * Genera el diagrama Entidad-Relación del schema `tesisreserva`.
 *
 *   npm run docs:der
 *
 * Lee la estructura REAL de la base (tablas, columnas, tipos, claves primarias,
 * foráneas y únicas), así el diagrama no puede quedar desactualizado respecto
 * de lo que corre: si se agrega una columna, se vuelve a generar y aparece.
 *
 * Salen dos versiones en docs/diagramas/:
 *
 *   der-resumen   claves y atributos principales. Es la que entra legible en
 *                 una página A4 del cuerpo de la tesis.
 *   der-completo  todas las columnas con su tipo. Con ~150 atributos no se lee
 *                 impreso en A4 (la letra quedaría en ~4 pt): va a un anexo o
 *                 en hoja apaisada.
 *
 * Cada una en SVG (vectorial, para Word) y PNG a 3x. Además `der.mmd` en
 * Mermaid, por si se quiere editar en mermaid.live.
 *
 * Notación: pata de gallo (Crow's Foot).
 *
 * La posición de cada tabla está puesta a mano a propósito: con 14 entidades y
 * 19 relaciones, un acomodo automático cruza líneas por todos lados. Esto está
 * pensado para que las relaciones no se crucen (queda un solo cruce).
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const salida = join(root, 'docs', 'diagramas');

for (const f of ['.env.local', '.env']) {
  const p = join(root, f);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

if (!process.env.DATABASE_URL) {
  console.error('\n  Falta DATABASE_URL en .env.local\n');
  process.exit(1);
}

/* ─────────────────────────  1. Leer el schema  ───────────────────────── */

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();

const columnas = (
  await db.query(`
    select c.table_name as tabla, c.column_name as nombre, c.udt_name as tipo,
           c.is_nullable = 'YES' as nulo
      from information_schema.columns c
      join information_schema.tables t
        on t.table_schema = c.table_schema and t.table_name = c.table_name
     where c.table_schema = 'tesisreserva' and t.table_type = 'BASE TABLE'
     order by c.table_name, c.ordinal_position`)
).rows;

const primarias = new Set(
  (
    await db.query(`
      select tc.table_name as tabla, kcu.column_name as nombre
        from information_schema.table_constraints tc
        join information_schema.key_column_usage kcu
          on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
       where tc.table_schema = 'tesisreserva' and tc.constraint_type = 'PRIMARY KEY'`)
  ).rows.map((r) => `${r.tabla}.${r.nombre}`),
);

const foraneas = (
  await db.query(`
    select replace(con.conrelid::regclass::text, 'tesisreserva.', '') as tabla,
           a.attname as columna,
           replace(con.confrelid::regclass::text, 'tesisreserva.', '') as destino
      from pg_constraint con
      join pg_attribute a on a.attrelid = con.conrelid and a.attnum = any(con.conkey)
      join pg_namespace n on n.oid = con.connamespace
     where con.contype = 'f' and n.nspname = 'tesisreserva'`)
).rows;

// Sólo las únicas de una columna se marcan en la fila: una única compuesta
// (business_id, day_of_week) marcada columna por columna diría otra cosa.
const unicas = new Set(
  (
    await db.query(`
      select replace(con.conrelid::regclass::text, 'tesisreserva.', '') as tabla,
             min(a.attname) as nombre
        from pg_constraint con
        join pg_attribute a on a.attrelid = con.conrelid and a.attnum = any(con.conkey)
        join pg_namespace n on n.oid = con.connamespace
       where con.contype = 'u' and n.nspname = 'tesisreserva'
       group by con.conrelid, con.conname
      having count(*) = 1`)
  ).rows.map((r) => `${r.tabla}.${r.nombre}`),
);

await db.end();

const esForanea = new Set(foraneas.map((f) => `${f.tabla}.${f.columna}`));

/* ─────────────────────────  2. Qué se muestra  ───────────────────────── */

/** Nombre en castellano y grupo de cada tabla. */
const ENTIDADES = {
  profiles:                   { es: 'Usuario (perfil)',         grupo: 'usuarios' },
  notifications:              { es: 'Notificación',             grupo: 'usuarios' },
  business_categories:        { es: 'Rubro',                    grupo: 'negocio' },
  businesses:                 { es: 'Negocio',                  grupo: 'negocio' },
  business_hours:             { es: 'Horario por día',          grupo: 'negocio' },
  business_hour_slots:        { es: 'Franja horaria',           grupo: 'negocio' },
  business_capacity:          { es: 'Mesas por tamaño',         grupo: 'negocio' },
  promotions:                 { es: 'Promoción',                grupo: 'negocio' },
  catalog_categories:         { es: 'Categoría del catálogo',   grupo: 'catalogo' },
  catalog_items:              { es: 'Producto, servicio o alojamiento', grupo: 'catalogo' },
  reservations:               { es: 'Reserva',                  grupo: 'reservas' },
  reservation_status_history: { es: 'Historial de estados',     grupo: 'reservas' },
  reservation_payments:       { es: 'Pago de seña',             grupo: 'reservas' },
  reviews:                    { es: 'Reseña',                   grupo: 'reservas' },
};

const faltan = [...new Set(columnas.map((c) => c.tabla))].filter((t) => !ENTIDADES[t]);
if (faltan.length) {
  console.error(`\n  Hay tablas nuevas sin ubicar en el diagrama: ${faltan.join(', ')}`);
  console.error('  Agregalas en ENTIDADES y en las posiciones de este script.\n');
  process.exit(1);
}

/**
 * Atributos de la versión resumida, además de claves primarias, foráneas y
 * únicas, que siempre se muestran. Son los que explican para qué existe la
 * tabla; el resto queda indicado como "+ N columnas".
 */
const PRINCIPALES = {
  profiles: ['full_name', 'role', 'is_owner'],
  notifications: ['title', 'type', 'read_at'],
  business_categories: ['name'],
  businesses: ['name', 'reservation_type', 'deposit_enabled', 'active'],
  business_hours: ['day_of_week', 'enabled'],
  business_hour_slots: ['opens_at', 'closes_at'],
  business_capacity: ['party_size', 'quantity'],
  promotions: ['title', 'starts_at', 'ends_at'],
  catalog_categories: ['name'],
  catalog_items: ['name', 'item_type', 'price', 'capacity', 'units'],
  reservations: ['reservation_date', 'reservation_time', 'check_out_date', 'status', 'deposit_proof_url'],
  reservation_status_history: ['new_status'],
  reservation_payments: ['amount', 'status'],
  reviews: ['rating', 'comment'],
};

const TIPOS = {
  int4: 'int', int8: 'bigint', bool: 'bool', float8: 'float', numeric: 'numeric',
  timestamptz: 'timestamptz', text: 'text', uuid: 'uuid', date: 'date', time: 'time',
};

/**
 * Relaciones con su cardinalidad en cada punta:
 *   '1'  exactamente uno      '01' cero o uno
 *   '1N' uno o muchos         '0N' cero o muchos
 *
 * Las columnas que apuntan a un usuario (owner_id, client_id, user_id,
 * changed_by) referencian auth.users, cuyo id es el mismo de `profiles` (1:1).
 * Se dibujan contra `profiles`, que es la entidad usuario del sistema.
 */
const RELACIONES = [
  { de: 'profiles', a: 'businesses', c: ['1', '0N'], col: 'owner_id', verbo: 'administra' },
  { de: 'business_categories', a: 'businesses', c: ['01', '0N'], col: 'category_id' },
  { de: 'businesses', a: 'business_hours', c: ['1', '0N'], col: 'business_id' },
  { de: 'business_hours', a: 'business_hour_slots', c: ['1', '0N'], col: 'business_hour_id' },
  { de: 'businesses', a: 'business_capacity', c: ['1', '0N'], col: 'business_id' },
  { de: 'businesses', a: 'promotions', c: ['1', '0N'], col: 'business_id' },
  { de: 'businesses', a: 'catalog_categories', c: ['1', '0N'], col: 'business_id' },
  { de: 'businesses', a: 'catalog_items', c: ['1', '0N'], col: 'business_id' },
  { de: 'catalog_categories', a: 'catalog_items', c: ['01', '0N'], col: 'category_id' },
  { de: 'businesses', a: 'reservations', c: ['1', '0N'], col: 'business_id', verbo: 'recibe' },
  { de: 'profiles', a: 'reservations', c: ['1', '0N'], col: 'client_id', verbo: 'hace' },
  { de: 'catalog_items', a: 'reservations', c: ['01', '0N'], col: 'catalog_item_id' },
  { de: 'reservations', a: 'reservation_status_history', c: ['1', '0N'], col: 'reservation_id' },
  { de: 'profiles', a: 'reservation_status_history', c: ['01', '0N'], col: 'changed_by', verbo: 'cambia' },
  { de: 'reservations', a: 'reservation_payments', c: ['1', '0N'], col: 'reservation_id' },
  { de: 'reservations', a: 'reviews', c: ['01', '01'], col: 'reservation_id' },
  { de: 'businesses', a: 'reviews', c: ['1', '0N'], col: 'business_id' },
  { de: 'profiles', a: 'reviews', c: ['1', '0N'], col: 'client_id', verbo: 'escribe' },
  { de: 'profiles', a: 'notifications', c: ['1', '0N'], col: 'user_id', verbo: 'recibe' },
];

// Cada foránea real de la base tiene que estar dibujada. Si alguien agrega
// una y no la suma acá, el diagrama mentiría por omisión.
for (const f of foraneas) {
  // profiles.id -> auth.users no es una línea: es lo que explica la nota de la
  // leyenda (profiles es el mismo usuario de Supabase Auth, 1:1).
  if (f.tabla === 'profiles' && f.columna === 'id') continue;
  const dibujada = RELACIONES.some((r) => r.a === f.tabla && r.col === f.columna);
  if (!dibujada) {
    console.error(`\n  Foránea sin dibujar: ${f.tabla}.${f.columna} -> ${f.destino}\n`);
    process.exit(1);
  }
}

/* ─────────────────────────  3. Medidas y colores  ───────────────────────── */

const FUENTE = "'Segoe UI', Arial, Helvetica, sans-serif";
const MONO = "Consolas, 'Courier New', monospace";

const COLOR = {
  tinta: '#2B2622',
  suave: '#8A7E73',
  nulo: '#9C9188',
  borde: '#5B524B',
  linea: '#4A423C',
  fondo: '#FFFFFF',
  fila: '#FAF8F5',
};

/** Cabecera por grupo. Distinguibles también impresos en blanco y negro. */
const GRUPO = {
  usuarios: { fondo: '#E7EEF7', texto: 'Usuarios' },
  negocio:  { fondo: '#F6E7DC', texto: 'Negocio y configuración' },
  catalogo: { fondo: '#E6F1E7', texto: 'Catálogo' },
  reservas: { fondo: '#EFE6F4', texto: 'Reservas' },
};

const FILA = 20;
const CABECERA = 50;
const PIE = 8;
const ANCHO_CHAR = 6.7;   // Consolas 12 px
const ANCHO_TIPO = 6.2;   // Consolas 11 px

function filasDe(tabla, resumen) {
  const todas = columnas.filter((c) => c.tabla === tabla);
  const marca = (c) => {
    const clave = `${tabla}.${c.nombre}`;
    if (primarias.has(clave)) return 'PK';
    if (esForanea.has(clave) && unicas.has(clave)) return 'FK·U';
    if (esForanea.has(clave)) return 'FK';
    if (unicas.has(clave)) return 'U';
    return '';
  };
  const fila = (c) => ({ nombre: c.nombre, tipo: TIPOS[c.tipo] ?? c.tipo, nulo: c.nulo, marca: marca(c) });

  if (!resumen) return todas.map(fila);

  const quedan = todas.filter((c) => marca(c) || PRINCIPALES[tabla].includes(c.nombre));
  const filas = quedan.map(fila);
  const resto = todas.length - quedan.length;
  if (resto > 0) filas.push({ resto });
  return filas;
}

function medir(tabla, resumen) {
  const filas = filasDe(tabla, resumen);
  let ancho = Math.max(tabla.length * 8.6 + 28, ENTIDADES[tabla].es.length * 6.3 + 28);
  for (const f of filas) {
    if (f.resto) continue;
    ancho = Math.max(ancho, 44 + f.nombre.length * ANCHO_CHAR + 20 + f.tipo.length * ANCHO_TIPO + 14);
  }
  return { filas, ancho: Math.ceil(ancho), alto: CABECERA + filas.length * FILA + PIE };
}

/* ─────────────────────────  4. Acomodo  ───────────────────────── */

/**
 * Columnas de izquierda a derecha y posición vertical de cada tabla.
 *
 * Los huecos verticales no son casuales: por ellos pasan relaciones que
 * cruzan una columna (por ejemplo negocio → reserva pasa entre `profiles` y
 * `catalog_categories`). Si se mueve una tabla, hay que mirar que el hueco
 * siga coincidiendo.
 */
const COLUMNAS = [
  ['business_hours', 'business_hour_slots', 'business_capacity', 'promotions'],
  ['business_categories', 'businesses'],
  ['profiles', 'catalog_categories', 'catalog_items'],
  ['notifications', 'reservations'],
  ['reviews', 'reservation_status_history', 'reservation_payments'],
];

const POSICION_Y = {
  completo: {
    business_hours: 70, business_hour_slots: 308, business_capacity: 540, promotions: 780,
    business_categories: 70, businesses: 330,
    profiles: 150, catalog_categories: 470, catalog_items: 708,
    notifications: 70, reservations: 340,
    reviews: 70, reservation_status_history: 410, reservation_payments: 640,
  },
  resumen: {
    business_hours: 70, business_hour_slots: 285, business_capacity: 480, promotions: 675,
    business_categories: 70, businesses: 270,
    profiles: 180, catalog_categories: 400, catalog_items: 615,
    notifications: 70, reservations: 290,
    reviews: 70, reservation_status_history: 320, reservation_payments: 505,
  },
};

const MARGEN = 40;
const HUECO_X = 110;

function acomodar(variante) {
  const resumen = variante === 'resumen';
  const cajas = {};
  let x = MARGEN;
  for (const col of COLUMNAS) {
    const medidas = col.map((t) => [t, medir(t, resumen)]);
    const ancho = Math.max(...medidas.map(([, m]) => m.ancho));
    for (const [t, m] of medidas) {
      const y = POSICION_Y[variante][t];
      cajas[t] = { t, x, y, w: ancho, h: m.alto, filas: m.filas, r: x + ancho, b: y + m.alto };
    }
    x += ancho + HUECO_X;
  }
  return cajas;
}

/* ─────────────────────────  5. Rutas de las relaciones  ───────────────────────── */

/**
 * Cada relación es una polilínea ortogonal. Las rectas horizontales van a la
 * mitad de la franja donde las dos tablas se superponen; las que no se
 * superponen doblan por el pasillo entre columnas.
 */
function rutas(B) {
  const centro = (c) => Math.round(c.y + c.h / 2);
  const acotar = (v, c, margen = 20) => Math.round(Math.min(Math.max(v, c.y + margen), c.b - margen));

  /**
   * Une dos tablas de columnas vecinas. Si se enfrentan lo suficiente, va
   * recta; si no, dobla por el pasillo entre columnas (`carril` = cuántos px
   * a la derecha de la columna izquierda).
   *
   * `de` y `a` pueden estar en cualquier orden: la línea siempre sale del
   * lado que mira a la otra tabla.
   */
  const enlace = (de, a, { t = 0.5, carril = 55, salida } = {}) => {
    const izq = de.x < a.x ? de : a;
    const der = de.x < a.x ? a : de;
    const desde = Math.max(izq.y, der.y) + 18;
    const hasta = Math.min(izq.b, der.b) - 18;
    const orientar = (pts) => (de === izq ? pts : pts.reverse());

    if (hasta - desde >= 8 && salida === undefined) {
      const y = Math.round(desde + (hasta - desde) * t);
      return orientar([[izq.r, y], [der.x, y]]);
    }
    const yDe = salida ?? acotar(centro(a), de);
    const yA = acotar(yDe, a);
    const x = izq.r + carril;
    const pts = [[de === izq ? de.r : de.x, yDe], [x, yDe], [x, yA], [de === izq ? a.x : a.r, yA]];
    return pts;
  };

  const enfrentadas = (a, b) =>
    Math.min(a.b, b.b) - 18 - (Math.max(a.y, b.y) + 18) >= 8;

  const vertical = (arriba, abajo) => {
    const x = Math.round(arriba.x + arriba.w / 2);
    return [[x, arriba.b], [x, abajo.y]];
  };

  const P = B.profiles, N = B.businesses, R = B.reservations, V = B.reviews;
  const S = B.reservation_status_history;
  const techo = 32;
  const piso = Math.max(...Object.values(B).map((c) => c.b)) + 45;
  const margenDerecho = V.r + 45;

  // Por este hueco pasan dos relaciones que cruzan una columna entera.
  const yEntreNotifYReserva = Math.round((B.notifications.b + R.y) / 2);
  const yEntrePerfilYCatalogo = Math.round((P.b + B.catalog_categories.y) / 2);

  return {
    // ── Usuario ──
    'profiles>businesses': enlace(P, N),
    'profiles>notifications': enlace(P, B.notifications),
    'profiles>reservations': enlace(P, R, { t: 0.55 }),
    'profiles>reviews': [
      [P.x + P.w * 0.72, P.y], [P.x + P.w * 0.72, techo],
      [V.x + V.w * 0.5, techo], [V.x + V.w * 0.5, V.y],
    ],
    // Sale entre `notifications` y `reservations`, baja por el pasillo y
    // entra al historial. Es el único cruce del diagrama: se entrelaza con
    // reserva → reseña y no hay acomodo que separe a las dos.
    'profiles>reservation_status_history': (() => {
      const x = R.r + 72;
      const yA = S.y + 40;
      return [[P.r, yEntreNotifYReserva], [x, yEntreNotifYReserva], [x, yA], [S.x, yA]];
    })(),

    // ── Negocio y su configuración ──
    // Las tres tablas de la izquierda se escalonan: la de más abajo usa el
    // carril más cercano al negocio, así sus líneas no se pisan.
    'business_categories>businesses': vertical(B.business_categories, N),
    'businesses>business_hours': enlace(N, B.business_hours, { salida: N.y + 22, carril: 70 }),
    'business_hours>business_hour_slots': vertical(B.business_hours, B.business_hour_slots),
    // Si tienen que doblar, cada una sale a su altura: con la misma salida
    // se superponían y parecían una sola línea que se abre en dos.
    'businesses>business_capacity': enlace(N, B.business_capacity, {
      carril: 30,
      salida: enfrentadas(N, B.business_capacity) ? undefined : N.b - 46,
    }),
    'businesses>promotions': enlace(N, B.promotions, {
      carril: 50,
      t: 0.6,
      salida: enfrentadas(N, B.promotions) ? undefined : N.b - 20,
    }),
    'businesses>catalog_categories': enlace(N, B.catalog_categories),
    'businesses>catalog_items': enlace(N, B.catalog_items, { carril: 50 }),
    'businesses>reservations': [[N.r, yEntrePerfilYCatalogo], [R.x, yEntrePerfilYCatalogo]],
    // Da la vuelta por abajo y por el margen derecho: es la única forma de
    // llegar a la reseña sin atravesar tres columnas de tablas.
    'businesses>reviews': [
      [N.x + N.w * 0.8, N.b], [N.x + N.w * 0.8, piso],
      [margenDerecho, piso], [margenDerecho, centro(V)], [V.r, centro(V)],
    ],

    // ── Catálogo ──
    'catalog_categories>catalog_items': vertical(B.catalog_categories, B.catalog_items),
    'catalog_items>reservations': enlace(B.catalog_items, R, { carril: 50 }),

    // ── Reserva ──
    'reservations>reservation_status_history': enlace(R, S),
    'reservations>reservation_payments': enlace(R, B.reservation_payments, { t: 0.4 }),
    'reservations>reviews': (() => {
      const x = R.r + 38;
      // Entra a la reseña bien separada de la línea "cambia", que corre casi
      // a la misma altura: a menos de 10 px parecían una sola.
      const y = Math.min(V.b - 26, yEntreNotifYReserva - 24);
      return [[R.r, R.y + 24], [x, R.y + 24], [x, y], [V.x, y]];
    })(),
  };
}

/* ─────────────────────────  6. Dibujo SVG  ───────────────────────── */

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Símbolo de pata de gallo en la punta de una línea.
 * (px, py) es donde la línea toca la tabla; (dx, dy) apunta HACIA la tabla.
 */
function simbolo(px, py, dx, dy, card) {
  const nx = -dy, ny = dx;                       // perpendicular
  const en = (d, o = 0) => [px - dx * d + nx * o, py - dy * d + ny * o];
  const raya = (d) => {
    const [a1, a2] = en(d, 7), [b1, b2] = en(d, -7);
    return `<line x1="${a1}" y1="${a2}" x2="${b1}" y2="${b2}"/>`;
  };
  const pata = () => {
    const [c1, c2] = en(12);
    const [i1, i2] = en(0, 8), [d1, d2] = en(0, -8), [m1, m2] = en(0);
    return `<line x1="${c1}" y1="${c2}" x2="${i1}" y2="${i2}"/>` +
           `<line x1="${c1}" y1="${c2}" x2="${d1}" y2="${d2}"/>` +
           `<line x1="${c1}" y1="${c2}" x2="${m1}" y2="${m2}"/>`;
  };
  const circulo = (d) => {
    const [c1, c2] = en(d);
    return `<circle cx="${c1}" cy="${c2}" r="5" fill="${COLOR.fondo}"/>`;
  };

  switch (card) {
    case '1':  return raya(8) + raya(14);
    case '01': return raya(8) + circulo(19);
    case '1N': return pata() + raya(18);
    case '0N': return pata() + circulo(23);
    default: throw new Error(`cardinalidad desconocida: ${card}`);
  }
}

function dibujarRelacion(puntos, [cardDe, cardA], verbo) {
  const d = puntos.map(([x, y], i) => `${i ? 'L' : 'M'}${Math.round(x)},${Math.round(y)}`).join(' ');
  const dir = (a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    return [dx / l, dy / l];
  };
  const [p0, p1] = puntos;
  const [q1, q0] = [puntos[puntos.length - 2], puntos[puntos.length - 1]];
  // Los dos vectores apuntan HACIA la tabla de su punta: así el símbolo se
  // dibuja sobre la línea, afuera de la caja. Invertido, queda dentro y la
  // caja (que se dibuja después) lo tapa.
  const [ax, ay] = dir(p1, p0);   // hacia la tabla de origen
  const [bx, by] = dir(q1, q0);   // hacia la tabla de destino

  let etiqueta = '';
  if (verbo) {
    // En el tramo más largo, para que no quede encima de un símbolo.
    let mejor = 0, largo = -1;
    for (let i = 0; i < puntos.length - 1; i++) {
      const l = Math.hypot(puntos[i + 1][0] - puntos[i][0], puntos[i + 1][1] - puntos[i][1]);
      if (l > largo) { largo = l; mejor = i; }
    }
    const [a, b] = [puntos[mejor], puntos[mejor + 1]];
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    const horizontal = Math.abs(b[1] - a[1]) < 1;
    const ancho = verbo.length * 6 + 10;
    etiqueta = horizontal
      ? `<rect x="${mx - ancho / 2}" y="${my - 17}" width="${ancho}" height="14" fill="${COLOR.fondo}" opacity="0.92"/>` +
        `<text x="${mx}" y="${my - 6}" text-anchor="middle" class="verbo">${esc(verbo)}</text>`
      : `<rect x="${mx + 5}" y="${my - 8}" width="${ancho}" height="14" fill="${COLOR.fondo}" opacity="0.92"/>` +
        `<text x="${mx + 9}" y="${my + 3}" class="verbo">${esc(verbo)}</text>`;
  }

  return `<g class="rel"><path d="${d}" fill="none"/>` +
    `<g class="sim">${simbolo(p0[0], p0[1], ax, ay, cardDe)}${simbolo(q0[0], q0[1], bx, by, cardA)}</g>` +
    `${etiqueta}</g>`;
}

function dibujarEntidad(c) {
  const g = GRUPO[ENTIDADES[c.t].grupo];
  let s = `<g class="ent">`;
  s += `<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" rx="6" fill="${COLOR.fondo}" stroke="${COLOR.borde}" stroke-width="1.3"/>`;
  s += `<path d="M${c.x},${c.y + CABECERA} V${c.y + 6} Q${c.x},${c.y} ${c.x + 6},${c.y} H${c.r - 6} Q${c.r},${c.y} ${c.r},${c.y + 6} V${c.y + CABECERA} Z" fill="${g.fondo}"/>`;
  s += `<line x1="${c.x}" y1="${c.y + CABECERA}" x2="${c.r}" y2="${c.y + CABECERA}" stroke="${COLOR.borde}" stroke-width="1.1"/>`;
  s += `<text x="${c.x + 12}" y="${c.y + 22}" class="tabla">${esc(c.t)}</text>`;
  s += `<text x="${c.x + 12}" y="${c.y + 40}" class="es">${esc(ENTIDADES[c.t].es)}</text>`;

  c.filas.forEach((f, i) => {
    const y = c.y + CABECERA + i * FILA;
    const base = y + 14;
    if (i % 2 === 1) {
      s += `<rect x="${c.x + 1}" y="${y}" width="${c.w - 2}" height="${FILA}" fill="${COLOR.fila}"/>`;
    }
    if (f.resto) {
      s += `<text x="${c.x + 44}" y="${base}" class="resto">+ ${f.resto} columna${f.resto === 1 ? '' : 's'} más</text>`;
      return;
    }
    if (f.marca) s += `<text x="${c.x + 10}" y="${base}" class="marca">${esc(f.marca)}</text>`;
    const clase = f.marca === 'PK' ? 'col pk' : f.nulo ? 'col nulo' : 'col';
    s += `<text x="${c.x + 44}" y="${base}" class="${clase}">${esc(f.nombre)}</text>`;
    s += `<text x="${c.r - 12}" y="${base}" text-anchor="end" class="tipo">${esc(f.tipo)}</text>`;
  });

  return s + `</g>`;
}

const ALTO_LEYENDA = 262;
const ANCHO_LEYENDA = 440;

function dibujarLeyenda(x, y) {
  const linea = (yy, card, texto) => {
    const x0 = x + 18, x1 = x + 78;
    return `<g class="rel"><path d="M${x0},${yy} L${x1},${yy}" fill="none"/>` +
      `<g class="sim">${simbolo(x1, yy, 1, 0, card)}</g></g>` +
      `<text x="${x + 92}" y="${yy + 4}" class="ley">${texto}</text>`;
  };
  // Cada marca en su x: los espacios seguidos se pierden dentro de un <text>.
  const marca = (xx, yy, m, texto) =>
    `<text x="${xx}" y="${yy}" class="marca">${m}</text>` +
    `<text x="${xx + (m.length * 7 + 6)}" y="${yy}" class="ley">${texto}</text>`;

  let s = `<g><rect x="${x}" y="${y}" width="${ANCHO_LEYENDA}" height="${ALTO_LEYENDA}" rx="6" fill="${COLOR.fondo}" stroke="${COLOR.borde}" stroke-width="1"/>`;
  s += `<text x="${x + 16}" y="${y + 24}" class="leytit">Referencias</text>`;
  s += linea(y + 48, '1', 'exactamente uno');
  s += linea(y + 72, '01', 'cero o uno');
  s += linea(y + 96, '0N', 'cero o muchos');
  s += marca(x + 18, y + 126, 'PK', 'clave primaria');
  s += marca(x + 150, y + 126, 'FK', 'clave foránea');
  s += marca(x + 280, y + 126, 'U', 'valor único');
  s += `<text x="${x + 18}" y="${y + 148}" class="ley">Columna en gris: admite valores nulos.</text>`;

  Object.values(GRUPO).forEach((g, i) => {
    const gx = x + 18 + (i % 2) * 200;
    const gy = y + 162 + Math.floor(i / 2) * 22;
    s += `<rect x="${gx}" y="${gy}" width="14" height="14" rx="3" fill="${g.fondo}" stroke="${COLOR.borde}" stroke-width="0.8"/>`;
    s += `<text x="${gx + 20}" y="${gy + 12}" class="ley">${g.texto}</text>`;
  });

  s += `<text x="${x + 18}" y="${y + 228}" class="nota">Las columnas de usuario (owner_id, client_id, user_id, changed_by)</text>`;
  s += `<text x="${x + 18}" y="${y + 244}" class="nota">referencian auth.users de Supabase, con el mismo id que profiles (1:1).</text>`;
  return s + `</g>`;
}

function svg(variante) {
  const B = acomodar(variante);
  if (process.env.DER_MEDIDAS) {
    console.log(`\n${variante}:`);
    for (const c of Object.values(B)) console.log(`  ${c.t.padEnd(28)} x=${c.x} y=${c.y} w=${c.w} h=${c.h} fin=${c.b}`);
  }
  const R = rutas(B);

  // La leyenda va abajo a la izquierda: esa esquina queda libre y ninguna
  // relación pasa por ahí (la vuelta de negocio → reseña baja más a la derecha).
  const piso = Math.max(...Object.values(B).map((c) => c.b)) + 45;
  const yLeyenda = Math.max(B.promotions.b, B.businesses.b) + 40;
  const ancho = B.reviews.r + 45 + MARGEN;
  const alto = Math.max(piso, yLeyenda + ALTO_LEYENDA) + MARGEN;

  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}" viewBox="0 0 ${ancho} ${alto}">`;
  s += `<style>
    .tabla{font:700 14.5px ${MONO};fill:${COLOR.tinta}}
    .es{font:italic 12px ${FUENTE};fill:${COLOR.suave}}
    .col{font:12px ${MONO};fill:${COLOR.tinta}}
    .col.pk{font-weight:700;text-decoration:underline}
    .col.nulo{fill:${COLOR.nulo}}
    .tipo{font:11px ${MONO};fill:${COLOR.suave}}
    .marca{font:700 9.5px ${FUENTE};fill:${COLOR.borde};letter-spacing:.3px}
    .resto{font:italic 11px ${FUENTE};fill:${COLOR.suave}}
    .rel path,.rel line{stroke:${COLOR.linea};stroke-width:1.35}
    .sim circle{stroke:${COLOR.linea};stroke-width:1.35}
    .verbo{font:italic 11px ${FUENTE};fill:${COLOR.suave}}
    .leytit{font:700 13px ${FUENTE};fill:${COLOR.tinta}}
    .ley{font:12px ${FUENTE};fill:${COLOR.tinta}}
    .nota{font:italic 11px ${FUENTE};fill:${COLOR.suave}}
  </style>`;
  s += `<rect width="100%" height="100%" fill="${COLOR.fondo}"/>`;

  // Primero las líneas y después las tablas, que tapan los extremos.
  for (const rel of RELACIONES) {
    const clave = `${rel.de}>${rel.a}`;
    if (!R[clave]) throw new Error(`Relación sin ruta: ${clave}`);
    s += dibujarRelacion(R[clave], rel.c, rel.verbo);
  }
  for (const c of Object.values(B)) s += dibujarEntidad(c);
  s += dibujarLeyenda(MARGEN, yLeyenda);

  return { svg: s + `</svg>`, ancho, alto };
}

/* ─────────────────────────  7. Mermaid  ───────────────────────── */

function mermaid() {
  const card = { '1': '||', '01': 'o|', '0N': 'o{', '1N': '|{' };
  const cardIzq = { '1': '||', '01': '|o', '0N': '}o', '1N': '}|' };
  let s = 'erDiagram\n';
  for (const r of RELACIONES) {
    s += `  ${r.de} ${cardIzq[r.c[0]]}--${card[r.c[1]]} ${r.a} : "${r.verbo ?? r.col}"\n`;
  }
  for (const t of Object.keys(ENTIDADES)) {
    s += `  ${t} {\n`;
    for (const f of filasDe(t, false)) {
      const m = f.marca === 'PK' ? ' PK' : f.marca.startsWith('FK') ? ' FK' : f.marca === 'U' ? ' UK' : '';
      s += `    ${f.tipo} ${f.nombre}${m}\n`;
    }
    s += '  }\n';
  }
  return s;
}

/* ─────────────────────────  8. Escribir  ───────────────────────── */

mkdirSync(salida, { recursive: true });

const EDGE = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find((p) => existsSync(p));

for (const variante of ['resumen', 'completo']) {
  const { svg: contenido, ancho, alto } = svg(variante);
  const archivoSvg = join(salida, `der-${variante}.svg`);
  writeFileSync(archivoSvg, contenido);

  if (!EDGE) {
    console.log(`  der-${variante}.svg  (sin Edge: no se generó el PNG)`);
    continue;
  }

  // El PNG lo saca Edge sin ventana, a 3x: una imagen de 1900 px de ancho
  // impresa en una hoja apaisada queda pixelada; a 3x se ve nítida.
  //
  // Con un perfil temporal propio: sin `--user-data-dir`, Edge arranca con el
  // perfil de quien corre el script y hasta intenta sincronizar su cuenta.
  const temporal = mkdtempSync(join(tmpdir(), 'der-'));
  const html = join(temporal, `der-${variante}.html`);
  writeFileSync(
    html,
    `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#fff}</style></head><body>${contenido}</body></html>`,
  );
  const png = join(salida, `der-${variante}.png`);
  rmSync(png, { force: true });
  try {
    // `--headless` a secas ya no saca capturas en Edge actual: hace falta =new.
    execFileSync(EDGE, [
      '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
      '--no-default-browser-check', `--user-data-dir=${join(temporal, 'perfil')}`,
      '--force-device-scale-factor=3',
      `--window-size=${ancho},${alto}`,
      `--screenshot=${png}`,
      pathToFileURL(html).href,
    ], { stdio: 'ignore', timeout: 90_000 });

    // Edge devuelve el control en ~40 ms y escribe la captura recién ~1 s
    // después, desde otro proceso. Sin esperar, se borraba la carpeta temporal
    // con Edge todavía trabajando y el PNG no llegaba a existir. Se espera a
    // que aparezca y a que deje de crecer, que es cuando terminó de escribir.
    let anterior = -1;
    for (let i = 0; i < 120; i++) {
      await new Promise((r) => setTimeout(r, 250));
      if (!existsSync(png)) continue;
      const tamano = statSync(png).size;
      if (tamano > 0 && tamano === anterior) break;
      anterior = tamano;
    }
  } finally {
    rmSync(temporal, { recursive: true, force: true });
  }

  if (!existsSync(png)) {
    console.error(`  der-${variante}.svg  (Edge no generó el PNG)`);
    process.exitCode = 1;
    continue;
  }
  console.log(`  der-${variante}.svg + .png  (${ancho}×${alto} px, PNG a 3x)`);
}

writeFileSync(join(salida, 'der.mmd'), mermaid());
console.log('  der.mmd');
console.log(`\n  ${Object.keys(ENTIDADES).length} entidades, ${RELACIONES.length} relaciones.`);
