import { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from "react";
import { watch } from "@tauri-apps/plugin-fs";
import { scanLibrary } from "../services/fileSystem";
import { useStore } from "../hooks/useStore";

const LibraryContext = createContext(null);

const DEBOUNCE_MS = 800;
const DOWNLOAD_INTENT_WINDOW_MS = 24 * 60 * 60 * 1000;

export function LibraryProvider({ children }) {
  const { data, setLocalFiles, setMyAnimes, libraryScopeReady } = useStore();
  const [syncing, setSyncing] = useState(false);

  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const unwatchRef = useRef(null);
  const debounceRef = useRef(null);

  const performSync = useCallback(
    async (myAnimesOverride = null, settingsOverride = null) => {
      const currentData = dataRef.current;
      if (!currentData.folderPath || !libraryScopeReady) return;

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

        const autoLinkCandidates = Object.values(localFiles).filter(
          (folder) => !folder.isLinked && folder.isSuggested && folder.suggestedMalId,
        );

        if (autoLinkCandidates.length > 0) {
          const now = Date.now();
          let hasAutoLinkedChanges = false;
          const normalizedMyAnimes = Object.fromEntries(
            Object.entries(myAnimesToUse).map(([id, anime]) => {
              const matchingFolder = autoLinkCandidates.find((folder) => String(folder.suggestedMalId) === String(id));
              const intentAt = anime?.downloadIntentAt ? new Date(anime.downloadIntentAt).getTime() : 0;
              const hasRecentDownloadIntent = intentAt > 0 && now - intentAt <= DOWNLOAD_INTENT_WINDOW_MS;

              if (!matchingFolder || !hasRecentDownloadIntent || anime?.folderName) {
                return [id, anime];
              }

              hasAutoLinkedChanges = true;
              return [
                id,
                {
                  ...anime,
                  folderName: matchingFolder.folderName,
                  downloadIntentAt: null,
                  lastUpdated: new Date().toISOString(),
                },
              ];
            }),
          );

          if (hasAutoLinkedChanges) {
            await setMyAnimes(normalizedMyAnimes);
            myAnimesToUse = normalizedMyAnimes;
            localFiles = await scanLibrary(currentData.folderPath, myAnimesToUse, settingsToUse);
          }
        }

        if (dataRef.current.folderPath === currentData.folderPath) {
          await setLocalFiles(localFiles);
        }
      } catch (error) {
        console.error("[Library] Error sincronizando:", error);
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
  }, []);

  const startWatcher = useCallback(
    async (folderPath) => {
      if (!folderPath || !libraryScopeReady) return;
      stopWatcher();

      try {
        const unwatch = await watch(
          folderPath,
          (event) => {
            const relevantKinds = ["create", "remove", "modify", "rename"];

            // event.type puede ser un string o un objeto en Tauri
            const typeStr = typeof event.type === "string"
              ? event.type
              : JSON.stringify(event.type || {});

            const kind = typeStr.toLowerCase();
            const isRelevant = relevantKinds.some((k) => kind.includes(k));
            if (!isRelevant) return;

            const paths = Array.isArray(event.paths) ? event.paths : [];
            const shouldSync = paths.length === 0 || paths.some((p) => {
              const pLow = p.toLowerCase();
              return (
                pLow.endsWith(".mkv") ||
                pLow.endsWith(".mp4") ||
                pLow.endsWith(".avi") ||
                pLow.endsWith(".webm") ||
                pLow.endsWith(".mov") ||
                pLow.endsWith(".!qb") ||
                pLow.endsWith(".part") ||
                pLow.endsWith(".bc!") ||
                !pLow.includes(".")
              );
            });
            if (!shouldSync) return;

            debouncedSync();
          },
          { recursive: true },
        );

        unwatchRef.current = unwatch;
      } catch (err) {
        console.error("[Library] Watcher nativo falló:", err);
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

  const value = useMemo(() => ({ performSync, syncing }), [performSync, syncing]);

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary() {
  const context = useContext(LibraryContext);
  if (!context) throw new Error("useLibrary debe usarse dentro de LibraryProvider");
  return context;
}
