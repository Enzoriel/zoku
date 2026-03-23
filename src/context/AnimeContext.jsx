import { createContext, useContext, useState, useEffect, useRef } from "react";
import { getFullSeasonAnime } from "../services/api";
import { getCurrentWindow } from "@tauri-apps/api/window";

const CACHE_DURATION = 60 * 60 * 1000; // 1 hora

const AnimeContext = createContext(null);

export function AnimeProvider({ children }) {
  const [seasonalAnime, setSeasonalAnime] = useState([]);
  const [searchAnimes, setSearchAnimes] = useState([]); // Guardamos aquí los últimos resultados de búsqueda
  const lastFetchRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const isFetching = useRef(false);

  const fetchSeasonal = async () => {
    if (isFetching.current) return;
    
    isFetching.current = true;
    setError(null);
    try {
      const data = await getFullSeasonAnime();
      setSeasonalAnime(data || []);
      lastFetchRef.current = Date.now();
    } catch (e) {
      console.error("Failed to fetch seasonal anime:", e);
      setError("No se pudo sincronizar con AniList. Revisa tu conexión.");
    } finally {
      isFetching.current = false;
      setLoading(false);
    }
  };

  const shouldRefresh = () => !lastFetchRef.current || Date.now() - lastFetchRef.current > CACHE_DURATION;

  useEffect(() => {
    fetchSeasonal();

    let unlisten;
    getCurrentWindow()
      .listen("tauri://focus", () => {
        if (shouldRefresh()) fetchSeasonal();
      })
      .then((fn) => (unlisten = fn));

    return () => unlisten?.();
  }, []);

  const getAnimeById = (id) => {
    const parsed = parseInt(id);
    // Buscamos en temporada y en los últimos resultados de búsqueda
    return (
      seasonalAnime.find((a) => a.anilistId === parsed || a.mal_id === parsed) ||
      searchAnimes.find((a) => a.anilistId === parsed || a.mal_id === parsed) ||
      null
    );
  };

  return (
    <AnimeContext.Provider value={{ seasonalAnime, searchAnimes, setSearchAnimes, loading, error, getAnimeById }}>
      {children}
    </AnimeContext.Provider>
  );
}

export function useAnime() {
  const context = useContext(AnimeContext);
  if (!context) throw new Error("useAnime debe usarse dentro de AnimeProvider");
  return context;
}
