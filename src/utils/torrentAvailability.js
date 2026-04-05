import { findTorrentMatches } from "./torrentMatch";

export function getEpisodeTorrentAvailability(
  animeTitle,
  animeTitleEnglish,
  episodeNumber,
  torrentItems,
  principalFansub,
  torrentAlias = null,
  torrentSearchTerm = null,
  torrentTitle = null,
  synonyms = [],
) {
  const matches = findTorrentMatches(
    animeTitle,
    animeTitleEnglish,
    episodeNumber,
    torrentItems,
    torrentAlias,
    torrentSearchTerm,
    torrentTitle,
    synonyms,
  );
  const hasPrincipalMatch = principalFansub ? matches.some((match) => match.fansub === principalFansub) : false;

  return {
    matches,
    hasPrincipalMatch,
    status: matches.length === 0 ? "missing" : hasPrincipalMatch ? "principal" : "alternative",
  };
}
