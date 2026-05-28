const VIDEO_EXTENSIONS_PATTERN = /\.(?:mkv|mp4|avi|webm|mov|m4v|flv|wmv)$/i;
const TEMP_EXTENSIONS_PATTERN = /\.(?:!qb|part|bc!|crdownload|tmp)$/i;

function stripKnownFileExtension(value) {
  return String(value || "")
    .replace(TEMP_EXTENSIONS_PATTERN, "")
    .replace(VIDEO_EXTENSIONS_PATTERN, "");
}

function normalizeEpisodeSeparators(value) {
  return String(value || "")
    .replace(/[._]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function removeTechnicalMetadata(value) {
  let clean = value;

  [
    /\b(?:2160|1080|720|480|360)p\b/gi,
    /\b4k\b/gi,
    /\b[\,.\s_-]*[xh][\s._-]?26[45]\b/gi,
    /\bhevc\b/gi,
    /\baac\d?(?:[._]\d)?\b/gi,
    /\b(?:10|8)bit\b/gi,
    /\bv[23]\b/gi,
    /\bbatch\b/gi,
    /\bweb(?:[._-]?dl)?\b/gi,
    /\bbluray\b/gi,
    /\b(?:jpn|multi|msubs?|subs?|toons?hub|cr)\b/gi,
  ].forEach((pattern) => {
    clean = clean.replace(pattern, " ");
  });

  return clean;
}

function removeSeasonMarkers(value) {
  return value
    .replace(/\bs(?:eason)?\s*\d{1,2}\b/gi, " ")
    .replace(/\b\d{1,2}(?:st|nd|rd|th)\s+season\b/gi, " ")
    .replace(/\b\d{1,2}\s*[-\s\u2013\u2014~.]*\s*(?:ova|ona|oad|special|movie|film)\b/gi, " ");
}

/**
 * Extrae el numero de episodio del nombre del archivo de forma avanzada.
 * @param {string} fileName Nombre del archivo
 * @param {string|string[]} ignoreContext Uno o varios strings que deberian ignorarse (como el titulo del anime)
 * @returns {number|null} El numero de episodio detectado
 */
export function extractEpisodeNumber(fileName, ignoreContext = []) {
  if (!fileName) return null;

  const name = stripKnownFileExtension(fileName).toLowerCase();
  const normalizedName = normalizeEpisodeSeparators(name);
  let cleanName = name;

  const seasonEpisodeMatch =
    normalizedName.match(/(?:^|[^a-z0-9])s\d{1,2}\s*e\s*0*(\d{1,4})(?:\b|[^0-9])/i) ||
    normalizedName.match(/(?:^|[^a-z0-9])\d{1,2}x0*(\d{1,4})(?:\b|[^0-9])/i);
  if (seasonEpisodeMatch) return parseInt(seasonEpisodeMatch[1], 10);

  // Limpieza de HASH/CRC (ej: [E0D8E966]) al final para evitar numeros falsos.
  cleanName = cleanName.replace(/[\[\(\s][a-f0-9]{8}[\]\)\s]*$/i, " ");

  // Elimina tags de Fansub como [Erai-raws] o [Subs].
  cleanName = cleanName.replace(/^\[[^\]]+\]\s*/, "");

  // Elimina bloques [metadata] restantes (codec, audio, resolucion, subs, etc.).
  cleanName = cleanName.replace(/\[[^\]]*\]/g, " ");
  cleanName = removeTechnicalMetadata(cleanName);
  cleanName = removeSeasonMarkers(cleanName);

  // El patron "Nombre - 01" es el estandar mas fiable en naming de anime.
  const lastHyphenIndex = cleanName.lastIndexOf(" - ");
  if (lastHyphenIndex !== -1) {
    const afterHyphen = cleanName.substring(lastHyphenIndex + 3).trim();
    const match = afterHyphen.match(/^0*(\d{1,3})(?:\b|[^0-9])/);
    if (match) return parseInt(match[1], 10);
  }

  // Elimina el titulo/contexto para evitar numeros falsos dentro del nombre de la serie.
  const context = Array.isArray(ignoreContext) ? ignoreContext : [ignoreContext];
  context.forEach((item) => {
    if (item && typeof item === "string") {
      const escapedRaw = escapeRegExp(item.toLowerCase());
      const escapedNormalized = escapeRegExp(normalizeEpisodeSeparators(item.toLowerCase()));

      cleanName = cleanName.replace(new RegExp(escapedRaw, "g"), " ");
      cleanName = normalizeEpisodeSeparators(cleanName).replace(new RegExp(escapedNormalized, "g"), " ");
    }
  });

  cleanName = removeSeasonMarkers(normalizeEpisodeSeparators(removeTechnicalMetadata(cleanName)));

  // Busca prefijos explicitos de episodio.
  const priorityMatch = cleanName.match(/(?:^|[^a-z])(?:ep|e|cap|episode)\s*0*(\d{1,4})(?:\b|[^0-9])/i);
  if (priorityMatch) return parseInt(priorityMatch[1], 10);

  // Fallback para peliculas: si no hay numero pero indica "movie/film", asumimos Ep 1.
  const isMovieKeywords = cleanName.includes("movie") || cleanName.includes("film") || name.includes("movie");
  if (isMovieKeywords) {
    const anyNumber = cleanName.match(/\d+/);
    if (!anyNumber || parseInt(anyNumber[0], 10) === 1) return 1;
  }

  const allNumbers = cleanName.match(/\d{1,4}/g);
  if (allNumbers) {
    const nonYearNumbers = allNumbers.filter((n) => {
      const num = parseInt(n, 10);
      return !(num >= 1970 && num <= 2030);
    });

    if (nonYearNumbers.length > 0) {
      return parseInt(nonYearNumbers[nonYearNumbers.length - 1], 10);
    }
    return null;
  }

  return null;
}

/**
 * Detecta numeros que aparecen en TODOS los archivos de una carpeta.
 * Estos numeros son parte del titulo, no numeros de episodio.
 * Util para titulos como "86", "7Seeds", "re:zero season 2", etc.
 * @param {string[]} fileNames Lista de nombres de archivo
 * @returns {number[]} Numeros constantes entre todos los archivos
 */
export function detectConstantNumbers(fileNames) {
  if (!fileNames || fileNames.length < 2) return [];

  const numbersPerFile = fileNames.map((name) => {
    const clean = stripKnownFileExtension(name).toLowerCase();
    return (clean.match(/\d+/g) || []).map(Number);
  });

  const first = numbersPerFile[0];
  return first.filter((num) => numbersPerFile.every((nums) => nums.includes(num)));
}
