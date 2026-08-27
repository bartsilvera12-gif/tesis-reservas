# Recuperación de contraseña

La app usa un **código de 6 dígitos**, no un enlace.

## Por qué un código y no un enlace

Dentro del APK la aplicación corre en `https://localhost`, que es el servidor
interno de Capacitor. Un enlace de vuelta apuntaba ahí, así que al tocarlo el
teléfono abría el navegador en una dirección que no existe y el flujo moría.

Con el código la persona nunca sale de AJ Spots, y no hace falta configurar
deep links, dominios ni archivos de verificación en Android.

## Cómo funciona

1. La persona escribe su correo en **Recuperar contraseña**.
2. El servidor genera un código de 6 dígitos y lo manda por correo.
   En la base queda guardado sólo el hash (`SHA-224` de `correo + código`),
   nunca el código en claro.
3. La persona lo escribe junto con su contraseña nueva.
4. El código se canjea por una sesión temporal y en el mismo paso se guarda la
   contraseña. Si el cambio falla, la sesión se cierra: no queda abierta una
   sesión con permisos plenos esperando otra pantalla.

El código **vence en una hora** y es de **un solo uso**: una vez canjeado, el
servidor lo rechaza.

## Lo que falta hacer en el servidor

Todo lo anterior ya está implementado en la app. Falta que el Supabase
autohospedado pueda **enviar correos**, y que la plantilla incluya el código.

### 1. Conectar el correo (SMTP de Gmail)

Los correos salen desde **alanayala212.aa@gmail.com**, usando el servidor de
Google. No hace falta verificar ningún dominio ni tocar DNS.

> **Por qué Gmail y no un proveedor como Resend:** se eligió que el remitente
> sea esa casilla concreta. Resend (y cualquier proveedor serio) sólo deja
> enviar desde un dominio propio verificado, y `gmail.com` es de Google: nadie
> puede demostrar que es suyo. Para que el remitente sea un Gmail, el único
> camino es el SMTP del propio Google.

#### a. Activar la verificación en dos pasos

Google no entrega contraseñas de aplicación sin esto:
<https://myaccount.google.com/signinoptions/twosv>

> **Cuidado con la cuenta.** Si tenés varias sesiones de Google abiertas, las
> URLs de configuración caen en la **predeterminada**, no en la que creés.
> El síntoma es "La opción de configuración que buscas no está disponible
> para tu cuenta", que parece un bloqueo de Google y en realidad es que
> estás mirando otra cuenta. Verificá el avatar de arriba a la derecha, o
> forzá cuál con `/u/0/`, `/u/1/`, etc. en la URL.

La opción de contraseñas de aplicación también queda escondida si la 2FA
está configurada **sólo con una llave de seguridad** física (se arregla
agregando el teléfono como segundo método) o si la cuenta tiene el
**Programa de Protección Avanzada**, que las bloquea por diseño.

#### b. Generar una contraseña de aplicación

**Cuenta de Google → Seguridad → Contraseñas de aplicaciones**.

Se crea una para "Correo" y Google devuelve **16 caracteres**. Esa es la que
va en la configuración, NO la contraseña con la que entrás a Gmail.

> Se copia directo al `.env` de la VPS. No hace falta que pase por ningún
> lado más: es una credencial y cuantas menos manos la toquen, mejor. Si
> alguna vez se filtra, se revoca desde esa misma pantalla sin cambiar la
> contraseña de la cuenta.

#### c. Configurar GoTrue

En la VPS de Supabase (`187.77.247.54`), en el `.env` del stack:

```env
GOTRUE_SMTP_HOST=smtp.gmail.com
GOTRUE_SMTP_PORT=587
GOTRUE_SMTP_USER=alanayala212.aa@gmail.com
GOTRUE_SMTP_PASS=<los 16 caracteres, sin espacios>
GOTRUE_SMTP_ADMIN_EMAIL=alanayala212.aa@gmail.com
GOTRUE_SMTP_SENDER_NAME=AJ Spots
```

`GOTRUE_SMTP_ADMIN_EMAIL` tiene que ser **la misma dirección** que
`GOTRUE_SMTP_USER`. Si se pone otra, Gmail reescribe el remitente o rechaza
el envío directamente: no permite mandar en nombre de una casilla ajena.

Después, reiniciar el servicio de autenticación:

```bash
docker compose restart auth
```

#### Límites que conviene tener presentes

- **~500 correos por día.** Para esta app sobra: son unas pocas
  recuperaciones de contraseña.
- **El usuario ve una dirección personal** como remitente, y Gmail suele
  agregar un "enviado por" cuando detecta correo automatizado.
- **Si Google bloquea el acceso**, avisa por correo a esa misma casilla. Suele
  pasar la primera vez que un servidor nuevo se conecta.

### 2. Poner el código en la plantilla

Por defecto la plantilla del correo de recuperación trae un enlace. Hay que
cambiarla para que muestre el código.

En el panel de Supabase: **Authentication → Email Templates → Reset Password**.

```html
<h2>Recuperar tu contraseña</h2>
<p>Tu código para AJ Spots es:</p>
<p style="font-size:28px;font-weight:bold;letter-spacing:6px">{{ .Token }}</p>
<p>Vence en una hora. Si no lo pediste, ignorá este correo.</p>
```

Lo importante es `{{ .Token }}`, que es el código de 6 dígitos.
`{{ .ConfirmationURL }}` (el enlace) puede sacarse: la app no lo usa.

### 3. Probar que llega

```bash
npm run auth:probar-correo -- neurautomations@gmail.com
```

Conviene probar contra una casilla **distinta** de la que envía: si mandás y
recibís en la misma, Gmail a veces la archiva sola y parece que no llegó.

Si no llega, los registros del contenedor dicen por qué:

```bash
docker compose logs auth --tail 50
```

#### Qué significa cada error

| En los registros | Qué pasó |
|---|---|
| `535 Username and Password not accepted` | La clave no es la de aplicación, o quedó con espacios. Son 16 caracteres seguidos. |
| `534 Application-specific password required` | Falta activar la verificación en 2 pasos, o se puso la contraseña normal de la cuenta. |
| `dial tcp ... i/o timeout` | La VPS no llega a `smtp.gmail.com:587`. Muchos proveedores **bloquean el puerto 587 y el 25 de salida** para frenar spam. Probar el puerto `465`; si tampoco, hay que pedirle al proveedor que lo abra. |
| `553 ... not allowed` | `GOTRUE_SMTP_ADMIN_EMAIL` no coincide con `GOTRUE_SMTP_USER`. |
| Nada, y el correo tampoco llega | Revisar spam, y el correo de la casilla que envía: Google avisa ahí cuando bloquea un acceso nuevo. |

## Notas de seguridad

- **El mensaje de error no distingue** entre código equivocado y código
  vencido. No es un descuido: el servidor devuelve el mismo error en los dos
  casos para no confirmarle a nadie que un código existe.
- **La pantalla habla en condicional** ("si ese correo tiene una cuenta") por
  el mismo motivo: no revela si el correo está registrado.
- **Seis dígitos son un millón de combinaciones.** GoTrue limita los intentos
  de verificación; si se cambia esa configuración, conviene revisar que el
  límite siga puesto.
