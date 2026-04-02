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

/**
 * Normaliza una cadena eliminando todo lo que no sea alfanumérico.
 * @param {string} str 
 * @returns {string}
 */
function superNormalize(str) {
  if (!str) return "";
  return str.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// ─── Matching de torrents ─────────────────────────────────────────────────────

const MATCH_SCORE_THRESHOLD = 0.75; // Aumentamos ligeramente de 0.72

/**
 * Dado un título de anime (de AniList), un número de episodio,
 * y el array de TorrentItems del TorrentContext,
 * devuelve los TorrentItems que corresponden a ese episodio.
 *
 * @param {string} animeTitleRomaji - título en romaji de AniList
 * @param {string} animeTitleEnglish - título en inglés de AniList (puede ser null)
 * @param {number} episodeNumber - número del episodio a buscar
 * @param {TorrentItem[]} torrentItems - items del TorrentContext
 * @param {string} torrentAlias - Alias opcional vinculado manualmente por el usuario
 * @returns {TorrentItem[]} items que matchean, ordenados por score desc
 */
export function findTorrentMatches(animeTitleRomaji, animeTitleEnglish, episodeNumber, torrentItems, torrentAlias = null) {
  if (!torrentItems?.length || !episodeNumber) return [];

  const titlesToMatch = Array.from(
    new Set([torrentAlias, torrentAlias ? extractAliasFromTitle(torrentAlias) : null, animeTitleRomaji, animeTitleEnglish].filter(Boolean)),
  );
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
      let score = 0;
      let matchedTitle = "";
      
      titlesToMatch.forEach(t => {
        const jw = jaroWinkler(cleanTitle.toLowerCase(), t.toLowerCase());
        
        // Bonus por coincidencia de palabras (similar a AnimeDetails)
        const getWords = (s) => s.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2);
        const wT = getWords(cleanTitle);
        const wA = getWords(t);
        
        let wordScore = 0;
        if (wT.length > 0 && wA.length > 0) {
            const matchesCount = wA.filter(w => wT.includes(w)).length;
            wordScore = matchesCount / Math.max(wA.length, wT.length);
        }

        const compositeScore = Math.max(jw, wordScore);

        if (compositeScore > score) {
          score = compositeScore;
          matchedTitle = t;
        }
      });

      // 5. Normalización agresiva y validación cruzada
      const normTorrent = superNormalize(cleanTitle);
      const normAnime = superNormalize(matchedTitle);

      // Si el título es largo y no se contienen, penalizamos si el score no es perfecto
      if (normAnime.length > 5) {
        const contains = normTorrent.includes(normAnime) || normAnime.includes(normTorrent);
        if (!contains && score < 0.95) {
          score *= 0.8; 
        }
      }

      // 6. Descartar si el score es menor al umbral
      if (score < MATCH_SCORE_THRESHOLD) return null;

      return { item, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item);
}

/**
 * Extrae el alias de Nyaa de un título de torrent ruidoso.
 * @param {string} rawTitle 
 * @returns {string}
 */
export function extractAliasFromTitle(rawTitle) {
  if (!rawTitle) return "";
  
  const fansubMatch = rawTitle.match(/^(\[[^\]]+\])/);
  const fansubPart = fansubMatch ? fansubMatch[1] : "";
  
  let titlePart = rawTitle
    .replace(/^\[[^\]]+\]\s*/, "") // fansub
    .replace(/\s*-\s*\d+.*$/, "") // ep
    .replace(/\s*-\s*v\d+.*$/, "") // v2
    .replace(/\b(2160p|1080p|720p|480p|360p)\b/gi, "")
    .replace(/\b(HEVC|x265|x264|h265|h264|10bit|8bit)\b/gi, "")
    .replace(/[[\(][a-f0-9]{8}[\]\)]/gi, "") // hash
    .replace(/\s+\d+.*$/, "") // ep (space)
    .replace(/[\[\(].*$/, "") // metadata tags
    .trim();

  return fansubPart ? `${fansubPart} ${titlePart}` : titlePart;
}
