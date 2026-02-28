import { useState, useEffect, useCallback } from "react";
import { getStore, setStore } from "../services/store";

/* Estructura del store
 {
  folderPath: "C:/Users/Usuario/Animes",
  settings: {
    language: "es",
    autoMarkWatched: true,
    scanOnStartup: true
  },
  myAnimes: {
    "123": {
      malId: 123,
      title: "Naruto",
      coverImage: "https://...",
      totalEpisodes: 220,
      episodeDuration: 24,
      status: "watching",
      userRating: null,
      watchedEpisodes: [1, 2, 3],
      lastEpisodeWatched: 3,
      watchHistory: [
        { episode: 1, watchedAt: "2025-02-15T21:30:00Z", duration: 24 }
      ],
      addedAt: "2025-02-10T18:00:00Z"
    }
  },
  localFiles: {
    "Naruto": {
      files: [
        { episode: 1, path: "C:/.../Naruto - 01.mkv" }
      ],
      lastScanned: "2025-02-15T20:00:00Z"
    }
  }
} */

export function useStore() {
  const [data, setData] = useState({
    folderPath: "",
    myAnimes: {},
    localFiles: {},
  });
  const [loading, setLoading] = useState(true);

  // Cargar datos del store al inicial
  useEffect(() => {
    async function loadData() {
      try {
        const folderPath = (await getStore("folderPath")) || "";
        const myAnimes = (await getStore("myAnimes")) || {};
        const localFiles = (await getStore("localFiles")) || {};

        setData({ folderPath, myAnimes, localFiles });
      } catch (error) {
        console.error("Error al cargar datos del store:", error);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Guardar datos en el store
  const setFolderPath = useCallback(async (path) => {
    await setStore("folderPath", path);
    setData((prev) => ({ ...prev, folderPath: path }));
  }, []);

  // Guardar animes en el store
  const setMyAnimes = useCallback(async (animes) => {
    await setStore("myAnimes", animes);
    setData((prev) => ({ ...prev, myAnimes: animes }));
  }, []);

  // Guardar archivos locales en el store
  const setLocalFiles = useCallback(async (files) => {
    await setStore("localFiles", files);
    setData((prev) => ({ ...prev, localFiles: files }));
  }, []);

  return { data, loading, setFolderPath, setMyAnimes, setLocalFiles };
}
