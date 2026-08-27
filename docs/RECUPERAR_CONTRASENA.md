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

### 1. Conectar un proveedor de correo

Un servidor propio de correo termina en spam. Conviene un proveedor; con el
plan gratuito de cualquiera de estos alcanza de sobra para una tesis:

| Proveedor | Gratis | Servidor SMTP |
|---|---|---|
| Brevo | 300 correos/día | `smtp-relay.brevo.com`, puerto 587 |
| Resend | 3.000 correos/mes | `smtp.resend.com`, puerto 587 |

En la VPS de Supabase (`187.77.247.54`), en el archivo `.env` del stack:

```env
GOTRUE_SMTP_HOST=smtp-relay.brevo.com
GOTRUE_SMTP_PORT=587
GOTRUE_SMTP_USER=<usuario que te da el proveedor>
GOTRUE_SMTP_PASS=<clave que te da el proveedor>
GOTRUE_SMTP_ADMIN_EMAIL=no-responder@tudominio.com
GOTRUE_SMTP_SENDER_NAME=AJ Spots
```

Después, reiniciar el servicio de autenticación:

```bash
docker compose restart auth
```

> El remitente tiene que ser un dominio verificado en el proveedor. Si usás
> una casilla de Gmail sin verificar, los correos se van a rechazar o a spam.

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
npm run auth:probar-correo -- tucorreo@gmail.com
```

Si el correo no llega, revisar los registros del contenedor:

```bash
docker compose logs auth --tail 50
```

## Notas de seguridad

- **El mensaje de error no distingue** entre código equivocado y código
  vencido. No es un descuido: el servidor devuelve el mismo error en los dos
  casos para no confirmarle a nadie que un código existe.
- **La pantalla habla en condicional** ("si ese correo tiene una cuenta") por
  el mismo motivo: no revela si el correo está registrado.
- **Seis dígitos son un millón de combinaciones.** GoTrue limita los intentos
  de verificación; si se cambia esa configuración, conviene revisar que el
  límite siga puesto.
