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
 * Compara el released count anterior vs el actual y registra las fechas
 * de los episodios nuevos. Solo registra episodios que NO estaban antes.
 *
 * @returns {Object} episodeAirDates actualizado (o el original si no hay cambios)
 */
export function detectNewEpisodeAirDates(storedAnime, freshReleasedCount, nowMs = Date.now()) {
  const existingDates = storedAnime?.episodeAirDates || {};
  const oldCount = getReleasedEpisodeCount(storedAnime, nowMs);
  const highestRecordedEpisode = Math.max(...Object.keys(existingDates).map(Number), 0);

  if (oldCount <= 0 && highestRecordedEpisode <= 0) {
    return existingDates;
  }

  if (freshReleasedCount <= oldCount && freshReleasedCount <= highestRecordedEpisode) {
    return existingDates;
  }

  const dates = { ...existingDates };
  let changed = false;

  for (let ep = oldCount + 1; ep <= freshReleasedCount; ep += 1) {
    if (!dates[ep]) {
      dates[ep] = nowMs;
      changed = true;
    }
  }

  return changed ? dates : existingDates;
}

export function buildRecentEpisodeOccurrences(anime, nowMs = Date.now(), options = {}) {
  const apiReleasedCount = getReleasedEpisodeCount(anime, nowMs);
  const overrideCount = Number(options.overrideReleasedCount) || 0;
  const releasedEpisodeCount = overrideCount > apiReleasedCount ? overrideCount : apiReleasedCount;
  if (!releasedEpisodeCount) return [];

  const cutoffMs = nowMs - RECENT_MS;
  const filterRange = (entry) => entry.airedAt >= cutoffMs && entry.airedAt <= nowMs + 60 * 60 * 1000;

  // 1. Prioridad máxima: fechas registradas (episodeAirDates)
  const airDates = anime?.episodeAirDates || {};
  const recordedOccurrences = Object.entries(airDates)
    .map(([epStr, timestamp]) => ({
      ep: Number(epStr),
      airedAt: Number(timestamp),
      isEstimated: false,
    }))
    .filter((entry) => entry.ep > 0 && entry.ep <= releasedEpisodeCount && Number.isFinite(entry.airedAt))
    .filter(filterRange);

  if (recordedOccurrences.length > 0) {
    // Si tenemos fechas registradas para TODOS los episodios recientes, usarlas directamente.
    // Si faltan algunos (episodios antiguos sin registro), complementar con cálculo.
    const recordedEps = new Set(recordedOccurrences.map((o) => o.ep));
    const missingOccurrences = buildFallbackOccurrences(anime, releasedEpisodeCount, nowMs)
      .filter((entry) => !recordedEps.has(entry.ep))
      .filter(filterRange);

    return [...recordedOccurrences, ...missingOccurrences].sort((first, second) => {
      if (second.airedAt !== first.airedAt) return second.airedAt - first.airedAt;
      return second.ep - first.ep;
    });
  }

  // 2. Fallback: cálculo estimado (para animes sin episodeAirDates registrados)
  return buildFallbackOccurrences(anime, releasedEpisodeCount, nowMs).filter(filterRange);
}

/**
 * Cálculo estimado de fechas de episodios (fallback cuando no hay episodeAirDates).
 * Usa nextAiringEpisode.airingAt y calcula hacia atrás.
 */
function buildFallbackOccurrences(anime, releasedEpisodeCount, nowMs) {
  // Fechas explícitas del episodeList
  const dateMap = new Map();
  (anime?.episodeList || []).forEach((episode) => {
    const epNumber = Number(episode?.mal_id || episode?.episode || episode?.number);
    const airedDate = parseDateParts(episode?.aired || episode?.airingAt || episode?.airedAt);
    if (epNumber > 0 && airedDate) {
      dateMap.set(epNumber, airedDate.getTime());
    }
  });

  const explicitOccurrences = Array.from(dateMap.entries())
    .filter(([episode]) => episode > 0 && episode <= releasedEpisodeCount)
    .map(([ep, airedAt]) => ({ ep, airedAt, isEstimated: false }));

  if (explicitOccurrences.length > 0) {
    return explicitOccurrences;
  }

  // Cálculo hacia atrás desde nextAiringEpisode
  const nextAiring = anime?.nextAiringEpisode;
  const airingAtMs = Number(nextAiring?.airingAt || 0) * 1000;
  if (Number.isFinite(airingAtMs) && airingAtMs > 0) {
    const rawMs = hasAiredNextEpisode(nextAiring, nowMs) ? airingAtMs : airingAtMs - WEEK_MS;
    const lastReleaseMs = Math.min(rawMs, nowMs);
    return buildWeeklyOccurrences(releasedEpisodeCount, lastReleaseMs, true);
  }

  // Fallback: startDate como batch premiere
  const startDate = parseDateParts(anime?.startDate || anime?.aired?.from);
  if (startDate) {
    return Array.from({ length: releasedEpisodeCount }, (_, i) => ({
      ep: i + 1,
      airedAt: startDate.getTime(),
      isEstimated: true,
    }));
  }

  // Último fallback: endDate
  const endDate = parseDateParts(anime?.endDate);
  if (endDate) {
    return buildWeeklyOccurrences(releasedEpisodeCount, endDate.getTime(), true);
  }

  return [];
}
