# Asistente de AJ Spots

Servicio que conecta la app con Claude.

## Por qué existe

La API key de Anthropic **no puede vivir en el APK**. Vite embebe toda variable
`VITE_*` en el bundle, y un APK se descompila en minutos: cualquiera podría
sacar la clave y gastar tu cuenta. Por eso la app habla con este servicio, y
este servicio habla con Claude.

## Cómo lee los datos del usuario

Cuando llega una consulta, el servicio arma un contexto con los datos de esa
persona (sus reservas, sus negocios, sus métricas) y se lo pasa a Claude.

Ese contexto se consulta **con el JWT del propio usuario**, no con
`service_role`. Es una decisión deliberada: RLS sigue aplicando, así que el
asistente sólo puede ver lo que esa persona ya vería dentro de la app. Con
`service_role` un cliente podría, con la pregunta correcta, hacer que el
asistente le contara las reservas de otro.

Verificado: el contexto de un cliente contiene sólo sus propias reservas más lo
que es público; el de un dueño, sólo sus negocios.

## Configuración

```bash
cp .env.example .env
```

| Variable | Para qué |
|---|---|
| `ANTHROPIC_API_KEY` | Tu clave. Vive sólo acá. |
| `ANTHROPIC_MODEL` | Por defecto `claude-opus-5`. |
| `SUPABASE_URL` | La misma que usa la app. |
| `SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_ANON_KEY` | La clave **pública**, a propósito (ver arriba). |
| `ALLOWED_ORIGINS` | Orígenes web permitidos, separados por coma. Vacío = todos. |
| `RATE_LIMIT` | Consultas por usuario cada 10 minutos. Por defecto 30. |
| `PORT` | Por defecto 8787. |

## Correr en local

```bash
npm install
npm run build
npm start
```

Probar que responde:

```bash
curl http://localhost:8787/health
```

## Desplegar en Coolify

1. **New Resource → Docker Compose** (o Dockerfile) apuntando a esta carpeta.
2. Cargar las variables de entorno de la tabla de arriba.
3. Asignarle un dominio, por ejemplo `https://asistente.neura.com.py`.
4. En el proyecto de la app, completar `VITE_ASSISTANT_URL` con ese dominio y
   recompilar el APK.

Tiene que ser **HTTPS y accesible desde internet**: el celular no llega a
`localhost` ni a una IP de tu red.

Mientras `VITE_ASSISTANT_URL` esté vacía, la burbuja de ayuda no aparece y el
resto de la app funciona igual.

## Endpoints

### `GET /health`

```json
{ "ok": true, "modelo": "claude-opus-5" }
```

### `POST /chat`

Requiere `Authorization: Bearer <JWT de Supabase>`.

```json
{ "messages": [{ "role": "user", "content": "¿Cuál es mi próxima reserva?" }] }
```

Responde por **Server-Sent Events**, para que el texto aparezca a medida que se
genera en vez de tras varios segundos de pantalla vacía:

```
event: texto
data: "Tu próxima reserva es "

event: texto
data: "en La Cabaña..."

event: fin
data: {"uso": 87}
```

Si algo falla llega `event: error` con un mensaje ya redactado para mostrarle
al usuario.

## Decisiones de diseño

**Contexto inyectado, no tool use.** El servicio arma un panorama de los datos
del usuario y lo manda en el prompt, en vez de darle herramientas a Claude para
que consulte la base. Es más simple, más rápido (una sola llamada) y el costo
es predecible. Si más adelante hiciera falta buscar en un catálogo grande,
convendría pasar a tool use.

**Las consultas van en paralelo.** En serie tardaban ~3,2 s para un dueño con
varios negocios, antes de que Claude empezara siquiera. En paralelo, ~0,5 s.

**El contexto se cachea.** Va en el `system` con `cache_control`, así que en un
hilo de varias preguntas se cobra una vez en lugar de repetirse en cada turno.

**`effort: 'low'`.** El asistente resume datos y da consejos breves; no necesita
razonamiento profundo, y con menos esfuerzo responde más rápido y más barato.

**El contexto está marcado como datos.** Los nombres de negocio, descripciones
y reseñas los escriben los usuarios, así que podrían contener texto que intente
pasar por instrucción. El prompt lo delimita y aclara que es contenido, no
órdenes.

**El asistente no ejecuta acciones.** No crea ni cancela reservas, no responde
reseñas ni publica promociones: explica dónde hacerlo. Es deliberado — una
acción destructiva disparada por un malentendido del modelo no tiene vuelta
atrás, y el usuario está a dos toques de hacerlo él mismo.
