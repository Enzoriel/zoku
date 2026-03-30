import { createContext, useContext, useState, useEffect, useRef, useMemo, useCallback } from "react";
import { getFullSeasonAnime } from "../services/api";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useStore } from "../hooks/useStore";

const CACHE_DURATION = 60 * 60 * 1000;

const AnimeContext = createContext(null);

export function AnimeProvider({ children }) {
  const { data: storeData } = useStore();
  const [seasonalAnime, setSeasonalAnime] = useState([]);
  const [searchAnimes, setSearchAnimes] = useState([]);
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
    let mounted = true;
    let unlisten;

    fetchSeasonal();

    getCurrentWindow()
      .listen("tauri://focus", () => {
        if (shouldRefresh()) fetchSeasonal();
      })
      .then((fn) => {
        if (mounted) {
          unlisten = fn;
        } else {
          fn();
        }
      });

    return () => {
      mounted = false;
      unlisten?.();
    };
  }, []);

  const getAnimeById = useCallback(
    (id) => {
      const parsed = parseInt(id);
      return (
        storeData.myAnimes[id] ||
        storeData.myAnimes[parsed] ||
        seasonalAnime.find((a) => a.anilistId === parsed || a.mal_id === parsed) ||
        searchAnimes.find((a) => a.anilistId === parsed || a.mal_id === parsed) ||
        null
      );
    },
    [seasonalAnime, searchAnimes, storeData.myAnimes],
  );

  const retryFetch = useCallback(async () => {
    setLoading(true);
    await fetchSeasonal();
  }, []);

  const value = useMemo(
    () => ({
      seasonalAnime,
      searchAnimes,
      setSearchAnimes,
      loading,
      error,
      getAnimeById,
      retryFetch,
    }),
    [seasonalAnime, searchAnimes, loading, error, getAnimeById, retryFetch],
  );

  return <AnimeContext.Provider value={value}>{children}</AnimeContext.Provider>;
}

export function useAnime() {
  const context = useContext(AnimeContext);
  if (!context) throw new Error("useAnime debe usarse dentro de AnimeProvider");
  return context;
}
