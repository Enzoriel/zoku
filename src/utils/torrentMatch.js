import { extractEpisodeNumber } from "./fileParsing";

// ─── Jaro-Winkler (implementación manual) ─────────────────────────────────────

/**
 * Calcula la distancia Jaro entre dos strings.
 * @param {string} s1
 * @param {string} s2
 * @returns {number} score entre 0 y 1
 */
function jaro(s1, s2) {
  if (s1 === s2) return 1;
  if (!s1.length || !s2.length) return 0;

  const matchWindow = Math.max(Math.floor(Math.max(s1.length, s2.length) / 2) - 1, 0);
  const s1Matches = new Array(s1.length).fill(false);
  const s2Matches = new Array(s2.length).fill(false);

  let matches = 0;
  let transpositions = 0;

  for (let i = 0; i < s1.length; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, s2.length);

    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  let k = 0;
  for (let i = 0; i < s1.length; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  return (matches / s1.length + matches / s2.length + (matches - transpositions / 2) / matches) / 3;
}

/**
 * Calcula el score Jaro-Winkler entre dos strings.
 * @param {string} s1
 * @param {string} s2
 * @param {number} [prefixScale=0.1] peso del prefijo común (máx 0.25)
 * @returns {number} score entre 0 y 1
 */
function jaroWinkler(s1, s2, prefixScale = 0.1) {
  const jaroScore = jaro(s1, s2);

  // Prefijo común (máximo 4 caracteres)
  let prefix = 0;
  const maxPrefix = Math.min(s1.length, s2.length, 4);
  for (let i = 0; i < maxPrefix; i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }

  return jaroScore + prefix * prefixScale * (1 - jaroScore);
}

// ─── Matching de torrents ─────────────────────────────────────────────────────

const MATCH_SCORE_THRESHOLD = 0.72;

/**
 * Dado un título de anime (de AniList), un número de episodio,
 * y el array de TorrentItems del TorrentContext,
 * devuelve los TorrentItems que corresponden a ese episodio.
 *
 * @param {string} animeTitleRomaji - título en romaji de AniList
 * @param {string} animeTitleEnglish - título en inglés de AniList (puede ser null)
 * @param {number} episodeNumber - número del episodio a buscar
 * @param {TorrentItem[]} torrentItems - items del TorrentContext
 * @returns {TorrentItem[]} items que matchean, ordenados por score desc
 */
export function findTorrentMatches(animeTitleRomaji, animeTitleEnglish, episodeNumber, torrentItems) {
  if (!torrentItems?.length || !episodeNumber) return [];

  const titlesToMatch = [animeTitleRomaji, animeTitleEnglish].filter(Boolean);
  if (titlesToMatch.length === 0) return [];

  return torrentItems
    .map((item) => {
      // 1. Extraer número de episodio del título del torrent
      const itemEpisode = extractEpisodeNumber(item.title, titlesToMatch);

      // 2. Si el número de episodio no coincide → descartar
      if (itemEpisode !== episodeNumber) return null;

      // 3. Limpiar el título del torrent para matching
      let cleanTitle = item.title
        .replace(/^\[[^\]]+\]\s*/, "") // fansub
        .replace(/\b(2160p|1080p|720p|480p|360p)\b/gi, "")
        .replace(/\b(HEVC|x265|x264|h265|h264|10bit|8bit)\b/gi, "")
        .replace(/[[\(][a-f0-9]{8}[\]\)]/gi, "") // hash CRC
        .replace(/[-–]\s*\d{1,4}\s*$/, "") // número de episodio al final
        .replace(/[-–]\s*\d{1,4}\s*[-–]/, " ") // número de episodio en medio
        .replace(/\s+/g, " ")
        .trim();

      // 4. Calcular score máximo contra todos los títulos disponibles
      let score = Math.max(
        ...titlesToMatch.map((t) => jaroWinkler(cleanTitle.toLowerCase(), t.toLowerCase())),
      );

      // Penalizar si la diferencia de longitud es masiva (Jaro-Winkler falla con prefijos en strings muy asimétricos)
      const maxTitleLen = Math.max(...titlesToMatch.map(t => t.length));
      const minLen = Math.min(cleanTitle.length, maxTitleLen);
      const maxLen = Math.max(cleanTitle.length, maxTitleLen);
      const lengthRatio = minLen / maxLen;
      
      if (lengthRatio < 0.4) {
        score *= 0.8;
      }

      // 5. Descartar si el score es menor al umbral
      if (score < MATCH_SCORE_THRESHOLD) return null;

      return { item, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item);
}
