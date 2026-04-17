import { calculateUserStatus } from "./animeStatus";
import { findAnimeFolderCandidates } from "../services/fileSystem";

function normalizeFileCount(folder) {
  return Array.isArray(folder?.files) ? folder.files.length : 0;
}

function isRejectedSuggestion(anime, folder) {
  const rejectedFolderName = String(anime?.rejectedSuggestion?.folderName || "").toLowerCase();
  const folderName = String(folder?.folderName || "").toLowerCase();
  return Boolean(rejectedFolderName) && rejectedFolderName === folderName;
}

export function getBestFolderMatch(anime, localFiles, localFilesIndex = null) {
  if (!anime || !localFiles) return null;

  if (localFilesIndex) {
    const indexed = localFilesIndex[String(anime.malId)];
    if (indexed && !isRejectedSuggestion(anime, indexed)) {
      return indexed;
    }
  }

  const directMatch = Object.values(localFiles || {}).find(
    (folder) =>
      String(folder?.resolvedMalId || folder?.malId || "") === String(anime?.malId || "") &&
      !isRejectedSuggestion(anime, folder),
  );

  if (directMatch) return directMatch;

  const candidate = findAnimeFolderCandidates(anime, localFiles, { onlyWithFiles: true }).find(
    ([folderKey]) => String(anime?.rejectedSuggestion?.folderName || "").toLowerCase() !== folderKey.toLowerCase(),
  );

  return candidate?.[1] || null;
}

function getLibraryStatus(anime, folderMatch) {
  const fileCount = normalizeFileCount(folderMatch);

  if (folderMatch?.isLinked && fileCount > 0) return "LINKED";
  if (folderMatch?.isSuggested) return "SUGGESTED";
  if (folderMatch?.isLinked || !folderMatch) return "NO_FILES";
  if (folderMatch) return "UNLINKED";
  return "NO_FILES";
}

export function buildLibraryViewModel(myAnimes = {}, localFiles = {}, localFilesIndex = null) {
  const animeEntries = Object.values(myAnimes || {})
    .map((anime) => {
      const folderMatch = getBestFolderMatch(anime, localFiles, localFilesIndex);
      const computedStatus = calculateUserStatus(anime);
      const libraryStatus = getLibraryStatus(anime, folderMatch);
      const fileCount = normalizeFileCount(folderMatch);
      const hasFiles = fileCount > 0;

      return {
        malId: anime.malId,
        anime,
        computedStatus,
        libraryStatus,
        hasFiles,
        isLinked: Boolean(folderMatch?.isLinked),
        isSuggested: Boolean(folderMatch?.isSuggested),
        isTrackingOnly: libraryStatus === "NO_FILES",
        fileCount,
        resolvedFolderName: folderMatch?.folderName || anime.folderName || null,
        folderMatch,
        isMissing: Boolean(folderMatch?.isMissing),
        sortTitle: String(anime?.title || anime?.title_english || "").toLowerCase(),
      };
    })
    .sort((first, second) => first.sortTitle.localeCompare(second.sortTitle));

  const localEntries = Object.entries(localFiles || {})
    .filter(([, folder]) => {
      if (!folder || folder.isTracking || folder.isLinked) return false;
      if (normalizeFileCount(folder) === 0) return false;
      return true;
    })
    .map(([name, folder]) => ({
      ...folder,
      name,
      fileCount: normalizeFileCount(folder),
    }))
    .sort((first, second) => first.name.localeCompare(second.name));

  return {
    animeEntries,
    localEntries,
  };
}
