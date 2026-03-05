// Continuar viendo: animes en progreso ordenados por último visto
export function getContinueWatching(myAnimes) {
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
  const result = [];

  Object.values(myAnimes).forEach((anime) => {
    const localEpisodes = localFiles[anime.title] || [];
    const maxWatched = Math.max(...(anime.watchedEpisodes || [0]));
    const maxLocal = Math.max(...localEpisodes.map((e) => e.episode), 0);

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
  return Object.values(myAnimes)
    .sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt))
    .slice(0, 10);
}

// Verificar si está vacío
export function isLibraryEmpty(myAnimes) {
  return Object.keys(myAnimes).length === 0;
}
