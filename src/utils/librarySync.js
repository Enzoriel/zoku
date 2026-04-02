import { acceptSuggestedFolder, clearLinkingMetadata, syncAnimeSuggestion } from "./linkingState";

export function hasRecentDownloadIntent(anime = {}, nowMs, windowMs) {
  if (!anime?.downloadIntentAt) return false;
  const intentAt = new Date(anime.downloadIntentAt).getTime();
  return intentAt > 0 && nowMs - intentAt <= windowMs;
}

export function reconcileMissingFolders(localFiles = {}, myAnimes = {}, nowIso) {
  const missingIds = new Set(
    Object.values(localFiles)
      .filter((folder) => folder.isMissing && folder.malId)
      .map((folder) => String(folder.malId)),
  );

  if (missingIds.size === 0) {
    return { myAnimes, changed: false };
  }

  let changed = false;
  const nextMyAnimes = Object.fromEntries(
    Object.entries(myAnimes).map(([id, anime]) => {
      if (!missingIds.has(String(id)) || !anime?.folderName) {
        return [id, anime];
      }

      changed = true;
      return [
        id,
        {
          ...anime,
          folderName: null,
          lastUpdated: nowIso,
        },
      ];
    }),
  );

  return { myAnimes: nextMyAnimes, changed };
}

export function buildSuggestionMap(localFiles = {}) {
  return new Map(
    Object.values(localFiles)
      .filter((folder) => !folder.isLinked && folder.isSuggested && folder.suggestedMalId)
      .map((folder) => [String(folder.suggestedMalId), folder.folderName]),
  );
}

export function applySuggestionState(myAnimes = {}, suggestionMap, nowIso) {
  let changed = false;
  const nextMyAnimes = Object.fromEntries(
    Object.entries(myAnimes).map(([id, anime]) => {
      const nextSuggestionName = suggestionMap.get(String(id)) || null;
      const normalizedAnime = anime?.folderName ? clearLinkingMetadata(anime) : syncAnimeSuggestion(anime, nextSuggestionName);
      const currentSuggestionName = anime?.linkSuggestion?.folderName || null;

      if (
        normalizedAnime.folderName !== anime.folderName ||
        (normalizedAnime.linkSuggestion?.folderName || null) !== currentSuggestionName ||
        normalizedAnime.rejectedSuggestion !== anime.rejectedSuggestion
      ) {
        changed = true;
        return [id, { ...normalizedAnime, lastUpdated: normalizedAnime.lastUpdated || nowIso }];
      }

      return [id, anime];
    }),
  );

  return { myAnimes: nextMyAnimes, changed };
}

export function applyAutoLinkLogic(myAnimes = {}, suggestionMap, config) {
  const { nowMs, windowMs } = config;
  let changed = false;

  const nextMyAnimes = Object.fromEntries(
    Object.entries(myAnimes).map(([id, anime]) => {
      if (anime?.folderName) return [id, anime];
      if (!hasRecentDownloadIntent(anime, nowMs, windowMs)) return [id, anime];

      const suggestedFolderName = suggestionMap.get(String(id)) || null;
      if (!suggestedFolderName) return [id, anime];

      changed = true;
      return [id, acceptSuggestedFolder(anime, suggestedFolderName)];
    }),
  );

  return { myAnimes: nextMyAnimes, changed };
}

export function cleanupStaleIntents(localFiles = {}, myAnimes = {}, config) {
  const { nowMs, folderHasActiveDownload, folderHasTempDownloadFile, nowIso } = config;
  let changed = false;

  const nextMyAnimes = Object.fromEntries(
    Object.entries(myAnimes).map(([id, anime]) => {
      if (!anime?.downloadIntentAt || !anime?.folderName) return [id, anime];

      const linkedFolder = Object.values(localFiles).find((folder) => folder.folderName === anime.folderName);
      if (!linkedFolder) return [id, anime];

      const shouldKeep =
        anime.downloadTrackingMode === "temp"
          ? folderHasTempDownloadFile(linkedFolder)
          : folderHasActiveDownload(linkedFolder, anime.downloadIntentAt, nowMs);

      if (shouldKeep) return [id, anime];

      changed = true;
      return [
        id,
        {
          ...anime,
          downloadIntentAt: null,
          downloadTrackingMode: null,
          lastUpdated: nowIso,
        },
      ];
    }),
  );

  return { myAnimes: nextMyAnimes, changed };
}

export function updateTrackingModes(localFiles = {}, myAnimes = {}, config) {
  const { folderHasTempDownloadFile, nowIso } = config;
  let changed = false;

  const nextMyAnimes = Object.fromEntries(
    Object.entries(myAnimes).map(([id, anime]) => {
      if (!anime?.downloadIntentAt || !anime?.folderName) return [id, anime];

      const linkedFolder = Object.values(localFiles).find((folder) => folder.folderName === anime.folderName);
      if (!linkedFolder) return [id, anime];

      const inferredMode = folderHasTempDownloadFile(linkedFolder) ? "temp" : "direct";
      if (inferredMode === (anime.downloadTrackingMode || null)) return [id, anime];

      changed = true;
      return [
        id,
        {
          ...anime,
          downloadTrackingMode: inferredMode,
          lastUpdated: nowIso,
        },
      ];
    }),
  );

  return { myAnimes: nextMyAnimes, changed };
}

export function mergeLibraryAnimeUpdates(latestMyAnimes = {}, originalMyAnimes = {}, reconciledMyAnimes = {}) {
  const nextMyAnimes = { ...latestMyAnimes };

  Object.keys(reconciledMyAnimes).forEach((id) => {
    const originalAnime = originalMyAnimes[id];
    const reconciledAnime = reconciledMyAnimes[id];
    const latestAnime = latestMyAnimes[id];

    if (originalAnime && !latestAnime) {
      return;
    }

    if (!originalAnime || !reconciledAnime || !latestAnime) {
      nextMyAnimes[id] = reconciledAnime;
      return;
    }

    const changedFields = Object.keys(reconciledAnime).filter((field) => reconciledAnime[field] !== originalAnime[field]);
    if (changedFields.length === 0) return;

    nextMyAnimes[id] = { ...latestAnime };
    changedFields.forEach((field) => {
      nextMyAnimes[id][field] = reconciledAnime[field];
    });
  });

  return nextMyAnimes;
}
