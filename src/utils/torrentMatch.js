import { extractEpisodeNumber } from "./fileParsing";
import { buildTorrentMatchCandidates, extractBaseTitle } from "./titleIdentity";

function jaro(s1, s2) {
  if (s1 === s2) return 1;
  if (!s1.length || !s2.length) return 0;

  const matchWindow = Math.max(Math.floor(Math.max(s1.length, s2.length) / 2) - 1, 0);
  const s1Matches = new Array(s1.length).fill(false);
  const s2Matches = new Array(s2.length).fill(false);

  let matches = 0;
  let transpositions = 0;

  for (let i = 0; i < s1.length; i += 1) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, s2.length);

    for (let j = start; j < end; j += 1) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches += 1;
      break;
    }
  }

  if (matches === 0) return 0;

  let k = 0;
  for (let i = 0; i < s1.length; i += 1) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k += 1;
    if (s1[i] !== s2[k]) transpositions += 1;
    k += 1;
  }

  return (matches / s1.length + matches / s2.length + (matches - transpositions / 2) / matches) / 3;
}

function jaroWinkler(s1, s2, prefixScale = 0.1) {
  const jaroScore = jaro(s1, s2);

  let prefix = 0;
  const maxPrefix = Math.min(s1.length, s2.length, 4);
  for (let i = 0; i < maxPrefix; i += 1) {
    if (s1[i] === s2[i]) prefix += 1;
    else break;
  }

  return jaroScore + prefix * prefixScale * (1 - jaroScore);
}

function superNormalize(str) {
  if (!str) return "";
  return str.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function toUniqueTitles(values) {
  return Array.from(new Set((values || []).filter(Boolean)));
}

function buildTitleVariants(value) {
  if (!value) return [];
  const baseTitle = extractBaseTitle(value);
  return toUniqueTitles([value, baseTitle]);
}

function getWords(value) {
  return String(value || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2);
}

const MATCH_SCORE_THRESHOLD = 0.75;

export function findTorrentMatches(
  animeTitleRomaji,
  animeTitleEnglish,
  episodeNumber,
  torrentItems,
  torrentAlias = null,
  torrentSearchTerm = null,
  torrentTitle = null,
  synonyms = [],
) {
  if (!torrentItems?.length || !Number.isFinite(episodeNumber)) return [];

  const titlesToMatch = toUniqueTitles(
    buildTorrentMatchCandidates({
      torrentSearchTerm,
      torrentAlias,
      torrentTitle,
      animeTitleRomaji,
      animeTitleEnglish,
      synonyms,
    }).flatMap((value) => buildTitleVariants(value)),
  );

  if (titlesToMatch.length === 0) return [];

  return torrentItems
    .map((item) => {
      const itemEpisode = extractEpisodeNumber(item.title, titlesToMatch);
      if (itemEpisode !== episodeNumber) return null;

      const cleanTitle = extractBaseTitle(item.title);
      if (!cleanTitle) return null;

      let score = 0;
      let matchedTitle = "";

      titlesToMatch.forEach((candidate) => {
        const jw = jaroWinkler(cleanTitle.toLowerCase(), candidate.toLowerCase());
        const torrentWords = getWords(cleanTitle);
        const candidateWords = getWords(candidate);

        let wordScore = 0;
        if (torrentWords.length > 0 && candidateWords.length > 0) {
          const shared = candidateWords.filter((word) => torrentWords.includes(word)).length;
          wordScore = shared / Math.max(candidateWords.length, torrentWords.length);
        }

        const compositeScore = Math.max(jw, wordScore);
        if (compositeScore > score) {
          score = compositeScore;
          matchedTitle = candidate;
        }
      });

      const normTorrent = superNormalize(cleanTitle);
      const normAnime = superNormalize(extractBaseTitle(matchedTitle) || matchedTitle);

      if (normAnime.length > 5) {
        const contains = normTorrent.includes(normAnime) || normAnime.includes(normTorrent);
        if (!contains && score < 0.95) {
          score *= 0.8;
        }
      }

      if (score < MATCH_SCORE_THRESHOLD) return null;
      return { item, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item);
}

export function findTorrentMatchesPrecomputed(episodeNumber, filteredTorrents, resolvedCandidates) {
  if (!filteredTorrents?.length || !Number.isFinite(episodeNumber) || !resolvedCandidates?.length) return [];

  const titlesToMatch = toUniqueTitles(
    resolvedCandidates.flatMap((value) => buildTitleVariants(value)),
  );
  if (titlesToMatch.length === 0) return [];

  return filteredTorrents
    .map((item) => {
      const itemEpisode = extractEpisodeNumber(item.title, titlesToMatch);
      if (itemEpisode !== episodeNumber) return null;

      const cleanTitle = extractBaseTitle(item.title);
      if (!cleanTitle) return null;

      let score = 0;
      let matchedTitle = "";

      titlesToMatch.forEach((candidate) => {
        const jw = jaroWinkler(cleanTitle.toLowerCase(), candidate.toLowerCase());
        const torrentWords = getWords(cleanTitle);
        const candidateWords = getWords(candidate);

        let wordScore = 0;
        if (torrentWords.length > 0 && candidateWords.length > 0) {
          const shared = candidateWords.filter((word) => torrentWords.includes(word)).length;
          wordScore = shared / Math.max(candidateWords.length, torrentWords.length);
        }

        const compositeScore = Math.max(jw, wordScore);
        if (compositeScore > score) {
          score = compositeScore;
          matchedTitle = candidate;
        }
      });

      const normTorrent = superNormalize(cleanTitle);
      const normAnime = superNormalize(extractBaseTitle(matchedTitle) || matchedTitle);

      if (normAnime.length > 5) {
        const contains = normTorrent.includes(normAnime) || normAnime.includes(normTorrent);
        if (!contains && score < 0.95) {
          score *= 0.8;
        }
      }

      if (score < MATCH_SCORE_THRESHOLD) return null;
      return { item, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item);
}
