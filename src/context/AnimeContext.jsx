import { createContext, useContext, useState, useEffect, useRef, useMemo, useCallback } from "react";
import { getAnimeDetails, getFullSeasonAnime } from "../services/api";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useStore } from "../hooks/useStore";
import { detectNewEpisodeAirDates } from "../utils/recentEpisodes";
import { REMOTE_METADATA_FIELDS } from "../hooks/useAnimeMetadataSync";

const CACHE_DURATION = 60 * 60 * 1000;

const AnimeContext = createContext(null);

export function AnimeProvider({ children }) {
  const { data: storeData, loading: storeLoading, setMyAnimes } = useStore();
  const [seasonalAnime, setSeasonalAnime] = useState([]);
  const [searchState, setSearchState] = useState({ query: "", page: 1, animes: [], pagination: { total: 0, current_page: 1, last_visible_page: 1, has_next_page: false }, hasSearched: false });
  const [extraAnimeById, setExtraAnimeById] = useState({});
  const lastFetchRef = useRef(null);
  const lastSyncedSeasonalFetchRef = useRef(null);
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
  
  useEffect(() => {
    if (storeLoading || !seasonalAnime.length) return;
    if (lastSyncedSeasonalFetchRef.current === lastFetchRef.current) return;

    lastSyncedSeasonalFetchRef.current = lastFetchRef.current;

    const syncWithSeasonal = async () => {
      try {
        await setMyAnimes((prevMyAnimes) => {
          if (!prevMyAnimes || Object.keys(prevMyAnimes).length === 0) return prevMyAnimes;

          let changed = false;
          const next = { ...prevMyAnimes };
          const nowIso = new Date().toISOString();

          // Crear un mapa de anime de temporada para búsquedas eficientes
          const seasonalMap = new Map();
          for (const anime of seasonalAnime) {
            const malId = Number(anime.malId || anime.mal_id);
            if (malId) seasonalMap.set(malId, anime);
            const anilistId = Number(anime.anilistId);
            if (anilistId) seasonalMap.set(anilistId, anime);
          }

          for (const [entryKey, stored] of Object.entries(prevMyAnimes)) {
            const rawId = stored?.malId ?? stored?.mal_id ?? entryKey;
            const id = Number(rawId);
            if (!id) continue;

            const fresh = seasonalMap.get(id);
            if (!fresh) continue;

            // Comparar y aplicar cambios para los campos de metadatos
            const patch = {};
            let hasFieldChanges = false;

            for (const field of REMOTE_METADATA_FIELDS) {
              if (!(field in fresh)) continue;

              const freshVal = fresh[field] ?? null;
              const storedVal = stored[field] ?? null;

              if (JSON.stringify(freshVal) !== JSON.stringify(storedVal)) {
                patch[field] = freshVal;
                hasFieldChanges = true;
              }
            }

            if (hasFieldChanges) {
              const mergedForCount = { ...stored, ...patch };
              const updatedAirDates = detectNewEpisodeAirDates(stored, mergedForCount);

              next[entryKey] = {
                ...stored,
                ...patch,
                episodeAirDates: updatedAirDates,
                lastMetadataFetch: nowIso,
              };
              changed = true;
            }
          }

          return changed ? next : prevMyAnimes;
        });
      } catch (error) {
        console.error("[AnimeContext] Error sincronizando myAnimes con seasonalAnime:", error);
      }
    };

    void syncWithSeasonal();
  }, [storeLoading, seasonalAnime, setMyAnimes]);

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
