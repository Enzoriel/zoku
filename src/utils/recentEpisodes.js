import { getReleasedEpisodeCount } from "./airingStatus";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const RECENT_MS = 14 * DAY_MS;
const AIRING_SCHEDULE_TOLERANCE_MS = 2 * 60 * 60 * 1000;

function parseDateParts(value) {
  if (!value) return null;

  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }

  if (typeof value === "number") {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }

  if (value.from) {
    return parseDateParts(value.from);
  }

  if (value.airedAt || value.airingAt) {
    return parseDateParts(value.airedAt || value.airingAt);
  }

  const year = Number(value.year);
  if (!Number.isFinite(year) || year <= 0) return null;
  const month = Math.max(Number(value.month || 1) - 1, 0);
  const day = Math.max(Number(value.day || 1), 1);
  
  // Interpretar en la zona horaria estándar de Japón (UTC+9)
  const utcMs = Date.UTC(year, month, day, 0, 0, 0);
  const jstMs = utcMs - 9 * 60 * 60 * 1000;
  const parsed = new Date(jstMs);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function parseCalendarDateAsLocalNoon(value) {
  if (!value) return null;

  if (typeof value === "string") {
    const dateOnlyMatch = value.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!dateOnlyMatch) return parseDateParts(value);

    const parsed = new Date(Number(dateOnlyMatch[1]), Number(dateOnlyMatch[2]) - 1, Number(dateOnlyMatch[3]), 12);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }

  const year = Number(value.year);
  if (!Number.isFinite(year) || year <= 0) return null;
  const month = Math.max(Number(value.month || 1) - 1, 0);
  const day = Math.max(Number(value.day || 1), 1);
  const parsed = new Date(year, month, day, 12);
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

function getNextAiringSchedule(anime) {
  const nextAiring = anime?.nextAiringEpisode;
  const episode = Number(nextAiring?.episode);
  const airingAtMs = Number(nextAiring?.airingAt || 0) * 1000;

  if (!Number.isFinite(episode) || episode <= 0 || !Number.isFinite(airingAtMs) || airingAtMs <= 0) {
    return null;
  }

  return { episode, airingAtMs };
}

function addScheduledDateRange(dates, anchorEpisode, anchorAiringAtMs, fromEpisode, toEpisode, nowMs) {
  let changed = false;

  for (let ep = fromEpisode; ep <= toEpisode; ep += 1) {
    if (dates[ep]) continue;

    const projectedMs = anchorAiringAtMs + (ep - anchorEpisode) * WEEK_MS;
    if (projectedMs > nowMs + AIRING_SCHEDULE_TOLERANCE_MS) continue;

    dates[ep] = projectedMs;
    changed = true;
  }

  return changed;
}

function getAiringScheduleOccurrences(anime, releasedEpisodeCount) {
  const occurrencesByEpisode = new Map();

  (anime?.airingSchedule || []).forEach((entry) => {
    const ep = Number(entry?.episode ?? entry?.ep);
    const airedAt = Number(entry?.airedAt);
    if (ep > 0 && ep <= releasedEpisodeCount && Number.isFinite(airedAt) && airedAt > 0) {
      occurrencesByEpisode.set(ep, { ep, airedAt, isEstimated: false });
    }
  });

  (anime?.episodeList || []).forEach((episode) => {
    const ep = Number(episode?.mal_id || episode?.episode || episode?.number);
    if (!ep || ep > releasedEpisodeCount || occurrencesByEpisode.has(ep)) return;

    const airedDate = parseDateParts(episode?.airedAt || episode?.airingAt || episode?.aired);
    if (airedDate) {
      occurrencesByEpisode.set(ep, { ep, airedAt: airedDate.getTime(), isEstimated: false });
    }
  });

  return Array.from(occurrencesByEpisode.values());
}

function addAiringScheduleDates(dates, currentAnime, currentReleasedCount, nowMs) {
  let changed = false;

  getAiringScheduleOccurrences(currentAnime, currentReleasedCount).forEach(({ ep, airedAt }) => {
    if (airedAt > nowMs + AIRING_SCHEDULE_TOLERANCE_MS) return;

    const existing = Number(dates[ep]);
    if (Number.isFinite(existing) && existing > 0 && existing <= nowMs + AIRING_SCHEDULE_TOLERANCE_MS) return;

    dates[ep] = airedAt;
    changed = true;
  });

  return changed;
}

/**
 * Compara el released count anterior vs el actual y registra las fechas
 * de los episodios nuevos. Solo registra episodios que NO estaban antes.
 *
 * @returns {Object} episodeAirDates actualizado (o el original si no hay cambios)
 */
export function detectNewEpisodeAirDates(previousAnime, currentAnime, nowMs = Date.now()) {
  const existingDates = previousAnime?.episodeAirDates || {};
  const currentReleasedCount = getReleasedEpisodeCount(currentAnime, nowMs);
  const highestRecordedEpisode = Math.max(...Object.keys(existingDates).map(Number), 0);

  if (currentReleasedCount <= 0) {
    return existingDates;
  }

  const dates = { ...existingDates };
  let changed = false;

  changed = addAiringScheduleDates(dates, currentAnime, currentReleasedCount, nowMs) || changed;

  if (currentReleasedCount <= highestRecordedEpisode) {
    return changed ? dates : existingDates;
  }

  const previousSchedule = getNextAiringSchedule(previousAnime);
  if (
    previousSchedule &&
    previousSchedule.episode <= currentReleasedCount &&
    previousSchedule.airingAtMs <= nowMs + AIRING_SCHEDULE_TOLERANCE_MS
  ) {
    const fromEpisode = Math.max(previousSchedule.episode, highestRecordedEpisode + 1);
    changed =
      addScheduledDateRange(
        dates,
        previousSchedule.episode,
        previousSchedule.airingAtMs,
        fromEpisode,
        currentReleasedCount,
        nowMs,
      ) || changed;
  }

  const currentSchedule = getNextAiringSchedule(currentAnime);
  if (highestRecordedEpisode > 0 && currentSchedule) {
    changed =
      addScheduledDateRange(
        dates,
        currentSchedule.episode,
        currentSchedule.airingAtMs,
        highestRecordedEpisode + 1,
        currentReleasedCount,
        nowMs,
      ) || changed;
  }

  if (
    !changed &&
    highestRecordedEpisode > 0 &&
    currentReleasedCount === highestRecordedEpisode + 1 &&
    !dates[currentReleasedCount]
  ) {
    dates[currentReleasedCount] = nowMs;
    changed = true;
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
  const explicitOccurrences = getAiringScheduleOccurrences(anime, releasedEpisodeCount);

  if (explicitOccurrences.length > 0) {
    return explicitOccurrences;
  }

  // Cálculo hacia atrás desde nextAiringEpisode
  const nextSchedule = getNextAiringSchedule(anime);
  if (nextSchedule) {
    const weeksBetween = nextSchedule.episode - releasedEpisodeCount;
    let lastReleaseMs = nextSchedule.airingAtMs - weeksBetween * WEEK_MS;

    if (lastReleaseMs > nowMs + AIRING_SCHEDULE_TOLERANCE_MS) {
      const weeksToPast = Math.ceil((lastReleaseMs - nowMs - AIRING_SCHEDULE_TOLERANCE_MS) / WEEK_MS);
      lastReleaseMs -= Math.max(1, weeksToPast) * WEEK_MS;
    }

    return buildWeeklyOccurrences(releasedEpisodeCount, lastReleaseMs, true);
  }

  // Fallback: endDate como final de emisión semanal
  const endDate = parseCalendarDateAsLocalNoon(anime?.endDate);
  if (endDate) {
    return buildWeeklyOccurrences(releasedEpisodeCount, endDate.getTime(), true);
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

  return [];
}
