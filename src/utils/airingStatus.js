function toFiniteNumber(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeStatus(status) {
  return String(status || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function isFinishedStatus(status) {
  return status.includes("finished") || status.includes("finalizado");
}

function isNotYetReleasedStatus(status) {
  return status.includes("not yet") || status.includes("proximamente");
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const AIRING_SCHEDULE_TOLERANCE_MS = 2 * 60 * 60 * 1000;

function getAiringScheduleReleasedCount(anime, nowMs) {
  const schedule = Array.isArray(anime?.airingSchedule) ? anime.airingSchedule : [];
  return schedule.reduce((highest, entry) => {
    const episode = toFiniteNumber(entry?.episode ?? entry?.ep);
    const airedAt = Number(entry?.airedAt ?? 0);
    if (!episode || !Number.isFinite(airedAt) || airedAt <= 0 || airedAt > nowMs + AIRING_SCHEDULE_TOLERANCE_MS) {
      return highest;
    }

    return Math.max(highest, episode);
  }, 0);
}

export function hasAiredNextEpisode(nextAiringEpisode, nowMs = Date.now()) {
  const airingAtSeconds = Number(nextAiringEpisode?.airingAt);
  if (!Number.isFinite(airingAtSeconds) || airingAtSeconds <= 0) {
    return false;
  }

  return airingAtSeconds * 1000 <= nowMs;
}

export function isAnimeActivelyAiring(anime) {
  const status = normalizeStatus(anime?.status);
  if (isFinishedStatus(status) || isNotYetReleasedStatus(status)) {
    return false;
  }

  return (
    Boolean(anime?.nextAiringEpisode) ||
    status.includes("airing") ||
    status.includes("releasing") ||
    status.includes("emision")
  );
}

export function getReleasedEpisodeCount(anime, nowMs = Date.now()) {
  const status = normalizeStatus(anime?.status);
  const releasedByAiringSchedule = getAiringScheduleReleasedCount(anime, nowMs);
  const finishedCount = Math.max(
    toFiniteNumber(anime?.episodes),
    toFiniteNumber(anime?.totalEpisodes),
    Array.isArray(anime?.episodeList) ? anime.episodeList.length : 0,
  );

  const nextAiring = anime?.nextAiringEpisode;
  const nextEpisodeNumber = toFiniteNumber(nextAiring?.episode);
  if (!nextEpisodeNumber) {
    if (isNotYetReleasedStatus(status)) {
      return 0;
    }

    if (releasedByAiringSchedule > 0 && !isFinishedStatus(status)) {
      return releasedByAiringSchedule;
    }

    return Math.max(finishedCount, releasedByAiringSchedule);
  }

  const airingAtMs = Number(nextAiring?.airingAt || 0) * 1000;
  const releasedBySchedule = hasAiredNextEpisode(nextAiring, nowMs)
    ? nextEpisodeNumber
    : (() => {
        if (!Number.isFinite(airingAtMs) || airingAtMs <= 0) {
          return Math.max(nextEpisodeNumber - 1, 0);
        }

        const futureEpisodes = Math.max(
          1,
          Math.ceil((airingAtMs - nowMs - AIRING_SCHEDULE_TOLERANCE_MS) / WEEK_MS),
        );
        return Math.max(nextEpisodeNumber - futureEpisodes, 0);
      })();

  if (isFinishedStatus(status)) {
    return Math.max(finishedCount, releasedByAiringSchedule, releasedBySchedule);
  }

  return Math.max(releasedByAiringSchedule, releasedBySchedule);
}

export function isAiringMetadataStale(anime, nowMs = Date.now()) {
  const nextAiring = anime?.nextAiringEpisode;
  return isAnimeActivelyAiring(anime) && hasAiredNextEpisode(nextAiring, nowMs);
}
