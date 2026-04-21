/**
 * Calcula el estado automático de un anime basado en el progreso y tiempo transcurrido.
 * 
 * Reglas:
 * - PENDIENTE: 0 episodios vistos.
 * - COMPLETADO: Todos los episodios vistos.
 * - ABANDONADO: > 1 mes sin ver (pero con progreso) -> Fe de erratas: El usuario dijo > 3 meses.
 * - EN PAUSA: > 1 mes < 3 meses sin ver.
 * - VIENDO: Al menos 1 visto, no todos, y < 1 mes desde el último.
 */
export function calculateUserStatus(anime) {
  if (!anime) return "PLAN_TO_WATCH";

  const watchedEpisodes = Array.isArray(anime.watchedEpisodes)
    ? [...new Set(anime.watchedEpisodes.filter(Number.isFinite))]
    : [];
  const watchedCount = watchedEpisodes.length;
  const maxWatchedEpisode = watchedCount > 0 ? Math.max(...watchedEpisodes) : 0;
  const total = Number(anime.episodes) || Number(anime.totalEpisodes) || 0;

  // 1. COMPLETADO: Si ha visto todo y no hay más episodios programados
  if (total > 0 && maxWatchedEpisode >= total && !anime.nextAiringEpisode) {
    return "COMPLETED";
  }

  // 2. PENDIENTE: Si no ha visto nada
  if (watchedCount === 0) {
    return "PLAN_TO_WATCH";
  }

  // 3. Tiempos (PAUSA / ABANDONADO / VIENDO)
  const history = anime.watchHistory || [];
  if (history.length === 0) return "WATCHING"; // Fallback si no hay fechas pero hay progreso

  const lastWatch = new Date(history[history.length - 1].watchedAt).getTime();
  const now = Date.now();
  const diffMonths = (now - lastWatch) / (1000 * 60 * 60 * 24 * 30);

  if (diffMonths >= 3) {
    return "DROPPED"; // ABANDONADO
  }

  if (diffMonths >= 1) {
    return "PAUSED"; // EN PAUSA
  }

  return "WATCHING"; // VIENDO
}
