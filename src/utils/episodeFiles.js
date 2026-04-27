import { extractEpisodeNumber } from "./fileParsing";

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
