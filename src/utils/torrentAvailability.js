import { findTorrentMatches, findTorrentMatchesPrecomputed } from "./torrentMatch";
import { buildTorrentMatchCandidates } from "./titleIdentity";
import { extractEpisodeNumber } from "./fileParsing";

function hasPreferredFansubMatch(matches, preferredFansub) {
  if (!preferredFansub) return false;

  const normalizedPreferredFansub = preferredFansub.toLowerCase();
  const extractedFansubs = matches
    .map((match) => {
      if (typeof match?.fansub === "string" && match.fansub.trim()) {
        return match.fansub.trim();
      }

      const title = typeof match?.title === "string" ? match.title : typeof match?.item?.title === "string" ? match.item.title : "";
      const bracketMatches = [...String(title).matchAll(/\[([^\]]+)\]/g)];
      return bracketMatches.length > 0 ? bracketMatches[bracketMatches.length - 1][1].trim() : "";
    })
    .filter(Boolean);

  if (extractedFansubs.length === 0) {
    return matches.length > 0;
  }

  return extractedFansubs.some((fansub) => fansub.toLowerCase() === normalizedPreferredFansub);
}

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
  const hasPrincipalMatch = hasPreferredFansubMatch(matches, principalFansub);

  return {
    matches,
    hasPrincipalMatch,
    status: matches.length === 0 ? "missing" : hasPrincipalMatch ? "principal" : "alternative",
  };
}

export function getBatchEpisodeTorrentAvailability(episodes, torrentItems, principalFansub) {
  // 1. Pre-indexar candidatos por anime: O(A) llamadas
  const candidatesByAnime = new Map();
  const indexedTorrentsByFeed = new Map();
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

  // 2. Matching directo: O(E × T_por_ep) en vez de O(E × T_total)
  const results = {};
  episodes.forEach(({ anime, ep, key, torrentItems: episodeTorrentItems, assignedFansub }) => {
    const animeId = anime.malId || anime.mal_id;
    const itemsForEpisode = Array.isArray(episodeTorrentItems) ? episodeTorrentItems : torrentItems;
    const feedKey = assignedFansub || "__fallback__";
    if (!indexedTorrentsByFeed.has(feedKey)) {
      const torrentsByEp = new Map();
      (itemsForEpisode || []).forEach((item) => {
        const detectedEp = extractEpisodeNumber(item.title, []);
        if (detectedEp === null) return;
        if (!torrentsByEp.has(detectedEp)) torrentsByEp.set(detectedEp, []);
        torrentsByEp.get(detectedEp).push(item);
      });
      indexedTorrentsByFeed.set(feedKey, torrentsByEp);
    }

    const relevantTorrents = indexedTorrentsByFeed.get(feedKey)?.get(ep) || [];
    const candidates = candidatesByAnime.get(animeId) || [];

    if (relevantTorrents.length === 0 || candidates.length === 0) {
      results[key] = { matches: [], hasPrincipalMatch: false, status: "missing" };
      return;
    }

    const matches = findTorrentMatchesPrecomputed(ep, relevantTorrents, candidates);
    const effectiveFansub = assignedFansub || principalFansub;
    const hasPrincipalMatch = hasPreferredFansubMatch(matches, effectiveFansub);

    results[key] = {
      matches,
      hasPrincipalMatch,
      status: matches.length === 0 ? "missing" : hasPrincipalMatch ? "principal" : "alternative",
    };
  });

  return results;
}
