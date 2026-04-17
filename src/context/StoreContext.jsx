import { createContext, useState, useEffect, useCallback, useRef, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getStore, setStore, clearStore } from "../services/store";
import { buildPlayerConfig, isValidPlayerConfig } from "../utils/playerDetection";

export const StoreContext = createContext();

const DEFAULT_SETTINGS = {
  player: "",
  playerConfig: null,
  onboardingComplete: false,
};

function normalizeSettings(settings, folderPath) {
  const nextSettings = settings || DEFAULT_SETTINGS;
  const normalizedPlayerConfig = isValidPlayerConfig(nextSettings?.playerConfig)
    ? buildPlayerConfig(nextSettings.playerConfig)
    : null;
  const hasValidSetup = Boolean(folderPath) && isValidPlayerConfig(normalizedPlayerConfig);

  return {
    ...DEFAULT_SETTINGS,
    ...nextSettings,
    playerConfig: normalizedPlayerConfig,
    onboardingComplete: Boolean(nextSettings?.onboardingComplete && hasValidSetup),
  };
}

export function StoreProvider({ children }) {
  const [data, setData] = useState({
    folderPath: "",
    myAnimes: {},
    localFiles: {},
    settings: DEFAULT_SETTINGS,
  });
  const storeStateRef = useRef(data);
  const [loading, setLoading] = useState(true);
  const [libraryScopeReady, setLibraryScopeReady] = useState(false);
  const [libraryScopeError, setLibraryScopeError] = useState(null);

  const writeQueue = useRef([]);
  const isWriting = useRef(false);

  const normalizeLibraryPath = useCallback((path) => {
    if (!path) return "";
    return String(path).replace(/\\/g, "/").replace(/\/+$/, "");
  }, []);

  const ensureLibraryScope = useCallback(
    async (folderPath) => {
      try {
        const result = await invoke("ensure_library_scope", { path: folderPath || "" });
        setLibraryScopeError(null);
        setLibraryScopeReady(true);
        return normalizeLibraryPath(result?.rootPath || folderPath || "");
      } catch (error) {
        console.error("[Store] Error asegurando scope de biblioteca:", error);
        setLibraryScopeError("No se pudo autorizar la carpeta de biblioteca actual.");
        setLibraryScopeReady(false);
        return null;
      }
    },
    [normalizeLibraryPath],
  );

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
        const settings = normalizeSettings(settingsValue, folderPath);
        const canonicalFolderPath = (await ensureLibraryScope(folderPath)) ?? normalizeLibraryPath(folderPath);
        const loadedData = { folderPath: canonicalFolderPath, myAnimes, localFiles, settings };
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
      const requestedPath = normalizeLibraryPath(path);
      const nextPath = await updateStore("folderPath", requestedPath);
      await updateStore("localFiles", {});
      const canonicalPath = await ensureLibraryScope(nextPath);
      if (!canonicalPath) {
        await updateStore("folderPath", previousPath);
        await updateStore("localFiles", previousLocalFiles);
        await ensureLibraryScope(previousPath);
        throw new Error("No se pudo autorizar la carpeta seleccionada.");
      }
      if (canonicalPath !== nextPath) {
        await updateStore("folderPath", canonicalPath);
      }
      return canonicalPath;
    },
    [ensureLibraryScope, normalizeLibraryPath, updateStore],
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
            settings: DEFAULT_SETTINGS,
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
    const canonicalPath = await ensureLibraryScope(storeStateRef.current.folderPath || "");
    if (canonicalPath && canonicalPath !== storeStateRef.current.folderPath) {
      await updateStore("folderPath", canonicalPath);
    }
    return canonicalPath;
  }, [ensureLibraryScope, updateStore]);

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
    [
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
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
