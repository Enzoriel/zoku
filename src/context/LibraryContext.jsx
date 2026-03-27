import { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from "react";
import { watch } from "@tauri-apps/plugin-fs";
import { scanLibrary } from "../services/fileSystem";
import { useStore } from "../hooks/useStore";

const LibraryContext = createContext(null);

const DEBOUNCE_MS = 800;

export function LibraryProvider({ children }) {
  const { data, setLocalFiles } = useStore();
  const [syncing, setSyncing] = useState(false);

  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const unwatchRef = useRef(null);
  const debounceRef = useRef(null);

  const performSync = useCallback(
    async (myAnimesOverride = null) => {
      const currentData = dataRef.current;
      if (!currentData.folderPath) return;

      setSyncing(true);
      try {
        const myAnimesToUse = myAnimesOverride || currentData.myAnimes;
        const localFiles = await scanLibrary(currentData.folderPath, myAnimesToUse);
        if (dataRef.current.folderPath === currentData.folderPath) {
          await setLocalFiles(localFiles);
        }
      } catch (error) {
        console.error("[Library] Error sincronizando:", error);
      } finally {
        setSyncing(false);
      }
    },
    [setLocalFiles],
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
      if (!folderPath) return;
      stopWatcher();

      try {
        const unwatch = await watch(
          folderPath,
          (event) => {
            const relevantKinds = ["create", "remove", "modify", "rename"];
            const kind = event.type?.toLowerCase?.() ?? "";
            const isRelevant = relevantKinds.some((k) => kind.includes(k));
            if (!isRelevant) return;

            const paths = Array.isArray(event.paths) ? event.paths : [];
            const videoExts = [".mkv", ".mp4", ".avi", ".webm", ".mov"];
            const hasVideoFile = paths.some((p) => videoExts.some((ext) => p.toLowerCase().endsWith(ext)));
            if (paths.length > 0 && !hasVideoFile) return;

            debouncedSync();
          },
          { recursive: true },
        );

        unwatchRef.current = unwatch;
      } catch (err) {
        console.error("[Library] Watcher nativo falló:", err);
      }
    },
    [stopWatcher, debouncedSync],
  );

  useEffect(() => {
    const folderPath = dataRef.current.folderPath;
    if (!folderPath) {
      stopWatcher();
      return;
    }
    startWatcher(folderPath);
    return () => stopWatcher();
  }, [data.folderPath, startWatcher, stopWatcher]);

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
