function buildTimestamp() {
  return new Date().toISOString();
}

export function clearLinkingMetadata(anime = {}) {
  const sourceAnime = anime ?? {};
  return {
    ...sourceAnime,
    linkSuggestion: null,
    rejectedSuggestion: null,
  };
}

export function acceptSuggestedFolder(anime = {}, folderName) {
  const sourceAnime = anime ?? {};
  return {
    ...sourceAnime,
    folderName: folderName || null,
    linkSuggestion: null,
    rejectedSuggestion: null,
    lastUpdated: buildTimestamp(),
  };
}

export function rejectSuggestedFolder(anime = {}, folderName) {
  const sourceAnime = anime ?? {};
  return {
    ...sourceAnime,
    folderName: null,
    linkSuggestion: null,
    rejectedSuggestion: folderName
      ? {
          folderName,
          rejectedAt: buildTimestamp(),
        }
      : sourceAnime.rejectedSuggestion || null,
    lastUpdated: buildTimestamp(),
  };
}

export function unlinkAnimeFolder(anime = {}) {
  const sourceAnime = anime ?? {};
  const currentFolderName = sourceAnime.folderName || sourceAnime.linkSuggestion?.folderName || null;
  return {
    ...sourceAnime,
    folderName: null,
    linkSuggestion: null,
    rejectedSuggestion: currentFolderName
      ? {
          folderName: currentFolderName,
          rejectedAt: buildTimestamp(),
        }
      : sourceAnime.rejectedSuggestion || null,
    lastUpdated: buildTimestamp(),
  };
}

export function syncAnimeSuggestion(anime, suggestedFolderName = null) {
  if (!anime) {
    return {
      linkSuggestion: null,
      lastUpdated: buildTimestamp(),
    };
  }

  const sourceAnime = anime ?? {};
  const previousSuggestionName = sourceAnime.linkSuggestion?.folderName || null;
  const nextSuggestion = suggestedFolderName
    ? {
        folderName: suggestedFolderName,
        detectedAt:
          previousSuggestionName === suggestedFolderName ? sourceAnime.linkSuggestion.detectedAt : buildTimestamp(),
      }
    : null;

  return {
    ...sourceAnime,
    linkSuggestion: sourceAnime.folderName ? null : nextSuggestion,
    lastUpdated: previousSuggestionName !== (suggestedFolderName || null) ? buildTimestamp() : sourceAnime.lastUpdated,
  };
}
