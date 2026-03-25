import { createContext, useState, useEffect, useCallback, useRef, useMemo } from "react";
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
  const [loading, setLoading] = useState(true);

  const writeQueue = useRef([]);
  const isWriting = useRef(false);

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
        const folderPath = (await getStore("folderPath")) || "";
        const myAnimes = (await getStore("myAnimes")) || {};
        const localFiles = (await getStore("localFiles")) || {};
        const settings = (await getStore("settings")) || { player: "mpv" };
        setData({ folderPath, myAnimes, localFiles, settings });
      } catch (error) {
        console.error("[Store] Error al cargar datos:", error);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const updateStore = useCallback(
    (key, valueOrAction) => {
      return new Promise((resolve, reject) => {
        writeQueue.current.push(async () => {
          try {
            const currentValue = (await getStore(key)) || (key === "folderPath" ? "" : {});
            const newValue = typeof valueOrAction === "function" ? valueOrAction(currentValue) : valueOrAction;
            await setStore(key, newValue);
            setData((prev) => ({ ...prev, [key]: newValue }));
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

  const setFolderPath = useCallback((path) => updateStore("folderPath", path), [updateStore]);
  const setMyAnimes = useCallback((action) => updateStore("myAnimes", action), [updateStore]);
  const setLocalFiles = useCallback((files) => updateStore("localFiles", files), [updateStore]);
  const setSettings = useCallback((settings) => updateStore("settings", settings), [updateStore]);

  const clearAllData = useCallback(() => {
    return new Promise((resolve, reject) => {
      writeQueue.current.push(async () => {
        try {
          await clearStore();
          setData({
            folderPath: "",
            myAnimes: {},
            localFiles: {},
            settings: { player: "mpv" },
          });
          resolve(true);
        } catch (error) {
          console.error("[Store] Error al limpiar datos:", error);
          reject(error);
        }
      });
      processQueue();
    });
  }, [processQueue]);

  const value = useMemo(
    () => ({
      data,
      loading,
      setFolderPath,
      setMyAnimes,
      setLocalFiles,
      setSettings,
      clearAllData,
    }),
    [data, loading, setFolderPath, setMyAnimes, setLocalFiles, setSettings, clearAllData],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
