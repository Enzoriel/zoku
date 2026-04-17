import { calculateUserStatus } from "./animeStatus";

function buildWatchHistory(history, episodeNumber, markWatched, watchedAt) {
  const filteredHistory = (Array.isArray(history) ? history : []).filter((entry) => entry.episode !== episodeNumber);

  if (!markWatched) {
    return filteredHistory;
  }

  return [...filteredHistory, { episode: episodeNumber, watchedAt }];
}

export function updateAnimeWatchProgress(anime, episodeNumber, { markWatched, watchedAt = new Date().toISOString() }) {
  if (!anime || !Number.isFinite(episodeNumber)) return anime;

  const nextWatchedEpisodes = markWatched
    ? [...new Set([...(anime.watchedEpisodes || []), episodeNumber])]
    : (anime.watchedEpisodes || []).filter((number) => number !== episodeNumber);

  const updated = {
    ...anime,
    watchedEpisodes: nextWatchedEpisodes,
    watchHistory: buildWatchHistory(anime.watchHistory, episodeNumber, markWatched, watchedAt),
    lastEpisodeWatched: nextWatchedEpisodes.length > 0 ? Math.max(...nextWatchedEpisodes) : 0,
    lastUpdated: watchedAt,
  };

  updated.userStatus = calculateUserStatus(updated);

  if (updated.userStatus === "COMPLETED") {
    updated.completedAt = anime.completedAt || watchedAt;
  } else if (anime.completedAt) {
    updated.completedAt = null;
  } else {
    updated.completedAt = anime.completedAt || null;
  }

  return updated;
}
