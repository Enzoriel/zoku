import { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { folderHasActiveDownload, folderHasTempDownloadFile, scanLibrary } from "../services/fileSystem";
import { useStore } from "../hooks/useStore";
import {
  applyAutoLinkLogic,
  applySuggestionState,
  buildSuggestionMap,
  cleanupStaleIntents,
  hasRecentDownloadIntent,
  mergeLibraryAnimeUpdates,
  reconcileMissingFolders,
  updateTrackingModes,
} from "../utils/librarySync";

const LibraryContext = createContext(null);

const DEBOUNCE_MS = 800;
const DOWNLOAD_INTENT_WINDOW_MS = 24 * 60 * 60 * 1000;
const ACTIVE_DOWNLOAD_POLL_MS = 10 * 1000;

function normalizeLibraryPath(path) {
  if (!path) return "";
  return String(path).replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
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
  const syncRunIdRef = useRef(0);

  const performSync = useCallback(
    async (myAnimesOverride = null, settingsOverride = null) => {
      const currentData = dataRef.current;
      if (!currentData.folderPath || !libraryScopeReady) return null;

      const runId = ++syncRunIdRef.current;
      setSyncing(true);

      try {
        const settingsToUse = settingsOverride || currentData.settings;
        let nextMyAnimes = myAnimesOverride || currentData.myAnimes;
        const originalMyAnimes = nextMyAnimes;
        const nowMs = Date.now();
        const nowIso = new Date(nowMs).toISOString();
        let localFiles = await scanLibrary(currentData.folderPath, nextMyAnimes);

        const missingResult = reconcileMissingFolders(localFiles, nextMyAnimes, nowIso);
        nextMyAnimes = missingResult.myAnimes;
        if (missingResult.changed) {
          localFiles = await scanLibrary(currentData.folderPath, nextMyAnimes);
        }

        let suggestionMap = buildSuggestionMap(localFiles);
        const suggestionResult = applySuggestionState(nextMyAnimes, suggestionMap, nowIso);
        nextMyAnimes = suggestionResult.myAnimes;
        if (suggestionResult.changed) {
          localFiles = await scanLibrary(currentData.folderPath, nextMyAnimes);
          suggestionMap = buildSuggestionMap(localFiles);
        }

        const autoLinkResult = applyAutoLinkLogic(nextMyAnimes, suggestionMap, {
          nowMs,
          windowMs: DOWNLOAD_INTENT_WINDOW_MS,
        });
        nextMyAnimes = autoLinkResult.myAnimes;
        if (autoLinkResult.changed) {
          localFiles = await scanLibrary(currentData.folderPath, nextMyAnimes, settingsToUse);
        }

        const staleIntentResult = cleanupStaleIntents(localFiles, nextMyAnimes, {
          nowMs,
          nowIso,
          folderHasActiveDownload,
          folderHasTempDownloadFile,
        });
        nextMyAnimes = staleIntentResult.myAnimes;

        const trackingModeResult = updateTrackingModes(localFiles, nextMyAnimes, {
          nowIso,
          folderHasTempDownloadFile,
        });
        nextMyAnimes = trackingModeResult.myAnimes;

        if (runId !== syncRunIdRef.current) {
          return null;
        }

        if (nextMyAnimes !== originalMyAnimes) {
          const mergedMyAnimes = await setMyAnimes((latestMyAnimes) =>
            mergeLibraryAnimeUpdates(latestMyAnimes, originalMyAnimes, nextMyAnimes),
          );

          if (runId !== syncRunIdRef.current) {
            return null;
          }

          localFiles = await scanLibrary(currentData.folderPath, mergedMyAnimes, settingsToUse);
        }

        if (dataRef.current.folderPath === currentData.folderPath) {
          await setLocalFiles(localFiles);
        }

        return localFiles;
      } catch (error) {
        console.error("[Library] Error sincronizando:", error);
        return null;
      } finally {
        if (runId === syncRunIdRef.current) {
          setSyncing(false);
        }
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
    const nowMs = Date.now();
    const hasActiveDownloadIntent = Object.values(data.myAnimes || {}).some((anime) =>
      hasRecentDownloadIntent(anime, nowMs, DOWNLOAD_INTENT_WINDOW_MS),
    );

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
