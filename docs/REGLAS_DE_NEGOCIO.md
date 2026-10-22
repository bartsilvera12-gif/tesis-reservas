# Reglas de negocio de AJ Spots

Este documento describe cómo funciona la aplicación en cada uno de los puntos que pidió revisar la corrección de la tesis. Todo lo que dice está implementado y probado:

- las reglas viven en la base de datos (`supabase/migrations/001_tesisreserva.sql`);
- las pruebas automáticas de `scripts/` las verifican contra la base real.

Sirve como insumo para los capítulos de requerimientos, reglas de negocio, base de datos, seguridad y pruebas.

---

## 1. Roles (punto 18)

La aplicación tiene **dos roles funcionales**:

| Rol | Qué hace | Cómo se obtiene |
|---|---|---|
| **Cliente** | Busca negocios, reserva, sube el comprobante de la seña, cancela, reseña. | Cualquier cuenta registrada. |
| **Administrador del negocio** (dueño o responsable) | Configura su negocio y responde las reservas, entre otras tareas (ver abajo). | Desde Perfil → "Tengo un negocio" (función `become_owner`). |

El administrador del negocio, además:

- carga el negocio, sus servicios, horarios y capacidad;
- acepta o rechaza reservas, verifica comprobantes y marca la asistencia;
- responde reseñas y publica promociones.

"Administrador" y "responsable del negocio" son **el mismo rol**. Conviene usar un solo nombre en todo el documento; se propone *administrador del negocio*. En las pantallas la app lo llama "dueño" o "Mi negocio".

Una misma cuenta puede ser cliente y administrador a la vez: el dueño de una peluquería puede reservar en un restaurante. La base guarda el rol en `profiles.role` y el acceso al panel en `profiles.is_owner`. Existe además un valor `admin` para soporte técnico de la plataforma. No tiene pantallas propias y **no forma parte del alcance funcional**.

---

## 2. Un modelo de reservas por tipo de negocio (puntos 11 y 12)

Cada negocio tiene un **tipo de reserva** (`businesses.reservation_type`) que define:

- qué es el **recurso** que se reserva;
- cómo se mide su **capacidad**;
- cómo se calcula la **disponibilidad**.

| Rubro | Tipo | Recurso | Capacidad | Disponibilidad |
|---|---|---|---|---|
| Lavadero | `slot` (turno) | Puesto de lavado | `max_concurrent_reservations`: cuántos vehículos se atienden a la vez | Turnos dentro del horario. Un turno está libre si las reservas que se superponen con él son menos que la capacidad. |
| Peluquería | `slot` (turno) | Puesto de atención (sillón) | `max_concurrent_reservations`: cuántos clientes se atienden a la vez | Igual que el lavadero. La duración la da el servicio elegido. |
| Spa de uñas | `service` | Puesto de atención | `max_concurrent_reservations` | Igual, pero **elegir el servicio es obligatorio**, porque define la duración. |
| Restaurante | `table` (mesa) | Mesa de un tamaño | `business_capacity`: cuántas mesas hay de cada tamaño (ej. 5 mesas de 2 y 3 de 4) | Se cuenta **por tamaño de mesa**: un horario está libre para 4 personas si quedan mesas de 4 sin reservas que se superpongan. |
| Hospedaje | `stay` (estadía) | Alojamiento (cabaña, habitación) | `catalog_items.units` (cuántas unidades iguales hay) y `catalog_items.capacity` (cuántas personas entran) | Por **rango de fechas**: una unidad está libre si no hay otra estadía que se superponga (ver sección 5). |

**Reglas comunes a los cinco:**

- **Superposición.** Dos reservas chocan si sus intervalos `[inicio, inicio + duración)` se superponen. Una reserva que termina a las 10:00 no choca con otra que empieza a las 10:00.
- **Duración.** Es la del servicio elegido (`catalog_items.duration_minutes`) o, si no hay, la duración por defecto del negocio. Un turno sólo se ofrece si **entra completo antes del cierre**.
- **Horario.** Sólo se reserva dentro de las franjas habilitadas de ese día. La app admite horario partido, por ejemplo 9 a 12 y 15 a 19.
- **Validación en el servidor.** La disponibilidad se calcula en `get_availability` y `get_stay_availability`. Al crear la reserva se vuelve a validar todo dentro de `create_reservation`, con un bloqueo por negocio y fecha (`pg_advisory_xact_lock`) para que dos personas no tomen el último lugar al mismo tiempo.

---

## 3. Peluquerías y spas: asignación a un profesional (punto 13)

**Fuera del alcance.** La reserva **no se asocia a un profesional** en particular. El negocio declara cuántos clientes atiende a la vez y la app controla esa capacidad general.

Atender agendas individuales implicaría:

- una entidad "profesional" con su propio horario;
- que el cliente elija con quién atenderse;
- disponibilidad calculada por profesional.

Queda como **línea de trabajo futuro**.

---

## 4. Restaurantes: asignación de mesas (punto 14)

- El negocio carga **cuántas mesas tiene de cada tamaño**: 2, 4, 6 personas, etc.
- El cliente elige **para cuántas personas** reserva, entre los tamaños que el negocio tiene cargados.
- La reserva ocupa **una mesa de ese tamaño** durante la duración de la reserva (por defecto 90 minutos).
- **No se asigna una mesa física numerada.** Se controla cuántas mesas de cada tamaño están ocupadas en cada horario. El dueño decide en el momento cuál ocupa.
- **Doble asignación.** Una misma mesa no puede asignarse a dos reservas a la vez: si las reservas superpuestas de un tamaño ya igualan la cantidad de mesas de ese tamaño, el horario deja de ofrecerse y `create_reservation` rechaza el pedido ("Ese horario ya no está disponible").
- **Mesas combinadas: fuera del alcance.** Un grupo de 7 no puede reservar juntando una mesa de 4 y una de 3. El negocio que quiera recibir grupos grandes carga ese tamaño de mesa.
- **Mesa más grande: fuera del alcance.** Un grupo de 3 no ocupa automáticamente una mesa de 4. Se reserva entre los tamaños que el negocio declaró.

Las pruebas que lo verifican están en `test-flows.mjs` (secciones 4 a 7: tope de mesas, solapamiento, otro tamaño sigue libre).

---

## 5. Hospedajes: disponibilidad por rango de fechas (punto 15)

- El cliente elige **fecha de entrada, fecha de salida y el alojamiento**.
- La estadía ocupa el intervalo **[entrada, salida)**: la noche de salida **no** se ocupa. Una estadía del 5 al 8 son 3 noches, y otra persona puede entrar el 8.
- Dos estadías del mismo alojamiento chocan si sus rangos se superponen. La base lo resuelve con `daterange(entrada, salida) && daterange(...)`.
- Cada alojamiento tiene una cantidad de **unidades iguales**. Por ejemplo, 3 cabañas de 4 personas: se aceptan estadías superpuestas hasta agotar las unidades.
- La salida tiene que ser posterior a la entrada (restricción `reservations_stay_check`). La cantidad de personas no puede superar la capacidad del alojamiento.

---

## 6. Estados de una reserva (puntos 16 y 17)

```
pending ──► confirmed ──► completed | no_show | cancelled
   │
   ├──► rejected    el administrador la rechaza (con motivo opcional)
   ├──► cancelled   el cliente la cancela
   └──► expired     nadie respondió dentro del plazo
```

| Estado | En pantalla | Ocupa lugar |
|---|---|---|
| `pending` | Pendiente | Sí, hasta que vence el plazo |
| `confirmed` | Confirmada | Sí |
| `rejected` | Rechazada | No |
| `cancelled` | Cancelada | No |
| `expired` | Vencida | No |
| `completed` | Completada (asistió) | No |
| `no_show` | No asistió | No |

**Reglas de transición** (todas en `set_reservation_status`):

- **Cliente.** Sólo puede **cancelar** su propia reserva, pendiente o confirmada.
- **Administrador del negocio.** Acepta, rechaza o cancela las reservas de **su** negocio.
- **Asistencia.** "Asistió" y "No asistió" se marcan sólo desde *confirmada* y recién cuando llega la hora, con 30 minutos de tolerancia.
- **Estados finales.** Rechazada, cancelada, vencida, completada y no asistió no cambian más.
- **Historial y avisos.** Cada cambio queda en `reservation_status_history`, con quién y cuándo, y genera una notificación a la otra parte.

### 6.1 Plazo de respuesta y vencimiento (punto 16)

- Una reserva pendiente tiene un **plazo de respuesta** (`reservations.expires_at`): **24 horas** desde que se creó, o **la hora de la reserva** si llega antes.
- Mientras el plazo corre, la reserva **ocupa su lugar**.
- **Al vencer el plazo, el lugar se libera en ese mismo instante**: el cálculo de disponibilidad deja de contarla (función `ocupa_lugar`).
- Una tarea programada en la base (**pg_cron, cada 5 minutos**, función `vencer_reservas`) hace cuatro cosas:
  1. pasa la reserva a **vencida**;
  2. registra el motivo ("El negocio no respondió a tiempo");
  3. la anota en el historial;
  4. avisa al cliente y al administrador.
- Pasado el plazo, el administrador **ya no puede aceptarla**: el lugar pudo haberlo tomado otra persona.
- El administrador ve en cada tarjeta "Respondé antes de mañana a las 10:00". El cliente ve hasta cuándo puede responder el negocio.

### 6.2 Negocios que no piden seña (punto 17)

El administrador elige el comportamiento en **Negocio → Cómo aceptás las reservas**:

- **Revisión manual** (opción por defecto). La reserva queda **pendiente** hasta que el administrador la acepte o la rechace, con el plazo de la sección 6.1.
- **Aceptar automáticamente** (`businesses.auto_confirm`). Si hay lugar, la reserva queda **confirmada al instante**. El cliente ve "¡Reserva confirmada!" y el administrador recibe "Nueva reserva confirmada".

Si el negocio pide seña, la aceptación automática **no se aplica nunca**: alguien tiene que verificar en el banco que la transferencia llegó.

---

## 7. La seña por transferencia (punto 16)

La aplicación **no procesa pagos**:

- el cliente transfiere a la cuenta del negocio;
- sube la captura del comprobante;
- el administrador la verifica en su banco.

La app registra cada paso y avisa a las partes.

| Estado de la seña (`deposit_status`) | Significado | Cuándo |
|---|---|---|
| `none` | El negocio no pide seña. | Al crear la reserva. |
| `pending` | Comprobante adjuntado, **pendiente de verificación**. | Al crear la reserva: **sin comprobante la reserva no se crea**. |
| `paid` | Verificada. | Cuando el administrador **acepta** la reserva. |
| `to_refund` | A devolver. | La reserva se **rechazó**, el cliente la **canceló** antes de que se confirmara, o **venció**. |
| `refunded` | Devuelta. | El administrador transfirió la devolución y tocó "Ya le devolví la seña". El cliente recibe el aviso. |

**Reglas:**

- **No existe el estado "pendiente de comprobante".** El comprobante se exige en el mismo paso de la reserva, también en el servidor: no se puede crear una reserva con seña sin adjuntarlo.
- **Monto.** Se calcula al reservar: monto fijo **por reserva**, o **por persona** en restaurantes y hospedajes, si el negocio lo elige.
- **Plazo.** La reserva con seña sigue el mismo plazo de respuesta (sección 6.1). Si vence, el lugar se libera y la seña pasa a "a devolver".
- **Cancelación de una reserva ya confirmada.** Devolver o retener la seña depende de la política del negocio. La app permite marcarla como devuelta, pero no lo exige.
- **Datos del pago.** El comprobante se guarda en un bucket **privado** (`tesisreserva-comprobantes`). Sólo lo ven el cliente que lo subió y el administrador del negocio, mediante un enlace firmado que caduca.

---

## 8. Aislamiento de datos entre negocios (punto 19)

La app es multi-negocio: un administrador sólo accede a lo suyo. El control **no depende de las pantallas**. Lo hace la base de datos con **Row Level Security (RLS)** en todas las tablas:

- **Reservas.** El administrador ve sólo las de los negocios que le pertenecen (`is_business_owner`). El cliente ve sólo las propias.
- **Negocio, servicios, horarios, mesas, promociones.** Cualquiera puede leer lo publicado, pero sólo el dueño de ese negocio puede modificarlo.
- **Comprobantes.** Están en un bucket privado. Cada archivo lo leen sólo el cliente que lo subió y el dueño del negocio de esa reserva.
- **Reseñas.** Sólo el dueño de ese negocio puede responderlas, y no puede modificar ni borrar lo que escribió el cliente.
- **Cambios de estado.** **Ningún usuario puede insertar ni modificar reservas directamente.**
  - Todo pasa por funciones del servidor (`create_reservation`, `set_reservation_status`, `mark_deposit_refunded`) que validan permisos, capacidad, horario y plazo.
  - Así un cliente no puede autoconfirmarse, y un administrador no puede revivir una reserva vencida.
  - El historial tampoco se puede escribir a mano.
- **Claves.** La aplicación móvil sólo lleva la clave pública (`anon`). Las claves de administración nunca salen del servidor.

**Pruebas que lo verifican:**

- `test-flows.mjs`:
  - un cliente no ve ni cancela la reserva de otro;
  - un dueño no modifica el negocio de otro;
  - todas las tablas tienen RLS activo.
- `test-owner.mjs`:
  - un dueño no ve ni responde reservas ni reseñas de otro negocio;
  - cada local tiene sus propias estadísticas.
- `test-reglas.mjs`:
  - nadie escribe reservas ni historial por fuera de las funciones;
  - otro dueño no puede marcar devoluciones ajenas.

---

## 9. Tecnología de la aplicación móvil híbrida (puntos 21 y 22)

- La interfaz está construida con **React + TypeScript** (Vite).
- Se empaqueta como aplicación **Android nativa** con **Capacitor 7**. Capacitor genera un proyecto Android (carpeta `android/`) que contiene la interfaz y le da acceso a funciones del teléfono: notificaciones locales para los recordatorios (`@capacitor/local-notifications`), ubicación para el mapa (`@capacitor/geolocation`), y el selector de archivos del sistema para elegir la captura del comprobante.
- **Compilación.**
  1. `npm run build` genera la interfaz.
  2. `npx cap sync android` la copia al proyecto Android.
  3. Gradle (`./gradlew assembleDebug`) genera el archivo **APK**.
- **Instalación.** El APK se copia al teléfono y se instala habilitando "Instalar apps de origen desconocido". Para una publicación en Google Play se generaría un *Android App Bundle* firmado (`bundleRelease`).
- **Servicios.**
  - Supabase (PostgreSQL, autenticación y almacenamiento de archivos), autoalojado.
  - El asistente, un servicio Node.js desplegado aparte que usa la API de Claude.

En la Tabla 1 del marco teórico corresponde decir "**la aplicación**" o "**la aplicación móvil**", no "la aplicación web".

---

## 10. Recomendaciones

Las recomendaciones salen de **reglas sobre los datos reales**, sin IA externa. Así cada recomendación se puede explicar y verificar.

### 10.1 Para el cliente ("Para vos", en el inicio)

Cada negocio activo suma puntos por:

| Criterio | Cómo se calcula |
|---|---|
| Afinidad | Rubros en los que la persona ya reservó. Una reserva que se concretó pesa el doble que un pedido. |
| Promoción | El negocio tiene una promoción vigente. |
| Reseñas | Promedio bayesiano: se parte de 4 estrellas con peso de 3 reseñas. Un 5 con una sola reseña no le gana a un 4,8 con treinta. |
| Cercanía | Sólo si la persona dio permiso de ubicación y está en Ñemby. Resta un poco por kilómetro. |

**Reglas:**

- Se muestra primero el mejor de cada rubro, para no recomendar dos negocios del mismo tipo seguidos.
- No se recomiendan los negocios propios ni uno donde la persona ya tiene una reserva próxima.
- Cada recomendación muestra **por qué** aparece: "Porque ya reservaste en hospedajes", "Promo: 2x1 los lunes", "A 800 m de vos" o "★ 4,8 en 12 reseñas". Nunca dice "cerca" si no se conoce la ubicación.

La función es `recommended_businesses` en la base de datos.

### 10.2 Para el administrador del negocio (panel)

Se muestran como mucho 4 recomendaciones, ordenadas por urgencia. Cada una lleva, cuando corresponde, un botón a la pantalla donde se resuelve.

| Recomendación | Cuándo aparece |
|---|---|
| Por vencer | Hay reservas pendientes cuyo plazo vence en las próximas 6 horas. |
| Reservas sin responder | 3 o más pendientes. |
| Se te vencieron reservas | Venció alguna en los últimos 30 días. Si el negocio no pide seña, sugiere la aceptación automática; si la pide, recuerda revisar las devoluciones. |
| Reseñas negativas sin respuesta / Reseñas sin responder | Hay reseñas sin contestar. Las de 3 estrellas o menos van primero. |
| Clientes que no vienen | 20% o más de "no asistió" con al menos 5 turnos cerrados en 3 meses. Si no pide seña, sugiere pedirla. |
| Días flojos | Un día con movimiento recibe menos de la mitad que el más fuerte. Los días cerrados no cuentan. Si no hay promo activa, sugiere crear una. |
| Horario más pedido | La franja más reservada y el servicio más pedido. En hospedajes se muestra el alojamiento más pedido. |
| Clientes que vuelven | Dos o más clientes con más de una reserva. |

Las recomendaciones de **demanda** (días flojos y horario más pedido) esperan a tener al menos **5 reservas** en 60 días, para no presentar una casualidad como tendencia. Las demás aparecen desde el primer día.

Los datos los calcula `business_stats` en la base. La regla vive en `src/services/stats.ts`.

## 11. Pruebas automatizadas (evidencia para el capítulo de pruebas)

| Comando | Qué verifica | Casos |
|---|---|---|
| `npm run db:test` | Flujos completos, RLS, capacidad, seña, historial, notificaciones, reseñas sólo después de la reserva | 67 |
| `npm run db:test:owner` | Reglas del panel del administrador: estados, reseñas, promociones, carta, horarios, capacidad, estadísticas, aislamiento | 106 |
| `npm run test:reglas` | Plazo de respuesta, vencimiento, aceptación automática, estados de la seña, escritura sólo por funciones | 41 |
| `npm run test:recomendaciones` | Recomendaciones del cliente (reseñas, rubros, promos, cercanía) y del panel del negocio | 25 |
| `npm run test:modo` | Modo cliente y modo negocio en la misma cuenta | 14 |
| `npm run test:cercania` | Orden por distancia en el mapa | 17 |
| `npm run test:recordatorios` | A quién y cuándo se le recuerda una reserva | 22 |
| `npm run test:nemby` | Límite geográfico de Ñemby | 29 |

Las pruebas de base de datos corren contra la base real dentro de una transacción que se revierte, así que no dejan datos.
