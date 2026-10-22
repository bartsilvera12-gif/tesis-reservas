import { supabase, friendlyError } from '@/lib/supabase';
import { dayLong } from '@/lib/format';
import type { Business, BusinessStats } from '@/types/db';

export async function fetchBusinessStats(businessId: string): Promise<BusinessStats> {
  const { data, error } = await supabase.rpc('business_stats', {
    p_business_id: businessId,
  });

  if (error) throw new Error(friendlyError(error, 'No pudimos cargar las estadísticas.'));
  return data as BusinessStats;
}

export interface Insight {
  title: string;
  text: string;
  /** A dónde ir para resolverlo, si hay una pantalla para eso. */
  accion?: { label: string; to: string };
}

/** Con menos reservas que esto, un "horario pico" es casualidad. */
const MINIMO_DEMANDA = 5;

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

/** "los sábados", "los lunes": el día en plural, como se dice. */
const losDias = (dow: number) => {
  const d = dayLong(dow).toLowerCase();
  return `los ${d.endsWith('s') ? d : `${d}s`}`;
};

/**
 * Recomendaciones por reglas sobre datos reales — sin IA externa.
 *
 * Van en orden de urgencia: primero lo que se pierde si no se hace hoy
 * (reservas por vencer), después lo que cuida la reputación (reseñas) y al
 * final lo que ayuda a vender más (demanda, promociones).
 *
 * Antes todo dependía de tener 5 reservas: un negocio nuevo veía siempre
 * "no hay suficientes datos", justo cuando más necesita una mano. Ahora sólo
 * los consejos de demanda esperan ese volumen; los demás salen desde el
 * primer día. Se muestran como mucho 4 para que se lean.
 */
export function buildInsights(
  stats: BusinessStats,
  negocio: Pick<Business, 'deposit_enabled' | 'deposit_amount' | 'auto_confirm' | 'reservation_type'>,
): Insight[] {
  const insights: Insight[] = [];
  const cobraSena = negocio.deposit_enabled && negocio.deposit_amount > 0;

  // Cada consejo dice qué pasó, por qué importa y qué hacer. Un dato suelto
  // ("1 reserva venció") no ayuda: el dueño tiene que saber qué cambiar.

  // ── Urgente: se pierde si no se responde ──────────────────────────────────
  if (stats.expiring_soon > 0) {
    const n = stats.expiring_soon;
    insights.push({
      title: 'Respondé hoy',
      text: `${n} ${plural(n, 'reserva vence', 'reservas vencen')} en menos de 6 horas. Si se vence, el cliente se queda sin lugar y es difícil que vuelva a intentar: aceptala o, si no podés, rechazala proponiendo otro horario.`,
      accion: { label: 'Responder ahora', to: '/panel/reservas?ver=pendientes' },
    });
  } else if (stats.pending_count >= 3) {
    insights.push({
      title: 'Clientes esperando respuesta',
      text: `Tenés ${stats.pending_count} reservas sin responder. Quien no recibe confirmación en el día suele reservar en otro lado: revisá "Por responder" al abrir y al cerrar el local.`,
      accion: { label: 'Ver pendientes', to: '/panel/reservas?ver=pendientes' },
    });
  }

  // La plata del cliente va antes que cualquier consejo de ventas.
  if (stats.to_refund > 0) {
    const n = stats.to_refund;
    insights.push({
      title: 'Devolvé las señas',
      text: `${n} ${plural(n, 'cliente espera', 'clientes esperan')} la devolución de una seña. Devolverla rápido genera confianza y hace que vuelvan a reservar; demorarla es la forma más rápida de ganarse una mala reseña.`,
      accion: { label: 'Ver señas', to: '/panel/reservas?ver=devolver' },
    });
  }

  // Con la aceptación automática y sin seña ya no se vence ninguna: lo que
  // pasó antes de activarla no pide ninguna acción.
  if (stats.expired_recent > 0 && (cobraSena || !negocio.auto_confirm)) {
    const n = stats.expired_recent;
    const puedeAutomatico = !cobraSena && !negocio.auto_confirm;
    insights.push({
      title: 'Estás perdiendo clientes',
      text:
        `Este mes ${plural(n, 'se venció 1 reserva', `se vencieron ${n} reservas`)} sin respuesta. ` +
        `${plural(n, 'Es un cliente que quiso venir y probablemente terminó', 'Son clientes que quisieron venir y probablemente terminaron')} en otro negocio. ` +
        (puedeAutomatico
          ? 'Como no pedís seña, podés aceptar las reservas automáticamente y no perder ninguna.'
          : 'Revisá "Por responder" al abrir y al cerrar el local: tenés 24 horas para contestar cada una.'),
      accion: puedeAutomatico
        ? { label: 'Aceptar automáticamente', to: '/panel/negocio' }
        : { label: 'Ver pendientes', to: '/panel/reservas?ver=pendientes' },
    });
  }

  // ── Reputación ────────────────────────────────────────────────────────────
  if (stats.low_unanswered_reviews > 0) {
    const n = stats.low_unanswered_reviews;
    insights.push({
      title: 'Respondé las críticas',
      text: `${n} ${plural(n, 'cliente te dejó', 'clientes te dejaron')} 3 estrellas o menos sin respuesta. Agradecé, no discutas y contá qué vas a mejorar: los próximos clientes leen esas respuestas antes de elegirte.`,
      accion: { label: 'Responder', to: '/panel/resenas' },
    });
  } else if (stats.unanswered_reviews > 0) {
    const n = stats.unanswered_reviews;
    insights.push({
      title: 'Agradecé las reseñas',
      text: `${n} ${plural(n, 'reseña espera', 'reseñas esperan')} tu respuesta. Un simple "¡Gracias, te esperamos!" muestra que el negocio está atento, y quien compara lugares lo tiene en cuenta.`,
      accion: { label: 'Responder', to: '/panel/resenas' },
    });
  } else if (stats.reviews_count >= 3 && stats.rating_avg != null && stats.rating_avg >= 4) {
    insights.push({
      title: 'Aprovechá tus buenas reseñas',
      text: `Tenés ${stats.rating_avg.toFixed(1).replace('.', ',')} estrellas con ${stats.reviews_count} reseñas. Es tu mejor carta de presentación: pedile a cada cliente que deje su opinión al irse, así seguís sumando.`,
    });
  }

  // Ausencias: con 5 o más turnos cerrados ya se puede hablar de un patrón.
  const cerradas = stats.attended + stats.no_shows;
  if (cerradas >= 5 && stats.no_shows / cerradas >= 0.2) {
    const pct = Math.round((stats.no_shows / cerradas) * 100);
    insights.push({
      title: 'Turnos perdidos por ausencias',
      text: cobraSena
        ? `El ${pct}% de los clientes no vino en los últimos 3 meses: son turnos que podrías haber dado a otros. Mandales un mensaje el día anterior para confirmar.`
        : `El ${pct}% de los clientes no vino en los últimos 3 meses: son turnos que podrías haber dado a otros. Pedir una seña chica al reservar es lo que más reduce las ausencias: quien pagó algo, viene.`,
      accion: cobraSena ? undefined : { label: 'Pedir seña', to: '/panel/negocio' },
    });
  }

  // ── Demanda: sólo con volumen suficiente ──────────────────────────────────
  if (stats.valid_reservations >= MINIMO_DEMANDA) {
    // Sólo los días en que hubo movimiento: un día con cero suele ser un día
    // cerrado, y decirle a una peluquería que "los domingos recibe menos"
    // cuando no abre los domingos no le sirve de nada.
    const withData = (stats.week_bars ?? []).filter((b) => b.count > 0);
    const quietest = withData.reduce((min, b) => (b.count < min.count ? b : min), withData[0]);
    const busiest = withData.reduce((max, b) => (b.count > max.count ? b : max), withData[0]);

    if (
      withData.length >= 3 &&
      busiest &&
      quietest &&
      busiest.count > 0 &&
      quietest.count < busiest.count / 2
    ) {
      insights.push({
        title: 'Llená los días flojos',
        text:
          `${losDias(quietest.dow).replace(/^l/, 'L')} recibís menos de la mitad de reservas que ${losDias(busiest.dow)}. ` +
          (stats.active_promotions === 0
            ? `Una promo sólo para ese día (por ejemplo, 15% de descuento) lleva clientes del día lleno al vacío y aprovechás mejor la semana.`
            : `Si tu promo actual no es para ese día, probá una pensada para ${losDias(quietest.dow)}.`),
        accion: { label: 'Crear promoción', to: '/panel/promos' },
      });
    }

    // En un hospedaje la hora es la de entrada, igual para todos: lo que
    // dice algo es qué alojamiento se pide más.
    if (negocio.reservation_type === 'stay') {
      if (stats.top_item) {
        insights.push({
          title: 'Tu alojamiento estrella',
          text: `${stats.top_item.name} es lo más reservado. Mantené sus fotos al día y, cuando esté lleno, ofrecé otro alojamiento con una promo para no perder la reserva.`,
        });
      }
    } else if (stats.peak_hour) {
      const refuerzo =
        negocio.reservation_type === 'table'
          ? 'sumá mesas a esa hora'
          : 'reforzala con alguien más';
      insights.push({
        title: 'Tu horario más fuerte',
        text: `La mayoría reserva a las ${stats.peak_hour}${
          stats.top_item ? ` y lo más pedido es ${stats.top_item.name}` : ''
        }. Es lo primero que se llena: si podés, ${refuerzo} y vas a recibir más clientes sin rechazar a nadie.`,
      });
    }
  }

  if (stats.returning_clients >= 2) {
    insights.push({
      title: 'Cuidá a los que vuelven',
      text: `${stats.returning_clients} clientes ya reservaron más de una vez. Son los que más valen y los que te recomiendan: una promo pensada para ellos (por ejemplo, "la quinta visita con descuento") hace que te sigan eligiendo.`,
      accion: { label: 'Crear promoción', to: '/panel/promos' },
    });
  }

  return insights.slice(0, 4);
}
