/**
 * Extrae el número de episodio del nombre del archivo de forma avanzada.
 * @param {string} fileName Nombre del archivo
 * @param {string|string[]} ignoreContext Uno o varios strings que deberían ignorarse (como el título del anime)
 * @returns {number|null} El número de episodio detectado
 */
export function extractEpisodeNumber(fileName, ignoreContext = []) {
  if (!fileName) return null;

  let name = fileName.toLowerCase();
  const nameWithoutExt = name.substring(0, name.lastIndexOf(".")) || name;
  let cleanName = nameWithoutExt;

  // Limpieza de HASH/CRC (ej: [E0D8E966]) al inicio para evitar que sus números confundan al detector
  cleanName = cleanName.replace(/[\[\(\s][a-f0-9]{8}[\]\)\s]*$/i, " ");

  // Elimina tags de Fansub como [Erai-raws] o [Subs]
  cleanName = cleanName.replace(/^\[[^\]]+\]\s*/, "");

  const noise = [
    "1080p",
    "720p",
    "480p",
    "2160p",
    "4k",
    "x264",
    "x265",
    "h264",
    "h265",
    "hevc",
    "10bit",
    "8bit",
    "v2",
    "v3",
    "batch",
    "web",
    "bluray",
  ];
  noise.forEach((n) => {
    cleanName = cleanName.replace(new RegExp(`\\b${n}\\b`, "g"), " ");
  });

  cleanName = cleanName
    .replace(/\bs(?:eason)?\s*\d{1,2}\b/gi, " ")
    .replace(/\b\d{1,2}(?:st|nd|rd|th)\s+season\b/gi, " ");

  // El patrón "Nombre - 01" es el estándar más fiable en la industria del anime
  const lastHyphenIndex = cleanName.lastIndexOf(" - ");
  if (lastHyphenIndex !== -1) {
    const afterHyphen = cleanName.substring(lastHyphenIndex + 3).trim();
    const match = afterHyphen.match(/^0*(\d{1,3})(?:\b|[^0-9])/);
    if (match) return parseInt(match[1], 10);
  }

  // Elimina el título de la serie del nombre para evitar números falsos (ej: el "29" en "29-sai...")
  const context = Array.isArray(ignoreContext) ? ignoreContext : [ignoreContext];
  context.forEach((item) => {
    if (item && typeof item === "string") {
      const escaped = item.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      cleanName = cleanName.replace(new RegExp(escaped, "g"), " ");
    }
  });

  cleanName = cleanName
    .replace(/\bs(?:eason)?\s*\d{1,2}\b/gi, " ")
    .replace(/\b\d{1,2}(?:st|nd|rd|th)\s+season\b/gi, " ");

  // Busca prefijos explícitos de episodio
  const priorityMatch = cleanName.match(/(?:ep|e|cap|episode|episode\s|ep\s)0*(\d{1,4})(?:\b|[^0-9])/i);
  if (priorityMatch) return parseInt(priorityMatch[1], 10);

  // Fallback para películas: si no hay número pero indica "movie/film", asumimos Ep 1
  const isMovieKeywords = cleanName.includes("movie") || cleanName.includes("film") || name.includes("movie");
  if (isMovieKeywords) {
    const anyNumber = cleanName.match(/\d+/);
    if (!anyNumber || parseInt(anyNumber[0], 10) === 1) return 1;
  }

  const allNumbers = cleanName.match(/\d{1,4}/g);
  if (allNumbers) {
    // Filtramos números que parezcan años (1970-2030)
    const nonYearNumbers = allNumbers.filter((n) => {
      const num = parseInt(n, 10);
      return !(num >= 1970 && num <= 2030);
    });

    if (nonYearNumbers.length > 0) {
      return parseInt(nonYearNumbers[nonYearNumbers.length - 1], 10);
    }
    return parseInt(allNumbers[0], 10);
  }

  return null;
}

/**
 * Detecta números que aparecen en TODOS los archivos de una carpeta.
 * Estos números son parte del título, no números de episodio.
 * Útil para títulos como "86", "7Seeds", "re:zero season 2", etc.
 * @param {string[]} fileNames Lista de nombres de archivo
 * @returns {number[]} Números constantes entre todos los archivos
 */
export function detectConstantNumbers(fileNames) {
  if (!fileNames || fileNames.length < 2) return [];

  const numbersPerFile = fileNames.map((name) => {
    const clean = name.toLowerCase().replace(/\.[^/.]+$/, "");
    return (clean.match(/\d+/g) || []).map(Number);
  });

  const first = numbersPerFile[0];
  return first.filter((num) => numbersPerFile.every((nums) => nums.includes(num)));
}
