const url = "https://graphql.anilist.co";
const sessionCache = {};
let lastRequest = 0;

// AniList permite ~90 req/min, limitamos a ~170ms entre llamadas de seguridad
const MIN_INTERVAL = 170; 


/**
 * Función principal para realizar peticiones GraphQL a AniList
 */
async function queryAniList(query, variables = {}) {
  const cacheKey = JSON.stringify({ query, variables });
  if (sessionCache[cacheKey]) return sessionCache[cacheKey];

  const now = Date.now();
  const timeLastRequest = now - lastRequest;
  if (timeLastRequest < MIN_INTERVAL) {
    await new Promise((resolve) => setTimeout(resolve, MIN_INTERVAL - timeLastRequest));
  }
  lastRequest = Date.now();

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const json = await response.json();
    if (json.errors) {
      console.error("[AniList] GraphQL Errors:", json.errors);
      return null;
    }

    sessionCache[cacheKey] = json.data;
    return json.data;
  } catch (error) {
    console.error("[AniList] Fetch Error:", error);
    return null;
  }
}

/**
 * Mapea el objeto Media de AniList a una estructura compatible con Jikan/MAL
 */
function mapMedia(media) {
  if (!media) return null;

  const cleanDescription = media.description
    ? media.description
        .replace(/<br>/g, "\n")
        .replace(/<i>/g, "")
        .replace(/<\/i>/g, "")
        .replace(/<b>/g, "")
        .replace(/<\/b>/g, "")
        .replace(/<[^>]*>/g, "")
    : "No description available.";

  const statusMap = {
    RELEASING: "Airing",
    FINISHED: "Finished Airing",
    NOT_YET_RELEASED: "Not yet aired",
    CANCELLED: "Cancelled",
    HIATUS: "Hiatus",
  };

  // Extraer demografía de los tags
  const demoTags = ["Shounen", "Seinen", "Shoujo", "Josei"];
  const demographic = media.tags?.find(t => demoTags.includes(t.name))?.name || "Unknown";

  // Normalización de tipos para filtros
  let normalizedType = media.format || "TV";
  if (normalizedType === "TV_SHORT") normalizedType = "TV";

  // Generar lista de episodios simulada
  let episodesCount = media.episodes || 0;
  
  // Si está en emisión y no tenemos total, usamos el último emitido
  if (!episodesCount && media.nextAiringEpisode) {
    episodesCount = media.nextAiringEpisode.episode - 1;
  }

  const episodeList = Array.from({ length: episodesCount || 0 }, (_, i) => ({
    mal_id: i + 1,
    title: `Episodio ${i + 1}`,
    aired: null,
  }));


  return {
    mal_id: media.idMal || media.id,
    malId: media.idMal || media.id,
    anilistId: media.id,
    title: media.title.userPreferred || media.title.english || media.title.romaji,
    title_english: media.title.english,
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
    rank: media.rankings?.find((r) => r.type === "RANKED" && r.allTime)?.rank || null,
    popularity: media.popularity,
    type: normalizedType,
    format: normalizedType, 
    status: statusMap[media.status] || media.status || "UNKNOWN",
    episodes: episodesCount,
    totalEpisodes: episodesCount, // Alias para compatibilidad global
    episodeList: episodeList,
    duration: media.duration ? `${media.duration} min` : "24 min",
    genres: media.genres ? media.genres.map((g, idx) => ({ mal_id: idx, name: g })) : [],
    demographics: [{ name: demographic }],
    studios: media.studios?.nodes?.map((s) => ({ name: s.name })) || [],
    source: media.source || "UNKNOWN",
    aired: {
      from: media.startDate?.year ? `${media.startDate.year}-${media.startDate.month}-${media.startDate.day}` : null,
    },
    members: media.popularity,
    favorites: media.favourites,
    isAdult: media.isAdult,
    nextAiringEpisode: media.nextAiringEpisode,
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
  source
  nextAiringEpisode {
    airingAt
    timeUntilAiring
    episode
  }
`;

// Top animes
export async function getTopAnime(page = 1, filter = "") {
  let sort = ["POPULARITY_DESC"];
  if (filter === "bypopularity") sort = ["POPULARITY_DESC"];
  if (filter === "favorite") sort = ["FAVOURITES_DESC"];
  if (filter === "upcoming") sort = ["START_DATE_DESC"];
  if (filter === "airing") sort = ["TRENDING_DESC"];

  const query = `
    query ($page: Int, $sort: [MediaSort]) {
      Page (page: $page, perPage: 24) {
        pageInfo {
          lastPage
          hasNextPage
          currentPage
        }
        media (type: ANIME, sort: $sort, isAdult: false) {
          ${MEDIA_FIELDS}
        }
      }
    }
  `;

  const result = await queryAniList(query, { page, sort });
  if (!result) return { data: [], pagination: {} };

  return {
    data: result.Page.media.map(mapMedia),
    pagination: {
      last_visible_page: result.Page.pageInfo.lastPage,
      has_next_page: result.Page.pageInfo.hasNextPage,
      current_page: result.Page.pageInfo.currentPage,
    },
  };
}

// Animes en emisión (Toda la temporada)
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
  let hasNextPage = true;
  let page = 1;

  while (hasNextPage && page <= 4) {
    const result = await queryAniList(query, { page, season, seasonYear: year });
    if (!result) break;
    
    allAnimes = [...allAnimes, ...result.Page.media.map(mapMedia)];
    hasNextPage = result.Page.pageInfo.hasNextPage;
    page++;
  }

  return allAnimes;
}

// Animes en emisión (Por página)
export async function getSeasonNow(page = 1, filter = "TV") {
  const query = `
    query ($page: Int, $format: MediaFormat) {
      Page (page: $page, perPage: 20) {
        pageInfo {
          lastPage
          hasNextPage
          currentPage
        }
        media (type: ANIME, status: RELEASING, format: $format, isAdult: false, sort: [POPULARITY_DESC]) {
          ${MEDIA_FIELDS}
        }
      }
    }
  `;

  const formatMap = {
    tv: "TV",
    movie: "MOVIE",
    ova: "OVA",
    ona: "ONA",
    special: "SPECIAL",
    tv_special: "TV_SHORT",
  };

  const variables = { 
    page, 
    format: formatMap[filter.toLowerCase()] || "TV" 
  };

  const result = await queryAniList(query, variables);
  if (!result) return { data: [], pagination: {} };

  return {
    data: result.Page.media.map(mapMedia),
    pagination: {
      last_visible_page: result.Page.pageInfo.lastPage,
      has_next_page: result.Page.pageInfo.hasNextPage,
    },
  };
}

// Buscar anime por nombre
export async function searchAnime(queryText, page = 1) {
  const query = `
    query ($search: String, $page: Int) {
      Page (page: $page, perPage: 24) {
        pageInfo {
          lastPage
          hasNextPage
          currentPage
        }
        media (search: $search, type: ANIME, isAdult: false) {
          ${MEDIA_FIELDS}
        }
      }
    }
  `;

  const result = await queryAniList(query, { search: queryText, page });
  if (!result) return { data: [], pagination: {} };

  return {
    data: result.Page.media.map(mapMedia),
    pagination: {
      last_visible_page: result.Page.pageInfo.lastPage,
      has_next_page: result.Page.pageInfo.hasNextPage,
    },
  };
}

// Obtener recomendaciones
export async function getRecentAnimeRecommendations() {
  const query = `
    query {
      Page (page: 1, perPage: 10) {
        media (type: ANIME, sort: [TRENDING_DESC], isAdult: false) {
          recommendations (limit: 5) {
            nodes {
              mediaRecommendation {
                ${MEDIA_FIELDS}
              }
            }
          }
        }
      }
    }
  `;

  const result = await queryAniList(query);
  if (!result) return [];

  const recommendations = [];
  const seenIds = new Set();

  result.Page.media.forEach(m => {
    if (m.recommendations && m.recommendations.nodes) {
      m.recommendations.nodes.forEach(node => {
        const rec = node.mediaRecommendation;
        if (rec && !seenIds.has(rec.id)) {
          seenIds.add(rec.id);
          recommendations.push(mapMedia(rec));
        }
      });
    }
  });

  return recommendations.slice(0, 50);
}

// Obtener detalles por ID
export async function getAnimeDetails(id) {
  const idInt = parseInt(id);
  if (isNaN(idInt)) return null;

  const isAniListId = idInt > 100000;
  const query = `
    query ($id: Int, $idMal: Int) {
      Media (id: $id, idMal: $idMal, type: ANIME) {
        ${MEDIA_FIELDS}
      }
    }
  `;

  const variables = isAniListId ? { id: idInt } : { idMal: idInt };
  const result = await queryAniList(query, variables);
  
  return result ? mapMedia(result.Media) : null;
}
