import { invoke } from "@tauri-apps/api/core";
import { getReleasedEpisodeCount } from "../utils/airingStatus";

const MIN_INTERVAL = 170;
const FETCH_TIMEOUT = 9000;

let lastRequestTime = 0;
let queuePromise = Promise.resolve();

function normalizeAniListError(error) {
  const message = typeof error === "string" ? error : error?.message || "AniList unavailable";
  const lowered = message.toLowerCase();

  if (lowered.includes("timeout")) {
    return new Error("AniList tardo demasiado en responder.");
  }

  if (lowered.includes("429")) {
    return new Error("AniList limito temporalmente las peticiones. Intenta de nuevo en unos segundos.");
  }

  if (lowered.includes("503") || lowered.includes("502") || lowered.includes("500")) {
    return new Error("AniList no esta disponible en este momento.");
  }

  return new Error(message);
}

async function queryAniList(query, variables = {}) {
  const execute = async () => {
    const now = Date.now();
    const timeSinceLast = now - lastRequestTime;
    if (timeSinceLast < MIN_INTERVAL) {
      await new Promise((resolve) => setTimeout(resolve, MIN_INTERVAL - timeSinceLast));
    }
    lastRequestTime = Date.now();

    let timeoutId;
    try {
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("Timeout de conexion con AniList")), FETCH_TIMEOUT);
      });

      const result = await Promise.race([invoke("query_anilist", { query, variables }), timeoutPromise]);

      if (!result) {
        throw new Error("AniList no devolvio datos.");
      }

      if (result.errors?.length) {
        throw new Error(result.errors.map((entry) => entry.message).join(" | "));
      }

      return result.data;
    } catch (error) {
      throw normalizeAniListError(error);
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const task = queuePromise.then(() => execute());
  queuePromise = task.catch(() => {});
  return task;
}

function mapMedia(media) {
  if (!media) return null;

  const cleanDescription = media.description
    ? media.description
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]*>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .trim()
    : "No description available.";

  const statusMap = {
    RELEASING: "En emision",
    FINISHED: "Finalizado",
    NOT_YET_RELEASED: "Proximamente",
    CANCELLED: "Cancelado",
    HIATUS: "En pausa",
  };

  const demoTags = ["Shounen", "Seinen", "Shoujo", "Josei"];
  const demographic = media.tags?.find((tag) => demoTags.includes(tag.name))?.name || "Desconocido";

  let normalizedType = media.format || "TV";
  if (normalizedType === "TV_SHORT") normalizedType = "TV";

  const totalEpisodes = media.episodes || 0;
  const releasedEpisodes = getReleasedEpisodeCount({
    status: statusMap[media.status] || media.status || "UNKNOWN",
    episodes: 0,
    totalEpisodes,
    nextAiringEpisode: media.nextAiringEpisode,
  });

  const airedDate = media.startDate?.year
    ? `${media.startDate.day || "?"}/${media.startDate.month || "?"}/${media.startDate.year}`
    : "N/A";

  return {
    mal_id: media.idMal || media.id,
    malId: media.idMal || media.id,
    anilistId: media.id,
    title: media.title.userPreferred || media.title.english || media.title.romaji,
    title_english: media.title.english,
    title_romaji: media.title.romaji,
    title_native: media.title.native,
    synonyms: media.synonyms || [],
    images: {
      jpg: {
        large_image_url: media.coverImage.extraLarge || media.coverImage.large,
        small_image_url: media.coverImage.medium,
      },
    },
    coverImage: media.coverImage.extraLarge || media.coverImage.large,
    bannerImage: media.bannerImage,
    synopsis: cleanDescription,
    score: media.averageScore ? media.averageScore / 10 : 0,
    rank:
      media.rankings?.find((ranking) => ranking.allTime && ranking.type === "RATED")?.rank ||
      media.rankings?.[0]?.rank ||
      null,
    popularity: media.popularity,
    rating: media.isAdult ? "R18+" : "TV-14",
    type: normalizedType,
    format: normalizedType,
    status: statusMap[media.status] || media.status || "UNKNOWN",
    episodes: releasedEpisodes,
    totalEpisodes,
    year: media.seasonYear || media.startDate?.year || "N/A",
    season: media.season || "N/A",
    get episodeList() {
      return Array.from({ length: totalEpisodes || releasedEpisodes || 0 }, (_, index) => ({
        mal_id: index + 1,
        title: `Episodio ${index + 1}`,
        aired: null,
      }));
    },
    duration: media.duration ? `${media.duration} min` : "24 min",
    genres: media.genres ? media.genres.map((genre, index) => ({ mal_id: index, name: genre })) : [],
    demographics: [{ name: demographic }],
    studios: media.studios?.nodes?.map((studio) => ({ name: studio.name })) || [],
    source: media.source || "UNKNOWN",
    airedDate,
    startDate: media.startDate || null,
    aired: {
      from: media.startDate?.year ? `${media.startDate.year}-${media.startDate.month}-${media.startDate.day}` : null,
      string: airedDate,
    },
    members: media.popularity,
    favorites: media.favourites,
    isAdult: media.isAdult,
    nextAiringEpisode: media.nextAiringEpisode,
    endDate: media.endDate,
  };
}

const MEDIA_FIELDS = `
  id
  idMal
  title {
    romaji
    english
    native
    userPreferred
  }
  synonyms
  description
  coverImage {
    extraLarge
    large
    medium
    color
  }
  bannerImage
  format
  status
  episodes
  duration
  genres
  tags {
    name
  }
  averageScore
  popularity
  favourites
  startDate {
    year
    month
    day
  }
  endDate {
    year
    month
    day
  }
  studios(isMain: true) {
    nodes {
      name
    }
  }
  rankings {
    rank
    type
    allTime
  }
  isAdult
  seasonYear
  season
  source
  nextAiringEpisode {
    airingAt
    timeUntilAiring
    episode
  }
`;

export async function getFullSeasonAnime() {
  const month = new Date().getMonth();
  let season = "FALL";
  if (month < 3) season = "WINTER";
  else if (month < 6) season = "SPRING";
  else if (month < 9) season = "SUMMER";

  const year = new Date().getFullYear();

  const query = `
    query ($page: Int, $season: MediaSeason, $seasonYear: Int) {
      Page (page: $page, perPage: 50) {
        pageInfo {
          hasNextPage
        }
        media (
          type: ANIME,
          season: $season,
          seasonYear: $seasonYear,
          isAdult: false,
          sort: [POPULARITY_DESC]
        ) {
          ${MEDIA_FIELDS}
        }
      }
    }
  `;

  let allAnimes = [];
  let page = 1;
  let hasNextPage = true;

  while (hasNextPage && page <= 2) {
    const result = await queryAniList(query, { page, season, seasonYear: year });
    allAnimes = [...allAnimes, ...result.Page.media.map(mapMedia)];
    hasNextPage = result.Page.pageInfo.hasNextPage;
    page += 1;
  }

  console.log("allAnimes", allAnimes);

  return allAnimes;
}

export async function searchAnime(queryText, page = 1) {
  const query = `
    query ($search: String, $page: Int) {
      Page (page: $page, perPage: 24) {
        pageInfo {
          lastPage
          hasNextPage
          currentPage
          total
        }
        media (search: $search, type: ANIME, isAdult: false) {
          ${MEDIA_FIELDS}
        }
      }
    }
  `;

  const result = await queryAniList(query, { search: queryText, page });

  return {
    data: result.Page.media.map(mapMedia),
    pagination: {
      total: result.Page.pageInfo.total,
      current_page: result.Page.pageInfo.currentPage,
      last_visible_page: result.Page.pageInfo.lastPage,
      has_next_page: result.Page.pageInfo.hasNextPage,
    },
  };
}

async function getAnimeDetailsByQuery(identifier, fieldName) {
  if (!identifier) return null;

  const query = `
    query ($id: Int) {
      Media (${fieldName}: $id, type: ANIME) {
        ${MEDIA_FIELDS}
      }
    }
  `;

  const result = await queryAniList(query, { id: Number(identifier) });
  return result?.Media ? mapMedia(result.Media) : null;
}

export async function getAnimeDetails(id, options = {}) {
  if (!id && !options.anilistId) return null;

  const malId = Number(id);
  if (Number.isFinite(malId) && malId > 0) {
    const byMalId = await getAnimeDetailsByQuery(malId, "idMal");
    if (byMalId) {
      return byMalId;
    }
  }

  const anilistId = Number(options.anilistId);
  if (Number.isFinite(anilistId) && anilistId > 0) {
    return getAnimeDetailsByQuery(anilistId, "id");
  }

  return null;
}

export async function getAnimeDetailsBatch(ids) {
  if (!ids || ids.length === 0) return [];

  const chunkSize = 50;
  let allResults = [];
  let firstError = null;

  for (let index = 0; index < ids.length; index += chunkSize) {
    const chunkIds = ids.slice(index, index + chunkSize);
    const query = `
      query ($ids: [Int]) {
        Page (perPage: 50) {
          media (idMal_in: $ids, type: ANIME) {
            ${MEDIA_FIELDS}
          }
        }
      }
    `;

    try {
      const result = await queryAniList(query, { ids: chunkIds });
      if (result?.Page?.media) {
        allResults = allResults.concat(result.Page.media.map(mapMedia).filter(Boolean));
      }
    } catch (error) {
      if (!firstError) {
        firstError = error;
      }
      console.warn(`Error fetching batch from ${index} to ${index + chunkSize}:`, error);
    }
  }

  if (allResults.length === 0 && firstError) {
    throw firstError;
  }

  return allResults;
}
