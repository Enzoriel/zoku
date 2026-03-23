import { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from "react";
import { scanLibrary } from "../services/fileSystem";
import { useStore } from "../hooks/useStore";

const LibraryContext = createContext(null);

export function LibraryProvider({ children }) {
  const { data, setLocalFiles } = useStore();
  const [syncing, setSyncing] = useState(false);

  // Refs para siempre tener los datos más frescos sin recrear performSync
  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const performSync = useCallback(
    async (myAnimesOverride = null) => {
      const currentData = dataRef.current;
      if (!currentData.folderPath) return;

      setSyncing(true);
      try {
        const myAnimesToUse = myAnimesOverride ?? currentData.myAnimes;
        const localFiles = await scanLibrary(currentData.folderPath, myAnimesToUse);
        await setLocalFiles(localFiles);
      } catch (error) {
        console.error("Error sincronizando biblioteca:", error);
      } finally {
        setSyncing(false);
      }
    },
    [setLocalFiles],
  );

  const value = useMemo(() => ({ performSync, syncing }), [performSync, syncing]);

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary() {
  const context = useContext(LibraryContext);
  if (!context) throw new Error("useLibrary debe usarse dentro de LibraryProvider");
  return context;
}
