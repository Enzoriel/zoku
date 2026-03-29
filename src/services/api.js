const url = "https://graphql.anilist.co/";
let lastRequest = 0;

const MIN_INTERVAL = 170;
const FETCH_TIMEOUT = 9000; // 9 segundos

async function queryAniList(query, variables = {}) {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequest;

  if (timeSinceLastRequest < MIN_INTERVAL) {
    const wait = MIN_INTERVAL - timeSinceLastRequest;
    lastRequest = Date.now() + wait;
    await new Promise((resolve) => setTimeout(resolve, wait));
  } else {
    lastRequest = Date.now();
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });

    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const json = await response.json();
    if (json.errors) {
      console.error("[AniList] GraphQL Errors:", json.errors);
      return null;
    }

    console.log("ESTE ES EL RAW API:", json.data);

    return json.data;
  } catch (error) {
    if (error.name === "AbortError") {
      console.error("[AniList] Request timeout después de 9 segundos");
    } else {
      console.error("[AniList] Fetch Error:", error);
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
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
    RELEASING: "En emisión",
    FINISHED: "Finalizado",
    NOT_YET_RELEASED: "Próximamente",
    CANCELLED: "Cancelado",
    HIATUS: "En pausa",
  };

  const demoTags = ["Shounen", "Seinen", "Shoujo", "Josei"];
  const demographic = media.tags?.find((t) => demoTags.includes(t.name))?.name || "Desconocido";

  let normalizedType = media.format || "TV";
  if (normalizedType === "TV_SHORT") normalizedType = "TV";

  let episodesCount = media.episodes || 0;
  if (!episodesCount && media.nextAiringEpisode) {
    episodesCount = media.nextAiringEpisode.episode - 1;
  }

  // Formatear fecha de estreno
  const airedDate = media.startDate?.year
    ? `${media.startDate.day || "?"}/${media.startDate.month || "?"}/${media.startDate.year}`
    : "N/A";

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
    rank: media.rankings?.find((r) => r.allTime && r.type === "RATED")?.rank || media.rankings?.[0]?.rank || null,
    popularity: media.popularity,
    rating: media.isAdult ? "R18+" : "TV-14",
    type: normalizedType,
    format: normalizedType,
    status: statusMap[media.status] || media.status || "UNKNOWN",
    episodes: episodesCount,
    totalEpisodes: episodesCount,
    year: media.seasonYear || media.startDate?.year || "N/A",
    season: media.season || "N/A",
    get episodeList() {
      return Array.from({ length: episodesCount || 0 }, (_, i) => ({
        mal_id: i + 1,
        title: `Episodio ${i + 1}`,
        aired: null,
      }));
    },
    duration: media.duration ? `${media.duration} min` : "24 min",
    genres: media.genres ? media.genres.map((g, idx) => ({ mal_id: idx, name: g })) : [],
    demographics: [{ name: demographic }],
    studios: media.studios?.nodes?.map((s) => ({ name: s.name })) || [],
    source: media.source || "UNKNOWN",
    airedDate: airedDate,
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
  let hasNextPage = true;
  let page = 1;

  while (hasNextPage && page <= 2) {
    const result = await queryAniList(query, { page, season, seasonYear: year });
    if (!result) break;

    allAnimes = [...allAnimes, ...result.Page.media.map(mapMedia)];
    hasNextPage = result.Page.pageInfo.hasNextPage;
    page++;
  }

  console.log("ESTA ES LA TEMPORADA", allAnimes);

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

// Trae múltiples animes por ID en una sola request GraphQL usando aliases
export async function getAnimeDetailsBatch(ids) {
  if (!ids || ids.length === 0) return [];

  const query = `
    query ($ids: [Int]) {
      Page (perPage: 50) {
        media (idMal_in: $ids, type: ANIME) {
          ${MEDIA_FIELDS}
        }
      }
    }
  `;

  const result = await queryAniList(query, { ids });
  if (!result || !result.Page) return [];

  return result.Page.media.map(mapMedia).filter(Boolean);
}
