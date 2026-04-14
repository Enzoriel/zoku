import { createContext, useState, useEffect, useCallback, useRef, useMemo, useContext } from "react";
import { StoreContext } from "./StoreContext";
import { getPrincipalFansub, getPreferredResolution } from "../utils/torrentConfig";
import { TORRENT_REFRESH_INTERVAL_MS } from "../constants";
import { fetchNyaaFeed } from "../services/nyaa";

const CACHE_DURATION = TORRENT_REFRESH_INTERVAL_MS;

export const TorrentContext = createContext(null);

export function TorrentProvider({ children }) {
  const { data: storeData, loading: storeLoading } = useContext(StoreContext);
  const principalFansub = useMemo(() => getPrincipalFansub(storeData.settings), [storeData.settings]);
  const preferredRes = useMemo(() => getPreferredResolution(storeData.settings), [storeData.settings]);

  const [data, setData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastFetch, setLastFetch] = useState(null);

  const intervalRef = useRef(null);
  const requestIdRef = useRef(0);

  // Background feed always uses English-translated (1_2) — fansubs multi-sub como Erai
  // se suben ahi aunque incluyan subs en espanol
  const fetchPrincipal = useCallback(
    async (force = false) => {
      if (!principalFansub || storeLoading) return;

      const requestId = ++requestIdRef.current;
      setIsLoading(true);
      setError(null);

      try {
        const result = await fetchNyaaFeed({
          fansub: principalFansub,
          query: preferredRes || "",
          force,
          ttlMs: CACHE_DURATION,
        });

        if (requestId !== requestIdRef.current) return;
        setData(result.data);
        setLastFetch(result.timestamp);
      } catch (fetchError) {
        if (requestId !== requestIdRef.current) return;
        console.error("[TorrentContext] Error:", fetchError);
        setError(typeof fetchError === "string" ? fetchError : "Error al obtener torrents del fansub principal.");
      } finally {
        if (requestId !== requestIdRef.current) return;
        setIsLoading(false);
      }
    },
    [principalFansub, preferredRes, storeLoading],
  );

  useEffect(() => {
    if (storeLoading) return;

    if (!principalFansub) {
      setData([]);
      setError(null);
      setLastFetch(null);
      return;
    }

    fetchPrincipal(false);

    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => fetchPrincipal(false), CACHE_DURATION);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [principalFansub, preferredRes, storeLoading, fetchPrincipal]);

  const refresh = useCallback(() => fetchPrincipal(true), [fetchPrincipal]);

  const value = useMemo(
    () => ({
      data,
      isLoading,
      error,
      lastFetch,
      principalFansub,
      preferredRes,
      refresh,
    }),
    [data, isLoading, error, lastFetch, principalFansub, preferredRes, refresh],
  );

  return <TorrentContext.Provider value={value}>{children}</TorrentContext.Provider>;
}

export function useTorrent() {
  const context = useContext(TorrentContext);
  if (!context) throw new Error("useTorrent debe usarse dentro de TorrentProvider");
  return context;
}
