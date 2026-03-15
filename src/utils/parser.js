// Formato típico: [Grupo-Fansub] Título del Anime - 01 [1080p AAC][hash].mkv

// Regex para extraer título
// Elimina [Grupo] al inicio, captura todo hasta - número
const TITLE_REGEX = /^\[(?:[^\]]+)\]\s*(.+?)\s*-\s*\d+/;

// Regex para extraer número de episodio
// Captura número después del -
const EPISODE_REGEX = /-\s*(\d+)/;

// Limpiar título de caracteres especiales
export function cleanTitle(title) {
  return title
    .replace(/\s*\[.*?\]/g, "") // Eliminar [720p], [1080p], etc.
    .replace(/\s*\(.*?\)/g, "") // Eliminar (Subs), etc.
    .replace(/\s*\{.*?\}/g, "") // Eliminar {hash}
    .trim();
}

// Parser principal
export function parseFileName(fileName) {
  // Quitar extensión
  const name = fileName.replace(/\.mkv$/i, "");

  // Extraer título
  const titleMatch = name.match(TITLE_REGEX);
  let title = titleMatch ? titleMatch[1] : name;
  title = cleanTitle(title);

  // Extraer número de episodio
  const episodeMatch = name.match(EPISODE_REGEX);
  const episode = episodeMatch ? parseInt(episodeMatch[1], 10) : 1;

  return { title, episode };
}

// Agrupar archivos por título
export function groupByTitle(files) {
  const groups = {};

  files.forEach((file) => {
    const { title, episode } = parseFileName(file.name);

    // Normalizar título (minúsculas, sin acentos)
    const normalizedTitle = normalizeTitle(title);

    if (!groups[normalizedTitle]) {
      groups[normalizedTitle] = {
        originalTitle: title,
        episodes: [],
      };
    }

    groups[normalizedTitle].episodes.push({
      episode,
      path: file.path,
      fileName: file.name,
    });
  });

  // Ordenar episodios
  Object.values(groups).forEach((group) => {
    group.episodes.sort((a, b) => a.episode - b.episode);
  });

  return groups;
}

// Normalizar título para matching
export function normalizeTitle(title) {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Quitar acentos
    .replace(/[^a-z0-9]/g, ""); // Solo letras y números
}
