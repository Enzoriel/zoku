import { createContext, useState, useEffect, useCallback, useRef, useMemo, useContext } from "react";
import { invoke } from "@tauri-apps/api/core";
import { StoreContext } from "./StoreContext";
import { getPrincipalFansub } from "../utils/torrentConfig";

const CACHE_DURATION = 10 * 60 * 1000; // 10 minutos

export const TorrentContext = createContext(null);

export function TorrentProvider({ children }) {
  const { data: storeData, loading: storeLoading } = useContext(StoreContext);
  const principalFansub = getPrincipalFansub(storeData.settings);

  const [data, setData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastFetch, setLastFetch] = useState(null);
  const [userTriggered, setUserTriggered] = useState(false);

  const intervalRef = useRef(null);

  const fetchPrincipal = useCallback(
    async (triggeredByUser = false) => {
      if (!principalFansub) return;

      setIsLoading(true);
      setError(null);

      try {
        const result = await invoke("fetch_nyaa", { query: "", fansub: principalFansub });
        setData(result || []);
        setLastFetch(Date.now());
        setUserTriggered(triggeredByUser);
      } catch (e) {
        console.error("[TorrentContext] Error:", e);
        setError(typeof e === "string" ? e : "Error al obtener torrents del fansub principal.");
      } finally {
        setIsLoading(false);
      }
    },
    [principalFansub],
  );

  // Fetch cuando cambia el fansub principal
  useEffect(() => {
    if (storeLoading) return;

    if (!principalFansub) {
      setData([]);
      setError(null);
      setLastFetch(null);
      return;
    }

    fetchPrincipal(false);

    // Intervalo de refresco
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => fetchPrincipal(false), CACHE_DURATION);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [principalFansub, storeLoading, fetchPrincipal]);

  const refresh = useCallback(() => fetchPrincipal(true), [fetchPrincipal]);

  const isStale = lastFetch === null || Date.now() - lastFetch > CACHE_DURATION;

  const value = useMemo(
    () => ({
      data,
      isLoading,
      error,
      lastFetch,
      userTriggered,
      isStale,
      principalFansub,
      refresh,
    }),
    [data, isLoading, error, lastFetch, userTriggered, isStale, principalFansub, refresh],
  );

  return <TorrentContext.Provider value={value}>{children}</TorrentContext.Provider>;
}

export function useTorrent() {
  const context = useContext(TorrentContext);
  if (!context) throw new Error("useTorrent debe usarse dentro de TorrentProvider");
  return context;
}
