function resolveAnimeId(anime = {}, overrides = {}) {
  return overrides.malId ?? anime.malId ?? anime.mal_id ?? null;
}

function resolveCoverImage(anime = {}) {
  return anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url || anime.coverImage || "";
}

function resolveTitle(anime = {}) {
  return anime.title || anime.title_english || anime.title_japanese || "Unknown Title";
}

function resolveEpisodeDuration(anime = {}) {
  if (typeof anime.episodeDuration === "number") {
    return anime.episodeDuration;
  }

  if (typeof anime.duration === "number") {
    return anime.duration;
  }

  if (typeof anime.duration === "string") {
    const parsed = Number.parseInt(anime.duration, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 24;
}

export function buildStoredAnimeEntry(anime = {}, overrides = {}) {
  const now = new Date().toISOString();
  const animeId = resolveAnimeId(anime, overrides);
  const genres = Array.isArray(anime.genres) ? anime.genres : [];
  const studios = Array.isArray(anime.studios) ? anime.studios : [];

  return {
    malId: animeId,
    mal_id: animeId,
    anilistId: anime.anilistId ?? null,
    title: resolveTitle(anime),
    title_english: anime.title_english || null,
    coverImage: resolveCoverImage(anime),
    bannerImage: anime.bannerImage || null,
    totalEpisodes: anime.totalEpisodes || anime.episodes || 0,
    episodeDuration: resolveEpisodeDuration(anime),
    episodeList: Array.isArray(anime.episodeList) ? anime.episodeList : [],
    watchedEpisodes: Array.isArray(anime.watchedEpisodes) ? anime.watchedEpisodes : [],
    lastEpisodeWatched: anime.lastEpisodeWatched || 0,
    userStatus: anime.userStatus || "PLAN_TO_WATCH",
    userScore: anime.userScore || 0,
    notes: anime.notes || "",
    watchHistory: Array.isArray(anime.watchHistory) ? anime.watchHistory : [],
    completedAt: anime.completedAt || null,
    folderName: anime.folderName || null,
    torrentAlias: anime.torrentAlias || "",
    lastMetadataFetch: anime.lastMetadataFetch || now,
    addedAt: anime.addedAt || now,
    lastUpdated: anime.lastUpdated || now,
    genres,
    status: anime.status || "Unknown",
    type: anime.type || anime.format || "TV",
    score: anime.score || 0,
    synopsis: anime.synopsis || "Sinopsis no disponible.",
    year: anime.year || (anime.aired?.from ? new Date(anime.aired.from).getFullYear() : "N/A"),
    season: anime.season || "N/A",
    studios,
    duration: anime.duration || `${resolveEpisodeDuration(anime)} min`,
    airedDate: anime.airedDate || anime.aired?.string || "N/A",
    members: anime.members || 0,
    favorites: anime.favorites || 0,
    source: anime.source || "N/A",
    images: anime.images,
    nextAiringEpisode: anime.nextAiringEpisode || null,
    endDate: anime.endDate || null,
    ...overrides,
    malId: animeId,
    mal_id: overrides.mal_id ?? animeId,
  };
}
