function buildTimestamp() {
  return new Date().toISOString();
}

export function clearLinkingMetadata(anime = {}) {
  return {
    ...anime,
    linkSuggestion: null,
    rejectedSuggestion: null,
  };
}

export function acceptSuggestedFolder(anime = {}, folderName) {
  return {
    ...anime,
    folderName: folderName || null,
    linkSuggestion: null,
    rejectedSuggestion: null,
    lastUpdated: buildTimestamp(),
  };
}

export function rejectSuggestedFolder(anime = {}, folderName) {
  return {
    ...anime,
    folderName: null,
    linkSuggestion: null,
    rejectedSuggestion: folderName
      ? {
          folderName,
          rejectedAt: buildTimestamp(),
        }
      : anime.rejectedSuggestion || null,
    lastUpdated: buildTimestamp(),
  };
}

export function unlinkAnimeFolder(anime = {}) {
  const currentFolderName = anime.folderName || anime.linkSuggestion?.folderName || null;
  return {
    ...anime,
    folderName: null,
    linkSuggestion: null,
    rejectedSuggestion: currentFolderName
      ? {
          folderName: currentFolderName,
          rejectedAt: buildTimestamp(),
        }
      : anime.rejectedSuggestion || null,
    lastUpdated: buildTimestamp(),
  };
}

export function syncAnimeSuggestion(anime = {}, suggestedFolderName = null) {
  const previousSuggestionName = anime?.linkSuggestion?.folderName || null;
  const nextSuggestion = suggestedFolderName
    ? {
        folderName: suggestedFolderName,
        detectedAt: previousSuggestionName === suggestedFolderName ? anime.linkSuggestion.detectedAt : buildTimestamp(),
      }
    : null;

  return {
    ...anime,
    linkSuggestion: anime.folderName ? null : nextSuggestion,
    lastUpdated: previousSuggestionName !== (suggestedFolderName || null) ? buildTimestamp() : anime.lastUpdated,
  };
}
