import { createContext, useContext, useState, useEffect, useRef, useMemo, useCallback } from "react";
import { getAnimeDetails, getFullSeasonAnime } from "../services/api";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useStore } from "../hooks/useStore";

const CACHE_DURATION = 60 * 60 * 1000;

const AnimeContext = createContext(null);

export function AnimeProvider({ children }) {
  const { data: storeData } = useStore();
  const [seasonalAnime, setSeasonalAnime] = useState([]);
  const [searchAnimes, setSearchAnimes] = useState([]);
  const [extraAnimeById, setExtraAnimeById] = useState({});
  const lastFetchRef = useRef(null);
  const [loading, setLoading] = useState(seasonalAnime.length === 0);
  const [error, setError] = useState(null);
  const isFetching = useRef(false);
  const detailRequestsRef = useRef(new Map());
  const [discoverState, setDiscoverState] = useState({ page: 1, type: "TV" });

  const fetchSeasonal = useCallback(async () => {
    if (isFetching.current) return;
    isFetching.current = true;
    setError(null);
    try {
      const data = await getFullSeasonAnime();
      setSeasonalAnime(data || []);
      lastFetchRef.current = Date.now();
    } catch (fetchError) {
      console.error("Failed to fetch seasonal anime:", fetchError);
      setError("No se pudo sincronizar con AniList. Revisa tu conexion.");
    } finally {
      isFetching.current = false;
      setLoading(false);
      setDiscoverState((prev) => ({ ...prev, page: 1 }));
    }
  }, []);

  const shouldRefresh = () => !lastFetchRef.current || Date.now() - lastFetchRef.current > CACHE_DURATION;

  useEffect(() => {
    let mounted = true;
    let unlisten;

    fetchSeasonal();

    getCurrentWindow()
      .listen("tauri://focus", () => {
        if (shouldRefresh()) {
          fetchSeasonal();
        }
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
  }, [fetchSeasonal]);

  const getFreshAnimeById = useCallback(
    (id) => {
      const parsed = parseInt(id, 10);
      return (
        seasonalAnime.find(
          (anime) => anime.anilistId === parsed || anime.malId === parsed || anime.mal_id === parsed,
        ) ||
        searchAnimes.find((anime) => anime.anilistId === parsed || anime.malId === parsed || anime.mal_id === parsed) ||
        extraAnimeById[parsed] ||
        null
      );
    },
    [seasonalAnime, searchAnimes, extraAnimeById],
  );

  const getAnimeById = useCallback(
    (id) => {
      const parsed = parseInt(id, 10);
      return storeData.myAnimes[id] || storeData.myAnimes[parsed] || getFreshAnimeById(id) || null;
    },
    [getFreshAnimeById, storeData.myAnimes],
  );

  const retryFetch = useCallback(async () => {
    setLoading(true);
    await fetchSeasonal();
  }, [fetchSeasonal]);

  const refreshAnimeById = useCallback(async (id, options = {}) => {
    const parsed = Number.parseInt(id, 10);
    if (!Number.isFinite(parsed)) return null;

    if (!options.force && detailRequestsRef.current.has(parsed)) {
      return detailRequestsRef.current.get(parsed);
    }

    const request = getAnimeDetails(parsed, options)
      .then((anime) => {
        if (anime) {
          setExtraAnimeById((prev) => ({ ...prev, [parsed]: anime }));
        }
        return anime;
      })
      .finally(() => {
        detailRequestsRef.current.delete(parsed);
      });

    detailRequestsRef.current.set(parsed, request);
    return request;
  }, []);

  const value = useMemo(
    () => ({
      seasonalAnime,
      searchAnimes,
      setSearchAnimes,
      loading,
      error,
      getAnimeById,
      getFreshAnimeById,
      refreshAnimeById,
      retryFetch,
      discoverState,
      setDiscoverState,
    }),
    [
      seasonalAnime,
      searchAnimes,
      loading,
      error,
      getAnimeById,
      getFreshAnimeById,
      refreshAnimeById,
      retryFetch,
      discoverState,
      setDiscoverState,
    ],
  );

  return <AnimeContext.Provider value={value}>{children}</AnimeContext.Provider>;
}

export function useAnime() {
  const context = useContext(AnimeContext);
  if (!context) throw new Error("useAnime debe usarse dentro de AnimeProvider");
  return context;
}
