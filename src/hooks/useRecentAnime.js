import { useState, useEffect, useMemo, useCallback } from "react";
import { getAnimeDetailsBatch } from "../services/api";

const RECENT_DAYS = 14;
const RECENT_MS = RECENT_DAYS * 24 * 60 * 60 * 1000;

export function useRecentAnime(seasonalAnime, myAnimes, localFiles) {
  const [extraAnime, setExtraAnime] = useState([]);
  const [loadingExtra, setLoadingExtra] = useState(false);
  const [errorExtra, setErrorExtra] = useState(null);

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

  const fetchExtra = useCallback(async (ids) => {
    setLoadingExtra(true);
    setErrorExtra(null);
    try {
      const results = await getAnimeDetailsBatch(ids);
      if (!results || results.length === 0) {
        // Si la API devolvió null/vacío pero no lanzó error, puede ser timeout
        if (ids.length > 0) {
          setErrorExtra("No se pudieron cargar las series adicionales. La API no respondió.");
        }
      }
      setExtraAnime(results || []);
    } catch (e) {
      console.error("[useRecentAnime] Error fetching extra:", e);
      setErrorExtra("Error al cargar series adicionales. Revisa tu conexión.");
    } finally {
      setLoadingExtra(false);
    }
  }, []);

  useEffect(() => {
    if (missingIds.length === 0) {
      setExtraAnime([]);
      return;
    }

    fetchExtra(missingIds);
  }, [missingIds.join(","), fetchExtra]);

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

  const retryExtra = useCallback(() => {
    if (missingIds.length > 0) {
      return fetchExtra(missingIds);
    }
  }, [missingIds, fetchExtra]);

  return { allAiringAnime, loadingExtra, errorExtra, retryExtra };
}
