import { isAnimeActivelyAiring } from "./airingStatus";
import { extractEpisodeNumber } from "./fileParsing";
import { getBestFolderMatch } from "./libraryView";

function getAnimeIdentity(anime) {
  return String(anime?.malId || anime?.mal_id || anime?.id || anime?.anilistId || "");
}

function getComparableEpisodeNumber(anime, file) {
  if (Number.isFinite(file?.episodeNumber)) {
    return file.episodeNumber;
  }

  return extractEpisodeNumber(file?.name, [
    anime?.title || "",
    anime?.title_english,
    ...(anime?.synonyms || []),
    anime?.folderName,
  ]);
}

function getKnownTotalEpisodes(anime) {
  // Si está en emisión, el total es incierto, así que regresamos 0 para no bloquear progreso
  if (isAnimeActivelyAiring(anime)) {
    return 0;
  }

  const totalEpisodes = Number.parseInt(anime?.totalEpisodes, 10);
  if (Number.isFinite(totalEpisodes) && totalEpisodes > 0) {
    return totalEpisodes;
  }

  const fallbackTotal = Number.parseInt(anime?.episodes, 10);
  if (Number.isFinite(fallbackTotal) && fallbackTotal > 0) {
    return fallbackTotal;
  }

  const listedEpisodes = Array.isArray(anime?.episodeList) ? anime.episodeList.length : 0;
  return listedEpisodes > 0 ? listedEpisodes : 0;
}

function buildDashboardEpisodeState(anime, folderMatch) {
  const localFilesList = Array.isArray(folderMatch?.files)
    ? folderMatch.files.filter((file) => !file.isDownloading)
    : [];

  const watchedEpisodes = Array.isArray(anime?.watchedEpisodes) ? anime.watchedEpisodes.filter(Number.isFinite) : [];
  const maxWatched = watchedEpisodes.length > 0 ? Math.max(...watchedEpisodes) : 0;
  const nextEpisode = maxWatched + 1;

  // Priorizamos file.episodeNumber (ya resuelto por el escaneo) sobre el regex manual
  const episodeNumbers = localFilesList
    .map((file) => (Number.isFinite(file.episodeNumber) ? file.episodeNumber : getComparableEpisodeNumber(anime, file)))
    .filter(Number.isFinite);

  const maxLocalEpisode = episodeNumbers.length > 0 ? Math.max(...episodeNumbers) : 0;

  // Buscamos el archivo del siguiente episodio usando la misma prioridad
  const nextEpisodeFile =
    localFilesList.find((file) => {
      const num = Number.isFinite(file.episodeNumber) ? file.episodeNumber : getComparableEpisodeNumber(anime, file);
      return num === nextEpisode;
    }) || null;

  const knownTotalEpisodes = getKnownTotalEpisodes(anime);
  // El total para progreso es el máximo entre metadata y archivos locales
  const progressTotalEpisodes = Math.max(knownTotalEpisodes, maxLocalEpisode);

  const validWatchedCount = watchedEpisodes.filter(
    (episode) => progressTotalEpisodes === 0 || episode <= progressTotalEpisodes,
  ).length;

  const progress = progressTotalEpisodes > 0 ? Math.round((validWatchedCount / progressTotalEpisodes) * 100) : 0;

  return {
    watchedEpisodes,
    maxWatched,
    nextEpisode,
    nextEpisodeFile,
    episodeNumbers,
    maxLocalEpisode,
    knownTotalEpisodes,
    progressTotalEpisodes,
    validWatchedCount,
    progress,
  };
}

// Continuar viendo: animes con progreso guardado y episodios locales listos

export function getContinueWatching(myAnimes, localFiles = {}, localFilesIndex = null) {
  if (!myAnimes) return [];

  return Object.values(myAnimes)
    .map((anime) => {
      const folderMatch = getBestFolderMatch(anime, localFiles, localFilesIndex);
      const episodeState = buildDashboardEpisodeState(anime, folderMatch);
      const watchedCount = episodeState.watchedEpisodes.length;

      // Si tenemos el ARCHIVO del siguiente episodio, DEBE aparecer, ignorando si la metadata cree que ya terminó
      if (watchedCount === 0 || !episodeState.nextEpisodeFile) {
        return null;
      }

      // Si metadata dice que terminó PERO tenemos el siguiente archivo, la metadata está desactualizada
      const isCompleteByMetaData =
        episodeState.knownTotalEpisodes > 0 && episodeState.maxWatched >= episodeState.knownTotalEpisodes;

      if (isCompleteByMetaData && episodeState.maxLocalEpisode <= episodeState.maxWatched) {
        return null;
      }

      return {
        ...anime,
        nextEpisode: episodeState.nextEpisode,
        nextEpisodeFile: episodeState.nextEpisodeFile,
        progressTotalEpisodes: episodeState.progressTotalEpisodes,
        progressWatchedCount: episodeState.validWatchedCount,
        progress: episodeState.progress,
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const getLastWatch = (anime) => {
        if (!anime.watchHistory?.length) return 0;
        return new Date(anime.watchHistory[anime.watchHistory.length - 1]?.watchedAt || 0).getTime();
      };
      return getLastWatch(b) - getLastWatch(a);
    })
    .slice(0, 20);
}

// Nuevos episodios: animes con capitulos locales superiores al ultimo visto

export function getNewEpisodes(myAnimes, localFiles, localFilesIndex = null, excludedAnimeIds = new Set()) {
  if (!myAnimes || !localFiles) return [];
  const result = [];
  const excludedIds =
    excludedAnimeIds instanceof Set ? excludedAnimeIds : new Set(Array.isArray(excludedAnimeIds) ? excludedAnimeIds : []);

  Object.values(myAnimes).forEach((anime) => {
    const animeId = getAnimeIdentity(anime);
    if (animeId && excludedIds.has(animeId)) {
      return;
    }

    const folderMatch = getBestFolderMatch(anime, localFiles, localFilesIndex);
    const episodeState = buildDashboardEpisodeState(anime, folderMatch);

    if (!episodeState.nextEpisodeFile || episodeState.maxLocalEpisode <= episodeState.maxWatched) {
      return;
    }

    result.push({
      ...anime,
      newEpisodesCount: episodeState.episodeNumbers.filter((episode) => episode > episodeState.maxWatched).length,
      nextEpisode: episodeState.nextEpisode,
      nextEpisodeFile: episodeState.nextEpisodeFile,
      progressTotalEpisodes: episodeState.progressTotalEpisodes,
      progressWatchedCount: episodeState.validWatchedCount,
      progress: episodeState.progress,
    });
  });

  return result;
}

// Anadidos recientemente a la biblioteca

export function getRecentlyAdded(myAnimes) {
  if (!myAnimes) return [];
  return Object.values(myAnimes)
    .sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt))
    .slice(0, 10);
}
