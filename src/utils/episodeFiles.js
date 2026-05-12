import { extractEpisodeNumber } from "./fileParsing";

function getDetectedEpisodeNumber(file) {
  if (Number.isFinite(file?.episodeNumber)) return file.episodeNumber;
  return extractEpisodeNumber(file?.name, []);
}

function buildSequentialEpisodes(start, total) {
  return Array.from({ length: Math.max(total, 0) }, (_, index) => start + index);
}

export function buildVisibleEpisodeNumbers({ apiTotal = 0, files = [] } = {}) {
  const normalizedApiTotal = Number.isFinite(Number(apiTotal)) ? Math.max(Number(apiTotal), 0) : 0;
  const localEpisodeNumbers = Array.from(
    new Set(
      (files || [])
        .map(getDetectedEpisodeNumber)
        .filter((episodeNumber) => Number.isFinite(episodeNumber) && episodeNumber >= 0),
    ),
  ).sort((first, second) => first - second);

  const hasEpisodeZero = localEpisodeNumbers.includes(0);
  const localMaxEpisode = localEpisodeNumbers.length > 0 ? Math.max(...localEpisodeNumbers) : 0;

  if (hasEpisodeZero && normalizedApiTotal > 0) {
    const localCountMatchesApi = localEpisodeNumbers.length === normalizedApiTotal;
    const localRangeMatchesZeroBasedApi = localMaxEpisode === normalizedApiTotal - 1;

    if (localCountMatchesApi && localRangeMatchesZeroBasedApi) {
      return buildSequentialEpisodes(0, normalizedApiTotal);
    }
  }

  const totalEps =
    normalizedApiTotal > 0
      ? Math.max(normalizedApiTotal, Math.min(localMaxEpisode, normalizedApiTotal))
      : Math.max(normalizedApiTotal, localMaxEpisode);

  const standardEpisodes = buildSequentialEpisodes(1, totalEps || 1);
  return hasEpisodeZero ? [0, ...standardEpisodes] : standardEpisodes;
}

function matchesEpisode(file, epNum, episodes, mainAnime, folderName) {
  const detectedEpisode =
    file.episodeNumber ??
    extractEpisodeNumber(file.name, [
      mainAnime?.title,
      mainAnime?.title_english,
      ...(mainAnime?.synonyms || []),
      folderName,
    ]);

  if (detectedEpisode !== null) return detectedEpisode === epNum;
  return epNum === 1 && episodes.length === 1;
}

export function buildEpisodeFileMap({ episodes = [], files = [], mainAnime = null, folderName = "" }) {
  const episodeFileMap = new Map();

  episodes.forEach((epNum) => {
    episodeFileMap.set(
      epNum,
      files.filter((file) => matchesEpisode(file, epNum, episodes, mainAnime, folderName)),
    );
  });

  return episodeFileMap;
}
