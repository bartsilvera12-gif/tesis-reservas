# AJ Spots

App móvil de reservas para Paraguay. Dos roles: **cliente** (descubre y reserva)
y **dueño de negocio** (gestiona reservas, carta, horarios, promos y reseñas).

React + Vite + TypeScript · Supabase (schema `tesisreserva`) · Capacitor Android.

El diseño viene del prototipo original de Claude Design, que quedó archivado en
[`prototype-original/`](prototype-original/). La estética beige/terracota,
tipografías (Marcellus + Figtree), cards, chips y navegación inferior se
conservaron; lo que cambió es que **ya no hay datos simulados**: todo sale de
Supabase.

---

## Requisitos

- Node.js 18 o superior
- Una instancia de Supabase (Cloud o self-hosted)
- Para el APK: Android Studio (incluye el JDK)

---

## 1. Instalación

```bash
npm install
```

## 2. Variables de entorno

```bash
cp .env.example .env.local
```

Completá `.env.local`:

```env
VITE_SUPABASE_URL=https://tu-supabase.ejemplo.com
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
# Si tu instancia todavía usa la anon key (JWT), dejá la de arriba vacía y usá:
VITE_SUPABASE_ANON_KEY=eyJ...

# Sólo para tu máquina: crear el schema. Nunca llega al frontend.
DATABASE_URL=postgresql://usuario:clave@host:6432/postgres?sslmode=disable
```

En Windows (PowerShell) el `cp` equivalente es:

```powershell
Copy-Item .env.example .env.local
```

> Vite embebe **toda** variable `VITE_*` en el bundle y por lo tanto en el APK.
> Nunca pongas ahí `service_role`, secret keys ni la contraseña de PostgreSQL.

## 3. Crear la base de datos

```bash
npm run db:push
```

Crea el schema `tesisreserva` con sus 14 tablas, índices, constraints,
triggers, funciones RPC, RLS y los buckets de Storage.

## 4. Exponer el schema

**Paso obligatorio.** PostgREST no sirve `tesisreserva` hasta que lo declares.
Los pasos están en [`docs/SUPABASE_SETUP.md`](docs/SUPABASE_SETUP.md).

Resumen:
- **Cloud:** `Project Settings → API → Exposed schemas` → agregar `tesisreserva`.
- **Self-hosted:** `PGRST_DB_SCHEMAS=public,storage,graphql_public,tesisreserva`
  y recrear el servicio REST.

## 5. Ejecutar la app

```bash
npm run dev
```

Abre <http://localhost:5173>. Está pensada para celular: en el navegador
conviene activar la vista móvil (F12 → modo dispositivo).

## 6. Datos demo (opcional)

Los negocios del prototipo (La Cabaña, Lupe Café, Barbería El Prado,
Aqua Spa & Wellness) se cargan como datos de prueba.

Como se enganchan a cuentas reales de Supabase Auth, **primero registrá desde
la app**:

| Email                         | Tipo de cuenta   |
|-------------------------------|------------------|
| `demo.owner@tesisreserva.py`  | Dueño de negocio |
| `demo.client@tesisreserva.py` | Cliente          |

Y después:

```bash
npm run db:seed
```

Y para completar las imágenes y las reseñas de muestra:

```bash
npm run db:images     # portadas y logos -> Supabase Storage
npm run db:reviewers  # 8 clientes ficticios con sus reseñas
```

`db:images` descarga las fotos originales del prototipo, las optimiza
(de ~2 MB a ~150 KB) y las sube al bucket; en las tablas queda sólo la URL.

Para los negocios sin logo propio, `db:images` dibuja un emblema SVG sobre el
color de su categoría (taza, tijera, gota, parrilla) en el mismo lenguaje de
iconos que el resto de la app. Pesan ~6 KB y se ven nítidos a cualquier tamaño.
**Nunca pisa un logo real** que el dueño haya subido desde la app.

`db:reviewers` da de alta los usuarios con el **API de Auth**, igual que un
registro normal desde la app.

Esas 8 cuentas (Marta González, Carlos Ruiz, Sofía López, Diego Paredes,
Hugo Benítez, Laura Cáceres, Romina Ortiz y Javier Acosta) usan el dominio
`@ejemplo.py` y la contraseña de `SEED_REVIEWER_PASSWORD`. Son usuarios reales
de Supabase Auth con rol `client` y sin negocios asociados, así que no pueden
administrar nada. Aun así **son cuentas de demostración**: si algún día llevás
esto a producción, borralas.

---

## Android (APK de depuración)

El APK ya está generado:

```
android/app/build/outputs/apk/debug/app-debug.apk
```

Para regenerarlo después de cambiar el código:

```bash
npm run build          # 1. compila la web a dist/
npx cap sync android   # 2. copia dist/ al proyecto nativo
cd android && ./gradlew assembleDebug
```

O desde Android Studio (`npm run android:open`):
**Build → Build Bundle(s) / APK(s) → Build APK(s)**.

Instalación: copiá el `.apk` al teléfono y abrilo (hay que permitir
"orígenes desconocidos"). Con el cable conectado también sirve
`adb install -r app-debug.apk`.

- App ID: `com.tesis.reserva` · Nombre: `AJ Spots`
- APK **debug**: no se generan ni versionan certificados de firma.

> El teléfono se conecta al Supabase real por HTTPS. `VITE_SUPABASE_URL`
> **no** puede ser `localhost`: dentro del APK eso apunta al propio teléfono.

### Icono de la app

El icono vive en `assets/app-icon.png`. Para regenerar los recursos de Android:

```bash
npm run android:icons
```

Genera las tres variantes que pide Android, en las cinco densidades:

| Archivo | Para qué |
|---|---|
| `ic_launcher.png` | Icono clásico (Android 7 y anteriores) |
| `ic_launcher_round.png` | Variante circular, para launchers que la piden |
| `ic_launcher_foreground.png` | Capa del icono adaptativo (Android 8+) |

Y actualiza `@color/ic_launcher_background` con el color muestreado del propio
icono.

Dos detalles que hacen que el resultado se vea bien y no conviene tocar a ciegas:

- **El monograma se recorta y se re-centra**, en vez de escalar la imagen
  entera. El icono adaptativo se recorta con máscaras distintas según el
  launcher (círculo, squircle, cuadrado), y sólo el **66% central** está
  garantizado. Escalando la imagen completa, el logo queda diminuto.
- **El recorte se hace con transparencia**, no con el fondo terracota incluido.
  Sobre el color plano del fondo adaptativo se notaría el borde cuadrado del
  recorte: la imagen original tiene textura y viñeteado, y no empata con un
  color liso. La transparencia se calcula por luminancia con transición suave
  para que el bisel de las letras no quede dentado.

Si cambiás el icono, reemplazá `assets/app-icon.png`, corré el script y
recompilá el APK.


### Nota sobre la versión de Java

Android Studio 2026.1 trae **JDK 25**, que Gradle 8.11 (el que usa la
plantilla de Capacitor 7) todavía no soporta: falla con
`Unsupported class file major version 69`.

Por eso el proyecto fija un **JDK 21** en `android/gradle.properties`:

```properties
org.gradle.java.home=C:/Neura/.tooling/jdk-21.0.12+8
```

Si movés el proyecto a otra máquina, ajustá esa ruta a tu JDK 17/21, o borrá
la línea y definí `JAVA_HOME` apuntando a uno.

`android/local.properties` (que guarda `sdk.dir`) está en `.gitignore` porque
tiene rutas de esta máquina; Android Studio lo regenera solo.

> En ambos archivos usá **barras normales**. En un `.properties` de Java el
> backslash es carácter de escape, así que `C:\Users\...` se convierte
> silenciosamente en `C:Users...` y Gradle falla con un error de ruta inválida
> que no dice cuál es el problema.

---

## Detalles de layout móvil

Dos cosas se ven distinto en el APK que en el navegador y conviene no romperlas
al tocar estilos.

### La navegación inferior queda fija

Porque el scroll ocurre **dentro** de `<main>`, no en la página. Eso exige
alturas **fijas** en toda la cadena:

```
html, body   ->  height: 100%;   overflow: hidden
#root        ->  height: 100dvh; overflow: hidden
AppShell     ->  height: 100dvh  (columna interna: height: 100%)
main         ->  flex: 1; min-height: 0; overflow-y: auto
```

Si alguna vuelve a `min-height`, el contenedor crece con el contenido, scrollea
la página entera y la barra se va fuera de pantalla.

### La barra de estado de Android

No se resuelve con `env(safe-area-inset-top)`: en Android ese valor sólo cubre
el *notch*, no la barra de estado común, así que devuelve `0` y el contenido
queda por debajo de la hora y la batería.

El arreglo es del lado nativo, en `src/main.tsx`:

```ts
await StatusBar.setOverlaysWebView({ overlay: false });
```

Con eso la WebView arranca debajo de la barra y no hace falta padding extra.

---

### Reglas móviles que conviene sostener

Auditado a 320 px de ancho (el celular más chico en uso), 360 px y 740×360 en
horizontal, sobre todas las pantallas de ambos roles.

| Regla | Por qué |
|---|---|
| **Área tocable ≥ 44 px** en todo lo que se toca | Un punto de 6 px o un enlace de 15 px de alto se fallan con el dedo. Cuando el elemento debe **verse** chico (los puntos del carrusel, los enlaces de texto), se agranda sólo el área con `padding` + `margin` negativo, sin mover el diseño. |
| **`minWidth: 0`** en campos dentro de un `flex` | `input[type=date]` y `[type=time]` imponen un ancho mínimo intrínseco (~176 px): dos en fila desbordan a 320 px. Las filas además usan `flexWrap` para apilarse. |
| **`font-size: 16px`** en los inputs | Con menos, el navegador hace zoom al enfocar y descoloca la pantalla. |
| **Sin alturas fijas grandes** | El mapa usa `min(250px, 38dvh)`: en horizontal taparía toda el área útil. |
| **Sin scroll horizontal de página** | Sólo scrollean los carruseles, que lo declaran explícitamente. |
| **`ellipsis` en texto variable** | Los nombres de negocio y de cliente vienen de la base y pueden ser largos. |

### Gestos e integración nativa

- El carrusel de promociones usa **scroll nativo con `scroll-snap`**: se desliza
  con el dedo y con inercia. Los puntos son un atajo, no el único modo.
- Las confirmaciones **no usan `window.confirm`**: en Android abre el diálogo
  del sistema, en inglés y sin la tipografía de la app. Se usa `useConfirm()`.
- `prefers-reduced-motion` desactiva las animaciones. Sirve además de red de
  seguridad: varias entradas usan `fill-mode`, y si el navegador congela la
  animación el contenido igual queda visible y en su lugar.


## Estructura

```
src/
├─ components/    UI reutilizable (botones, cards, chips, mapa…)
├─ context/       AuthContext (sesión + rol) y OwnerBusinessContext
├─ hooks/         useAsync (loading/error/empty), geolocalización, toasts
├─ layouts/       AppShell + navegación inferior por rol
├─ lib/           cliente Supabase, tokens de diseño, formateo
├─ pages/
│  ├─ auth/       bienvenida, login, registro, recuperar clave
│  ├─ client/     inicio, explorar, negocio, reservar, mis reservas, perfil
│  └─ owner/      onboarding, dashboard, reservas, negocio, reseñas, promos
├─ routes/        guardas por rol (ClientRoute / OwnerRoute)
├─ services/      acceso a datos (una función por operación)
└─ types/         tipos del schema

supabase/
├─ migrations/001_tesisreserva.sql
└─ seed.sql
```

---

## Cómo funcionan los roles

Hay **un solo login** para toda la app.

1. **Registro:** el usuario elige *Cliente* o *Dueño de negocio*. Es
   obligatorio y se elige **una sola vez**.
2. El trigger `tesisreserva.handle_new_user` crea el `profile` con ese rol.
3. **Login:** se lee `profiles.role` y la app redirige sola:
   - `client` → `/app` (Inicio · Explorar · Reservas · Perfil)
   - `owner` → `/panel` (Inicio · Reservas · Negocio · Reseñas · Promos)
4. Un `owner` sin negocio entra a un onboarding obligatorio antes del panel.

El rol **no se puede cambiar** desde el frontend: la política RLS de `profiles`
rechaza cualquier `UPDATE` que toque la columna `role`.

Las rutas están protegidas en el frontend (`ClientRoute` / `OwnerRoute`) **y**
en la base con RLS. Escribir la URL a mano no alcanza para entrar.

---

## Disponibilidad y reservas

Las reservas **no** se crean con un `INSERT` suelto: van por la función
`tesisreserva.create_reservation(...)`, que dentro de una sola transacción:

1. valida la sesión y que la cuenta no sea de negocio,
2. valida que el negocio esté activo y la fecha no sea pasada,
3. valida que el horario caiga dentro de una franja habilitada,
4. toma un `pg_advisory_xact_lock` por negocio+fecha y recién ahí cuenta la
   ocupación — esto es lo que evita que dos personas tomen el último lugar,
5. calcula la seña,
6. crea la reserva, su historial y la notificación al dueño.

La pantalla de confirmación sólo aparece si la base devolvió la reserva creada.

Los horarios disponibles salen de `tesisreserva.get_availability(...)`, que
genera los turnos desde `business_hour_slots` (soporta horario partido, ej.
11:30–15:00 y 19:00–23:00) y descuenta las reservas que se solapan.

Dos modelos de capacidad:

- **`table`** (restaurantes, cafeterías): mesas por tamaño en `business_capacity`.
- **`service`** (barberías, spas): turnos simultáneos vía
  `businesses.max_concurrent_reservations`.

---

## Sobre las "sugerencias"

El prototipo mostraba textos fijos bajo la etiqueta *IA*. Ahora son reglas
simples sobre datos reales y **no** se usa ningún servicio externo:

- **Cliente** (`recommended_businesses`): prioriza categorías donde ya reservó;
  si no hay historial, los mejor puntuados.
- **Dueño** (`business_stats` + `buildInsights`): horario más pedido, día más
  flojo, promedio de reseñas, reservas sin responder.

Si todavía no hay volumen, el panel dice
*"Todavía no hay suficientes datos para generar recomendaciones."*

---

## Asistente con IA

La app tiene una burbuja de ayuda flotante que responde consultas sobre los
datos reales del usuario, con **Claude Opus 5**. El código del servicio está en
[`server/`](server/) — ver su README para desplegarlo.

Para un cliente responde sobre sus reservas, los negocios y cómo usar la app.
Para un dueño, sobre sus métricas, reseñas sin responder y configuración.

Dos cosas importantes:

**La API key nunca está en el APK.** Vite embebe toda variable `VITE_*` en el
bundle y un APK se descompila en minutos. La clave vive en el servicio de
`server/`; la app sólo conoce su URL (`VITE_ASSISTANT_URL`).

**El asistente ve lo mismo que el usuario, ni más.** El servicio consulta los
datos con el JWT de esa persona, no con `service_role`, así que RLS sigue
aplicando. Un cliente no puede lograr que le cuente las reservas de otro.

Mientras `VITE_ASSISTANT_URL` esté vacía, la burbuja no aparece y el resto de
la app funciona igual.

---

## Scripts

| Comando               | Qué hace                                        |
|-----------------------|-------------------------------------------------|
| `npm run dev`         | Servidor de desarrollo                          |
| `npm run build`       | Chequeo de tipos + build de producción          |
| `npm run preview`     | Sirve el build                                  |
| `npm run lint`        | Sólo chequeo de tipos                           |
| `npm run db:push`     | Aplica las migraciones                          |
| `npm run db:seed`     | Migraciones + datos demo                        |
| `npm run db:test`     | Verifica RLS, capacidad y RPCs (hace ROLLBACK)  |
| `npm run db:images`   | Sube las portadas/logos demo a Storage          |
| `npm run db:reviewers`| Crea los clientes ficticios y sus reseñas demo  |
| `npm run android:sync`| Build + `cap sync android`                      |
| `npm run android:open`| Abre Android Studio                             |
| `npm run android:icons`| Regenera los iconos desde `assets/app-icon.png` |
