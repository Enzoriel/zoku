import { createContext, useState, useEffect, useCallback, useRef, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getStore, setStore, clearStore } from "../services/store";

export const StoreContext = createContext();

export function StoreProvider({ children }) {
  const [data, setData] = useState({
    folderPath: "",
    myAnimes: {},
    localFiles: {},
    settings: {
      player: "mpv",
    },
  });
  const storeStateRef = useRef(data);
  const [loading, setLoading] = useState(true);
  const [libraryScopeReady, setLibraryScopeReady] = useState(false);
  const [libraryScopeError, setLibraryScopeError] = useState(null);

  const writeQueue = useRef([]);
  const isWriting = useRef(false);

  const ensureLibraryScope = useCallback(async (folderPath) => {
    try {
      await invoke("ensure_library_scope", { path: folderPath || "" });
      setLibraryScopeError(null);
      setLibraryScopeReady(true);
      return true;
    } catch (error) {
      console.error("[Store] Error asegurando scope de biblioteca:", error);
      setLibraryScopeError("No se pudo autorizar la carpeta de biblioteca actual.");
      setLibraryScopeReady(false);
      return false;
    }
  }, []);

  const processQueue = useCallback(async () => {
    if (isWriting.current || writeQueue.current.length === 0) return;
    isWriting.current = true;
    while (writeQueue.current.length > 0) {
      const task = writeQueue.current.shift();
      try {
        await task();
      } catch (error) {
        console.error("[Store] Error procesando tarea en cola:", error);
      }
    }
    isWriting.current = false;
  }, []);

  useEffect(() => {
    async function loadData() {
      try {
        const [folderPathValue, myAnimesValue, localFilesValue, settingsValue] = await Promise.all([
          getStore("folderPath"),
          getStore("myAnimes"),
          getStore("localFiles"),
          getStore("settings"),
        ]);
        const folderPath = folderPathValue || "";
        const myAnimes = myAnimesValue || {};
        const localFiles = localFilesValue || {};
        const settings = settingsValue || { player: "mpv" };
        const loadedData = { folderPath, myAnimes, localFiles, settings };
        await ensureLibraryScope(folderPath);
        storeStateRef.current = loadedData;
        setData(loadedData);
      } catch (error) {
        console.error("[Store] Error al cargar datos:", error);
        setLibraryScopeReady(false);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [ensureLibraryScope]);

  const updateStore = useCallback(
    (key, valueOrAction) => {
      return new Promise((resolve, reject) => {
        writeQueue.current.push(async () => {
          try {
            const currentValue = storeStateRef.current[key] || (key === "folderPath" ? "" : {});
            const newValue = typeof valueOrAction === "function" ? valueOrAction(currentValue) : valueOrAction;
            await setStore(key, newValue);
            storeStateRef.current = { ...storeStateRef.current, [key]: newValue };
            setData(storeStateRef.current);
            resolve(newValue);
          } catch (error) {
            console.error(`[Store] Error actualizando ${key}:`, error);
            reject(error);
          }
        });
        processQueue();
      });
    },
    [processQueue],
  );

  const setFolderPath = useCallback(
    async (path) => {
      const previousPath = storeStateRef.current.folderPath || "";
      const previousLocalFiles = storeStateRef.current.localFiles || {};
      setLibraryScopeReady(false);
      setLibraryScopeError(null);
      const nextPath = await updateStore("folderPath", path);
      await updateStore("localFiles", {});
      const scopeOk = await ensureLibraryScope(nextPath);
      if (!scopeOk) {
        await updateStore("folderPath", previousPath);
        await updateStore("localFiles", previousLocalFiles);
        await ensureLibraryScope(previousPath);
        throw new Error("No se pudo autorizar la carpeta seleccionada.");
      }
      return nextPath;
    },
    [ensureLibraryScope, updateStore],
  );
  const setMyAnimes = useCallback((action) => updateStore("myAnimes", action), [updateStore]);
  const setLocalFiles = useCallback((files) => updateStore("localFiles", files), [updateStore]);
  const setSettings = useCallback((settings) => updateStore("settings", settings), [updateStore]);

  const clearAllData = useCallback(() => {
    return new Promise((resolve, reject) => {
      writeQueue.current.push(async () => {
        try {
          await clearStore();
          const clearedData = {
            folderPath: "",
            myAnimes: {},
            localFiles: {},
            settings: { player: "mpv" },
          };
          await invoke("ensure_library_scope", { path: "" });
          setLibraryScopeReady(true);
          setLibraryScopeError(null);
          storeStateRef.current = clearedData;
          setData(clearedData);
          resolve(true);
        } catch (error) {
          console.error("[Store] Error al limpiar datos:", error);
          reject(error);
        }
      });
      processQueue();
    });
  }, [processQueue]);

  const retryLibraryScope = useCallback(async () => {
    setLibraryScopeReady(false);
    return ensureLibraryScope(storeStateRef.current.folderPath || "");
  }, [ensureLibraryScope]);

  const value = useMemo(
    () => ({
      data,
      loading,
      libraryScopeReady,
      libraryScopeError,
      setFolderPath,
      setMyAnimes,
      setLocalFiles,
      setSettings,
      clearAllData,
      retryLibraryScope,
    }),
    [data, loading, libraryScopeReady, libraryScopeError, setFolderPath, setMyAnimes, setLocalFiles, setSettings, clearAllData, retryLibraryScope],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
