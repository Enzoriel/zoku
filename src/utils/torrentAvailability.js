import { findTorrentMatches, findTorrentMatchesPrecomputed } from "./torrentMatch";
import { buildTorrentMatchCandidates } from "./titleIdentity";
import { extractEpisodeNumber } from "./fileParsing";

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

export function getBatchEpisodeTorrentAvailability(episodes, torrentItems, principalFansub) {
  // 1. Pre-indexar torrents por episodio: O(T) llamadas a extractEpisodeNumber
  const torrentsByEp = new Map();
  torrentItems.forEach((item) => {
    const ep = extractEpisodeNumber(item.title, []);
    if (ep !== null) {
      if (!torrentsByEp.has(ep)) torrentsByEp.set(ep, []);
      torrentsByEp.get(ep).push(item);
    }
  });

  // 2. Pre-indexar candidatos por anime: O(A) llamadas
  const candidatesByAnime = new Map();
  episodes.forEach(({ anime, stored }) => {
    const animeId = anime.malId || anime.mal_id;
    if (!candidatesByAnime.has(animeId)) {
      candidatesByAnime.set(animeId, buildTorrentMatchCandidates({
        torrentSearchTerm: stored?.torrentSearchTerm,
        torrentAlias: stored?.torrentAlias,
        torrentTitle: stored?.torrentTitle,
        animeTitleRomaji: anime.title,
        animeTitleEnglish: anime.title_english || null,
        synonyms: stored?.synonyms || [],
      }));
    }
  });

  // 3. Matching directo: O(E × T_por_ep) en vez de O(E × T_total)
  const results = {};
  episodes.forEach(({ anime, ep, key }) => {
    const animeId = anime.malId || anime.mal_id;
    const relevantTorrents = torrentsByEp.get(ep) || [];
    const candidates = candidatesByAnime.get(animeId) || [];

    if (relevantTorrents.length === 0 || candidates.length === 0) {
      results[key] = { matches: [], hasPrincipalMatch: false, status: "missing" };
      return;
    }

    const matches = findTorrentMatchesPrecomputed(ep, relevantTorrents, candidates);
    const hasPrincipalMatch = principalFansub
      ? matches.some((m) => m.fansub === principalFansub)
      : false;

    results[key] = {
      matches,
      hasPrincipalMatch,
      status: matches.length === 0 ? "missing" : hasPrincipalMatch ? "principal" : "alternative",
    };
  });

  return results;
}
