/**
 * Contenido de la pantalla "Cómo se usa".
 *
 * Es el mismo manual de uso que se entregó en PDF, acortado para leerse en el
 * celular. Vive acá como datos y no en el componente para poder corregir un
 * texto sin tocar la pantalla.
 *
 * Los textos admiten **negrita**. Las imágenes son capturas reales de la app
 * con datos de ejemplo, en `public/ayuda/`.
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
    resumen: 'Promociones y lugares recomendados.',
    puntos: [
      '**Promociones:** las ofertas de los negocios. Tocá **Ver negocio** para ir al local.',
      '**Para vos:** los lugares mejor calificados.',
      '**Cerca de vos:** la lista de negocios. Tocá cualquiera para verlo.',
      'La barra de abajo tiene **Inicio**, **Explorar**, **Reservas** y **Perfil**.',
    ],
    imagen: 'c03-inicio',
  },
  {
    id: 'buscar',
    titulo: 'Buscar un lugar',
    resumen: 'En Explorar, con el mapa o por nombre.',
    puntos: [
      '**Buscador:** escribí el nombre o lo que buscás, por ejemplo *sushi*.',
      '**Filtros:** tocá Restaurantes, Peluquerías, etc.',
      '**Mapa:** cada punto es un negocio. Tocalo y después **Ver el negocio**.',
      'La línea punteada es el **límite de Ñemby**.',
    ],
    nota: 'Si le das permiso de ubicación, el mapa te muestra lo que tenés más cerca.',
    imagen: 'c04-explorar',
  },
  {
    id: 'negocio',
    titulo: 'Mirar un negocio',
    resumen: 'Servicios, precios, horarios y dónde queda.',
    puntos: [
      '**Servicios** (o **Carta**, o **Alojamientos**): qué ofrece y cuánto cuesta.',
      '**Reseñas:** lo que opinaron otros clientes.',
      '**Info:** horarios, dirección, mapa, **Cómo llegar** y **WhatsApp**.',
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
      'Elegí la **hora**. Las tachadas ya no están disponibles.',
      'Revisá el resumen **TU RESERVA** y tocá **Confirmar reserva**.',
    ],
    nota: 'En un hospedaje elegís la fecha de entrada y de salida, y la habitación.',
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
    nota: 'La app no cobra nada: la plata va directo al negocio.',
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
      '**Próximas** y **Historial**, con el estado de cada una.',
      '**Cancelar:** tocá Cancelar en la reserva. El negocio recibe un aviso.',
      '**Reseñar:** en una reserva confirmada, dejá tus estrellas y tu opinión.',
    ],
    nota: 'Si la reserva se rechaza o vence, el negocio te tiene que devolver la seña. Si cancelás una ya confirmada, la devolución la arreglás con el negocio.',
    imagen: 'c12-mis-reservas',
  },
  {
    id: 'asistente',
    titulo: 'El asistente',
    resumen: 'El botón redondo de abajo a la derecha.',
    puntos: [
      'Escribile como a una persona: *“¿Cuál es mi próxima reserva?”*.',
      'Explica cómo funciona la app y te dice en qué pantalla hacer cada cosa.',
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
      'En **Perfil**, tocá **Tengo un negocio** y después **Crear mi negocio**.',
      'Escribí el **nombre** y elegí la **categoría**.',
      'Agregá una **descripción** corta y el **WhatsApp**.',
      'Elegí el **logo** y una **portada** linda del local.',
    ],
    imagen: 'd02-alta-paso1',
  },
  {
    id: 'alta-2',
    titulo: 'Paso 2 · Ubicación',
    resumen: 'Dirección, barrio y pin en el mapa.',
    pasos: [
      'Escribí la **dirección**.',
      'Tocá tu **barrio**: el pin salta hasta ahí.',
      '**Tocá el mapa** justo donde está tu local.',
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
      '**Días que atendés** y el horario (ya viene uno sugerido).',
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
      'Los números del día y qué días te reservan más.',
    ],
    imagen: 'd06-panel-recien-creado',
  },
  {
    id: 'responder',
    titulo: 'Responder las reservas',
    resumen: 'Aceptar o rechazar, y ver el comprobante.',
    pasos: [
      'Entrá a **Reservas**. Abre en **Por responder**.',
      'Leé el cliente, el día, la hora y el servicio.',
      'Si pidió seña, tocá **Ver el comprobante** y fijate en tu banco que llegó.',
      'Tocá **Aceptar** o **Rechazar**. El cliente recibe un aviso.',
    ],
    nota: 'Tenés **24 horas** para responder (o hasta la hora de la reserva, si es antes): cada tarjeta dice hasta cuándo. Si no respondés, vence sola y se libera el lugar. Cuando llega la hora, marcá **Asistida** o **No asistió**.',
    imagen: 'e02-por-responder',
  },
  {
    id: 'rechazar',
    titulo: 'Rechazar con un motivo',
    resumen: 'Para que el cliente sepa qué hacer.',
    puntos: [
      'Al rechazar, escribí el **motivo**: *“¿te sirve a las 16?”*.',
      'Si cobraste seña, devolvela por transferencia y tocá **Ya le devolví la seña**: el cliente recibe el aviso.',
      'Las señas pendientes de devolver quedan juntas en **Reservas → Señas a devolver**.',
    ],
    imagen: 'e05-rechazar',
  },
  {
    id: 'configurar',
    titulo: 'Configurar tu negocio',
    resumen: 'Todo lo que ven tus clientes.',
    puntos: [
      'En **Negocio**, cada sección se abre tocando su título.',
      'Lo que falta se ve en **amarillo**.',
      '**Datos del negocio → Editar** para cambiar la dirección o el pin.',
      '**Cómo aceptás las reservas:** prendé **Aceptar automáticamente** para que las reservas sin seña se confirmen solas.',
      '**Visibilidad:** pausá el negocio si cerrás por un tiempo.',
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
    id: 'horarios',
    titulo: 'Horarios',
    resumen: 'Qué días y a qué hora se reserva.',
    puntos: [
      'El **interruptor** abre o cierra cada día.',
      '**Tocá el horario** para cambiarlo, o usar **horario partido**.',
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
    pregunta: 'No me deja confirmar la reserva.',
    respuesta: 'Arriba del botón la app dice qué falta: un horario, las personas o el comprobante.',
  },
  {
    pregunta: 'No aparece el horario que quiero.',
    respuesta: 'Ya está ocupado, ya pasó o el servicio no entra antes del cierre. Probá otro día.',
  },
  {
    pregunta: 'Mi reserva dice “Vencida”. ¿Qué pasó?',
    respuesta:
      'El negocio no respondió a tiempo y se liberó el lugar. Podés reservar de nuevo. Si habías pagado seña, el negocio te la tiene que devolver.',
  },
  {
    pregunta: '¿La app me cobra algo?',
    respuesta: 'No. La seña, si el negocio la pide, se transfiere directo al negocio.',
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
