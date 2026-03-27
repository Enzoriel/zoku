import { useState, useEffect, useMemo } from "react";
import { getAnimeDetailsBatch } from "../services/api";

const RECENT_DAYS = 14;
const RECENT_MS = RECENT_DAYS * 24 * 60 * 60 * 1000;

export function useRecentAnime(seasonalAnime, myAnimes, localFiles) {
  const [extraAnime, setExtraAnime] = useState([]);
  const [loadingExtra, setLoadingExtra] = useState(false);

  // IDs que ya tenemos frescos de seasonalAnime
  const seasonalIds = useMemo(() => new Set(seasonalAnime.map((a) => Number(a.malId || a.mal_id))), [seasonalAnime]);

  // IDs que necesitan llamada extra
  const missingIds = useMemo(() => {
    const now = Date.now();
    return Object.entries(myAnimes || {})
      .filter(([id, anime]) => {
        if (seasonalIds.has(Number(id))) return false; // ya lo tenemos

        const status = anime.status?.toLowerCase();
        const isAiring = status === "airing" || status === "releasing" || status === "en emisión";

        // Terminó recientemente — chequeamos por completedAt o lastUpdated
        const finishedRecently =
          (status === "finished airing" || status === "completed" || status === "finalizado") &&
          (anime.completedAt
? now - new Date(anime.completedAt).getTime() < RECENT_MS
            : true); // Si no tenemos fecha pero está finalizada hoy/ayer segun AniList

        return isAiring || finishedRecently;
      })
      .map(([id]) => Number(id));
  }, [myAnimes, seasonalIds]);

  useEffect(() => {
    if (missingIds.length === 0) {
      setExtraAnime([]);
      return;
    }

    let cancelled = false;
    setLoadingExtra(true);

    getAnimeDetailsBatch(missingIds).then((results) => {
      if (!cancelled) {
        setExtraAnime(results);
        setLoadingExtra(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [missingIds.join(",")]); // solo re-fetch si cambian los IDs

  // Combinar seasonal + extra, sin duplicados
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

  return { allAiringAnime, loadingExtra };
}
