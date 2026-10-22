/**
 * Contenido de "Cómo se usa": el manual de uso completo.
 *
 * Es la única fuente del manual. La pantalla de ayuda de la app lo muestra y
 * `scripts/generar-manual.mjs` arma con el mismo texto el PDF para imprimir,
 * así que lo que dice la app y lo que dice el papel no pueden desfasarse.
 *
 * Los textos admiten **negrita** y *cursiva*. Las imágenes son capturas
 * reales de la app con datos de ejemplo, en `public/ayuda/`.
 */
export interface SeccionAyuda {
  id: string;
  titulo: string;
  /** Una línea que se ve con la sección cerrada. */
  resumen: string;
  pasos?: string[];
  puntos?: string[];
  nota?: string;
  imagen?: string;
}

export const AYUDA_CLIENTE: SeccionAyuda[] = [
  {
    id: 'inicio',
    titulo: 'La pantalla de inicio',
    resumen: 'Promociones y lugares recomendados para vos.',
    puntos: [
      '**Promociones:** las ofertas de los negocios. Tocá **Ver negocio** para ir al local.',
      '**Para vos:** lugares elegidos para vos, con el motivo: un rubro que ya reservaste, una promo o muy buenas reseñas.',
      '**Cerca de vos:** la lista de negocios. Tocá cualquiera para verlo.',
      'Arriba, el botón **Ñemby** abre el mapa.',
      'La barra de abajo tiene **Inicio**, **Explorar**, **Reservas**, **Perfil** y **Asistente**.',
    ],
    imagen: 'c03-inicio',
  },
  {
    id: 'buscar',
    titulo: 'Buscar un lugar',
    resumen: 'En Explorar, con el mapa, la lista o el buscador.',
    puntos: [
      '**Buscador:** escribí el nombre o lo que buscás, por ejemplo *sushi*. La **×** lo borra.',
      '**Filtros:** tocá Restaurantes, Peluquerías, etc.',
      '**Mapa:** cada punto es un negocio. Tocalo y después **Ver el negocio**.',
      '**Lista:** los mismos negocios, uno debajo del otro.',
      'La línea punteada es el **límite de Ñemby**.',
    ],
    nota: 'Si le das permiso de ubicación, el mapa te muestra lo que tenés más cerca.',
    imagen: 'c04-explorar',
  },
  {
    id: 'negocio',
    titulo: 'Mirar un negocio',
    resumen: 'Servicios, precios, reseñas, horarios y dónde queda.',
    puntos: [
      '**Servicios** (o **Carta**, o **Alojamientos**): qué ofrece, cuánto cuesta y cuánto dura.',
      '**Reseñas:** lo que opinaron otros clientes y lo que les contestó el negocio.',
      '**Info:** horarios, dirección y mapa. Tocá el **teléfono** para llamar, **Cómo llegar** para que el celular te guíe, o **WhatsApp**.',
      'Si el local cargó a su equipo, arriba dice **Te atienden** y quiénes son.',
      'Abajo está siempre el botón **Reservar**.',
    ],
    imagen: 'c07-ficha-info',
  },
  {
    id: 'reservar',
    titulo: 'Hacer una reserva',
    resumen: 'Día, servicio y hora, y confirmar.',
    pasos: [
      'En el negocio, tocá **Reservar**.',
      'Elegí el **día**. La fila se desliza para ver más días.',
      'Elegí el **servicio** o, en un restaurante, **para cuántas personas**.',
      'Si aparece **¿Con quién?**, tocá a la persona que querés que te atienda, o **Sin preferencia**.',
      'Elegí la **hora**. Sólo aparecen las que quedan; las tachadas ya están ocupadas.',
      'Revisá el resumen **TU RESERVA** (servicio, precio y hora) y tocá **Confirmar reserva**.',
    ],
    nota: 'En un hospedaje elegís la fecha de entrada y de salida (viene marcada una noche) y el alojamiento.',
    imagen: 'c08-reservar-turno',
  },
  {
    id: 'sena',
    titulo: 'Si el negocio pide seña',
    resumen: 'Transferís y subís el comprobante.',
    pasos: [
      'Mirá el **monto** y los **datos de la cuenta** del negocio.',
      'Hacé la **transferencia** desde la app de tu banco o billetera.',
      'Sacá una **captura** del comprobante.',
      'Tocá **Subir el comprobante** y elegí la captura.',
    ],
    nota: 'La app no cobra nada: la plata va directo al negocio. Sin el comprobante la reserva no se puede completar.',
    imagen: 'c09-reservar-sena',
  },
  {
    id: 'despues',
    titulo: 'Después de reservar',
    resumen: 'Pendiente, confirmada, rechazada o vencida.',
    puntos: [
      'Aparece **¡Reserva creada!** con tu **código**.',
      'Queda **pendiente** hasta que el negocio la acepte. Te llega un aviso cuando responde.',
      'Algunos negocios aceptan solos: ahí ves **¡Reserva confirmada!** al instante.',
      'Si el negocio no responde en **24 horas** (o antes de la hora de la reserva), la reserva **vence** y se libera el lugar.',
      'La app te recuerda la reserva antes de que llegue la hora.',
    ],
    imagen: 'c11-reserva-creada',
  },
  {
    id: 'mis-reservas',
    titulo: 'Mis reservas',
    resumen: 'Ver, cancelar y dejar una opinión.',
    puntos: [
      '**Próximas** e **Historial**, con el estado de cada una.',
      'En una pendiente ves **hasta cuándo** tiene el negocio para responder.',
      '**Cancelar:** se puede hasta la hora de la reserva. El negocio recibe un aviso.',
      '**Reseñar:** después de ir, en el **Historial**, dejá tus estrellas y tu opinión.',
    ],
    nota: 'Si la reserva se rechaza o vence, el negocio te tiene que devolver la seña. Si cancelás una ya confirmada, la devolución la arreglás con el negocio.',
    imagen: 'c12-mis-reservas',
  },
  {
    id: 'avisos',
    titulo: 'Avisos',
    resumen: 'Te enterás cuando el negocio responde.',
    puntos: [
      'En **Perfil → Notificaciones** están todos los avisos: reserva confirmada, rechazada (con el motivo), vencida o seña devuelta.',
      '**Tocá un aviso** para ir directo a esa reserva.',
      'En **Perfil**, al lado de **Notificaciones**, ves cuántos avisos no leíste.',
    ],
    imagen: 'c13-avisos',
  },
  {
    id: 'asistente',
    titulo: 'El asistente',
    resumen: 'El botón Asistente de la barra de abajo.',
    puntos: [
      'Tocá **Asistente**: el chat se abre encima de la pantalla en la que estés.',
      'Escribile como a una persona: *“¿Cuál es mi próxima reserva?”* o *“¿Cómo funcionan las señas?”*.',
      'Te explica cómo usar la app y en qué pantalla hacer cada cosa.',
      'No puede reservar ni cancelar por vos.',
    ],
    imagen: 'c14-asistente-respuesta',
  },
];

export const AYUDA_DUENIO: SeccionAyuda[] = [
  {
    id: 'alta-1',
    titulo: 'Cargar tu negocio · paso 1',
    resumen: 'Nombre, rubro, descripción y fotos.',
    pasos: [
      'En **Perfil**, tocá **Tengo un negocio**, después **Sí, empezar** y **Crear mi negocio**.',
      'Escribí el **nombre** y elegí la **categoría**.',
      'Agregá una **descripción** corta, el **teléfono** y el **WhatsApp**.',
      'Elegí el **logo** y una **portada** linda del local.',
    ],
    nota: 'Es la misma cuenta con la que reservás: después cambiás entre los dos modos desde Perfil.',
    imagen: 'd02-alta-paso1',
  },
  {
    id: 'alta-2',
    titulo: 'Paso 2 · Ubicación',
    resumen: 'Dirección, barrio y pin en el mapa.',
    pasos: [
      'Escribí la **dirección**.',
      'Tocá tu **barrio**: el pin salta hasta ahí.',
      '**Tocá el mapa** justo donde está tu local, o **Usar mi ubicación actual** si estás ahí.',
    ],
    nota: 'Sólo se aceptan ubicaciones dentro de Ñemby.',
    imagen: 'd04-alta-paso2',
  },
  {
    id: 'alta-3',
    titulo: 'Paso 3 · Reservas',
    resumen: 'Días, horario y a cuántos atendés.',
    puntos: [
      '**Duración** de cada reserva.',
      '**Días que atendés** y el horario (ya viene uno sugerido para tu rubro).',
      '**A cuántos atendés a la vez** (o tus mesas, o tus habitaciones).',
      'Tocá **Crear mi negocio**: desde ahí los clientes ya te ven.',
    ],
    imagen: 'd05-alta-paso3',
  },
  {
    id: 'panel',
    titulo: 'El inicio del panel',
    resumen: 'Lo que tenés que hacer hoy.',
    puntos: [
      '**Completá tu negocio:** lo que te falta cargar, hasta que esté todo.',
      '**Reservas que esperan respuesta:** tocá el aviso para responderlas.',
      'Los números del día, qué días te reservan más y las **reservas de hoy**.',
    ],
    imagen: 'd06-panel',
  },
  {
    id: 'consejos',
    titulo: 'Recomendaciones para tu negocio',
    resumen: 'Consejos con tus propios datos.',
    puntos: [
      'En el inicio del panel, **Recomendaciones** te dice qué hacer para no perder clientes y para vender más.',
      'Por ejemplo: reservas por vencer, señas para devolver, críticas sin responder, días flojos para una promo o tu horario más fuerte.',
      'Cada consejo trae un botón que te lleva a donde se resuelve.',
    ],
    nota: 'Salen de tus reservas y reseñas reales. Con más movimiento, más consejos.',
    imagen: 'd06-consejos',
  },
  {
    id: 'responder',
    titulo: 'Responder las reservas',
    resumen: 'Aceptar o rechazar, y ver el comprobante.',
    pasos: [
      'Entrá a **Reservas**. Abre en **Por responder**.',
      'Leé el cliente, el día, la hora, el servicio y su comentario.',
      'Si pidió seña, tocá **Ver el comprobante** y fijate en tu banco que llegó.',
      'Tocá **Aceptar** o **Rechazar**. El cliente recibe un aviso.',
    ],
    nota: 'Tenés **24 horas** para responder (o hasta la hora de la reserva, si es antes): cada tarjeta dice hasta cuándo. Si no respondés, vence sola y se libera el lugar.',
    imagen: 'e02-por-responder',
  },
  {
    id: 'rechazar',
    titulo: 'Rechazar con un motivo',
    resumen: 'Para que el cliente sepa qué hacer.',
    puntos: [
      'Al rechazar, escribí el **motivo**: *“¿te sirve a las 16?”*. Le llega al cliente en el aviso.',
      'Cuando llega la hora de una reserva aceptada, tocá **Marcar asistida** o **No asistió**.',
    ],
    imagen: 'e05-rechazar',
  },
  {
    id: 'devolver',
    titulo: 'Señas a devolver',
    resumen: 'Cuando la reserva no se concretó.',
    pasos: [
      'Si rechazás, el cliente cancela antes de que aceptes o la reserva vence, la seña queda **a devolver**.',
      'Entrá a **Reservas → Señas a devolver**: están todas juntas, de cualquier día.',
      'Transferile la seña al cliente desde tu banco.',
      'Tocá **Ya le devolví la seña**. El cliente recibe el aviso.',
    ],
    nota: 'La app no mueve plata: sólo deja constancia de que la devolviste.',
    imagen: 'e06-senas-devolver',
  },
  {
    id: 'aceptar-solas',
    titulo: 'Aceptar reservas automáticamente',
    resumen: 'Que se confirmen solas, sin esperar.',
    pasos: [
      'En **Negocio**, abrí **Cómo aceptás las reservas**.',
      'Prendé **Aceptar automáticamente**.',
    ],
    nota: 'Funciona sólo si **no pedís seña**: con seña tenés que mirar cada comprobante. Si lo dejás apagado, revisás cada reserva vos.',
    imagen: 'd13-aceptar',
  },
  {
    id: 'configurar',
    titulo: 'Configurar tu negocio',
    resumen: 'Todo lo que ven tus clientes.',
    puntos: [
      'En **Negocio**, cada sección se abre tocando su título.',
      'Lo que falta se ve en **amarillo**.',
      '**Datos del negocio → Editar** para cambiar la descripción, la dirección, el pin o el teléfono.',
      '**Visibilidad:** pausá el negocio si cerrás por un tiempo. Las reservas que ya tenés siguen igual.',
    ],
    imagen: 'd07-negocio',
  },
  {
    id: 'servicios',
    titulo: 'Servicios y precios',
    resumen: 'Agregar, editar y ocultar.',
    pasos: [
      'Abrí **Servicios**.',
      'Escribí el nombre y el precio, y tocá **Añadir**.',
      '**Tocá el nombre** para cambiar la duración o la descripción.',
    ],
    nota: 'El interruptor muestra u oculta el servicio. El tachito lo borra.',
    imagen: 'd08-servicios',
  },
  {
    id: 'equipo',
    titulo: 'Tu equipo: elegir con quién',
    resumen: 'Para peluquerías, barberías y spas.',
    pasos: [
      'En **Negocio**, abrí **Tu equipo**.',
      'Escribí el nombre de quien atiende y tocá **Añadir**.',
      'Tocá los **días** para marcar cuáles trabaja cada uno.',
      'Si alguien se toma unos días, apagá su **interruptor**: deja de aparecer sin borrarlo.',
    ],
    nota: 'Cada persona atiende a un cliente por vez y tiene su propia agenda. El cliente elige con quién o **Sin preferencia**, y ahí le toca a quien esté libre. En cada reserva ves **con quién** es.',
    imagen: 'd14-equipo',
  },
  {
    id: 'horarios',
    titulo: 'Horarios',
    resumen: 'Qué días y a qué hora se reserva.',
    puntos: [
      'El **interruptor** abre o cierra cada día.',
      '**Tocá el horario** para cambiarlo, o usar **horario partido** (por ejemplo, mediodía y noche).',
      '**Usar este horario en todos los días** lo copia a la semana entera.',
    ],
    imagen: 'd11-horario-dia',
  },
  {
    id: 'sena-duenio',
    titulo: 'Pedir seña',
    resumen: 'Monto y a dónde te transfieren.',
    pasos: [
      'Prendé **Pedir seña al reservar**.',
      'Escribí el **monto** y tocá **Guardar**.',
      'Completá banco, titular y cuenta, y tocá **Guardar datos bancarios**.',
    ],
    nota: 'Pedir una seña chica es lo que más reduce los clientes que no vienen.',
    imagen: 'd12-sena',
  },
  {
    id: 'promos',
    titulo: 'Promociones',
    resumen: 'Aparecen en el inicio de todos los clientes.',
    pasos: [
      'Entrá a **Promos**.',
      'Escribí el título y un detalle corto, y elegí hasta cuándo dura.',
      'Tocá **Publicar promoción**.',
    ],
    nota: 'La promo es un anuncio: el descuento lo aplicás vos en el local.',
    imagen: 'd16-promo-publicada',
  },
  {
    id: 'como-te-ven',
    titulo: 'Cómo te ven tus clientes',
    resumen: 'Revisalo como si fueras cliente.',
    puntos: [
      'En **Negocio → Tu cuenta**, tocá **Explorar como cliente** y buscá tu negocio.',
      'Usá fotos del local real y mantené los precios al día.',
      'El **Asistente** de la barra de abajo también te ayuda en el panel: *“¿Cómo viene mi semana?”*.',
    ],
    imagen: 'e07-vista-cliente',
  },
];

export const PREGUNTAS: { pregunta: string; respuesta: string }[] = [
  {
    pregunta: 'Mi reserva dice “Pendiente”. ¿Está mal?',
    respuesta: 'No. El negocio todavía no la aceptó. Te llega un aviso apenas responda.',
  },
  {
    pregunta: 'Mi reserva dice “Vencida”. ¿Qué pasó?',
    respuesta:
      'El negocio no respondió a tiempo y se liberó el lugar. Podés reservar de nuevo. Si habías pagado seña, el negocio te la tiene que devolver.',
  },
  {
    pregunta: 'No me deja confirmar la reserva.',
    respuesta: 'Arriba del botón la app dice qué falta: un horario, las personas o el comprobante.',
  },
  {
    pregunta: 'No aparece el horario que quiero.',
    respuesta:
      'Ya está ocupado, ya pasó o el servicio no entra antes del cierre. Si elegiste a alguien, probá con **Sin preferencia** o con otro día.',
  },
  {
    pregunta: '¿Puedo elegir quién me atiende?',
    respuesta:
      'Sí, si el local cargó a su equipo: al reservar aparece **¿Con quién?**. Si no te importa, elegí **Sin preferencia**.',
  },
  {
    pregunta: 'Restaurante: ¿qué mesa me toca?',
    respuesta:
      'Elegís para cuántas personas y el local te guarda una mesa de ese tamaño. Cuál mesa exactamente lo decide el local cuando llegás. Si son más de lo que se ofrece, consultá por WhatsApp: las mesas no se juntan desde la app.',
  },
  {
    pregunta: '¿Y si el negocio no pide seña?',
    respuesta:
      'Reservás sin pagar nada. La reserva queda **pendiente** hasta que el negocio la acepte, salvo que acepte automáticamente: ahí sale **confirmada** al instante.',
  },
  {
    pregunta: '¿La app me cobra algo?',
    respuesta: 'No. La seña, si el negocio la pide, se transfiere directo al negocio.',
  },
  {
    pregunta: 'Soy dueño: ¿qué pasa si no respondo una reserva?',
    respuesta:
      'A las 24 horas (o a la hora de la reserva) vence sola, se libera el lugar y le avisamos al cliente. Si no pedís seña, podés aceptarlas automáticamente.',
  },
  {
    pregunta: 'Soy dueño: ¿por qué no me reservan?',
    respuesta:
      'Revisá en **Negocio** que nada esté en amarillo: servicios, días abiertos y que esté **visible**.',
  },
  {
    pregunta: '¿Puedo borrar mi negocio?',
    respuesta: 'No, para no perder las reservas y reseñas. Si no lo vas a usar, pausalo.',
  },
];
