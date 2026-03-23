const url = "https://graphql.anilist.co";
let lastRequest = 0;

const MIN_INTERVAL = 170;

async function queryAniList(query, variables = {}) {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequest;
  if (timeSinceLastRequest < MIN_INTERVAL) {
    await new Promise((resolve) => setTimeout(resolve, MIN_INTERVAL - timeSinceLastRequest));
  }
  lastRequest = Date.now();

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const json = await response.json();
    if (json.errors) {
      console.error("[AniList] GraphQL Errors:", json.errors);
      return null;
    }

    return json.data;
  } catch (error) {
    console.error("[AniList] Fetch Error:", error);
    return null;
  }
}

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

  const demoTags = ["Shounen", "Seinen", "Shoujo", "Josei"];
  const demographic = media.tags?.find((t) => demoTags.includes(t.name))?.name || "Unknown";

  let normalizedType = media.format || "TV";
  if (normalizedType === "TV_SHORT") normalizedType = "TV";

  let episodesCount = media.episodes || 0;
  if (!episodesCount && media.nextAiringEpisode) {
    episodesCount = media.nextAiringEpisode.episode - 1;
  }

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
    totalEpisodes: episodesCount,
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
