const url = "https://api.jikan.moe/v4";

// Rate limit: 3 requests por minuto
let lastRequest = 0;
const MIN_INTERVAL = 350;

async function safeFetch(url) {
  const now = Date.now();
  const timeLastRequest = now - lastRequest;

  if (timeLastRequest < MIN_INTERVAL) {
    await new Promise((resolve) => setTimeout(resolve, MIN_INTERVAL - timeLastRequest));
  }

  lastRequest = Date.now();
  const response = await fetch(url);
  return response.json();
}

// Top animes
export async function getTopAnime(page = 1, filter = "") {
  const data = await safeFetch(`${url}/top/anime?page=${page}&limit=24${filter ? `&filter=${filter}` : ""}&sfw=true`);
  return {
    data: data.data || [],
    pagination: data.pagination || {},
  };
}

// Animes en emisión
export async function getSeasonNow(page = 1, filter = "tv") {
  const data = await safeFetch(`${url}/seasons/now?page=${page}&limit=20&filter=${filter}&sfw=true`);
  const malIds = new Set();
  const animes = [];
  data.data.forEach((anime) => {
    if (anime.mal_id && !malIds.has(anime.mal_id)) {
      malIds.add(anime.mal_id);
      animes.push(anime);
    }
  });
  console.log("ESTOS SON LOS RESULTADOS:", animes);
  return {
    data: animes || [],
    pagination: data.pagination || {},
  };
}

// Buscar anime por nombre
export async function searchAnime(query, page = 1) {
  const data = await safeFetch(`${url}/anime?q=${query}&page=${page}&limit=24&sfw=true`);
  return {
    data: data.data || [],
    pagination: data.pagination || {},
  };
}

// Obtener recomendaciones recientes
export async function getRecentAnimeRecommendations() {
  const data = await safeFetch(`${url}/recommendations/anime?sfw=true`);
  console.log("Recommendations data:", data);
  const recommendations = data.data || [];

  // Extraer los animes únicos de las recomendaciones (cada recomendación tiene un array 'entry' con 2 animes)
  const uniqueAnimes = [];
  const seenIds = new Set();

  for (const rec of recommendations) {
    for (const anime of rec.entry) {
      if (!seenIds.has(anime.mal_id)) {
        seenIds.add(anime.mal_id);
        uniqueAnimes.push(anime);
      }
      if (uniqueAnimes.length >= 50) break;
    }
    if (uniqueAnimes.length >= 50) break;
  }

  return uniqueAnimes;
}

// Obtener datos de un anime por su ID
export async function getAnimeDetails(id) {
  const data = await safeFetch(`${url}/anime/${id}`);
  return data.data || null;
}

// Obtener episodios de un anime por su ID
export async function getAnimeEpisodes(id) {
  const data = await safeFetch(`${url}/anime/${id}/episodes?limit=100`);
  return data.data || [];
}
