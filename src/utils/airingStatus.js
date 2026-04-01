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

export function hasAiredNextEpisode(nextAiringEpisode, nowMs = Date.now()) {
  const airingAtSeconds = Number(nextAiringEpisode?.airingAt);
  if (!Number.isFinite(airingAtSeconds) || airingAtSeconds <= 0) {
    return false;
  }

  return airingAtSeconds * 1000 <= nowMs;
}

export function isAnimeActivelyAiring(anime) {
  const status = normalizeStatus(anime?.status);

  return (
    Boolean(anime?.nextAiringEpisode) ||
    status.includes("airing") ||
    status.includes("releasing") ||
    status.includes("emision")
  );
}

export function getReleasedEpisodeCount(anime, nowMs = Date.now()) {
  const status = normalizeStatus(anime?.status);
  const finishedCount = Math.max(
    toFiniteNumber(anime?.episodes),
    toFiniteNumber(anime?.totalEpisodes),
    Array.isArray(anime?.episodeList) ? anime.episodeList.length : 0,
  );

  const nextEpisodeNumber = toFiniteNumber(anime?.nextAiringEpisode?.episode);
  if (!nextEpisodeNumber) {
    if (isFinishedStatus(status)) {
      return finishedCount;
    }

    if (isNotYetReleasedStatus(status)) {
      return 0;
    }

    return toFiniteNumber(anime?.episodes);
  }

  const releasedBySchedule = hasAiredNextEpisode(anime.nextAiringEpisode, nowMs)
    ? nextEpisodeNumber
    : Math.max(nextEpisodeNumber - 1, 0);

  if (isFinishedStatus(status)) {
    return Math.max(finishedCount, releasedBySchedule);
  }

  return releasedBySchedule;
}

export function isAiringMetadataStale(anime, nowMs = Date.now()) {
  return isAnimeActivelyAiring(anime) && hasAiredNextEpisode(anime?.nextAiringEpisode, nowMs);
}
