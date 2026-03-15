import React, { createContext, useState, useEffect, useCallback, useRef } from "react";
import { getStore, setStore } from "../services/store";

export const StoreContext = createContext();

export function StoreProvider({ children }) {
  const [data, setData] = useState({
    folderPath: "",
    myAnimes: {},
    localFiles: {},
  });
  const [loading, setLoading] = useState(true);
  
  // Cola de escritura para evitar colisiones en el disco
  const storeWritePromise = useRef(Promise.resolve());

  // Cargar datos iniciales
  useEffect(() => {
    async function loadData() {
      try {
        const folderPath = (await getStore("folderPath")) || "";
        const myAnimes = (await getStore("myAnimes")) || {};
        const localFiles = (await getStore("localFiles")) || {};

        setData({ folderPath, myAnimes, localFiles });
      } catch (error) {
        console.error("[Store] Error al cargar datos:", error);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Función genérica para actualizar el store y el estado
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

  const value = {
    data,
    loading,
    setFolderPath,
    setMyAnimes,
    setLocalFiles
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
