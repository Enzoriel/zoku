import { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { folderHasActiveDownload, folderHasTempDownloadFile, scanLibrary } from "../services/fileSystem";
import { useStore } from "../hooks/useStore";
import { acceptSuggestedFolder, clearLinkingMetadata, syncAnimeSuggestion } from "../utils/linkingState";

const LibraryContext = createContext(null);

const DEBOUNCE_MS = 800;
const DOWNLOAD_INTENT_WINDOW_MS = 24 * 60 * 60 * 1000;
const ACTIVE_DOWNLOAD_POLL_MS = 10 * 1000;

function normalizeLibraryPath(path) {
  if (!path) return "";
  return String(path).replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

function hasRecentDownloadIntent(anime) {
  if (!anime?.downloadIntentAt) return false;
  const intentAt = new Date(anime.downloadIntentAt).getTime();
  return intentAt > 0 && Date.now() - intentAt <= DOWNLOAD_INTENT_WINDOW_MS;
}

export function LibraryProvider({ children }) {
  const { data, setLocalFiles, setMyAnimes, libraryScopeReady } = useStore();
  const [syncing, setSyncing] = useState(false);

  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const unwatchRef = useRef(null);
  const debounceRef = useRef(null);
  const activeDownloadPollRef = useRef(null);

  const performSync = useCallback(
    async (myAnimesOverride = null, settingsOverride = null) => {
      const currentData = dataRef.current;
      if (!currentData.folderPath || !libraryScopeReady) return null;

      setSyncing(true);
      try {
        let myAnimesToUse = myAnimesOverride || currentData.myAnimes;
        const settingsToUse = settingsOverride || currentData.settings;
        let localFiles = await scanLibrary(currentData.folderPath, myAnimesToUse, settingsToUse);
        const missingLinkedFolders = Object.values(localFiles).filter((folder) => folder.isMissing && folder.malId);

        if (missingLinkedFolders.length > 0) {
          const missingIds = new Set(missingLinkedFolders.map((folder) => String(folder.malId)));
          const normalizedMyAnimes = Object.fromEntries(
            Object.entries(myAnimesToUse).map(([id, anime]) => {
              if (!missingIds.has(String(id))) {
                return [id, anime];
              }

              return [
                id,
                {
                  ...anime,
                  folderName: null,
                  lastUpdated: new Date().toISOString(),
                },
              ];
            }),
          );

          await setMyAnimes(normalizedMyAnimes);
          myAnimesToUse = normalizedMyAnimes;
          localFiles = await scanLibrary(currentData.folderPath, myAnimesToUse, settingsToUse);
        }

        const suggestionMap = new Map(
          Object.values(localFiles)
            .filter((folder) => !folder.isLinked && folder.isSuggested && folder.suggestedMalId)
            .map((folder) => [String(folder.suggestedMalId), folder.folderName]),
        );

        const suggestionUpdates = Object.entries(myAnimesToUse).reduce((acc, [id, anime]) => {
          const nextSuggestionName = suggestionMap.get(String(id)) || null;
          const normalizedAnime = anime?.folderName ? clearLinkingMetadata(anime) : syncAnimeSuggestion(anime, nextSuggestionName);
          const currentSuggestionName = anime?.linkSuggestion?.folderName || null;

          if (
            normalizedAnime.folderName !== anime.folderName ||
            (normalizedAnime.linkSuggestion?.folderName || null) !== currentSuggestionName ||
            normalizedAnime.rejectedSuggestion !== anime.rejectedSuggestion
          ) {
            acc[id] = normalizedAnime;
          }

          return acc;
        }, {});

        if (Object.keys(suggestionUpdates).length > 0) {
          const normalizedMyAnimes = {
            ...myAnimesToUse,
            ...suggestionUpdates,
          };

          await setMyAnimes(normalizedMyAnimes);
          myAnimesToUse = normalizedMyAnimes;
          localFiles = await scanLibrary(currentData.folderPath, myAnimesToUse, settingsToUse);
        }

        const autoLinkUpdates = Object.entries(myAnimesToUse).reduce((acc, [id, anime]) => {
          if (anime?.folderName) return acc;
          if (!hasRecentDownloadIntent(anime)) return acc;

          const suggestedFolderName = suggestionMap.get(String(id)) || null;
          if (!suggestedFolderName) return acc;

          acc[id] = acceptSuggestedFolder(anime, suggestedFolderName);
          return acc;
        }, {});

        if (Object.keys(autoLinkUpdates).length > 0) {
          const normalizedMyAnimes = {
            ...myAnimesToUse,
            ...autoLinkUpdates,
          };

          await setMyAnimes(normalizedMyAnimes);
          myAnimesToUse = normalizedMyAnimes;
          localFiles = await scanLibrary(currentData.folderPath, myAnimesToUse, settingsToUse);
        }

        const intentsToClear = Object.entries(myAnimesToUse).filter(([, anime]) => {
          if (!anime?.downloadIntentAt || !anime?.folderName) return false;
          const linkedFolder = Object.values(localFiles).find((folder) => folder.folderName === anime.folderName);
          if (!linkedFolder) return false;
          if (anime.downloadTrackingMode === "temp") {
            return !folderHasTempDownloadFile(linkedFolder);
          }
          return !folderHasActiveDownload(linkedFolder, anime.downloadIntentAt, Date.now());
        });

        if (intentsToClear.length > 0) {
          const normalizedMyAnimes = Object.fromEntries(
            Object.entries(myAnimesToUse).map(([id, anime]) => {
              if (!intentsToClear.some(([targetId]) => String(targetId) === String(id))) {
                return [id, anime];
              }

              return [
                id,
                {
                  ...anime,
                  downloadIntentAt: null,
                  downloadTrackingMode: null,
                  lastUpdated: new Date().toISOString(),
                },
              ];
            }),
          );

          await setMyAnimes(normalizedMyAnimes);
          myAnimesToUse = normalizedMyAnimes;
          localFiles = await scanLibrary(currentData.folderPath, myAnimesToUse, settingsToUse);
        }

        const trackingModeUpdates = Object.entries(myAnimesToUse).filter(([, anime]) => {
          if (!anime?.downloadIntentAt || !anime?.folderName) return false;
          const linkedFolder = Object.values(localFiles).find((folder) => folder.folderName === anime.folderName);
          if (!linkedFolder) return false;
          const inferredMode = folderHasTempDownloadFile(linkedFolder) ? "temp" : "direct";
          return inferredMode !== (anime.downloadTrackingMode || null);
        });

        if (trackingModeUpdates.length > 0) {
          const normalizedMyAnimes = Object.fromEntries(
            Object.entries(myAnimesToUse).map(([id, anime]) => {
              const target = trackingModeUpdates.find(([targetId]) => String(targetId) === String(id));
              if (!target) {
                return [id, anime];
              }

              const linkedFolder = Object.values(localFiles).find((folder) => folder.folderName === anime.folderName);
              return [
                id,
                {
                  ...anime,
                  downloadTrackingMode: linkedFolder && folderHasTempDownloadFile(linkedFolder) ? "temp" : "direct",
                  lastUpdated: new Date().toISOString(),
                },
              ];
            }),
          );

          await setMyAnimes(normalizedMyAnimes);
          myAnimesToUse = normalizedMyAnimes;
        }

        if (dataRef.current.folderPath === currentData.folderPath) {
          await setLocalFiles(localFiles);
        }
        return localFiles;
      } catch (error) {
        console.error("[Library] Error sincronizando:", error);
        return null;
      } finally {
        setSyncing(false);
      }
    },
    [libraryScopeReady, setLocalFiles, setMyAnimes],
  );

  const performSyncRef = useRef(performSync);
  useEffect(() => {
    performSyncRef.current = performSync;
  }, [performSync]);

  const debouncedSync = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      performSyncRef.current();
    }, DEBOUNCE_MS);
  }, []);

  const stopWatcher = useCallback(() => {
    if (unwatchRef.current) {
      unwatchRef.current();
      unwatchRef.current = null;
    }
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (activeDownloadPollRef.current) {
      clearInterval(activeDownloadPollRef.current);
      activeDownloadPollRef.current = null;
    }
  }, []);

  const startWatcher = useCallback(
    async (folderPath) => {
      if (!folderPath || !libraryScopeReady) return;
      stopWatcher();

      try {
        const unlisten = await getCurrentWindow().listen("library-changed", (event) => {
          const activeFolder = dataRef.current.folderPath;
          const rootPath = event.payload?.rootPath;
          if (!activeFolder || !libraryScopeReady) return;
          if (rootPath && normalizeLibraryPath(rootPath) !== normalizeLibraryPath(activeFolder)) return;
          debouncedSync();
        });

        unwatchRef.current = unlisten;
      } catch (error) {
        console.error("[Library] Watcher backend fallo:", error);
      }
    },
    [libraryScopeReady, stopWatcher, debouncedSync],
  );

  useEffect(() => {
    const folderPath = dataRef.current.folderPath;
    if (!folderPath || !libraryScopeReady) {
      stopWatcher();
      return;
    }
    startWatcher(folderPath);
    return () => stopWatcher();
  }, [data.folderPath, libraryScopeReady, startWatcher, stopWatcher]);

  useEffect(() => {
    return () => stopWatcher();
  }, [stopWatcher]);

  useEffect(() => {
    const hasActiveDownloadIntent = Object.values(data.myAnimes || {}).some((anime) => hasRecentDownloadIntent(anime));

    if (!data.folderPath || !libraryScopeReady || !hasActiveDownloadIntent) {
      if (activeDownloadPollRef.current) {
        clearInterval(activeDownloadPollRef.current);
        activeDownloadPollRef.current = null;
      }
      return;
    }

    if (activeDownloadPollRef.current) return;

    activeDownloadPollRef.current = setInterval(() => {
      performSyncRef.current();
    }, ACTIVE_DOWNLOAD_POLL_MS);

    return () => {
      if (activeDownloadPollRef.current) {
        clearInterval(activeDownloadPollRef.current);
        activeDownloadPollRef.current = null;
      }
    };
  }, [data.myAnimes, data.folderPath, libraryScopeReady]);

  const value = useMemo(() => ({ performSync, syncing }), [performSync, syncing]);

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary() {
  const context = useContext(LibraryContext);
  if (!context) throw new Error("useLibrary debe usarse dentro de LibraryProvider");
  return context;
}
