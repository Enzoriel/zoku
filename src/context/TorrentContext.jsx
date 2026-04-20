import { createContext, useState, useEffect, useCallback, useRef, useMemo, useContext } from "react";
import { StoreContext } from "./StoreContext";
import {
  getPrincipalFansub,
  getPreferredResolution,
  getRequiredTorrentFeeds,
  getEffectiveTorrentSourceFansub,
} from "../utils/torrentConfig";
import { TORRENT_REFRESH_INTERVAL_MS } from "../constants";
import { fetchNyaaFeed } from "../services/nyaa";

const CACHE_DURATION = TORRENT_REFRESH_INTERVAL_MS;

export const TorrentContext = createContext(null);

export function TorrentProvider({ children }) {
  const { data: storeData, loading: storeLoading } = useContext(StoreContext);
  const principalFansub = useMemo(() => getPrincipalFansub(storeData.settings), [storeData.settings]);
  const preferredRes = useMemo(() => getPreferredResolution(storeData.settings), [storeData.settings]);
  // Clave estable: recalcular solo cuando cambian campos que alteran la lista de feeds requerida.
  const feedRelevantKey = useMemo(() => {
    return Object.entries(storeData.myAnimes || {})
      .map(
        ([id, anime]) =>
          [
            id,
            anime?.torrentSourceFansub || "",
            (anime?.userStatus || "").toUpperCase(),
            (anime?.status || "").toUpperCase(),
          ].join(":"),
      )
      .sort()
      .join(",");
  }, [storeData.myAnimes]);

  const requiredFeeds = useMemo(
    () => getRequiredTorrentFeeds(storeData.myAnimes, storeData.settings, principalFansub, preferredRes),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [feedRelevantKey, storeData.settings, principalFansub, preferredRes],
  );

  const [data, setData] = useState([]);
  const [feedsByKey, setFeedsByKey] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastFetch, setLastFetch] = useState(null);

  const intervalRef = useRef(null);
  const requestIdRef = useRef(0);
  const feedsRef = useRef({});

  const resetFeedState = useCallback((invalidateInFlight = false) => {
    if (invalidateInFlight) {
      requestIdRef.current += 1;
    }

    feedsRef.current = {};
    setFeedsByKey({});
    setData([]);
    setError(null);
    setLastFetch(null);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    feedsRef.current = feedsByKey;
  }, [feedsByKey]);

  const runFeedCycle = useCallback(
    async (force = false) => {
      if (storeLoading) return;

      if (requiredFeeds.length === 0) {
        resetFeedState(true);
        return;
      }

      const requestId = ++requestIdRef.current;
      setIsLoading(true);
      setError(null);

      const nextFeeds = {};
      const errors = [];
      let latestFetch = null;

      try {
        // Paralelizar con concurrencia limitada para respetar rate-limits de Nyaa
        const CONCURRENCY = 2;
        for (let i = 0; i < requiredFeeds.length; i += CONCURRENCY) {
          if (requestId !== requestIdRef.current) return;

          const batch = requiredFeeds.slice(i, i + CONCURRENCY);
          const results = await Promise.allSettled(
            batch.map((feed) =>
              fetchNyaaFeed({
                fansub: feed.fansub,
                query: feed.query,
                category: feed.category,
                force,
                ttlMs: CACHE_DURATION,
              }),
            ),
          );

          if (requestId !== requestIdRef.current) return;

          results.forEach((result, idx) => {
            const feed = batch[idx];
            if (result.status === "fulfilled") {
              nextFeeds[feed.key] = {
                ...feed,
                items: result.value.data || [],
                lastFetch: result.value.timestamp,
                error: null,
              };
              latestFetch = Math.max(latestFetch || 0, result.value.timestamp || 0);
            } else {
              console.error("[TorrentContext] Feed error:", feed.fansub, result.reason);
              const previousFeed = feedsRef.current[feed.key];
              nextFeeds[feed.key] = {
                ...feed,
                items: previousFeed?.items || [],
                lastFetch: previousFeed?.lastFetch || null,
                error:
                  typeof result.reason === "string" ? result.reason : `Error al obtener torrents de ${feed.fansub}.`,
              };
              errors.push(nextFeeds[feed.key].error);
            }
          });
        }

        if (requestId !== requestIdRef.current) return;

        feedsRef.current = nextFeeds;
        setFeedsByKey(nextFeeds);
        setData(Object.values(nextFeeds).flatMap((feed) => feed.items || []));
        setLastFetch(latestFetch || null);
        setError(errors.length > 0 ? errors[0] : null);
      } finally {
        if (requestId !== requestIdRef.current) return;
        setIsLoading(false);
      }
    },
    [requiredFeeds, resetFeedState, storeLoading],
  );

  const getFeedForFansub = useCallback((fansubName) => {
    if (!fansubName) return null;

    return (
      Object.values(feedsRef.current).find((feed) => feed.fansub.toLowerCase() === fansubName.toLowerCase()) || null
    );
  }, []);

  const getItemsForFansub = useCallback(
    (fansubName) => {
      return getFeedForFansub(fansubName)?.items || [];
    },
    [getFeedForFansub],
  );

  const getItemsForAnime = useCallback(
    (anime) => {
      if (!anime) return [];
      const sourceFansub = getEffectiveTorrentSourceFansub(anime, principalFansub);
      return sourceFansub ? getItemsForFansub(sourceFansub) : [];
    },
    [getItemsForFansub, principalFansub],
  );

  useEffect(() => {
    if (storeLoading || requiredFeeds.length === 0) {
      resetFeedState(true);
      return;
    }

    runFeedCycle(false);

    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => runFeedCycle(false), CACHE_DURATION);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [requiredFeeds, resetFeedState, runFeedCycle, storeLoading]);

  const refresh = useCallback(() => runFeedCycle(true), [runFeedCycle]);

  const value = useMemo(
    () => ({
      data,
      isLoading,
      error,
      lastFetch,
      principalFansub,
      preferredRes,
      getFeedForFansub,
      getItemsForFansub,
      getItemsForAnime,
      refresh,
    }),
    [
      data,
      isLoading,
      error,
      lastFetch,
      principalFansub,
      preferredRes,
      getFeedForFansub,
      getItemsForFansub,
      getItemsForAnime,
      refresh,
    ],
  );

  return <TorrentContext.Provider value={value}>{children}</TorrentContext.Provider>;
}

export function useTorrent() {
  const context = useContext(TorrentContext);
  if (!context) throw new Error("useTorrent debe usarse dentro de TorrentProvider");
  return context;
}
