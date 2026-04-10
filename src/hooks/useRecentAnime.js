import { useState, useEffect, useMemo, useCallback } from "react";
import { getAnimeDetailsBatch } from "../services/api";

const RECENT_DAYS = 14;
const RECENT_MS = RECENT_DAYS * 24 * 60 * 60 * 1000;
const EXTRA_CACHE_MS = 60 * 60 * 1000;
const recentAnimeCache = new Map();

function isRecentlyRelevantAnime(anime, now) {
  if (!anime) return false;

  const status = anime.status?.toLowerCase() || "";
  const isAiring =
    status === "airing" ||
    status === "releasing" ||
    status === "en emision" ||
    status === "en emisión";

  if (isAiring || anime.nextAiringEpisode) {
    return true;
  }

  const isFinished = status === "finished airing" || status === "completed" || status === "finalizado";
  if (!isFinished || !anime.endDate?.year) {
    return false;
  }

  const finishedAt = new Date(
    anime.endDate.year,
    Math.max((anime.endDate.month || 1) - 1, 0),
    anime.endDate.day || 1,
  ).getTime();

  return Number.isFinite(finishedAt) && now - finishedAt < RECENT_MS;
}

export function useRecentAnime(seasonalAnime, myAnimes) {
  const [extraAnime, setExtraAnime] = useState([]);
  const [loadingExtra, setLoadingExtra] = useState(false);
  const [errorExtra, setErrorExtra] = useState(null);

  const seasonalIds = useMemo(() => new Set(seasonalAnime.map((a) => Number(a.malId || a.mal_id))), [seasonalAnime]);

  const missingIds = useMemo(() => {
    return Object.keys(myAnimes || {})
      .map((id) => Number(id))
      .filter((id) => !seasonalIds.has(id));
  }, [myAnimes, seasonalIds]);

  const storedFallback = useMemo(() => {
    return missingIds
      .map((id) => myAnimes?.[id] || myAnimes?.[String(id)] || null)
      .filter(Boolean)
      .filter((anime) => isRecentlyRelevantAnime(anime, Date.now()));
  }, [missingIds, myAnimes]);

  const fetchExtra = useCallback(async (ids, signalObj = { active: true }, options = {}) => {
    const cacheKey = ids.join(",");
    const cachedEntry = recentAnimeCache.get(cacheKey);
    const isFresh = cachedEntry?.timestamp && Date.now() - cachedEntry.timestamp < EXTRA_CACHE_MS;
    if (!options.force && cachedEntry?.data && isFresh) {
      setExtraAnime(cachedEntry.data);
      setLoadingExtra(false);
      setErrorExtra(null);
      return cachedEntry.data;
    }

    setLoadingExtra(true);
    setErrorExtra(null);
    try {
      const pendingPromise = !options.force && cachedEntry?.promise ? cachedEntry.promise : getAnimeDetailsBatch(ids);
      recentAnimeCache.set(cacheKey, { promise: pendingPromise });
      const results = await pendingPromise;
      const now = Date.now();
      const filteredResults = (results || []).filter((anime) => isRecentlyRelevantAnime(anime, now));

      if (!signalObj.active) return;

      if (!results || results.length === 0) {
        if (ids.length > 0) {
          setErrorExtra("No se pudieron cargar las series adicionales. La API no respondio.");
        }
      }

      recentAnimeCache.set(cacheKey, { data: filteredResults, timestamp: Date.now() });

      // GC: limpiar entries expiradas cada vez que se escribe
      if (recentAnimeCache.size > 20) {
        const nowGC = Date.now();
        for (const [key, entry] of recentAnimeCache) {
          if (!entry.timestamp || nowGC - entry.timestamp > EXTRA_CACHE_MS) {
            recentAnimeCache.delete(key);
          }
        }
      }



      setExtraAnime(filteredResults);
      return filteredResults;
    } catch (e) {
      recentAnimeCache.delete(cacheKey);
      if (!signalObj.active) return;
      console.error("[useRecentAnime] Error fetching extra:", e);
      setErrorExtra("Error al cargar series adicionales. Revisa tu conexion.");
    } finally {
      if (signalObj.active) setLoadingExtra(false);
    }
  }, []);

  useEffect(() => {
    if (missingIds.length === 0) {
      setExtraAnime([]);
      return;
    }

    setExtraAnime(storedFallback);
    const signalObj = { active: true };
    fetchExtra(missingIds, signalObj);

    return () => {
      signalObj.active = false;
    };
  }, [storedFallback, missingIds.join(","), fetchExtra]);

  const allAiringAnime = useMemo(() => {
    const combined = [...seasonalAnime];
    const existingIds = new Set(seasonalAnime.map((a) => Number(a.malId || a.mal_id)));

    extraAnime.forEach((a) => {
      if (!existingIds.has(Number(a.malId || a.mal_id))) {
        combined.push(a);
      }
    });

    return combined;
  }, [seasonalAnime, extraAnime]);

  const retryExtra = useCallback(() => {
    if (missingIds.length > 0) {
      return fetchExtra(missingIds, { active: true }, { force: true });
    }
  }, [missingIds, fetchExtra]);

  return { allAiringAnime, loadingExtra, errorExtra, retryExtra };
}
