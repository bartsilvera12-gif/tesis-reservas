# Configurar Supabase para `tesisreserva`

Esta app **no** usa el schema `public`. Todo vive en `tesisreserva`, y el cliente
JS se inicializa con `db: { schema: 'tesisreserva' }`.

---

## 1. Crear el schema

```bash
npm run db:push
```

Esto ejecuta `supabase/migrations/001_tesisreserva.sql` usando `DATABASE_URL`
de tu `.env.local`. La migración es **idempotente**: podés correrla las veces
que quieras.

> `DATABASE_URL` es una credencial de administrador. Sólo se usa desde tu
> máquina. **Nunca** llega al frontend ni al APK.

Alternativa: pegar el contenido de `001_tesisreserva.sql` en el **SQL Editor**
de Supabase Studio y ejecutarlo.

---

## 2. Exponer el schema en la Data API  ⚠️ paso obligatorio

PostgREST sólo sirve los schemas que tiene declarados. Si `tesisreserva` no
está en la lista, **todas** las consultas fallan con:

```json
{ "code": "PGRST106", "message": "Invalid schema: tesisreserva" }
```

La app detecta este caso y muestra un mensaje explícito en pantalla.

### Supabase Cloud

`Project Settings` → `API` → **Exposed schemas** → agregar `tesisreserva` → guardar.

### Supabase self-hosted (Docker / Coolify)

Editar la variable de entorno del servicio REST:

```env
PGRST_DB_SCHEMAS=public,storage,graphql_public,tesisreserva
```

Y recrear el contenedor:

```bash
docker compose up -d --force-recreate rest
```

En Coolify: `Environment Variables` → editar `PGRST_DB_SCHEMAS` → **Redeploy**.

---

## 3. Recargar el cache de esquema de PostgREST

PostgREST cachea tablas, relaciones y funciones. Después de cualquier cambio
de estructura (tablas nuevas, **claves foráneas**, funciones RPC) hay que
avisarle o no verá los cambios:

```sql
NOTIFY pgrst, 'reload schema';
```

Síntoma típico de cache viejo:

```
Could not find a relationship between 'reservations' and 'profiles'
in the schema cache
```

---

## 4. Cargar los datos demo

Los negocios demo se enganchan a cuentas reales de Supabase Auth, así que
**primero registrá estas dos cuentas desde la app** (`/registro`):

| Email                         | Tipo de cuenta    |
|-------------------------------|-------------------|
| `demo.owner@tesisreserva.py`  | Dueño de negocio  |
| `demo.client@tesisreserva.py` | Cliente           |

Después:

```bash
npm run db:seed
```

Si falta alguna cuenta, el seed carga igual las categorías y avisa por consola
qué falta. Se puede volver a correr sin problema.

> **Por qué no se crean los usuarios desde SQL:** escribir a mano en
> `auth.users` / `auth.identities` obliga a replicar el hashing y el esquema
> interno de GoTrue. Es frágil y se rompe en cada actualización. Por eso el
> seed busca los usuarios por email en vez de inventarlos.

---

## 5. Storage

La migración crea dos buckets públicos:

- `tesisreserva-businesses` — logos y portadas. Ruta: `<business_id>/<archivo>`
- `tesisreserva-avatars` — fotos de perfil. Ruta: `<user_id>/<archivo>`

Las políticas validan la **primera carpeta** de la ruta: un dueño sólo puede
escribir dentro de la carpeta de un negocio que le pertenece, y cada usuario
sólo dentro de su propia carpeta. La subida se hace con la clave pública desde
el navegador; **nunca** hace falta `service_role` en el frontend.

---

## 6. Permisos: cómo está resuelto

Supabase trae `ALTER DEFAULT PRIVILEGES` globales que le dan **ALL** (incluido
`DELETE` y `TRUNCATE`) a `anon` y `authenticated` sobre cada tabla nueva.
`TRUNCATE` **no** respeta RLS, así que eso sería un agujero real.

Por eso la migración primero revoca y después concede lo mínimo:

```sql
revoke all on all tables in schema tesisreserva from anon, authenticated;
-- ...y a continuación sólo los GRANT necesarios
```

Resultado verificado:

| Rol             | Puede                                                                |
|-----------------|----------------------------------------------------------------------|
| `anon`          | Sólo **leer** catálogo público: categorías, negocios, horarios, carta, promos y reseñas activas |
| `authenticated` | Lo anterior + sus propios datos, según las políticas RLS             |

`anon` no tiene ningún permiso de escritura, ni puede leer `profiles`,
`reservations`, `notifications` ni `reservation_payments`.

> Si más adelante agregás tablas a este schema, **volvé a correr la migración**
> para que los permisos vuelvan a ajustarse.

---

## 7. Generar tipos TypeScript (opcional)

```bash
npx supabase gen types typescript --db-url "$DATABASE_URL" \
  --schema tesisreserva > src/types/database.types.ts
```

Hoy los tipos están escritos a mano en `src/types/db.ts` para no depender de
la CLI.

---

## 8. Nombres en las reseñas públicas

Las reseñas son públicas pero `profiles` no lo es: su política sólo deja leer
el perfil propio (y al dueño, el de sus clientes). Sin nada más, un cliente
que mira las reseñas de otro recibiría `null` y la pantalla mostraría
"Cliente" en vez del nombre.

Exponer `profiles` entero filtraría email y teléfono. La solución es la vista
`tesisreserva.review_authors`, que publica **sólo** `id`, `full_name` y
`avatar_url`, y únicamente de quienes tienen una reseña visible.

Dos detalles que la hacen segura y que conviene no romper:

1. **`security_invoker = false`** (el default). Es lo que le permite saltar la
   RLS de `profiles` limitándose a esas tres columnas.
2. **Sólo `SELECT`.** La vista es auto-actualizable, así que si `anon`
   conservara `INSERT`/`UPDATE`/`DELETE` —que es lo que le dan los
   `ALTER DEFAULT PRIVILEGES` globales de Supabase— tendría un camino para
   escribir en `profiles` salteando RLS. Por eso la migración hace
   `revoke all` antes del `grant select`.

`npm run db:test` verifica ambas cosas.
