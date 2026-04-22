import { acceptSuggestedFolder, clearLinkingMetadata, syncAnimeSuggestion } from "./linkingState";
import { findAnimeFolderCandidates } from "../services/fileSystem";

export function hasRecentDownloadIntent(anime = {}, nowMs, windowMs) {
  if (!anime?.downloadIntentAt) return false;
  const intentAt = new Date(anime.downloadIntentAt).getTime();
  return intentAt > 0 && nowMs - intentAt <= windowMs;
}

export function reconcileMissingFolders(localFiles = {}, myAnimes = {}, nowIso) {
  const safeLocalFiles = localFiles || {};
  const safeMyAnimes = myAnimes || {};
  const missingIds = new Set(
    Object.values(safeLocalFiles)
      .filter((folder) => folder.isMissing && folder.malId)
      .map((folder) => String(folder.malId)),
  );

  if (missingIds.size === 0) {
    return { myAnimes: safeMyAnimes, changed: false };
  }

  let changed = false;
  const nextMyAnimes = Object.fromEntries(
    Object.entries(safeMyAnimes).map(([id, anime]) => {
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
  const safeLocalFiles = localFiles || {};
  return new Map(
    Object.values(safeLocalFiles)
      .filter((folder) => !folder.isLinked && folder.isSuggested && folder.suggestedMalId)
      .map((folder) => [String(folder.suggestedMalId), folder.folderName]),
  );
}

export function applySuggestionState(myAnimes = {}, suggestionMap, nowIso) {
  const safeMyAnimes = myAnimes || {};
  const safeSuggestionMap = suggestionMap instanceof Map ? suggestionMap : new Map();
  let changed = false;
  const nextMyAnimes = { ...safeMyAnimes };

  // Procesar animes que están en el suggestionMap O que tienen folderName (para clearLinkingMetadata)
  const idsToProcess = new Set(safeSuggestionMap.keys());
  for (const [id, anime] of Object.entries(safeMyAnimes)) {
    if (anime?.folderName || anime?.linkSuggestion?.folderName || anime?.rejectedSuggestion) {
      idsToProcess.add(String(id));
    }
  }

  for (const id of idsToProcess) {
    const anime = nextMyAnimes[id];
    if (!anime) continue;

    const nextSuggestionName = safeSuggestionMap.get(String(id)) || null;
    const normalizedAnime = anime.folderName ? clearLinkingMetadata(anime) : syncAnimeSuggestion(anime, nextSuggestionName);
    const currentSuggestionName = anime.linkSuggestion?.folderName || null;

    if (
      normalizedAnime.folderName !== anime.folderName ||
      (normalizedAnime.linkSuggestion?.folderName || null) !== currentSuggestionName ||
      normalizedAnime.rejectedSuggestion !== anime.rejectedSuggestion
    ) {
      changed = true;
      nextMyAnimes[id] = { ...normalizedAnime, lastUpdated: normalizedAnime.lastUpdated || nowIso };
    }
  }

  return { myAnimes: nextMyAnimes, changed };
}

export function applyAutoLinkLogic(myAnimes = {}, suggestionMap, config) {
  const safeMyAnimes = myAnimes || {};
  const safeSuggestionMap = suggestionMap instanceof Map ? suggestionMap : new Map();
  const { nowMs, windowMs, localFiles } = config || {};
  let changed = false;

  const nextMyAnimes = Object.fromEntries(
    Object.entries(safeMyAnimes).map(([id, anime]) => {
      if (anime?.folderName) return [id, anime];
      if (!hasRecentDownloadIntent(anime, nowMs, windowMs)) return [id, anime];

      const suggestedFolderName = safeSuggestionMap.get(String(id)) || null;
      if (suggestedFolderName) {
        changed = true;
        return [id, acceptSuggestedFolder(anime, suggestedFolderName)];
      }

      // Fallback: búsqueda directa de candidatos cuando el suggestionMap
      // no tiene entradas (por rejectedSuggestion u otro motivo).
      // Solo auto-vincula si hay archivos modificados tras el downloadIntent.
      if (!localFiles) return [id, anime];

      const intentAt = anime.downloadIntentAt ? new Date(anime.downloadIntentAt).getTime() : 0;
      if (!intentAt) return [id, anime];

      const candidates = findAnimeFolderCandidates(anime, localFiles, { onlyWithFiles: true });
      const recentCandidates = candidates.filter(([, folder]) =>
        (folder.files || []).some((file) => {
          const modifiedAtMs = Number(file.modifiedAtMs || 0);
          return modifiedAtMs > 0 && modifiedAtMs >= intentAt - 30000;
        }),
      );

      if (recentCandidates.length === 1) {
        changed = true;
        return [id, acceptSuggestedFolder(anime, recentCandidates[0][0])];
      }

      return [id, anime];
    }),
  );

  return { myAnimes: nextMyAnimes, changed };
}

export function cleanupStaleIntents(localFiles = {}, myAnimes = {}, config) {
  const safeLocalFiles = localFiles || {};
  const safeMyAnimes = myAnimes || {};
  const {
    nowMs,
    folderHasActiveDownload = () => false,
    folderHasTempDownloadFile = () => false,
    nowIso,
  } = config || {};
  let changed = false;

  const nextMyAnimes = Object.fromEntries(
    Object.entries(safeMyAnimes).map(([id, anime]) => {
      if (!anime?.downloadIntentAt || !anime?.folderName) return [id, anime];

      const linkedFolder = Object.values(safeLocalFiles).find((folder) => folder.folderName === anime.folderName);
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
  const safeLocalFiles = localFiles || {};
  const safeMyAnimes = myAnimes || {};
  const { folderHasTempDownloadFile = () => false, nowIso } = config || {};
  let changed = false;

  const nextMyAnimes = Object.fromEntries(
    Object.entries(safeMyAnimes).map(([id, anime]) => {
      if (!anime?.downloadIntentAt || !anime?.folderName) return [id, anime];

      const linkedFolder = Object.values(safeLocalFiles).find((folder) => folder.folderName === anime.folderName);
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
  const safeLatestMyAnimes = latestMyAnimes || {};
  const safeOriginalMyAnimes = originalMyAnimes || {};
  const safeReconciledMyAnimes = reconciledMyAnimes || {};
  const nextMyAnimes = { ...safeLatestMyAnimes };

  Object.keys(safeReconciledMyAnimes).forEach((id) => {
    const originalAnime = safeOriginalMyAnimes[id];
    const reconciledAnime = safeReconciledMyAnimes[id];
    const latestAnime = safeLatestMyAnimes[id];

    if (originalAnime && !latestAnime) {
      nextMyAnimes[id] = reconciledAnime;
      return;
    }

    if (!reconciledAnime) {
      return;
    }

    if (!originalAnime || !latestAnime) {
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
