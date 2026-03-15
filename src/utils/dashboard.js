// Función auxiliar para extraer el número de episodio del nombre del archivo
function extractEpisodeNumber(fileName) {
  const name = fileName.toLowerCase();
  const nameWithoutExt = name.substring(0, name.lastIndexOf('.')) || name;
  
  // Patrones: " 01 ", "-01", "e01", "ep01", " 01.", etc.
  const match = nameWithoutExt.match(/(?:^|[^0-9])([0-9]{1,4})(?:$|[^0-9])/);
  if (match) {
    return parseInt(match[1], 10);
  }
  return null;
}

// Continuar viendo: animes en progreso ordenados por último visto
export function getContinueWatching(myAnimes) {
  if (!myAnimes) return [];
  return Object.values(myAnimes)
    .filter((anime) => anime.watchedEpisodes?.length > 0 && anime.watchedEpisodes.length < anime.totalEpisodes)
    .sort((a, b) => {
      const lastA = a.watchHistory?.[a.watchHistory.length - 1]?.watchedAt;
      const lastB = b.watchHistory?.[b.watchHistory.length - 1]?.watchedAt;
      return new Date(lastB) - new Date(lastA);
    });
}

// Nuevos episodios: animes con episodios nuevos en carpeta local
export function getNewEpisodes(myAnimes, localFiles) {
  if (!myAnimes || !localFiles) return [];
  const result = [];

  Object.values(myAnimes).forEach((anime) => {
    // Obtener la lista de archivos de la estructura del store { files: [], lastScanned: ... }
    const localData = localFiles[anime.title];
    const localFilesList = localData && Array.isArray(localData.files) ? localData.files : [];
    
    if (localFilesList.length === 0) return;

    const maxWatched = Math.max(...(anime.watchedEpisodes || [0]));
    
    // Extraer números de episodio de los nombres de archivo
    const episodeNumbers = localFilesList
      .map(f => extractEpisodeNumber(f.name))
      .filter(num => num !== null);

    const maxLocal = episodeNumbers.length > 0 ? Math.max(...episodeNumbers) : 0;

    if (maxLocal > maxWatched) {
      result.push({
        ...anime,
        newEpisodesCount: maxLocal - maxWatched,
      });
    }
  });

  return result;
}

// Añadidos recientemente: últimos 10 animes añadidos
export function getRecentlyAdded(myAnimes) {
  if (!myAnimes) return [];
  return Object.values(myAnimes)
    .sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt))
    .slice(0, 10);
}

// Verificar si está vacío
export function isLibraryEmpty(myAnimes) {
  if (!myAnimes) return true;
  return Object.keys(myAnimes).length === 0;
}
