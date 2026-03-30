import { useState, useEffect, useMemo, useCallback } from "react";
import { getAnimeDetailsBatch } from "../services/api";

const RECENT_DAYS = 14;
const RECENT_MS = RECENT_DAYS * 24 * 60 * 60 * 1000;
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

export function useRecentAnime(seasonalAnime, myAnimes, localFiles) {
  const [extraAnime, setExtraAnime] = useState([]);
  const [loadingExtra, setLoadingExtra] = useState(false);
  const [errorExtra, setErrorExtra] = useState(null);

  void localFiles;

  const seasonalIds = useMemo(() => new Set(seasonalAnime.map((a) => Number(a.malId || a.mal_id))), [seasonalAnime]);

  const missingIds = useMemo(() => {
    return Object.keys(myAnimes || {})
      .map((id) => Number(id))
      .filter((id) => !seasonalIds.has(id));
  }, [myAnimes, seasonalIds]);

  const fetchExtra = useCallback(async (ids, signalObj = { active: true }) => {
    const cacheKey = ids.join(",");
    const cachedEntry = recentAnimeCache.get(cacheKey);
    if (cachedEntry?.data) {
      setExtraAnime(cachedEntry.data);
      setLoadingExtra(false);
      setErrorExtra(null);
      return cachedEntry.data;
    }

    setLoadingExtra(true);
    setErrorExtra(null);
    try {
      const pendingPromise = cachedEntry?.promise || getAnimeDetailsBatch(ids);
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

      recentAnimeCache.set(cacheKey, { data: filteredResults });
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

    const signalObj = { active: true };
    fetchExtra(missingIds, signalObj);

    return () => {
      signalObj.active = false;
    };
  }, [missingIds.join(","), fetchExtra]);

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
      return fetchExtra(missingIds);
    }
  }, [missingIds, fetchExtra]);

  return { allAiringAnime, loadingExtra, errorExtra, retryExtra };
}
