import { supabase, friendlyError } from '@/lib/supabase';
import { dayLong } from '@/lib/format';
import type { BusinessStats } from '@/types/db';

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
}

/**
 * Insights por reglas sobre datos reales — sin IA externa.
 * Si todavía no hay volumen suficiente, se devuelve vacío y la pantalla
 * muestra el mensaje correspondiente.
 */
export function buildInsights(stats: BusinessStats): Insight[] {
  const insights: Insight[] = [];

  // Necesitamos una base mínima para que una recomendación signifique algo.
  if (stats.total_reservations < 5) return insights;

  if (stats.peak_hour) {
    insights.push({
      title: 'Pico de demanda',
      text: `Tu horario más pedido es a las ${stats.peak_hour}. Asegurate de tener cupo suficiente en esa franja.`,
    });
  }

  const bars = stats.week_bars ?? [];
  const withData = bars.filter((b) => b.count > 0);

  if (withData.length >= 3) {
    const quietest = bars.reduce((min, b) => (b.count < min.count ? b : min), bars[0]);
    const busiest = bars.reduce((max, b) => (b.count > max.count ? b : max), bars[0]);

    if (busiest.count > 0 && quietest.count < busiest.count / 2) {
      insights.push({
        title: 'Días flojos',
        text: `Los ${dayLong(quietest.dow).toLowerCase()} recibís bastante menos reservas que los ${dayLong(
          busiest.dow,
        ).toLowerCase()}. Una promoción puede ayudarte a equilibrar la semana.`,
      });
    }
  }

  if (stats.reviews_count >= 3 && stats.rating_avg != null) {
    if (stats.rating_avg < 4) {
      insights.push({
        title: 'Reseñas a mejorar',
        text: `Tu promedio es ${stats.rating_avg.toFixed(1)} sobre 5. Responder las reseñas negativas suele mejorar la percepción.`,
      });
    } else {
      insights.push({
        title: 'Buenas reseñas',
        text: `Mantenés un promedio de ${stats.rating_avg.toFixed(1)} con ${stats.reviews_count} reseñas. Responderlas ayuda a sostenerlo.`,
      });
    }
  }

  if (stats.pending_count >= 3) {
    insights.push({
      title: 'Reservas sin responder',
      text: `Tenés ${stats.pending_count} reservas pendientes. Confirmarlas rápido reduce las cancelaciones.`,
    });
  }

  return insights;
}
