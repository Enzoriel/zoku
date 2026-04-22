function resolveAnimeId(anime = {}, overrides = {}) {
  const sourceAnime = anime ?? {};
  const sourceOverrides = overrides ?? {};
  return sourceOverrides.malId ?? sourceAnime.malId ?? sourceAnime.mal_id ?? null;
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

function resolveYear(anime = {}) {
  if (anime.year) return anime.year;

  const airedFrom = anime?.aired?.from;
  if (typeof airedFrom === "string") {
    const yearMatch = airedFrom.match(/^(\d{4})/);
    if (yearMatch) {
      return Number(yearMatch[1]);
    }

    const parsed = new Date(airedFrom);
    if (Number.isFinite(parsed.getTime())) {
      return parsed.getUTCFullYear();
    }
  }

  return "N/A";
}

export function buildStoredAnimeEntry(anime = {}, overrides = {}) {
  const sourceAnime = anime ?? {};
  const sourceOverrides = overrides ?? {};
  const now = new Date().toISOString();
  const animeId = resolveAnimeId(sourceAnime, sourceOverrides);
  const genres = Array.isArray(sourceAnime.genres) ? sourceAnime.genres : [];
  const studios = Array.isArray(sourceAnime.studios) ? sourceAnime.studios : [];

  return {
    malId: animeId,
    mal_id: animeId,
    anilistId: sourceAnime.anilistId ?? null,
    title: resolveTitle(sourceAnime),
    title_english: sourceAnime.title_english || null,
    coverImage: resolveCoverImage(sourceAnime),
    bannerImage: sourceAnime.bannerImage || null,
    totalEpisodes: sourceAnime.totalEpisodes || sourceAnime.episodes || 0,
    episodeDuration: resolveEpisodeDuration(sourceAnime),
    episodeList: Array.isArray(sourceAnime.episodeList) ? sourceAnime.episodeList : [],
    watchedEpisodes: Array.isArray(sourceAnime.watchedEpisodes) ? sourceAnime.watchedEpisodes : [],
    lastEpisodeWatched: sourceAnime.lastEpisodeWatched || 0,
    userStatus: sourceAnime.userStatus || "PLAN_TO_WATCH",
    userScore: sourceAnime.userScore || 0,
    notes: sourceAnime.notes || "",
    watchHistory: Array.isArray(sourceAnime.watchHistory) ? sourceAnime.watchHistory : [],
    completedAt: sourceAnime.completedAt || null,
    folderName: sourceAnime.folderName || null,
    linkSuggestion: sourceAnime.linkSuggestion || null,
    rejectedSuggestion: sourceAnime.rejectedSuggestion || null,
    torrentAlias: sourceAnime.torrentAlias || "",
    torrentSearchTerm: sourceAnime.torrentSearchTerm || "",
    torrentTitle: sourceAnime.torrentTitle || "",
    torrentSourceFansub: sourceAnime.torrentSourceFansub || null,
    diskAlias: sourceAnime.diskAlias || "",
    lastMetadataFetch: sourceAnime.lastMetadataFetch || now,
    addedAt: sourceAnime.addedAt || now,
    lastUpdated: sourceAnime.lastUpdated || now,
    genres,
    status: sourceAnime.status || "Unknown",
    type: sourceAnime.type || sourceAnime.format || "TV",
    score: sourceAnime.score || 0,
    synopsis: sourceAnime.synopsis || "Sinopsis no disponible.",
    year: resolveYear(sourceAnime),
    season: sourceAnime.season || "N/A",
    studios,
    duration: sourceAnime.duration || `${resolveEpisodeDuration(sourceAnime)} min`,
    startDate: sourceAnime.startDate || null,
    airedDate: sourceAnime.airedDate || sourceAnime.aired?.string || "N/A",
    members: sourceAnime.members || 0,
    favorites: sourceAnime.favorites || 0,
    source: sourceAnime.source || "N/A",
    images: sourceAnime.images,
    nextAiringEpisode: sourceAnime.nextAiringEpisode || null,
    endDate: sourceAnime.endDate || null,
    synonyms: Array.isArray(sourceAnime.synonyms) ? sourceAnime.synonyms : [],
    title_romaji: sourceAnime.title_romaji || sourceAnime.title?.romaji || null,
    title_native: sourceAnime.title_native || sourceAnime.title?.native || null,
    ...sourceOverrides,
    malId: animeId,
    mal_id: sourceOverrides.mal_id ?? animeId,
  };
}
