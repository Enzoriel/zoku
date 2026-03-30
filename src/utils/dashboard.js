import { extractEpisodeNumber } from "./fileParsing";

// Continuar viendo: animes con progreso guardado y episodios locales listos

export function getContinueWatching(myAnimes, localFiles = {}) {
  if (!myAnimes) return [];

  return (
    Object.values(myAnimes)
      .filter((anime) => {
        const watched = anime.watchedEpisodes?.length || 0;
        const total = anime.totalEpisodes || anime.episodes || 0;
        // Tiene progreso y no está completo
        return watched > 0 && (total === 0 || watched < total);
      })
      .map((anime) => {
        const watched = anime.watchedEpisodes || [];
        const lastEp = watched.length > 0 ? Math.max(...watched) : 0;
        const nextEp = lastEp + 1;
        const total = anime.totalEpisodes || anime.episodes || 0;

        const animeTitle = anime.title || "";
        const localData = localFiles[animeTitle] || localFiles[anime.folderName] || { files: [] };
        const nextFile = localData.files.find((f) => {
          const epNum = extractEpisodeNumber(f.name, [animeTitle, anime.folderName]);
          return epNum !== null && epNum === nextEp;
        });

        const validWatched = watched.filter((ep) => total === 0 || ep <= total);

        return {
          ...anime,
          nextEpisode: nextEp,
          nextEpisodeFile: nextFile,
          progress: total > 0 ? Math.round((validWatched.length / total) * 100) : 0,
        };
      })
      // El usuario pidió que si no está descargado no aparezca allí (en Continuar viendo)
      .filter((anime) => !!anime.nextEpisodeFile)
      .sort((a, b) => {
        const getLastWatch = (anime) => {
          if (!anime.watchHistory?.length) return 0;
          return new Date(anime.watchHistory[anime.watchHistory.length - 1]?.watchedAt || 0).getTime();
        };
        return getLastWatch(b) - getLastWatch(a);
      })
      .slice(0, 20)
  );
}

// Nuevos episodios: animes con capítulos locales superiores al último visto

export function getNewEpisodes(myAnimes, localFiles) {
  if (!myAnimes || !localFiles) return [];
  const result = [];

  Object.values(myAnimes).forEach((anime) => {
    const animeTitle = anime.title;
    const localData = localFiles[animeTitle] || localFiles[anime.folderName];
    const localFilesList = localData && Array.isArray(localData.files) ? localData.files : [];

    if (localFilesList.length === 0) return;

    const watched = anime.watchedEpisodes || [];
    const maxWatched = watched.length > 0 ? Math.max(...watched) : 0;

    const episodeNumbers = localFilesList
      .map((f) => extractEpisodeNumber(f.name, [animeTitle, anime.folderName]))
      .filter((num) => num !== null);

    const maxLocal = episodeNumbers.length > 0 ? Math.max(...episodeNumbers) : 0;

    if (maxLocal > maxWatched) {
      const nextEp = maxWatched + 1;
      const nextFile = localFilesList.find((f) => {
        const epNum = extractEpisodeNumber(f.name, [animeTitle, anime.folderName]);
        return epNum !== null && epNum === nextEp;
      });

      // Solo lo añadimos si no está "terminado"
      const total = anime.totalEpisodes || anime.episodes || 0;
      if (total === 0 || maxWatched < total) {
        result.push({
          ...anime,
          newEpisodesCount: maxLocal - maxWatched,
          nextEpisode: nextEp,
          nextEpisodeFile: nextFile,
        });
      }
    }
  });

  return result;
}

// Añadidos recientemente a la biblioteca

export function getRecentlyAdded(myAnimes) {
  if (!myAnimes) return [];
  return Object.values(myAnimes)
    .sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt))
    .slice(0, 10);
}

