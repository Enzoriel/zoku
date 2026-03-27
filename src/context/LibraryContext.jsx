import { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from "react";
import { watch } from "@tauri-apps/plugin-fs";
import { scanLibrary } from "../services/fileSystem";
import { useStore } from "../hooks/useStore";

const LibraryContext = createContext(null);

const DEBOUNCE_MS = 800;
const POLL_FALLBACK_MS = 5000;

export function LibraryProvider({ children }) {
  const { data, setLocalFiles } = useStore();
  const [syncing, setSyncing] = useState(false);
  const [watchMode, setWatchMode] = useState("none");

  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const unwatchRef = useRef(null);
  const debounceRef = useRef(null);
  const pollIntervalRef = useRef(null);

  const performSync = useCallback(
    async (myAnimesOverride = null) => {
      const currentData = dataRef.current;
      if (!currentData.folderPath) return;

      setSyncing(true);
      try {
        const isEvent = myAnimesOverride && (myAnimesOverride.nativeEvent || myAnimesOverride.target);
        const myAnimesToUse = myAnimesOverride && !isEvent ? myAnimesOverride : currentData.myAnimes;
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
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    setWatchMode("none");
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
        setWatchMode("native");
      } catch (err) {
        console.warn("[Library] Watcher nativo falló, usando polling:", err);
        pollIntervalRef.current = setInterval(() => {
          performSyncRef.current();
        }, POLL_FALLBACK_MS);
        setWatchMode("polling");
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

  const value = useMemo(() => ({ performSync, syncing, watchMode }), [performSync, syncing, watchMode]);

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary() {
  const context = useContext(LibraryContext);
  if (!context) throw new Error("useLibrary debe usarse dentro de LibraryProvider");
  return context;
}
