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

// Animes en emisión
export async function getSeasonNow(page = 1) {
  const data = await safeFetch(`${url}/seasons/now?page=${page}&limit=20`);
  return data.data || [];
}

// Buscar anime por nombre
export async function searchAnime(query, page = 1) {
  const data = await safeFetch(`${url}/anime?q=${query}&page=${page}&limit=20`);
  return data.data || [];
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
