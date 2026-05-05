import { createContext, useContext, useState, useEffect, useRef, useMemo, useCallback } from "react";
import { getAnimeDetails, getFullSeasonAnime } from "../services/api";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useStore } from "../hooks/useStore";

const CACHE_DURATION = 60 * 60 * 1000;

const AnimeContext = createContext(null);

export function AnimeProvider({ children }) {
  const { data: storeData } = useStore();
  const [seasonalAnime, setSeasonalAnime] = useState([]);
  const [searchState, setSearchState] = useState({ query: "", page: 1, animes: [], pagination: { total: 0, current_page: 1, last_visible_page: 1, has_next_page: false }, hasSearched: false });
  const [extraAnimeById, setExtraAnimeById] = useState({});
  const lastFetchRef = useRef(null);
  const [loading, setLoading] = useState(seasonalAnime.length === 0);
  const [error, setError] = useState(null);
  const isFetching = useRef(false);
  const detailRequestsRef = useRef(new Map());

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
        searchState.animes.find((anime) => anime.anilistId === parsed || anime.malId === parsed || anime.mal_id === parsed) ||
        extraAnimeById[parsed] ||
        null
      );
    },
    [seasonalAnime, searchState.animes, extraAnimeById],
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
          // Actualizar en seasonalAnime si existe, para que Recent refleje
          // datos frescos sin esperar al cache de 1 hora.
          setSeasonalAnime((prev) => {
            const index = prev.findIndex(
              (a) => Number(a.malId || a.mal_id) === parsed,
            );
            if (index === -1) return prev;
            const next = [...prev];
            next[index] = anime;
            return next;
          });
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
      searchState,
      setSearchState,
      loading,
      error,
      getAnimeById,
      getFreshAnimeById,
      refreshAnimeById,
      retryFetch,
    }),
    [
      seasonalAnime,
      searchState,
      loading,
      error,
      getAnimeById,
      getFreshAnimeById,
      refreshAnimeById,
      retryFetch,
    ],
  );

  return <AnimeContext.Provider value={value}>{children}</AnimeContext.Provider>;
}

export function useAnime() {
  const context = useContext(AnimeContext);
  if (!context) throw new Error("useAnime debe usarse dentro de AnimeProvider");
  return context;
}
