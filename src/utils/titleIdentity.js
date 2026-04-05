function stripFileExtension(value = "") {
  return String(value).replace(/\.[^/.]+$/, "");
}

export function normalizeForSearch(text) {
  if (!text) return "";
  return String(text)
    .toLowerCase()
    .replace(/[ \-_.:]+/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
}

export function extractBaseTitle(fileName) {
  if (!fileName) return "";

  let name = stripFileExtension(fileName);
  name = name.replace(/\[.*?\]/g, "");
  name = name.replace(/\(.*?\)/g, "");
  name = name.replace(/\{.*?\}/g, "");

  const junk = [
    /2160p/gi,
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

  const episodePattern = /[ \-_.]+(?:\d{1,4}|\b(?:ep|e)\d{1,4})\b/gi;
  const endingPattern = /\b(end|final|ova|special|movie|film)\b/i;

  const matches = [...name.matchAll(episodePattern)];
  if (matches.length > 0) {
    const lastMatch = matches[matches.length - 1];
    name = name.substring(0, lastMatch.index);
  } else {
    const endingMatch = name.match(endingPattern);
    if (endingMatch) {
      name = name.substring(0, endingMatch.index);
    }
  }

  name = name.replace(/^[ \-_.:]+|[ \-_.:]+$/g, "");
  name = name.replace(/\s+/g, " ");

  return name.trim() || stripFileExtension(fileName);
}

export function deriveTorrentAliasFromTitle(rawTitle) {
  if (!rawTitle) return "";

  const groupMatch = String(rawTitle).match(/^\s*(\[[^\]]+\])\s*(.*)$/);
  const group = groupMatch ? groupMatch[1].trim() : "";
  const titlePart = groupMatch ? groupMatch[2] : rawTitle;
  const baseTitle = extractBaseTitle(titlePart);

  if (!baseTitle) {
    return String(rawTitle).trim();
  }

  return group ? `${group} ${baseTitle}`.trim() : baseTitle;
}

export function buildTorrentMatchCandidates({
  torrentSearchTerm = null,
  torrentAlias = null,
  torrentTitle = null,
  animeTitleRomaji = null,
  animeTitleEnglish = null,
  synonyms = [],
} = {}) {
  return Array.from(
    new Set(
      [
        torrentSearchTerm,
        torrentAlias,
        torrentTitle ? deriveTorrentAliasFromTitle(torrentTitle) : null,
        animeTitleRomaji,
        animeTitleEnglish,
        ...(Array.isArray(synonyms) ? synonyms : []),
      ].filter(Boolean),
    ),
  );
}
