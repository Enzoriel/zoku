export function stripFileExtension(value) {
  let name = String(value);
  // Elimina extensiones temporales de descarga comunes
  name = name.replace(/\.(?:!qb|part|bc!|crdownload|tmp)$/i, "");
  // Elimina la extensión real (.mkv, .mp4, etc.)
  return name.replace(/\.[^/.]+$/, "");
}

export function normalizeForSearch(text) {
  if (!text) return "";

  const raw = String(text).toLowerCase();
  let normalized = raw
    .replace(/[-_.:]+/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .trim()
    .replace(/\s+/g, " ");

  if (!/\d/.test(normalized) && !/[-_.:]/.test(raw) && /\s{2,}/.test(raw)) {
    normalized = normalized.replace(/\s+/g, "");
  }

  return normalized;
}

export function extractBaseTitle(fileName) {
  if (!fileName) return "";

  let name = stripFileExtension(fileName);
  name = name.replace(/\[.*?\]/g, "");
  name = name.replace(/\(.*?\)/g, "");
  name = name.replace(/\{.*?\}/g, "");

  const junk = [
    /2160p/gi,
    /4k/gi,
    /1080p/gi,
    /720p/gi,
    /480p/gi,
    /360p/gi,
    /bdrip/gi,
    /h264/gi,
    /x264/gi,
    /h265/gi,
    /x265/gi,
    /hevc/gi,
    /10bit/gi,
    /8bit/gi,
    /multi-?subs?/gi,
    /aac/gi,
    /dual-audio/gi,
    /bluray/gi,
    /web-?dl/gi,
    /hd/gi,
    /remux/gi,
  ];

  junk.forEach((pattern) => {
    name = name.replace(pattern, "");
  });

  name = name.replace(/\bS[0-9]{1,2}\b/gi, "");
  name = name.replace(/\bSeason [0-9]{1,2}\b/gi, "");
  name = name.replace(/\bv[0-9]{1}\b/gi, "");

  name = name.replace(
    /(?:[ \-_.]+(?:(?:episode|ep|e|cap)\s*)?\d{1,4}(?:v\d{1,2})?(?:\s*[-~]\s*\d{1,4})?)\s*$/i,
    "",
  );
  name = name.replace(/(?:[ \-_.]+)(?:end|final|ova|special|movie|film)\s*$/i, "");

  name = name.replace(/^[ \-_.:]+|[ \-_.:]+$/g, "");
  name = name.replace(/\s+/g, " ");

  return name.trim() || stripFileExtension(fileName);
}

export function deriveTorrentAliasFromTitle(rawTitle) {
  if (!rawTitle) return "";

  const groupMatch = String(rawTitle).match(/^\s*(\[[^\]]+\])\s*(.*)$/);
  const group = groupMatch ? groupMatch[1].trim() : "";
  const titlePart = groupMatch ? groupMatch[2] : rawTitle;
  const trimmedTitlePart = String(titlePart || "").trim();

  if (group && /^\d{1,4}(?:\s*[-~]\s*\d{1,4})?$/.test(trimmedTitlePart)) {
    return group;
  }

  const baseTitle = extractBaseTitle(titlePart);

  if (!baseTitle) {
    return group || String(rawTitle).trim();
  }

  return group ? `${group} ${baseTitle}`.trim() : baseTitle;
}

export function buildTorrentMatchCandidates(input = {}) {
  const {
    torrentSearchTerm = null,
    torrentAlias = null,
    torrentTitle = null,
    animeTitleRomaji = null,
    animeTitleEnglish = null,
    synonyms = [],
  } = input || {};
  const normalizedSynonyms = Array.isArray(synonyms) ? synonyms : synonyms ? [synonyms] : [];

  return Array.from(
    new Set(
      [
        torrentSearchTerm,
        torrentAlias,
        torrentTitle ? deriveTorrentAliasFromTitle(torrentTitle) : null,
        animeTitleRomaji,
        animeTitleEnglish,
        ...normalizedSynonyms,
      ].filter(Boolean),
    ),
  );
}
