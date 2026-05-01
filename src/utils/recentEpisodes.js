import { getReleasedEpisodeCount, hasAiredNextEpisode } from "./airingStatus";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const RECENT_MS = 14 * DAY_MS;

function parseDateParts(value) {
  if (!value) return null;

  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }

  const year = Number(value.year);
  if (!Number.isFinite(year) || year <= 0) return null;
  const month = Math.max(Number(value.month || 1) - 1, 0);
  const day = Math.max(Number(value.day || 1), 1);
  const parsed = new Date(year, month, day);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function isSameLocalDay(firstDate, secondDate) {
  if (!firstDate || !secondDate) return false;
  return (
    firstDate.getFullYear() === secondDate.getFullYear() &&
    firstDate.getMonth() === secondDate.getMonth() &&
    firstDate.getDate() === secondDate.getDate()
  );
}

function buildEpisodeDateMap(anime = {}) {
  const map = new Map();
  (anime.episodeList || []).forEach((episode) => {
    const epNumber = Number(episode?.mal_id || episode?.episode || episode?.number);
    const airedDate = parseDateParts(episode?.aired || episode?.airingAt || episode?.airedAt);
    if (epNumber > 0 && airedDate) {
      map.set(epNumber, airedDate.getTime());
    }
  });
  return map;
}

function buildBatchPremiereOccurrences(releasedEpisodeCount, startDate) {
  return Array.from({ length: releasedEpisodeCount }, (_, index) => ({
    ep: index + 1,
    airedAt: startDate.getTime(),
    isEstimated: true,
  }));
}

function buildWeeklyOccurrences(releasedEpisodeCount, lastReleaseMs, isEstimated = true) {
  const occurrences = [];
  for (let offset = 0; offset < releasedEpisodeCount; offset += 1) {
    occurrences.push({
      ep: releasedEpisodeCount - offset,
      airedAt: lastReleaseMs - offset * WEEK_MS,
      isEstimated,
    });
  }
  return occurrences;
}

/**
 * Calcula las fechas de cada episodio usando un ancla estable (startDate + hora).
 * Cada episodio se calcula como: anchorMs + (episodio - 1) * WEEK_MS.
 *
 * Esto evita que las fechas de episodios pasados se desplacen cuando la API
 * corrige el nextAiringEpisode (por ejemplo, cuando un episodio se retrasa).
 */
function buildWeeklyOccurrencesFromStart(releasedEpisodeCount, anchorMs, isEstimated = true) {
  const occurrences = [];
  for (let ep = 1; ep <= releasedEpisodeCount; ep += 1) {
    occurrences.push({
      ep,
      airedAt: anchorMs + (ep - 1) * WEEK_MS,
      isEstimated,
    });
  }
  return occurrences;
}

/**
 * Combina la FECHA de startDate con la HORA precisa de nextAiringEpisode
 * para obtener un timestamp estable del episodio 1.
 *
 * startDate solo tiene año/mes/día (sin hora exacta).
 * nextAiringEpisode.airingAt tiene el timestamp preciso (con hora, ej. 23:30 JST).
 *
 * Extraemos la hora del día del airingAt y la combinamos con la fecha del startDate.
 * El resultado es estable: si la API retrasa un episodio (cambia airingAt por +1 semana),
 * la hora del día no cambia, y startDate tampoco → el ancla se mantiene idéntica.
 *
 * Valida que el día de la semana del airingAt coincida con startDate (ambos deben
 * ser el mismo día de la semana si el anime emite semanalmente).
 */
function buildStableAnchorMs(startDate, nextAiring) {
  if (!startDate || !nextAiring) return null;

  const airingAtMs = Number(nextAiring.airingAt || 0) * 1000;
  if (!Number.isFinite(airingAtMs) || airingAtMs <= 0) return null;

  const airingDate = new Date(airingAtMs);
  const startMs = startDate.getTime();

  // Extraer la hora del día del airingAt (horas + minutos + segundos en ms)
  const timeOfDayMs =
    airingDate.getHours() * 3600000 +
    airingDate.getMinutes() * 60000 +
    airingDate.getSeconds() * 1000;

  // Combinar fecha de startDate + hora de airingAt
  const anchorMs = startMs + timeOfDayMs;

  // Validar: el día de la semana del startDate debe coincidir con el del airingAt
  // (ambos deben caer el mismo día de la semana para un anime semanal).
  // Si no coinciden, podría ser un anime con horario irregular → no usar este método.
  if (startDate.getDay() !== airingDate.getDay()) {
    return null;
  }

  return anchorMs;
}

export function buildRecentEpisodeOccurrences(anime, nowMs = Date.now()) {
  const releasedEpisodeCount = getReleasedEpisodeCount(anime, nowMs);
  if (!releasedEpisodeCount) return [];

  const cutoffMs = nowMs - RECENT_MS;
  const dateMap = buildEpisodeDateMap(anime);
  const explicitOccurrences = Array.from(dateMap.entries())
    .filter(([episode]) => episode > 0 && episode <= releasedEpisodeCount)
    .map(([ep, airedAt]) => ({
      ep,
      airedAt,
      isEstimated: false,
    }))
    .filter((entry) => entry.airedAt >= cutoffMs && entry.airedAt <= nowMs + 60 * 60 * 1000);

  if (explicitOccurrences.length > 0) {
    return explicitOccurrences.sort((first, second) => {
      if (second.airedAt !== first.airedAt) return second.airedAt - first.airedAt;
      return second.ep - first.ep;
    });
  }

  const startDate = parseDateParts(anime?.startDate || anime?.aired?.from);
  const nextAiring = anime?.nextAiringEpisode;
  const nextAiringAtMs = Number(nextAiring?.airingAt || 0) * 1000;
  const hasNextAiring = Number.isFinite(nextAiringAtMs) && nextAiringAtMs > 0;

  if (startDate && hasNextAiring) {
    // Intentar usar startDate + hora como ancla estable.
    // Esto hace que las fechas de episodios pasados NO cambien
    // cuando la API corrige el nextAiringEpisode (ej. episodio retrasado).
    const stableAnchorMs = buildStableAnchorMs(startDate, nextAiring);

    if (stableAnchorMs !== null) {
      // Verificar si es un batch premiere (todos los episodios salen el mismo día)
      if (releasedEpisodeCount === 1) {
        return buildBatchPremiereOccurrences(releasedEpisodeCount, startDate).filter(
          (entry) => entry.airedAt >= cutoffMs && entry.airedAt <= nowMs + 60 * 60 * 1000,
        );
      }

      return buildWeeklyOccurrencesFromStart(releasedEpisodeCount, stableAnchorMs, false).filter(
        (entry) => entry.airedAt >= cutoffMs && entry.airedAt <= nowMs + 60 * 60 * 1000,
      );
    }

    // Fallback: si el día de la semana no coincide, usar el método original
    const lastReleaseMs = hasAiredNextEpisode(nextAiring, nowMs) ? nextAiringAtMs : nextAiringAtMs - WEEK_MS;
    if (isSameLocalDay(startDate, new Date(lastReleaseMs))) {
      return buildBatchPremiereOccurrences(releasedEpisodeCount, startDate).filter(
        (entry) => entry.airedAt >= cutoffMs && entry.airedAt <= nowMs + 60 * 60 * 1000,
      );
    }

    return buildWeeklyOccurrences(releasedEpisodeCount, lastReleaseMs, false).filter(
      (entry) => entry.airedAt >= cutoffMs && entry.airedAt <= nowMs + 60 * 60 * 1000,
    );
  }

  if (startDate && releasedEpisodeCount > 1) {
    return buildBatchPremiereOccurrences(releasedEpisodeCount, startDate).filter(
      (entry) => entry.airedAt >= cutoffMs && entry.airedAt <= nowMs + 60 * 60 * 1000,
    );
  }

  if (hasNextAiring) {
    const lastReleaseMs = hasAiredNextEpisode(nextAiring, nowMs) ? nextAiringAtMs : nextAiringAtMs - WEEK_MS;
    return buildWeeklyOccurrences(releasedEpisodeCount, lastReleaseMs, false).filter(
      (entry) => entry.airedAt >= cutoffMs && entry.airedAt <= nowMs + 60 * 60 * 1000,
    );
  }

  const endDate = parseDateParts(anime?.endDate);
  if (endDate) {
    return buildWeeklyOccurrences(releasedEpisodeCount, endDate.getTime(), false).filter(
      (entry) => entry.airedAt >= cutoffMs && entry.airedAt <= nowMs + 60 * 60 * 1000,
    );
  }

  return [];
}
