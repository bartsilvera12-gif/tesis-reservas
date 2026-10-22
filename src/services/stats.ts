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

  // ── Urgente: se pierde si no se responde ──────────────────────────────────
  if (stats.expiring_soon > 0) {
    insights.push({
      title: 'Por vencer',
      text: `${stats.expiring_soon} ${plural(stats.expiring_soon, 'reserva vence', 'reservas vencen')} en las próximas horas. Si no respondés, se libera el lugar y el cliente se va.`,
      accion: { label: 'Responder ahora', to: '/panel/reservas?ver=pendientes' },
    });
  } else if (stats.pending_count >= 3) {
    insights.push({
      title: 'Reservas sin responder',
      text: `Tenés ${stats.pending_count} reservas esperando. Responder rápido evita que el cliente busque otro lugar.`,
      accion: { label: 'Ver pendientes', to: '/panel/reservas?ver=pendientes' },
    });
  }

  // La plata del cliente va antes que cualquier consejo de ventas.
  if (stats.to_refund > 0) {
    insights.push({
      title: 'Señas para devolver',
      text: `${stats.to_refund} ${plural(stats.to_refund, 'cliente espera que le devuelvas la seña', 'clientes esperan que les devuelvas la seña')} de una reserva que no se concretó.`,
      accion: { label: 'Ver señas', to: '/panel/reservas?ver=devolver' },
    });
  }

  if (stats.expired_recent > 0) {
    insights.push({
      title: 'Se te vencieron reservas',
      text: cobraSena || negocio.auto_confirm
          ? `${stats.expired_recent} ${plural(stats.expired_recent, 'reserva venció', 'reservas vencieron')} sin respuesta este mes.`
          : `${stats.expired_recent} ${plural(stats.expired_recent, 'reserva venció', 'reservas vencieron')} sin respuesta este mes. Si no pedís seña, podés aceptarlas automáticamente.`,
      // Con seña no hay atajo: responder a tiempo es la única solución.
      accion:
        cobraSena || negocio.auto_confirm ? undefined : { label: 'Configurar', to: '/panel/negocio' },
    });
  }

  // ── Reputación ────────────────────────────────────────────────────────────
  if (stats.low_unanswered_reviews > 0) {
    insights.push({
      title: 'Reseñas negativas sin respuesta',
      text: `${stats.low_unanswered_reviews} ${plural(stats.low_unanswered_reviews, 'cliente te calificó', 'clientes te calificaron')} con 3 estrellas o menos y no ${plural(stats.low_unanswered_reviews, 'tiene', 'tienen')} respuesta. Contestar con calma muestra que te importa.`,
      accion: { label: 'Responder', to: '/panel/resenas' },
    });
  } else if (stats.unanswered_reviews > 0) {
    insights.push({
      title: 'Reseñas sin responder',
      text: `${stats.unanswered_reviews} ${plural(stats.unanswered_reviews, 'reseña espera', 'reseñas esperan')} tu respuesta. Agradecer una buena reseña también suma.`,
      accion: { label: 'Responder', to: '/panel/resenas' },
    });
  } else if (stats.reviews_count >= 3 && stats.rating_avg != null && stats.rating_avg >= 4) {
    insights.push({
      title: 'Buenas reseñas',
      text: `Mantenés ${stats.rating_avg.toFixed(1).replace('.', ',')} estrellas con ${stats.reviews_count} reseñas, todas respondidas. Seguí así.`,
    });
  }

  // Ausencias: con 5 o más turnos cerrados ya se puede hablar de un patrón.
  const cerradas = stats.attended + stats.no_shows;
  if (cerradas >= 5 && stats.no_shows / cerradas >= 0.2) {
    const pct = Math.round((stats.no_shows / cerradas) * 100);
    insights.push({
      title: 'Clientes que no vienen',
      text: cobraSena
        ? `El ${pct}% de los clientes no se presentó en los últimos 3 meses. Un recordatorio por WhatsApp el día antes ayuda.`
        : `El ${pct}% de los clientes no se presentó en los últimos 3 meses. Pedir una seña al reservar suele bajar las ausencias.`,
      accion: cobraSena ? undefined : { label: 'Configurar seña', to: '/panel/negocio' },
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
        title: 'Días flojos',
        text: `${losDias(quietest.dow).replace(/^l/, 'L')} recibís bastante menos reservas que ${losDias(
          busiest.dow,
        )}.${stats.active_promotions === 0 ? ' Una promoción para ese día puede equilibrar la semana.' : ''}`,
        accion:
          stats.active_promotions === 0 ? { label: 'Crear promoción', to: '/panel/promos' } : undefined,
      });
    }

    // En un hospedaje la hora es la de entrada, igual para todos: lo que
    // dice algo es qué alojamiento se pide más.
    if (negocio.reservation_type === 'stay') {
      if (stats.top_item) {
        insights.push({
          title: 'Lo más pedido',
          text: `${stats.top_item.name} es lo que más se reserva. Tené las fotos y el precio al día.`,
        });
      }
    } else if (stats.peak_hour) {
      insights.push({
        title: 'Horario más pedido',
        text: `La mayoría reserva a las ${stats.peak_hour}${
          stats.top_item ? `, y lo más pedido es ${stats.top_item.name}` : ''
        }. Asegurate de tener lugar en esa franja.`,
      });
    }
  }

  if (stats.returning_clients >= 2) {
    insights.push({
      title: 'Clientes que vuelven',
      text: `${stats.returning_clients} clientes ya reservaron más de una vez. Una promo para clientes frecuentes los mantiene cerca.`,
    });
  }

  return insights.slice(0, 4);
}
