import { useState, useEffect, useMemo, useCallback } from "react";
import { getAnimeDetailsBatch } from "../services/api";

const RECENT_DAYS = 14;
const RECENT_MS = RECENT_DAYS * 24 * 60 * 60 * 1000;
const EXTRA_CACHE_MS = 60 * 60 * 1000;
const recentAnimeCache = new Map();

function isRecentlyRelevantAnime(anime, now) {
  if (!anime) return false;

  const status = String(anime.status || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const isAiring =
    status === "airing" ||
    status === "releasing" ||
    status === "en emision";

  if (isAiring || anime.nextAiringEpisode) {
    return true;
  }

  // Verificar episodeAirDates (fuente más confiable que endDate).
  // Si algún episodio fue registrado dentro de los últimos 14 días, la serie es reciente.
  const airDates = anime?.episodeAirDates;
  if (airDates && typeof airDates === "object") {
    const hasRecentEpisode = Object.values(airDates).some(
      (timestamp) => Number.isFinite(timestamp) && now - timestamp < RECENT_MS,
    );
    if (hasRecentEpisode) return true;
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

      // Enriquecer resultados de la API con episodeAirDates del store local.
      // La API no devuelve este campo, pero el store sí lo tiene registrado.
      // Sin esto, series completadas pasarían el filtro en storedFallback
      // pero serían descartadas aquí al no tener episodeAirDates.
      const filteredResults = (results || []).filter((anime) => {
        const id = Number(anime.malId || anime.mal_id);
        const stored = myAnimes?.[id] || myAnimes?.[String(id)];
        const enriched = stored?.episodeAirDates
          ? { ...anime, episodeAirDates: stored.episodeAirDates }
          : anime;
        return isRecentlyRelevantAnime(enriched, now);
      });

      if (!signalObj.active) return;

      if (!results || results.length === 0) {
        if (ids.length > 0) {
          setErrorExtra("No se pudieron cargar las series adicionales. La API no respondio.");
        }
      }

      recentAnimeCache.set(cacheKey, { data: filteredResults, timestamp: Date.now() });

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
  }, [myAnimes]);

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
