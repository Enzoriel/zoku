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

function buildWeeklyOccurrences(releasedEpisodeCount, lastReleaseMs) {
  const occurrences = [];
  for (let offset = 0; offset < releasedEpisodeCount; offset += 1) {
    occurrences.push({
      ep: releasedEpisodeCount - offset,
      airedAt: lastReleaseMs - offset * WEEK_MS,
      isEstimated: true,
    });
  }
  return occurrences;
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
  const nextAiringAtMs = Number(anime?.nextAiringEpisode?.airingAt || 0) * 1000;
  const hasNextAiring = Number.isFinite(nextAiringAtMs) && nextAiringAtMs > 0;

  if (startDate && hasNextAiring) {
    const lastReleaseMs = hasAiredNextEpisode(anime.nextAiringEpisode, nowMs) ? nextAiringAtMs : nextAiringAtMs - WEEK_MS;
    if (isSameLocalDay(startDate, new Date(lastReleaseMs))) {
      return buildBatchPremiereOccurrences(releasedEpisodeCount, startDate).filter(
        (entry) => entry.airedAt >= cutoffMs && entry.airedAt <= nowMs + 60 * 60 * 1000,
      );
    }

    return buildWeeklyOccurrences(releasedEpisodeCount, lastReleaseMs).filter(
      (entry) => entry.airedAt >= cutoffMs && entry.airedAt <= nowMs + 60 * 60 * 1000,
    );
  }

  if (startDate && releasedEpisodeCount > 1) {
    return buildBatchPremiereOccurrences(releasedEpisodeCount, startDate).filter(
      (entry) => entry.airedAt >= cutoffMs && entry.airedAt <= nowMs + 60 * 60 * 1000,
    );
  }

  if (hasNextAiring) {
    const lastReleaseMs = hasAiredNextEpisode(anime.nextAiringEpisode, nowMs) ? nextAiringAtMs : nextAiringAtMs - WEEK_MS;
    return buildWeeklyOccurrences(releasedEpisodeCount, lastReleaseMs).filter(
      (entry) => entry.airedAt >= cutoffMs && entry.airedAt <= nowMs + 60 * 60 * 1000,
    );
  }

  const endDate = parseDateParts(anime?.endDate);
  if (endDate) {
    return buildWeeklyOccurrences(releasedEpisodeCount, endDate.getTime()).filter(
      (entry) => entry.airedAt >= cutoffMs && entry.airedAt <= nowMs + 60 * 60 * 1000,
    );
  }

  return [];
}
