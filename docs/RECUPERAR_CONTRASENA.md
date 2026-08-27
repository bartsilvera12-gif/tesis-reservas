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

## Cómo quedó montado el servidor

Ya está configurado y andando. Esta sección documenta qué se tocó, porque la
instancia de Supabase es **compartida por 123 proyectos** y conviene que quede
escrito.

### Envío de correos

Ya estaba configurado por otro proyecto de la misma instancia:

```
smtp.hostinger.com:465
info@neura.com.py
remitente: "Soporte Neura"
```

No hizo falta ni contraseña de aplicación de Google ni un proveedor nuevo:
`neura.com.py` ya tiene su correo en Hostinger, con MX y SPF puestos.

### La plantilla del correo

GoTrue es **un solo servicio para los 123 proyectos**: la plantilla de
recuperación es única y compartida. Y varios proyectos la usan de verdad
(panelhito, seguridadalimentaria, tecnolabo).

Por eso la plantilla trae **las dos formas a la vez**:

- `{{ .Token }}` — el código de 6 dígitos, que usa AJ Spots
- `{{ .ConfirmationURL }}` — el enlace, que siguen usando los proyectos web

Sacar cualquiera de las dos le rompe la recuperación a alguien. El texto es
neutro a propósito: no nombra ninguna app porque le llega a los usuarios de
todas.

### Dónde vive

La plantilla se sirve desde un contenedor `nginx:alpine` llamado
`mail-templates`, en la red `supabase_default`:

```
/root/supabase/mail-templates/recovery.html  ->  http://mail-templates/recovery.html
```

En `docker-compose.yml`, dentro del servicio `auth`:

```yaml
GOTRUE_MAILER_TEMPLATES_RECOVERY: "http://mail-templates/recovery.html"
GOTRUE_MAILER_SUBJECTS_RECOVERY: "Recuperar tu contrasena"
```

> **Por qué en el mismo servidor y no en una URL externa.** GoTrue baja la
> plantilla por HTTP, y si la descarga falla **no cae a la plantilla por
> defecto**: el correo directamente no sale (se verificó en el código de
> `templatemailer`). Alojándola en el mismo stack, sólo puede fallar si ya
> falló todo lo demás.

### Cómo revertirlo

Sacar esas dos líneas del `docker-compose.yml` y recrear el servicio:

```bash
cd /root/supabase/docker && docker compose up -d --no-deps auth
```

Vuelve a la plantilla de fábrica. Hay copias del compose en
`docker-compose.yml.bak-*`.

### Cómo verificar que sigue andando

El registro del contenedor de plantillas muestra cada descarga que hace
GoTrue (aparece como `Go-http-client`):

```bash
docker logs mail-templates --tail 20
```

## Si hay que rehacerlo desde cero

## Notas de seguridad

- **El mensaje de error no distingue** entre código equivocado y código
  vencido. No es un descuido: el servidor devuelve el mismo error en los dos
  casos para no confirmarle a nadie que un código existe.
- **La pantalla habla en condicional** ("si ese correo tiene una cuenta") por
  el mismo motivo: no revela si el correo está registrado.
- **Seis dígitos son un millón de combinaciones.** GoTrue limita los intentos
  de verificación; si se cambia esa configuración, conviene revisar que el
  límite siga puesto.
