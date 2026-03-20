import { createContext, useState, useEffect, useCallback, useRef } from "react";
import { getStore, setStore } from "../services/store";

export const StoreContext = createContext();

export function StoreProvider({ children }) {
  const [data, setData] = useState({
    folderPath: "",
    myAnimes: {},
    localFiles: {},
    settings: {
      player: "mpv", // Reproductor por defecto
    },
  });
  const [loading, setLoading] = useState(true);

  // Cola de escritura secuencial para evitar race conditions al persistir en disco
  const storeWritePromise = useRef(Promise.resolve());

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

  const updateStore = useCallback(async (key, valueOrAction) => {
    storeWritePromise.current = storeWritePromise.current.then(async () => {
      try {
        const currentValue = (await getStore(key)) || (key === "folderPath" ? "" : {});
        const newValue = typeof valueOrAction === "function" ? valueOrAction(currentValue) : valueOrAction;

        await setStore(key, newValue);
        setData((prev) => ({ ...prev, [key]: newValue }));
      } catch (error) {
        console.error(`[Store] Error actualizando ${key}:`, error);
      }
    });
    return storeWritePromise.current;
  }, []);

  const setFolderPath = useCallback((path) => updateStore("folderPath", path), [updateStore]);
  const setMyAnimes = useCallback((action) => updateStore("myAnimes", action), [updateStore]);
  const setLocalFiles = useCallback((files) => updateStore("localFiles", files), [updateStore]);
  const setSettings = useCallback((settings) => updateStore("settings", settings), [updateStore]);

  const value = {
    data,
    loading,
    setFolderPath,
    setMyAnimes,
    setLocalFiles,
    setSettings,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
